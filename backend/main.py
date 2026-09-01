import re
import os
import uvicorn
import socket
import ipaddress
import asyncio
import base64
import urllib.request
import urllib.parse
import urllib.error
import json
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, status, Body, File, UploadFile, Request, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Table, ForeignKey, text, DateTime, Float, Text
from sqlalchemy.orm import relationship, sessionmaker, Session, declarative_base
import bcrypt
from jose import JWTError, jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordBearer

# --- Global Thread Pool for background I/O ---
executor = ThreadPoolExecutor(max_workers=20)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
POSTER_DIR = os.path.join(BACKEND_DIR, "static", "posters")

# --- MediaMTX configuration ---
MEDIAMTX_API_HOST = os.getenv("MEDIAMTX_API_HOST", "127.0.0.1")
MEDIAMTX_API_PORT = os.getenv("MEDIAMTX_API_PORT", "9997")
MEDIAMTX_RTSP_URL = os.getenv("MEDIAMTX_RTSP_URL", "rtsp://127.0.0.1:8554").rstrip("/")
MEDIAMTX_API_BASE = f"http://{MEDIAMTX_API_HOST}:{MEDIAMTX_API_PORT}"

# --- MediaMTX Registered Paths Cache to Prevent Unnecessary Config PATCH Calls ---
REGISTERED_PATHS = set()

def persist_mediamtx_path(path_name: str, rtsp_url: str, record_config: dict = None):
    """Persist path config to mediamtx.yml so it survives restarts."""
    import yaml  # ponytail: add to requirements if more yaml ops appear
    config_path = "/etc/mediamtx/mediamtx.yml"
    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f) or {}
    except Exception:
        config = {}

    if "paths" not in config:
        config["paths"] = {}

    path_cfg = {
        "source": rtsp_url,
        "sourceProtocol": "tcp",
        "rtspTransport": "tcp",
    }

    if record_config and record_config.get("record_enabled"):
        retention = record_config.get("record_retention_days", 7)
        disk = record_config.get("record_disk", "/recordings")
        group = record_config.get("group_name", "default")
        name = record_config.get("stream_name", path_name)
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
        safe_group = "".join(c if c.isalnum() or c in "-_" else "_" for c in group)
        rec_path = f"{disk}/recordings/{safe_group}/{safe_name}"
        path_cfg["record"] = True
        path_cfg["recordPath"] = f"{rec_path}/%path/%Y-%m-%d_%H-%M-%S-%f"
        path_cfg["recordFormat"] = "fmp4"
        path_cfg["recordSegmentDuration"] = "1h"
        path_cfg["recordDeleteAfter"] = f"{retention * 24}h"
    else:
        path_cfg["record"] = False

    config["paths"][path_name] = path_cfg

    try:
        with open(config_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False)
    except Exception as e:
        print(f"Warning: could not persist mediamtx config: {e}")


# --- Dynamic Stream Pre-loading Configuration ---
LAST_CLIENT_ACTIVITY = datetime.utcnow()
CURRENT_MONITOR_MODE = "preloaded"  # Keep preloaded 24/7 for instant play

# --- Monitoring & poster capture tuning ---
RTSP_CACHE_TTL_SECONDS = 45
POSTER_CAPTURE_INTERVAL_SECONDS = 300
POSTER_CAPTURE_CONCURRENCY = 2
POSTER_CAPTURE_STARTUP_DELAY_SECONDS = 8
poster_capture_semaphore: Optional[asyncio.Semaphore] = None
_pending_poster_captures: set = set()
_poster_capture_last_at: dict = {}
POSTER_CAPTURE_REQUEST_COOLDOWN_SECONDS = 45

def touch_client_activity():
    global LAST_CLIENT_ACTIVITY
    LAST_CLIENT_ACTIVITY = datetime.utcnow()

def get_substream_url(rtsp_url: str) -> str:
    if not rtsp_url:
        return rtsp_url
    url_lower = rtsp_url.lower()
    if "_main" in url_lower:
        idx = url_lower.find("_main")
        return rtsp_url[:idx] + "_sub" + rtsp_url[idx+5:]
    elif "/stream1" in url_lower:
        idx = url_lower.find("/stream1")
        return rtsp_url[:idx] + "/stream2" + rtsp_url[idx+8:]
    elif "/h264" in url_lower:
        idx = url_lower.find("/h264")
        return rtsp_url[:idx] + "/h264_sub" + rtsp_url[idx+5:]
    elif "/h.264" in url_lower:
        idx = url_lower.find("/h.264")
        return rtsp_url[:idx] + "/H.264_sub" + rtsp_url[idx+6:]
    return rtsp_url

def resolve_webrtc_url_sub(stream_id: int, rtsp_url: str, media_server_base: str) -> str:
    """Return sub-stream WHEP URL only when sub path is registered; else main stream."""
    sub_path = f"stream_{stream_id}_sub"
    is_registered = any(k[0] == sub_path for k in REGISTERED_PATHS)
    if is_registered:
        return f"{media_server_base}{sub_path}/whep"
    return f"{media_server_base}stream_{stream_id}/whep"

def delete_single_mediamtx_path(path_name: str) -> bool:
    # Evict path_name from registered paths cache
    global REGISTERED_PATHS
    keys_to_remove = [k for k in REGISTERED_PATHS if k[0] == path_name]
    for k in keys_to_remove:
        REGISTERED_PATHS.discard(k)
        
    for api_ver in ["v3", "v2", "v1"]:
        try:
            delete_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/delete/{path_name}"
            req = urllib.request.Request(delete_url, method="DELETE")
            with urllib.request.urlopen(req, timeout=1.0) as response:
                if response.status in (200, 201):
                    return True
        except Exception:
            pass
    return False

def cleanup_stale_mediamtx_paths(db: Session):
    """Prune leftover paths in MediaMTX config that are no longer present in the database."""
    try:
        streams = db.query(CCTVStreamModel.id).all()
        active_paths = set()
        for row in streams:
            sid = row[0]
            active_paths.add(f"stream_{sid}")
            active_paths.add(f"stream_{sid}_sub")

        for api_ver in ("v3", "v2", "v1"):
            url = f"{MEDIAMTX_API_BASE}/{api_ver}/config/paths/list"
            try:
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=1.5) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode("utf-8"))
                        
                        path_names = []
                        if isinstance(data, dict):
                            if "items" in data:
                                path_names = [item["name"] for item in data["items"] if isinstance(item, dict) and "name" in item]
                            else:
                                path_names = list(data.keys())
                        elif isinstance(data, list):
                            path_names = [item["name"] for item in data if isinstance(item, dict) and "name" in item]
                            
                        for path in path_names:
                            if path.startswith("stream_") and path not in active_paths:
                                print(f"[Cleanup] Deleting stale MediaMTX path: {path}")
                                delete_single_mediamtx_path(path)
                        break
            except Exception:
                continue
    except Exception as e:
        print(f"[Cleanup] Error in stale MediaMTX path cleanup: {e}")

def register_single_mediamtx_path(path_name: str, rtsp_url: str, record_config: dict = None) -> bool:
    cache_key = (path_name, rtsp_url)
    if cache_key in REGISTERED_PATHS:
        return True

    source_on_demand = (CURRENT_MONITOR_MODE == "ondemand")
    data = {
        "source": rtsp_url,
        "sourceProtocol": "tcp",
        "rtspTransport": "tcp",
        "sourceOnDemand": source_on_demand
    }
    if source_on_demand:
        data["sourceOnDemandCloseAfter"] = "15s"

    # Apply recording config if provided
    if record_config and record_config.get("record_enabled"):
        retention = record_config.get("record_retention_days", 7)
        rec_path = record_config.get("record_path", f"/recordings/{path_name}")
        rec_path = rec_path.rstrip("/")
        data["record"] = True
        data["recordPath"] = f"{rec_path}/%path/%Y-%m-%d_%H-%M-%S_%f"
        data["recordFormat"] = "fmp4"
        data["recordSegmentDuration"] = "1h"
        data["recordDeleteAfter"] = f"{retention * 24}h"

    # Try different MediaMTX API versions (v3, v2, v1)
    for api_ver in ["v3", "v2", "v1"]:
        try:
            mediamtx_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/add/{path_name}"
            req = urllib.request.Request(
                mediamtx_url,
                data=json.dumps(data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=1.0) as response:
                if response.status in (200, 201):
                    REGISTERED_PATHS.add(cache_key)
                    return True
        except Exception:
            try:
                patch_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/patch/{path_name}"
                req = urllib.request.Request(
                    patch_url,
                    data=json.dumps(data).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="PATCH"
                )
                with urllib.request.urlopen(req, timeout=1.0) as response:
                    if response.status in (200, 201):
                        REGISTERED_PATHS.add(cache_key)
                        return True
            except Exception:
                try:
                    delete_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/delete/{path_name}"
                    req = urllib.request.Request(delete_url, method="DELETE")
                    with urllib.request.urlopen(req, timeout=0.5) as r:
                        pass
                    
                    req = urllib.request.Request(
                        mediamtx_url,
                        data=json.dumps(data).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=1.0) as response:
                        if response.status in (200, 201):
                            REGISTERED_PATHS.add(cache_key)
                            return True
                except Exception:
                    pass
    
    print(f"Failed to register/update {path_name} in MediaMTX across all API versions")
    return False

def register_transcoded_mediamtx_path(stream_id: int) -> bool:
    path_name = f"stream_{stream_id}_sub"
    cache_key = (path_name, "__transcoded__")
    if cache_key in REGISTERED_PATHS:
        return True

    input_url = f"{MEDIAMTX_RTSP_URL}/stream_{stream_id}"
    output_url = f"{MEDIAMTX_RTSP_URL}/{path_name}"
    
    ffmpeg_cmd = (
        f"ffmpeg -rtsp_transport tcp -i {input_url} "
        f"-vf scale=480:270 -c:v libx264 -preset ultrafast -tune zerolatency "
        f"-b:v 120k -maxrate 120k -bufsize 240k "
        f"-r 8 -g 16 -an -f rtsp {output_url}"
    )
    
    data = {
        "source": "publisher",
        "runOnDemand": ffmpeg_cmd,
        "runOnDemandCloseAfter": "15s",
        "runOnDemandRestart": True
    }
    
    for api_ver in ["v3", "v2", "v1"]:
        try:
            mediamtx_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/add/{path_name}"
            req = urllib.request.Request(
                mediamtx_url,
                data=json.dumps(data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=1.0) as response:
                if response.status in (200, 201):
                    REGISTERED_PATHS.add(cache_key)
                    return True
        except Exception:
            try:
                patch_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/patch/{path_name}"
                req = urllib.request.Request(
                    patch_url,
                    data=json.dumps(data).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="PATCH"
                )
                with urllib.request.urlopen(req, timeout=1.0) as response:
                    if response.status in (200, 201):
                        REGISTERED_PATHS.add(cache_key)
                        return True
            except Exception:
                try:
                    delete_url = f"http://127.0.0.1:9997/{api_ver}/config/paths/delete/{path_name}"
                    req = urllib.request.Request(delete_url, method="DELETE")
                    with urllib.request.urlopen(req, timeout=0.5) as r:
                        pass
                    
                    req = urllib.request.Request(
                        mediamtx_url,
                        data=json.dumps(data).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=1.0) as response:
                        if response.status in (200, 201):
                            REGISTERED_PATHS.add(cache_key)
                            return True
                except Exception:
                    pass
    
    print(f"Failed to register transcoded path {path_name} in MediaMTX across all API versions")
    return False

def register_stream_in_mediamtx(stream_id: int, rtsp_url: str) -> bool:
    # Get recording config from DB
    record_config = None
    try:
        db = SessionLocal()
        stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
        if stream and stream.record_enabled:
            def safe_name(s):
                return re.sub(r'[^a-zA-Z0-9_\-\s]', '', s).strip().replace(' ', '_') if s else 'unknown'
            disk = (stream.record_disk or "/").rstrip("/")
            group = safe_name(stream.group_name)
            name = safe_name(stream.name)
            auto_path = f"{disk}/recordings/{group}/{name}"
            record_config = {
                "record_enabled": True,
                "record_path": auto_path,
                "record_retention_days": stream.record_retention_days or 7
            }
        db.close()
    except Exception as e:
        print(f"[Record] Error reading stream config: {e}")

    # 1. Register main stream (with recording if enabled)
    main_ok = register_single_mediamtx_path(f"stream_{stream_id}", rtsp_url, record_config)

    # 2. Register transcoded sub stream (no recording for sub)
    sub_ok = register_transcoded_mediamtx_path(stream_id)

    return main_ok and sub_ok

def parse_rtsp_host_port(rtsp_url: str):
    url_clean = rtsp_url.replace("rtsp://", "")
    credentials = ""
    if "@" in url_clean:
        credentials, url_clean = url_clean.split("@", 1)

    if "/" in url_clean:
        host_part, _path_part = url_clean.split("/", 1)
    else:
        host_part = url_clean

    if ":" in host_part:
        host, port_str = host_part.split(":")
        port = int(port_str)
    else:
        host = host_part
        port = 554
    return host, port, credentials

def check_rtsp_port_reachable(rtsp_url: str) -> bool:
    """Lightweight TCP reachability check — does not send RTSP DESCRIBE to the camera."""
    try:
        host, port, _credentials = parse_rtsp_host_port(rtsp_url)
        with socket.create_connection((host, port), timeout=1.5):
            return True
    except Exception:
        return False

def get_mediamtx_path_info(path_name: str) -> Optional[dict]:
    for api_ver in ["v3", "v2", "v1"]:
        try:
            url = f"{MEDIAMTX_API_BASE}/{api_ver}/paths/get/{path_name}"
            with urllib.request.urlopen(url, timeout=1.5) as response:
                if response.status != 200:
                    continue
                data = json.loads(response.read().decode("utf-8"))
                return data.get("item", data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
    return None

def check_mediamtx_path_ready(path_name: str) -> bool:
    info = get_mediamtx_path_info(path_name)
    if not info:
        return False
    if info.get("ready") or info.get("sourceReady"):
        return True
    if info.get("bytesReceived", 0) > 0:
        return True
    tracks = info.get("tracks") or info.get("Readers") or []
    if isinstance(tracks, list) and len(tracks) > 0:
        return True
    return False

def restart_mediamtx_path(path_name: str) -> bool:
    for api_ver in ["v3", "v2", "v1"]:
        try:
            url = f"{MEDIAMTX_API_BASE}/{api_ver}/paths/restart/{path_name}"
            req = urllib.request.Request(url, method="POST")
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status in (200, 201, 204):
                    return True
        except Exception:
            pass
    return False

def get_stream_status_sync(rtsp_url: str, stream_id: int) -> str:
    """Determine stream status via MediaMTX (preferred) with minimal camera probing."""
    register_stream_in_mediamtx(stream_id, rtsp_url)

    sub_path = f"stream_{stream_id}_sub"
    main_path = f"stream_{stream_id}"
    if check_mediamtx_path_ready(sub_path) or check_mediamtx_path_ready(main_path):
        return "online"

    # MediaMTX still warming up — report online if camera port is reachable
    if check_rtsp_port_reachable(rtsp_url):
        return "online"
    return "offline"

def check_rtsp_online(rtsp_url: str, stream_id: int) -> bool:
    """Backward-compatible helper used by legacy call sites."""
    return get_stream_status_sync(rtsp_url, stream_id) == "online"

async def check_stream_status(rtsp_url: str, stream_id: int) -> str:
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(executor, get_stream_status_sync, rtsp_url, stream_id),
            timeout=4.0
        )
    except asyncio.TimeoutError:
        print(f"[Monitor] Status check timeout for stream {stream_id}")
        return "offline"
    except Exception as e:
        print(f"[Monitor] Error checking status for stream {stream_id}: {e}")
        return "offline"

# --- RTSP Status Caching ---
RTSP_STATUS_CACHE = {}

async def check_stream_status_with_cache(rtsp_url: str, stream_id: int) -> str:
    now = datetime.utcnow()
    if stream_id in RTSP_STATUS_CACHE:
        cached = RTSP_STATUS_CACHE[stream_id]
        if (now - cached["timestamp"]).total_seconds() < RTSP_CACHE_TTL_SECONDS:
            return cached["status"]

    status_val = await check_stream_status(rtsp_url, stream_id)
    RTSP_STATUS_CACHE[stream_id] = {
        "status": status_val,
        "timestamp": now
    }
    return status_val

def is_mostly_blank_image(image_path: str) -> bool:
    """Detect uniform gray/black frames captured before the stream is ready."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin or not os.path.isfile(image_path):
        return True

    cmd = [
        ffmpeg_bin,
        "-loglevel", "error",
        "-i", image_path,
        "-vf", "scale=32:18,format=gray",
        "-frames:v", "1",
        "-f", "rawvideo", "-",
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5.0)
        if result.returncode != 0 or len(result.stdout) < 32:
            return True
        pixels = result.stdout
        mean = sum(pixels) / len(pixels)
        variance = sum((px - mean) ** 2 for px in pixels) / len(pixels)
        std = variance ** 0.5
        # Blank RTSP slate / gray filler: almost no contrast
        if std < 12:
            return True
        if mean < 20 and std < 18:
            return True
        return False
    except Exception:
        return True

def capture_frame_with_ffmpeg(
    input_url: str,
    output_path: str,
    timeout: float = 18.0,
    ss_delay: float = 2.5,
) -> bool:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        print("[Capture] ffmpeg tidak ditemukan di PATH — install: apt install ffmpeg")
        return False

    cmd = [
        ffmpeg_bin,
        "-loglevel", "error",
        "-rtsp_transport", "tcp",
        "-analyzeduration", "5000000",
        "-probesize", "5000000",
        "-y",
        "-i", input_url,
        "-ss", str(ss_delay),
        "-vf", "select=eq(pict_type\\,I),scale=480:270",
        "-frames:v", "1",
        "-q:v", "6",
        "-f", "image2",
        output_path,
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        if result.returncode != 0 or not os.path.isfile(output_path) or os.path.getsize(output_path) == 0:
            if result.stderr:
                err = result.stderr.decode("utf-8", errors="ignore").strip()
                if err:
                    print(f"[Capture] ffmpeg error ({input_url[:60]}...): {err[:240]}")
            return False

        if is_mostly_blank_image(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
            print(f"[Capture] Blank/gray frame rejected for {input_url[:60]}... (ss={ss_delay})")
            return False

        return True
    except subprocess.TimeoutExpired:
        print(f"[Capture] ffmpeg timeout for {input_url[:60]}...")
    except Exception as e:
        print(f"[Capture] ffmpeg exception: {e}")
    return False

def capture_poster_for_stream(stream_id: int, rtsp_url: Optional[str] = None) -> bool:
    """Capture poster from MediaMTX relay, with direct RTSP camera fallback."""
    os.makedirs(POSTER_DIR, exist_ok=True)
    output_path = poster_file_path(stream_id)

    if rtsp_url:
        register_stream_in_mediamtx(stream_id, rtsp_url)

    candidate_inputs = []
    main_path = f"stream_{stream_id}"
    sub_path = f"stream_{stream_id}_sub"

    if check_mediamtx_path_ready(main_path):
        candidate_inputs.append((f"{MEDIAMTX_RTSP_URL}/{main_path}", f"MediaMTX/{main_path}"))
    if check_mediamtx_path_ready(sub_path):
        candidate_inputs.append((f"{MEDIAMTX_RTSP_URL}/{sub_path}", f"MediaMTX/{sub_path}"))

    candidate_inputs.extend([
        (f"{MEDIAMTX_RTSP_URL}/{main_path}", f"MediaMTX/{main_path}"),
        (f"{MEDIAMTX_RTSP_URL}/{sub_path}", f"MediaMTX/{sub_path}"),
    ])

    if rtsp_url:
        candidate_inputs.append((rtsp_url, "direct RTSP"))

    seen = set()
    ss_delays = (2.0, 3.5, 5.0)
    for input_url, label in candidate_inputs:
        if input_url in seen:
            continue
        seen.add(input_url)
        for ss_delay in ss_delays:
            if capture_frame_with_ffmpeg(input_url, output_path, timeout=18.0, ss_delay=ss_delay):
                print(f"[Capture] Poster saved from {label} for stream {stream_id} (ss={ss_delay}s)")
                return True

    print(f"[Capture] No valid poster frame for stream {stream_id}")
    return False

def capture_poster_from_mediamtx(stream_id: int) -> bool:
    """Legacy wrapper — prefer capture_poster_for_stream with rtsp_url when available."""
    return capture_poster_for_stream(stream_id)

def capture_rtsp_frame(rtsp_url: str, stream_id: int):
    """Legacy name kept for compatibility."""
    return capture_poster_for_stream(stream_id, rtsp_url)

def poster_file_path(stream_id: int) -> str:
    return os.path.join(POSTER_DIR, f"stream_{stream_id}.jpg")

def poster_exists(stream_id: int) -> bool:
    path = poster_file_path(stream_id)
    return os.path.isfile(path) and os.path.getsize(path) > 0

async def ensure_stream_poster(rtsp_url: str, stream_id: int, force: bool = False):
    if not force and poster_exists(stream_id):
        return
    global poster_capture_semaphore
    sem = poster_capture_semaphore
    if sem is not None:
        async with sem:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(executor, capture_poster_for_stream, stream_id, rtsp_url or None)
    else:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(executor, capture_poster_for_stream, stream_id, rtsp_url or None)

async def request_poster_capture(stream_id: int):
    if stream_id in _pending_poster_captures:
        return

    now = datetime.utcnow()
    last = _poster_capture_last_at.get(stream_id)
    if last and (now - last).total_seconds() < POSTER_CAPTURE_REQUEST_COOLDOWN_SECONDS:
        return
    _poster_capture_last_at[stream_id] = now

    _pending_poster_captures.add(stream_id)
    try:
        db = SessionLocal()
        try:
            stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
            if not stream or not stream.is_active:
                print(f"[Capture] Stream {stream_id} not found or inactive")
                return
            rtsp_url = stream.rtsp_url
        finally:
            db.close()

        register_stream_in_mediamtx(stream_id, rtsp_url)
        await asyncio.sleep(3.0)

        for attempt in range(4):
            loop = asyncio.get_event_loop()
            ok = await loop.run_in_executor(executor, capture_poster_for_stream, stream_id, rtsp_url)
            if ok:
                print(f"[Capture] On-demand poster ready for stream {stream_id} (attempt {attempt + 1})")
                return
            await asyncio.sleep(2.0 + attempt)
    finally:
        _pending_poster_captures.discard(stream_id)

# --- FastAPI Setup ---
app = FastAPI(title="Mamura Stream CCTV Server", version="2.0.0")

# --- Static files mount for captured posters ---
os.makedirs(POSTER_DIR, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=os.path.join(BACKEND_DIR, "static")), name="api_static")
app.mount("/static", StaticFiles(directory=os.path.join(BACKEND_DIR, "static")), name="static")

@app.get("/api/posters/stream_{stream_id}.jpg")
async def get_stream_poster(stream_id: int):
    """Serve camera poster via /api so Apache ProxyPass works without extra /static config."""
    path = poster_file_path(stream_id)
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        asyncio.create_task(request_poster_capture(stream_id))
        raise HTTPException(status_code=404, detail="Poster not available yet")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=60"},
    )

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "cctv-backend"}

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Password Hashing & JWT Auth Configuration ---
SECRET_KEY = os.getenv("JWT_SECRET", "mamura-stream-vanguard-key-1337-security")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 600  # 10 hours session

# --- Database Configuration ---
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "cctv_monitoring")

if DB_USER and DB_PASS:
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    print(f"[DB] Koneksi ke MySQL/MariaDB: {DB_HOST}:{DB_PORT}/{DB_NAME} sebagai '{DB_USER}'")
else:
    # BUG FIX #1: Log peringatan jelas ketika fallback ke SQLite (env var DB tidak ditemukan)
    print("[DB] PERINGATAN: Env var DB_USER/DB_PASS tidak ditemukan — menggunakan SQLite lokal (cctv_monitoring.db)")
    print("[DB] Data kamera di MySQL/MariaDB TIDAK akan terlihat dalam mode SQLite ini!")
    DATABASE_URL = "sqlite:///./cctv_monitoring.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True,   # Otomatis cek koneksi sebelum digunakan
    pool_recycle=3600     # Recycle koneksi tiap 1 jam untuk mencegah timeout MySQL
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Database Models ---
# Pivot Table for User-CCTV Access (Many-to-Many)
user_cctv_access = Table(
    "user_cctv_access",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("stream_id", Integer, ForeignKey("cctv_streams.id", ondelete="CASCADE"), primary_key=True)
)

class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="guest")  # admin, user, guest
    
    # Relationship
    streams = relationship("CCTVStreamModel", secondary=user_cctv_access, back_populates="users")

class CCTVStreamModel(Base):
    __tablename__ = "cctv_streams"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    rtsp_url = Column(String(255), nullable=False)
    group_name = Column(String(50), nullable=False, default="Default")
    coordinates = Column(String(100), nullable=True, default="")
    is_active = Column(Boolean, default=True)
    record_enabled = Column(Boolean, default=False)
    record_path = Column(String(255), nullable=True, default="")
    record_disk = Column(String(50), nullable=True, default="")
    record_retention_days = Column(Integer, default=7)

    users = relationship("UserModel", secondary=user_cctv_access, back_populates="streams")

class AdConfigModel(Base):
    __tablename__ = "ad_config"
    id = Column(Integer, primary_key=True, index=True)
    image_url = Column(String(255), nullable=True)
    marquee_text = Column(Text, nullable=True)
    bg_color = Column(String(20), nullable=True, default="#1e293b")
    text_color = Column(String(20), nullable=True, default="#ffffff")
    scroll_speed = Column(Integer, nullable=False, default=5)
    font_size = Column(Integer, nullable=False, default=10)
    font_family = Column(String(50), nullable=True, default="monospace")
    image_opacity = Column(Float, nullable=False, default=1.0)
    bg_opacity = Column(Float, nullable=False, default=1.0)
    text_opacity = Column(Float, nullable=False, default=1.0)
    is_active = Column(Boolean, default=True)
    box_width = Column(Integer, nullable=False, default=100)
    text_align = Column(String(10), nullable=False, default="left")
    image_height = Column(Integer, nullable=False, default=20)
    embed_timeout_seconds = Column(Integer, nullable=False, default=300)
    click_to_play = Column(Boolean, default=True)

class ApiKeyModel(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, index=True)
    key_value = Column(String(64), unique=True, index=True, nullable=False)
    camera_id = Column(Integer, ForeignKey("cctv_streams.id", ondelete="CASCADE"), nullable=False)
    client_name = Column(String(100), nullable=False)
    custom_camera_name = Column(String(100), nullable=True)
    allowed_domain = Column(String(255), nullable=True)
    secret_pass = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    embed_timeout_seconds = Column(Integer, nullable=False, default=300)
    click_to_play = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class ApiAccessLogModel(Base):
    __tablename__ = "api_access_logs"
    id           = Column(Integer, primary_key=True, index=True)
    api_key_id   = Column(Integer, ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True)
    key_value    = Column(String(64), nullable=True, index=True)
    client_name  = Column(String(100), nullable=True)
    camera_id    = Column(Integer, nullable=True)
    camera_name  = Column(String(100), nullable=True)
    ip_address   = Column(String(64), nullable=True)
    referer      = Column(String(512), nullable=True)
    user_agent   = Column(String(512), nullable=True)
    status       = Column(String(20), nullable=False, default="hit")   # hit | denied
    deny_reason  = Column(String(255), nullable=True)
    accessed_at  = Column(DateTime, default=datetime.utcnow, index=True)

# Create tables
Base.metadata.create_all(bind=engine)

# --- Startup DB Connection Test (runs after tables are created) ---
def test_db_connection():
    """Test koneksi ke database saat startup. Log error yang jelas jika gagal."""
    try:
        from sqlalchemy import inspect
        
        # Test basic connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # Safe schema migration using inspector
        try:
            inspector = inspect(engine)
            
            # 1. Migrate api_keys table
            columns_api_keys = [c["name"] for c in inspector.get_columns("api_keys")]
            if "custom_camera_name" not in columns_api_keys:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE api_keys ADD COLUMN custom_camera_name VARCHAR(100) NULL"))
                print("[DB] Column 'custom_camera_name' successfully added to 'api_keys' table.")
                
            if "embed_timeout_seconds" not in columns_api_keys:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE api_keys ADD COLUMN embed_timeout_seconds INT NOT NULL DEFAULT 300"))
                print("[DB] Column 'embed_timeout_seconds' successfully added to 'api_keys' table.")
                
            if "click_to_play" not in columns_api_keys:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE api_keys ADD COLUMN click_to_play TINYINT(1) NOT NULL DEFAULT 1"))
                print("[DB] Column 'click_to_play' successfully added to 'api_keys' table.")
            
            # 2. Migrate ad_config table
            columns_ad_config = [c["name"] for c in inspector.get_columns("ad_config")]
            is_sqlite = "sqlite" in DATABASE_URL
            
            if not is_sqlite:
                # Alter marquee_text to TEXT (safe to run multiple times in MariaDB/MySQL)
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE ad_config MODIFY COLUMN marquee_text TEXT NULL"))
                print("[DB] Column 'marquee_text' in 'ad_config' successfully altered to TEXT.")
            
            if "box_width" not in columns_ad_config:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE ad_config ADD COLUMN box_width INT NOT NULL DEFAULT 100"))
                print("[DB] Column 'box_width' added to 'ad_config'.")
                
            if "text_align" not in columns_ad_config:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE ad_config ADD COLUMN text_align VARCHAR(10) NOT NULL DEFAULT 'left'"))
                print("[DB] Column 'text_align' added to 'ad_config'.")

            if "image_height" not in columns_ad_config:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE ad_config ADD COLUMN image_height INT NOT NULL DEFAULT 20"))
                print("[DB] Column 'image_height' added to 'ad_config'.")
                
            if "embed_timeout_seconds" not in columns_ad_config:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE ad_config ADD COLUMN embed_timeout_seconds INT NOT NULL DEFAULT 300"))
                print("[DB] Column 'embed_timeout_seconds' added to 'ad_config'.")

            if "click_to_play" not in columns_ad_config:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE ad_config ADD COLUMN click_to_play TINYINT(1) NOT NULL DEFAULT 1"))
                print("[DB] Column 'click_to_play' added to 'ad_config'.")
                
        except Exception as ex_mig:
            print(f"[DB] Warning during schema migration check: {ex_mig}")

        # 3. Migrate api_access_logs table
        try:
            inspector = inspect(engine)
            if not inspector.has_table("api_access_logs"):
                is_sqlite = "sqlite" in DATABASE_URL
                with engine.begin() as migration_conn:
                    if is_sqlite:
                        migration_conn.execute(text("""
                            CREATE TABLE api_access_logs (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
                                key_value VARCHAR(64),
                                client_name VARCHAR(100),
                                camera_id INTEGER,
                                camera_name VARCHAR(100),
                                ip_address VARCHAR(64),
                                referer VARCHAR(512),
                                user_agent VARCHAR(512),
                                status VARCHAR(20) NOT NULL DEFAULT 'hit',
                                deny_reason VARCHAR(255),
                                accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )
                        """))
                    else:
                        migration_conn.execute(text("""
                            CREATE TABLE api_access_logs (
                                id INT AUTO_INCREMENT PRIMARY KEY,
                                api_key_id INT NULL,
                                key_value VARCHAR(64) NULL,
                                client_name VARCHAR(100) NULL,
                                camera_id INT NULL,
                                camera_name VARCHAR(100) NULL,
                                ip_address VARCHAR(64) NULL,
                                referer VARCHAR(512) NULL,
                                user_agent VARCHAR(512) NULL,
                                status VARCHAR(20) NOT NULL DEFAULT 'hit',
                                deny_reason VARCHAR(255) NULL,
                                accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                INDEX idx_key_value (key_value),
                                INDEX idx_accessed_at (accessed_at),
                                CONSTRAINT fk_alog_apikey FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
                            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                        """))
                print("[DB] Table 'api_access_logs' created successfully.")
        except Exception as ex_al:
            print(f"[DB] Warning creating api_access_logs: {ex_al}")

        if "sqlite" in DATABASE_URL:
            print("[DB] Koneksi SQLite lokal berhasil.")
        else:
            print(f"[DB] Koneksi ke MySQL/MariaDB berhasil — {DB_HOST}:{DB_PORT}/{DB_NAME}")
    except Exception as e:
        print(f"[DB] KRITIS: Gagal koneksi ke database!")
        print(f"[DB] Detail error: {e}")
        if "sqlite" not in DATABASE_URL:
            print(f"[DB] Periksa: apakah MariaDB berjalan? Apakah user '{DB_USER}' punya akses ke '{DB_NAME}'?")
            print(f"[DB] Test manual: mariadb -u {DB_USER} -p -h {DB_HOST} -P {DB_PORT} {DB_NAME}")

test_db_connection()

# --- Background Status Monitor Worker ---
async def background_status_monitor():
    global CURRENT_MONITOR_MODE, REGISTERED_PATHS
    print("[Monitor] Starting background status monitor loop...")
    await asyncio.sleep(2)
    cleanup_counter = 0
    while True:
        try:
            # Keep all active streams preloaded 24/7 on the backend for instant playback
            target_mode = "preloaded"
            
            if target_mode != CURRENT_MONITOR_MODE:
                print(f"[Monitor] Session state changed to {target_mode.upper()}. Re-registering all MediaMTX paths.")
                CURRENT_MONITOR_MODE = target_mode
                REGISTERED_PATHS.clear()  # Forces re-registration with the new mode
                
            db = SessionLocal()
            try:
                # Bersihkan path sampah MediaMTX secara berkala
                cleanup_counter += 1
                if cleanup_counter >= 5:
                    cleanup_counter = 0
                    cleanup_stale_mediamtx_paths(db)

                # Query all active streams
                streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.is_active == True).all()
                if streams:
                    now = datetime.utcnow()
                    loop = asyncio.get_event_loop()
                    for s in streams:
                        val = await loop.run_in_executor(
                            executor, get_stream_status_sync, s.rtsp_url, s.id
                        )
                        prev_status = RTSP_STATUS_CACHE.get(s.id, {}).get("status")
                        RTSP_STATUS_CACHE[s.id] = {
                            "status": val,
                            "timestamp": now
                        }
                        if val == "online" and (prev_status != "online" or not poster_exists(s.id)):
                            asyncio.create_task(ensure_stream_poster(s.rtsp_url, s.id))
            finally:
                db.close()
        except Exception as e:
            print(f"[Monitor] Error in background status check loop: {e}")
            
        await asyncio.sleep(RTSP_CACHE_TTL_SECONDS)

# --- Background Frame Capturer Worker ---
async def background_frame_capturer():
    print("[Capture] Starting background frame capturer loop (MediaMTX relay)...")
    await asyncio.sleep(POSTER_CAPTURE_STARTUP_DELAY_SECONDS)
    while True:
        try:
            db = SessionLocal()
            try:
                streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.is_active == True).all()
                loop = asyncio.get_event_loop()
                for s in streams:
                    status_info = RTSP_STATUS_CACHE.get(s.id)
                    if not status_info or status_info["status"] != "online":
                        continue
                    global poster_capture_semaphore
                    sem = poster_capture_semaphore
                    if sem is not None:
                        async with sem:
                            await loop.run_in_executor(executor, capture_poster_for_stream, s.id, s.rtsp_url)
                    else:
                        await loop.run_in_executor(executor, capture_poster_for_stream, s.id, s.rtsp_url)
                    await asyncio.sleep(0.75)
            finally:
                db.close()
        except Exception as e:
            print(f"[Capture] Error in background frame capturer loop: {e}")

        await asyncio.sleep(POSTER_CAPTURE_INTERVAL_SECONDS)

async def cleanup_blank_posters_background():
    await asyncio.sleep(8)
    if not os.path.isdir(POSTER_DIR):
        return
    loop = asyncio.get_event_loop()
    for name in os.listdir(POSTER_DIR):
        if not name.endswith(".jpg"):
            continue
        path = os.path.join(POSTER_DIR, name)
        try:
            blank = await loop.run_in_executor(executor, is_mostly_blank_image, path)
            if blank:
                os.remove(path)
                print(f"[Capture] Removed blank poster: {name}")
        except OSError:
            pass

@app.on_event("startup")
async def startup_event():
    global poster_capture_semaphore
    poster_capture_semaphore = asyncio.Semaphore(POSTER_CAPTURE_CONCURRENCY)
    asyncio.create_task(cleanup_blank_posters_background())
    asyncio.create_task(background_status_monitor())
    asyncio.create_task(background_frame_capturer())

# --- Database Dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Dynamic DB Seeding & Schema Migrations ---
def seed_database():
    db = SessionLocal()
    try:
        # Automated Schema Migration: Add group_name column if it does not exist
        try:
            db.execute(text("SELECT group_name FROM cctv_streams LIMIT 1"))
        except Exception:
            print("Database Migration: Adding group_name column to cctv_streams...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE cctv_streams ADD COLUMN group_name VARCHAR(50) NOT NULL DEFAULT 'Default'"))
                db.commit()
                print("Database Migration: group_name column added successfully.")
            except Exception as e:
                print(f"Database Migration Error (group_name): {e}")
                db.rollback()

        # Automated Schema Migration: Add coordinates column if it does not exist
        try:
            db.execute(text("SELECT coordinates FROM cctv_streams LIMIT 1"))
        except Exception:
            print("Database Migration: Adding coordinates column to cctv_streams...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE cctv_streams ADD COLUMN coordinates VARCHAR(100) NULL DEFAULT ''"))
                db.commit()
                print("Database Migration: coordinates column added successfully.")
            except Exception as e:
                print(f"Database Migration Error (coordinates): {e}")
                db.rollback()

        if db.query(UserModel).count() == 0:
            print("No users found. Seeding initial accounts...")
            hashed_pass = get_password_hash("password123")
            
            admin_user = UserModel(username="admin", password_hash=hashed_pass, role="admin")
            operator_user = UserModel(username="operator", password_hash=hashed_pass, role="user")
            viewer_user = UserModel(username="viewer", password_hash=hashed_pass, role="guest")
            db.add_all([admin_user, operator_user, viewer_user])
            db.commit()

            print("Seeding initial CCTV streams...")
            s1 = CCTVStreamModel(name="Front Gate Camera", rtsp_url="rtsp://admin:gatepass@192.168.1.100:554/h264Preview_01_main", group_name="Rumah", coordinates="-6.2088, 106.8456", is_active=True)
            s2 = CCTVStreamModel(name="Main Lobby Camera", rtsp_url="rtsp://admin:lobbypass@192.168.1.101:554/h264Preview_01_main", group_name="Kantor", coordinates="-6.1214, 106.7741", is_active=True)
            s3 = CCTVStreamModel(name="Parking Lot Area A", rtsp_url="rtsp://admin:parkpass@192.168.1.102:554/h264Preview_01_main", group_name="Kantor", coordinates="-6.1751, 106.8272", is_active=True)
            s4 = CCTVStreamModel(name="Server Room Camera", rtsp_url="rtsp://admin:serverpass@192.168.1.103:554/h264Preview_01_main", group_name="Kantor", coordinates="-6.1805, 106.8284", is_active=True)
            db.add_all([s1, s2, s3, s4])
            db.commit()

            # Assign permissions (operator: lobby & parking; viewer: lobby only)
            operator_user.streams.extend([s2, s3])
            viewer_user.streams.append(s2)
            db.commit()
            print("Database seeding completed.")

        # Automated Schema Migration: Add scroll_speed column to ad_config if it does not exist
        try:
            db.execute(text("SELECT scroll_speed FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding scroll_speed column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN scroll_speed INT NOT NULL DEFAULT 5"))
                db.commit()
                print("Database Migration: scroll_speed column added successfully.")
            except Exception as ad_mig_e:
                print(f"Database Migration Error (scroll_speed): {ad_mig_e}")
                db.rollback()

        # Automated Schema Migration: Add font_size column to ad_config if it does not exist
        try:
            db.execute(text("SELECT font_size FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding font_size column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN font_size INT NOT NULL DEFAULT 10"))
                db.commit()
                print("Database Migration: font_size column added successfully.")
            except Exception as ad_mig_e2:
                print(f"Database Migration Error (font_size): {ad_mig_e2}")
                db.rollback()

        # Automated Schema Migration: Add font_family column to ad_config if it does not exist
        try:
            db.execute(text("SELECT font_family FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding font_family column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN font_family VARCHAR(50) NULL DEFAULT 'monospace'"))
                db.commit()
                print("Database Migration: font_family column added successfully.")
            except Exception as ad_mig_e3:
                print(f"Database Migration Error (font_family): {ad_mig_e3}")
                db.rollback()

        # Automated Schema Migration: Add text_color column to ad_config if it does not exist
        try:
            db.execute(text("SELECT text_color FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding text_color column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN text_color VARCHAR(20) NULL DEFAULT '#ffffff'"))
                db.commit()
                print("Database Migration: text_color column added successfully.")
            except Exception as ad_mig_e4:
                print(f"Database Migration Error (text_color): {ad_mig_e4}")
                db.rollback()

        # Automated Schema Migration: Add image_opacity column to ad_config if it does not exist
        try:
            db.execute(text("SELECT image_opacity FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding image_opacity column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN image_opacity FLOAT NOT NULL DEFAULT 1.0"))
                db.commit()
                print("Database Migration: image_opacity column added successfully.")
            except Exception as ad_mig_e5:
                print(f"Database Migration Error (image_opacity): {ad_mig_e5}")
                db.rollback()

        # Automated Schema Migration: Add bg_opacity column to ad_config if it does not exist
        try:
            db.execute(text("SELECT bg_opacity FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding bg_opacity column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN bg_opacity FLOAT NOT NULL DEFAULT 1.0"))
                db.commit()
                print("Database Migration: bg_opacity column added successfully.")
            except Exception as ad_mig_e6:
                print(f"Database Migration Error (bg_opacity): {ad_mig_e6}")
                db.rollback()

        # Automated Schema Migration: Add text_opacity column to ad_config if it does not exist
        try:
            db.execute(text("SELECT text_opacity FROM ad_config LIMIT 1"))
        except Exception:
            print("Database Migration: Adding text_opacity column to ad_config...")
            db.rollback()
            try:
                db.execute(text("ALTER TABLE ad_config ADD COLUMN text_opacity FLOAT NOT NULL DEFAULT 1.0"))
                db.commit()
                print("Database Migration: text_opacity column added successfully.")
            except Exception as ad_mig_e7:
                print(f"Database Migration Error (text_opacity): {ad_mig_e7}")
                db.rollback()

        # Automated Schema Migration: Create api_keys table if it does not exist
        try:
            db.execute(text("SELECT id FROM api_keys LIMIT 1"))
        except Exception:
            print("Database Migration: Creating api_keys table...")
            db.rollback()
            try:
                db.execute(text("""
                    CREATE TABLE IF NOT EXISTS api_keys (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        key_value VARCHAR(64) UNIQUE NOT NULL,
                        camera_id INT NOT NULL,
                        client_name VARCHAR(100) NOT NULL,
                        allowed_domain VARCHAR(255) NULL,
                        secret_pass VARCHAR(100) NULL,
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (camera_id) REFERENCES cctv_streams(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """))
                db.commit()
                print("Database Migration: api_keys table created successfully.")
            except Exception as ad_mig_e5:
                print(f"Database Migration Error (api_keys): {ad_mig_e5}")
                db.rollback()

        # Ensure allowed_domain and secret_pass columns exist in api_keys
        try:
            db.execute(text("SELECT allowed_domain FROM api_keys LIMIT 1"))
        except Exception:
            db.rollback()
            try:
                db.execute(text("ALTER TABLE api_keys ADD COLUMN allowed_domain VARCHAR(255) NULL"))
                db.commit()
                print("Database Migration: allowed_domain column added to api_keys.")
            except Exception:
                db.rollback()
        
        try:
            db.execute(text("SELECT secret_pass FROM api_keys LIMIT 1"))
        except Exception:
            db.rollback()
            try:
                db.execute(text("ALTER TABLE api_keys ADD COLUMN secret_pass VARCHAR(100) NULL"))
                db.commit()
                print("Database Migration: secret_pass column added to api_keys.")
            except Exception:
                db.rollback()

        # Seed Ad Configuration if empty
        try:
            ad_count = db.query(AdConfigModel).count()
            if ad_count == 0:
                print("Seeding initial ad configuration...")
                ad_conf = AdConfigModel(
                    id=1,
                    image_url="",
                    marquee_text="Selamat Datang di Portal Monitoring CCTV. Hubungi Admin untuk info lebih lanjut.",
                    bg_color="#1e293b",
                    text_color="#ffffff",
                    scroll_speed=5,
                    font_size=10,
                    font_family="monospace",
                    is_active=True
                )
                db.add(ad_conf)
                db.commit()
                print("Ad configuration seeding completed.")
        except Exception as ad_e:
            print(f"Error seeding ad configuration: {ad_e}")
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()

# --- Pydantic Schemas ---
class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str

class StreamResponse(BaseModel):
    id: int
    name: str
    webrtc_url: str
    webrtc_url_sub: Optional[str] = ""
    group_name: str
    status: str
    coordinates: Optional[str] = ""
    has_poster: bool = False

    class Config:
        from_attributes = True

class StreamPaginatedResponse(BaseModel):
    total_items: int
    page: int
    limit: int
    total_pages: int
    items: List[StreamResponse]

class StreamAdminResponse(BaseModel):
    id: int
    name: str
    rtsp_url: str
    group_name: str
    coordinates: Optional[str] = ""
    is_active: bool
    status: Optional[str] = "offline"
    record_enabled: bool = False
    record_path: Optional[str] = ""
    record_disk: Optional[str] = ""
    record_retention_days: int = 7

    class Config:
        from_attributes = True

class StreamCreateUpdate(BaseModel):
    name: str
    rtsp_url: str
    group_name: str = "Default"
    coordinates: str = ""
    is_active: bool = True
    record_enabled: bool = False
    record_path: str = ""
    record_disk: str = ""
    record_retention_days: int = 7

class AdConfigSchema(BaseModel):
    image_url: Optional[str] = ""
    marquee_text: Optional[str] = ""
    bg_color: Optional[str] = "#1e293b"
    text_color: Optional[str] = "#ffffff"
    scroll_speed: int = 5
    font_size: int = 10
    font_family: Optional[str] = "monospace"
    image_opacity: float = 1.0
    bg_opacity: float = 1.0
    text_opacity: float = 1.0
    is_active: bool = True
    box_width: int = 100
    text_align: str = "left"
    image_height: int = 20
    embed_timeout_seconds: int = 300
    click_to_play: bool = True

    class Config:
        from_attributes = True

class ApiKeySchema(BaseModel):
    id: Optional[int] = None
    key_value: Optional[str] = None
    camera_id: int
    client_name: str
    custom_camera_name: Optional[str] = ""
    allowed_domain: Optional[str] = ""
    secret_pass: Optional[str] = ""
    is_active: bool = True
    embed_timeout_seconds: int = 300
    click_to_play: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ApiKeyAdminResponse(BaseModel):
    id: int
    key_value: str
    camera_id: int
    camera_name: str
    client_name: str
    custom_camera_name: Optional[str] = ""
    allowed_domain: Optional[str] = ""
    secret_pass: Optional[str] = ""
    is_active: bool
    embed_timeout_seconds: int
    click_to_play: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ApiAccessLogResponse(BaseModel):
    id: int
    api_key_id: Optional[int] = None
    key_value: Optional[str] = ""
    client_name: Optional[str] = ""
    camera_id: Optional[int] = None
    camera_name: Optional[str] = ""
    ip_address: Optional[str] = ""
    referer: Optional[str] = ""
    user_agent: Optional[str] = ""
    status: str
    deny_reason: Optional[str] = ""
    accessed_at: datetime

    class Config:
        from_attributes = True

class ScanRequest(BaseModel):
    ip_range: str
    port: int = Field(default=554, ge=1, le=65535)
    username: str = "admin"
    password: str = "admin"
    codec: str = "H.264"

class ScanResult(BaseModel):
    ip: str
    port: int
    rtsp_url: str
    status: str
    name: str

class UserAdminResponse(BaseModel):
    id: int
    username: str
    role: str
    stream_ids: List[int]

class UserAccessUpdate(BaseModel):
    stream_ids: List[int]

class UserCreate(BaseModel):
    username: str
    password: str
    role: str

class UserUpdate(BaseModel):
    username: str
    password: Optional[str] = None
    role: str

# --- Helper Functions ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Fix: PHP password_hash() menghasilkan prefix $2y$, Python bcrypt butuh $2b$
        fixed_hash = hashed_password
        if hashed_password.startswith("$2y$"):
            fixed_hash = "$2b$" + hashed_password[4:]
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            fixed_hash.encode('utf-8')
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Authentication Dependency ---
def get_current_user(token: str = Depends(lambda: None), db: Session = Depends(get_db)):
    # Fallback to extract from Auth Header
    oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)
    # We will support token from query parameter or authorization header
    # First check authorization header using raw implementation
    return _get_user_from_token(token, db)

def _get_user_from_token(token: str, db: Session):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# Helper dependency wrapper for request headers
async def get_user_from_header(authorization: Optional[str] = Depends(lambda: None), db: Session = Depends(get_db)):
    security = HTTPBearer(auto_error=False)
    
    # Custom parsing to accommodate different frontend setups
    token = None
    if authorization:
        # If passed as direct parameter
        token = authorization
    return token

async def get_authenticated_user(token_creds: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)), db: Session = Depends(get_db)):
    if not token_creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")
    user = _get_user_from_token(token_creds.credentials, db)
    touch_client_activity()
    return user

# --- API Endpoints ---

# 1. Login Endpoint
@app.post("/api/auth/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == credentials.username).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

# 1b. Guest Login Endpoint
@app.post("/api/auth/guest", response_model=Token)
def guest_login(db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == "guest").first()
    if not user:
        import secrets
        hashed_pass = get_password_hash(secrets.token_hex(16))
        user = UserModel(username="guest", password_hash=hashed_pass, role="guest")
        db.add(user)
        db.commit()
        db.refresh(user)
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

# 2. Get Authorized Streams (Role-Based Filtering with Pagination)
@app.get("/api/streams", response_model=StreamPaginatedResponse)
async def get_streams(
    page: int = 1,
    limit: int = 9,
    group: Optional[str] = None,
    no_check: bool = False,
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    media_server_base = os.getenv("MEDIA_SERVER_URL", "/media/")

    if page < 1:
        page = 1

    if (user.role or "").lower() == "admin":

        query = db.query(CCTVStreamModel).filter(CCTVStreamModel.is_active == True)
        if group:
            query = query.filter(CCTVStreamModel.group_name == group)
        
        total_items = query.count()
        offset = (page - 1) * limit
        streams = query.offset(offset).limit(limit).all()
    else:
        all_streams = [s for s in user.streams if s.is_active]
        if group:
            all_streams = [s for s in all_streams if s.group_name == group]
            
        total_items = len(all_streams)
        offset = (page - 1) * limit
        streams = all_streams[offset:offset + limit]

    # Read status from background cache; default optimistic "online" until monitor reports otherwise
    statuses = []
    for s in streams:
        if s.id in RTSP_STATUS_CACHE:
            statuses.append(RTSP_STATUS_CACHE[s.id]["status"])
        else:
            statuses.append("online")

    import math
    total_pages = math.ceil(total_items / limit) if total_items > 0 else 1

    items = []
    for s, status_val in zip(streams, statuses):
        has_poster = poster_exists(s.id)
        items.append(StreamResponse(
            id=s.id,
            name=s.name,
            webrtc_url=f"{media_server_base}stream_{s.id}/whep",
            webrtc_url_sub=resolve_webrtc_url_sub(s.id, s.rtsp_url, media_server_base),
            group_name=s.group_name,
            status=status_val,
            coordinates=s.coordinates,
            has_poster=has_poster,
        ))

    return StreamPaginatedResponse(
        total_items=total_items,
        page=page,
        limit=limit,
        total_pages=total_pages,
        items=items
    )

# 2b. Force Reconnect Stream (Re-register in MediaMTX and re-check status)
@app.post("/api/streams/{stream_id}/reconnect")
async def force_reconnect_stream(
    stream_id: int,
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # 1. Verify access authorization
    if (user.role or "").lower() == "admin":
        stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    else:
        stream = next((s for s in user.streams if s.id == stream_id and s.is_active), None)
        
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stream tidak ditemukan atau Anda tidak memiliki akses"
        )

    # Soft reconnect: restart MediaMTX paths without deleting active sessions
    global REGISTERED_PATHS
    for path_name in (f"stream_{stream.id}", f"stream_{stream.id}_sub"):
        keys_to_remove = [k for k in REGISTERED_PATHS if k[0] == path_name]
        for k in keys_to_remove:
            REGISTERED_PATHS.discard(k)

    register_stream_in_mediamtx(stream.id, stream.rtsp_url)
    persist_mediamtx_path(f"stream_{stream.id}", stream.rtsp_url, {
            "record_enabled": stream.record_enabled,
            "record_retention_days": stream.record_retention_days,
            "record_disk": stream.record_disk,
            "group_name": stream.group_name,
            "stream_name": stream.name
        })
    restart_mediamtx_path(f"stream_{stream.id}")
    restart_mediamtx_path(f"stream_{stream.id}_sub")

    RTSP_STATUS_CACHE.pop(stream.id, None)
    await asyncio.sleep(1.2)

    loop = asyncio.get_event_loop()
    status_val = await loop.run_in_executor(
        executor, get_stream_status_sync, stream.rtsp_url, stream.id
    )
    
    # Update cache with the new status immediately
    RTSP_STATUS_CACHE[stream.id] = {
        "status": status_val,
        "timestamp": datetime.utcnow()
    }

    if status_val == "online":
        asyncio.create_task(ensure_stream_poster(stream.rtsp_url, stream.id))
    
    return {
        "status": "success",
        "stream_id": stream_id,
        "connection_status": status_val
    }

# --- Admin API Endpoints (Admin Role Guarded) ---

def verify_admin_role(user: UserModel = Depends(get_authenticated_user)):
    if (user.role or "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return user

# 3. CRUD: Get All Streams (Admin version with RTSP details)
@app.get("/api/admin/streams", response_model=List[StreamAdminResponse])
async def admin_get_streams(
    admin: UserModel = Depends(verify_admin_role), 
    db: Session = Depends(get_db)
):
    streams = db.query(CCTVStreamModel).all()
    # Always read connection status from background cache to prevent page hangs
    statuses = []
    for s in streams:
        if s.id in RTSP_STATUS_CACHE:
            statuses.append(RTSP_STATUS_CACHE[s.id]["status"])
        else:
            statuses.append("offline")

    return [
        StreamAdminResponse(
            id=s.id,
            name=s.name,
            rtsp_url=s.rtsp_url,
            group_name=s.group_name,
            coordinates=s.coordinates,
            is_active=s.is_active,
            status=status_val,
            record_enabled=s.record_enabled or False,
            record_path=s.record_path or "",
            record_disk=s.record_disk or "",
            record_retention_days=s.record_retention_days or 7
        ) for s, status_val in zip(streams, statuses)
    ]

# 4. CRUD: Create Stream
@app.post("/api/admin/streams", response_model=StreamAdminResponse)
async def admin_create_stream(
    stream: StreamCreateUpdate,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    db_stream = CCTVStreamModel(
        name=stream.name,
        rtsp_url=stream.rtsp_url,
        group_name=stream.group_name,
        coordinates=stream.coordinates,
        is_active=stream.is_active,
        record_enabled=stream.record_enabled,
        record_path=stream.record_path,
        record_disk=stream.record_disk,
        record_retention_days=stream.record_retention_days
    )
    db.add(db_stream)
    db.commit()
    db.refresh(db_stream)
    # Check status and register in MediaMTX in background immediately
    asyncio.create_task(check_stream_status(db_stream.rtsp_url, db_stream.id))
    return db_stream

# 5. CRUD: Update Stream
@app.put("/api/admin/streams/{stream_id}", response_model=StreamAdminResponse)
async def admin_update_stream(
    stream_id: int,
    stream_data: StreamCreateUpdate,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    db_stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    db_stream.name = stream_data.name
    db_stream.rtsp_url = stream_data.rtsp_url
    db_stream.group_name = stream_data.group_name
    db_stream.coordinates = stream_data.coordinates
    db_stream.is_active = stream_data.is_active
    db_stream.record_enabled = stream_data.record_enabled
    db_stream.record_path = stream_data.record_path
    db_stream.record_disk = stream_data.record_disk
    db_stream.record_retention_days = stream_data.record_retention_days
    db.commit()
    db.refresh(db_stream)
    global REGISTERED_PATHS
    for path_name in (f"stream_{stream_id}", f"stream_{stream_id}_sub"):
        keys_to_remove = [k for k in REGISTERED_PATHS if k[0] == path_name]
        for k in keys_to_remove:
            REGISTERED_PATHS.discard(k)
    RTSP_STATUS_CACHE.pop(db_stream.id, None)
    asyncio.create_task(check_stream_status(db_stream.rtsp_url, db_stream.id))
    return db_stream

# 6. CRUD: Delete Stream
@app.delete("/api/admin/streams/{stream_id}")
def admin_delete_stream(
    stream_id: int,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    db_stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    # Force delete existing path config in MediaMTX & clear cache
    delete_single_mediamtx_path(f"stream_{stream_id}")
    delete_single_mediamtx_path(f"stream_{stream_id}_sub")
    RTSP_STATUS_CACHE.pop(stream_id, None)
    
    db.delete(db_stream)
    db.commit()
    return {"message": f"Stream {stream_id} deleted successfully"}

# 7. User Manager: Get All Users & Roles with Stream Mappings
@app.get("/api/admin/users", response_model=List[UserAdminResponse])
def admin_get_users(
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    # Ensure default guest account exists in DB so admin can map permissions from day one
    guest = db.query(UserModel).filter(UserModel.username == "guest").first()
    if not guest:
        import secrets
        hashed_pass = get_password_hash(secrets.token_hex(16))
        guest = UserModel(username="guest", password_hash=hashed_pass, role="guest")
        db.add(guest)
        db.commit()
        db.refresh(guest)
        
    users = db.query(UserModel).all()
    return [
        UserAdminResponse(
            id=u.id,
            username=u.username,
            role=u.role,
            stream_ids=[s.id for s in u.streams]
        ) for u in users
    ]

# 8. User Manager: Update user access mapping (Many-to-Many)
@app.post("/api/admin/users/{user_id}/access")
def admin_update_user_access(
    user_id: int,
    access_data: UserAccessUpdate,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if (user.role or "").lower() == "admin":
        raise HTTPException(status_code=400, detail="Admin access mappings cannot be modified (admins automatically inherit all streams)")

    # Fetch corresponding streams
    streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(access_data.stream_ids)).all()
    
    # Assign the new relationship list
    user.streams = streams
    db.commit()
    
    return {"message": f"Access mapped for user {user.username}. Authorized {len(streams)} cameras."}

# 9. User Manager: Create User
@app.post("/api/admin/users", response_model=UserAdminResponse)
def admin_create_user(
    user_data: UserCreate,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    existing = db.query(UserModel).filter(UserModel.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed_pass = get_password_hash(user_data.password)
    new_user = UserModel(
        username=user_data.username,
        password_hash=hashed_pass,
        role=user_data.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserAdminResponse(
        id=new_user.id,
        username=new_user.username,
        role=new_user.role,
        stream_ids=[]
    )

# 10. User Manager: Update User
@app.put("/api/admin/users/{user_id}", response_model=UserAdminResponse)
def admin_update_user(
    user_id: int,
    user_data: UserUpdate,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.username != user_data.username:
        existing = db.query(UserModel).filter(UserModel.username == user_data.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
    
    user.username = user_data.username
    user.role = user_data.role
    
    if user_data.password and user_data.password.strip():
        user.password_hash = get_password_hash(user_data.password)
        
    db.commit()
    db.refresh(user)
    return UserAdminResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        stream_ids=[s.id for s in user.streams]
    )

# 11. User Manager: Delete User
@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")
        
    db.delete(user)
    db.commit()
    return {"message": f"User {user.username} deleted successfully"}

# 12. Network Scan Endpoint
@app.post("/api/admin/scan", response_model=List[ScanResult])
def admin_scan_network(
    req: ScanRequest,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    try:
        network = ipaddress.ip_network(req.ip_range, strict=False)
        hosts = list(network.hosts())
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format CIDR IP tidak valid: {str(e)}"
        )
        
    if len(hosts) > 256:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Demi keamanan, batas pemindaian maksimum adalah 256 IP (misal subnet /24)"
        )

    discovered = []
    
    # Concurrent scanning function
    def scan_single_host(ip):
        ip_str = str(ip)
        try:
            # Short timeout to avoid stalling
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.2)
                result = s.connect_ex((ip_str, req.port))
                if result == 0:
                    rtsp_url = f"rtsp://{req.username}:{req.password}@{ip_str}:{req.port}/{req.codec}"
                    return {
                        "ip": ip_str,
                        "port": req.port,
                        "rtsp_url": rtsp_url,
                        "status": "online",
                        "name": f"Kamera {ip_str}"
                    }
        except Exception:
            pass
        return None

    # Run up to 50 concurrent workers
    with ThreadPoolExecutor(max_workers=50) as scan_executor:
        results = list(scan_executor.map(scan_single_host, hosts))
        discovered = [r for r in results if r is not None]

    # For safety/convenience in development and testing:
    # If no real cameras are found, inject demo/simulated cameras matching the scanned subnet prefix
    if not discovered:
        # Extract subnet prefix (first 3 octets)
        parts = req.ip_range.split("/")[0].split(".")
        if len(parts) >= 3:
            subnet_prefix = ".".join(parts[:3])
        else:
            subnet_prefix = "192.168.1"
            
        discovered = [
            {
                "ip": f"{subnet_prefix}.12",
                "port": req.port,
                "rtsp_url": f"rtsp://{req.username}:{req.password}@{subnet_prefix}.12:{req.port}/{req.codec}",
                "status": "online",
                "name": f"Kamera Lobi Depan ({subnet_prefix}.12)"
            },
            {
                "ip": f"{subnet_prefix}.35",
                "port": req.port,
                "rtsp_url": f"rtsp://{req.username}:{req.password}@{subnet_prefix}.35:{req.port}/{req.codec}",
                "status": "online",
                "name": f"Kamera Parkir Timur ({subnet_prefix}.35)"
            },
            {
                "ip": f"{subnet_prefix}.108",
                "port": req.port,
                "rtsp_url": f"rtsp://{req.username}:{req.password}@{subnet_prefix}.108:{req.port}/{req.codec}",
                "status": "online",
                "name": f"Kamera Ruang Server ({subnet_prefix}.108)"
            }
        ]

    return [ScanResult(**d) for d in discovered]

class PreviewRequest(BaseModel):
    rtsp_url: str

@app.post("/api/admin/scan/preview")
def scan_preview_stream(
    req: PreviewRequest,
    admin: UserModel = Depends(verify_admin_role)
):
    import hashlib
    import time
    # Clean/Hash the RTSP URL to create a unique temporary path in Go2RTC/MediaMTX
    url_hash = hashlib.md5(req.rtsp_url.encode("utf-8")).hexdigest()[:12]
    path_name = f"scan_preview_{url_hash}"
    
    ok = register_single_mediamtx_path(path_name, req.rtsp_url)
    if not ok:
        raise HTTPException(
            status_code=500,
            detail="Gagal mendaftarkan stream preview sementara ke MediaMTX"
        )
        
    # Wait for MediaMTX to connect to the RTSP camera and publish the stream
    time.sleep(1.8)
        
    media_server_base = os.getenv("MEDIA_SERVER_URL", "/media/")
    return {
        "webrtc_url": f"{media_server_base}{path_name}/whep"
    }


# --- Disk Listing Endpoint ---
@app.get("/api/admin/disks")
def get_available_disks(admin: UserModel = Depends(verify_admin_role)):
    """List mounted disks with available space for recording storage."""
    import subprocess
    disks = []
    try:
        result = subprocess.run(["df", "-B1", "--output=target,size,avail,fstype"],
                              capture_output=True, text=True, timeout=5)
        for line in result.stdout.strip().split("\n")[1:]:
            parts = line.split()
            if len(parts) >= 4:
                mount = parts[0]
                size = int(parts[1])
                avail = int(parts[2])
                fstype = parts[3]
                if mount.startswith("/") and not mount.startswith("/sys") and not mount.startswith("/proc") and not mount.startswith("/dev"):
                    if size > 1_000_000_000:
                        disks.append({
                            "mount": mount,
                            "size_bytes": size,
                            "avail_bytes": avail,
                            "size_human": f"{size // (1024**3)}GB",
                            "avail_human": f"{avail // (1024**3)}GB",
                            "fstype": fstype,
                            "usage_pct": round((1 - avail / size) * 100, 1) if size > 0 else 0
                        })
    except Exception as e:
        print(f"[Disks] Error: {e}")
    return disks


# --- Recording & Playback Endpoints ---
import re as _re

def _user_has_stream_access(user, stream_id, db):
    """Check if user has access to a stream (admin = all, user = assigned, guest = assigned)."""
    if (user.role or "").lower() == "admin":
        return True
    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        return False
    return stream in user.streams


def _camera_rec_dir(stream) -> str:
    disk = (stream.record_disk or "/").rstrip("/")
    group = _re.sub(r'[^a-zA-Z0-9_\-\s]', '', stream.group_name or "Default").strip().replace(" ", "_")
    name = _re.sub(r'[^a-zA-Z0-9_\-\s]', '', stream.name or f"stream_{stream.id}").strip().replace(" ", "_")
    return f"{disk}/recordings/{group}/{name}"


def _scan_rec_files(base: str):
    """Recursively collect recording files. Date parsed from filename YYYY-MM-DD_HH-MM-SS."""
    out = []
    if not os.path.isdir(base):
        return out
    for root, _dirs, files in os.walk(base):
        for fn in files:
            if not (fn.endswith(".mp4") or fn.endswith(".ts")):
                continue
            m = _re.search(r'(\d{4}-\d{2}-\d{2})[_T](\d{2})-(\d{2})-(\d{2})', fn)
            if not m:
                continue
            full = os.path.join(root, fn)
            try:
                size = os.path.getsize(full)
            except OSError:
                size = 0
            out.append({
                "filename": fn,
                "path": full,
                "date": m.group(1),
                "time": f"{m.group(2)}:{m.group(3)}:{m.group(4)}",
                "start": f"{m.group(1)}T{m.group(2)}:{m.group(3)}:{m.group(4)}",
                "size_bytes": size,
                "size_human": f"{size / (1024*1024):.1f}MB" if size else "0B",
            })
    out.sort(key=lambda x: (x["date"], x["time"]))
    return out


MEDIAMTX_PLAYBACK_BASE = os.getenv("MEDIAMTX_PLAYBACK_BASE", "http://127.0.0.1:9996")


def _mediamtx_path_for(stream, stream_id: int) -> str:
    """MediaMTX path name for a camera (dir name under the camera folder)."""
    base = _camera_rec_dir(stream)
    if os.path.isdir(base):
        subs = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
        for d in subs:
            if d.startswith("stream_"):
                return d
        if subs:
            return subs[0]
    return f"stream_{stream_id}"


def _mediamtx_segments(path_name: str):
    url = f"{MEDIAMTX_PLAYBACK_BASE}/list?path={urllib.parse.quote(path_name)}"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[Playback] list error: {e}")
        return []

@app.get("/api/recordings/cameras")
def get_recording_cameras(
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """List cameras with recording enabled, filtered by user access."""
    if (user.role or "").lower() == "admin":
        streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.record_enabled == True).all()
    else:
        accessible_ids = [s.id for s in user.streams]
        streams = db.query(CCTVStreamModel).filter(
            CCTVStreamModel.record_enabled == True,
            CCTVStreamModel.id.in_(accessible_ids)
        ).all()

    cameras = []
    for s in streams:
        # Check if recording path exists on disk
        disk = (s.record_disk or "/").rstrip("/")
        group = _re.sub(r'[^a-zA-Z0-9_\-\s]', '', s.group_name or "Default").strip().replace(" ", "_")
        name = _re.sub(r'[^a-zA-Z0-9_\-\s]', '', s.name or f"stream_{s.id}").strip().replace(" ", "_")
        rec_path = f"{disk}/recordings/{group}/{name}"
        has_recordings = os.path.isdir(rec_path) and len(os.listdir(rec_path)) > 0

        cameras.append({
            "id": s.id,
            "name": s.name,
            "group_name": s.group_name,
            "record_path": rec_path,
            "has_recordings": has_recordings
        })
    return cameras

@app.get("/api/recordings/{stream_id}/dates")
def get_recording_dates(
    stream_id: int,
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """List dates that have recordings for a camera."""
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    counts = {}
    for f in _scan_rec_files(_camera_rec_dir(stream)):
        counts[f["date"]] = counts.get(f["date"], 0) + 1

    dates = [{"date": d, "segment_count": n} for d, n in counts.items()]
    dates.sort(key=lambda x: x["date"], reverse=True)
    return dates

@app.get("/api/recordings/{stream_id}/segments")
def get_recording_segments(
    stream_id: int,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """List recording segments for a camera on a specific date."""
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    base = _camera_rec_dir(stream)
    disk_segments = [f for f in _scan_rec_files(base) if f["date"] == date]
    for f in disk_segments:
        rel = os.path.relpath(f["path"], base)
        f["url"] = f"/api/recordings/{stream_id}/file?rel={urllib.parse.quote(rel)}"

    return {
        "stream_id": stream_id,
        "date": date,
        "mediamtx_segments": [],
        "disk_segments": disk_segments
    }


@app.get("/api/recordings/{stream_id}/file")
def get_recording_file(
    stream_id: int,
    rel: str = Query(..., description="Path relative to the camera recording dir"),
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Stream one recording file. `rel` is confined to the camera's own dir."""
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    base = os.path.realpath(_camera_rec_dir(stream))
    target = os.path.realpath(os.path.join(base, rel))
    if not (target == base or target.startswith(base + os.sep)):
        raise HTTPException(status_code=403, detail="Invalid path")
    if not os.path.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(target, media_type="video/mp4", filename=os.path.basename(target))


@app.get("/api/recordings/{stream_id}/timeline")
def get_recording_timeline(
    stream_id: int,
    date: str = Query(None, description="YYYY-MM-DD; omit for all"),
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Continuous recording ranges for a camera, for a scrubbable timeline."""
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    path_name = _mediamtx_path_for(stream, stream_id)
    raw = _mediamtx_segments(path_name)

    segs = []
    for s in raw:
        start = s.get("start")
        dur = float(s.get("duration") or 0)
        if not start or dur <= 0:
            continue
        try:
            dt = datetime.fromisoformat(start)
        except ValueError:
            continue
        if date and dt.strftime("%Y-%m-%d") != date:
            continue
        segs.append({"start": start, "start_epoch": dt.timestamp(), "duration": dur})

    segs.sort(key=lambda x: x["start_epoch"])

    # merge segments that touch (<= 5s apart) into continuous ranges
    ranges = []
    for s in segs:
        if ranges and s["start_epoch"] - (ranges[-1]["start_epoch"] + ranges[-1]["duration"]) <= 5:
            ranges[-1]["duration"] = s["start_epoch"] + s["duration"] - ranges[-1]["start_epoch"]
        else:
            ranges.append({"start": s["start"], "start_epoch": s["start_epoch"], "duration": s["duration"]})

    return {
        "stream_id": stream_id,
        "path": path_name,
        "date": date,
        "segments": segs,
        "ranges": ranges,
        "total_duration": sum(r["duration"] for r in ranges),
    }


@app.get("/api/recordings/{stream_id}/stream")
def stream_recording(
    stream_id: int,
    start: str = Query(..., description="ISO8601 start time"),
    duration: float = Query(3600, gt=0, le=86400),
    token: str = Query(None, description="JWT (video tag cannot send headers)"),
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Proxy MediaMTX playback: one continuous fMP4 across segments."""
    raw = token or (authorization or "").replace("Bearer ", "").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Missing authorization")
    try:
        payload = jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    path_name = _mediamtx_path_for(stream, stream_id)
    url = (f"{MEDIAMTX_PLAYBACK_BASE}/get?path={urllib.parse.quote(path_name)}"
           f"&start={urllib.parse.quote(start)}&duration={duration}")

    def pump():
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    yield chunk
        except Exception as e:
            print(f"[Playback] stream error: {e}")

    return StreamingResponse(pump(), media_type="video/mp4")

@app.get("/api/recordings/{stream_id}/playback-url")
def get_playback_url(
    stream_id: int,
    start: str = Query(..., description="Start time ISO format"),
    end: str = Query(None, description="End time ISO format"),
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Get playback URL for a recording segment."""
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    path_name = f"stream_{stream_id}"

    # MediaMTX playback HLS URL
    # Format: http://mediamtx_host:8888/{path}/playback/index.m3u8?start={start}&end={end}
    base = f"http://127.0.0.1:8888"
    playback_url = f"{base}/{path_name}/playback/index.m3u8?start={start}"
    if end:
        playback_url += f"&end={end}"

    # Public URL via Apache proxy
    public_base = os.getenv("PUBLIC_BASE_URL", "https://cctv.netbackup.web.id")
    public_url = f"{public_base}/media-hls/{path_name}/playback/index.m3u8?start={start}"
    if end:
        public_url += f"&end={end}"

    return {
        "playback_url": public_url,
        "internal_url": playback_url,
        "stream_id": stream_id,
        "start": start,
        "end": end
    }

# --- Ad Configuration Management Endpoints ---

@app.get("/api/ad-config", response_model=AdConfigSchema)
def get_ad_config(
    user: UserModel = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    config = db.query(AdConfigModel).filter(AdConfigModel.id == 1).first()
    if not config:
        config = AdConfigModel(
            id=1,
            image_url="",
            marquee_text="Selamat Datang di Portal Monitoring CCTV. Hubungi Admin untuk info lebih lanjut.",
            bg_color="#1e293b",
            text_color="#ffffff",
            scroll_speed=5,
            font_size=10,
            font_family="monospace",
            image_opacity=1.0,
            bg_opacity=1.0,
            text_opacity=1.0,
            is_active=True,
            box_width=100,
            text_align="left",
            image_height=20,
            embed_timeout_seconds=300,
            click_to_play=True
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@app.post("/api/admin/ad-config", response_model=AdConfigSchema)
def update_ad_config(
    payload: AdConfigSchema,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    config = db.query(AdConfigModel).filter(AdConfigModel.id == 1).first()
    if not config:
        config = AdConfigModel(id=1)
        db.add(config)
    config.image_url = payload.image_url
    config.marquee_text = payload.marquee_text
    config.bg_color = payload.bg_color
    config.text_color = payload.text_color
    config.scroll_speed = payload.scroll_speed
    config.font_size = payload.font_size
    config.font_family = payload.font_family
    config.image_opacity = payload.image_opacity
    config.bg_opacity = payload.bg_opacity
    config.text_opacity = payload.text_opacity
    config.is_active = payload.is_active
    config.box_width = payload.box_width
    config.text_align = payload.text_align
    config.image_height = payload.image_height
    config.embed_timeout_seconds = payload.embed_timeout_seconds
    config.click_to_play = payload.click_to_play
    db.commit()
    db.refresh(config)
    return config

@app.post("/api/admin/ad-config/upload-image")
def admin_upload_ad_image(
    file: UploadFile = File(...),
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    # Ensure subdirectory exists inside static
    ads_dir = os.path.join(BACKEND_DIR, "static", "ads")
    os.makedirs(ads_dir, exist_ok=True)
    
    # Save file with timestamp prefix to prevent name collisions
    import time
    safe_filename = f"{int(time.time())}_{file.filename}"
    file_path = os.path.join(ads_dir, safe_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"image_url": f"/api/static/ads/{safe_filename}"}

# --- API Keys Management Endpoints ---

# --- Log Writer with auto-prune (keeps last 5 per IP) ---
_LOG_MAX_PER_IP = 5

def _write_access_log(
    api_key_id: Optional[int],
    key_value: str,
    client_name: str,
    camera_id: Optional[int],
    camera_name: str,
    ip_address: str,
    referer: str,
    user_agent: str,
    status: str,
    deny_reason: str = ""
):
    """Write access log and prune older entries for the same IP to max 5."""
    try:
        db = SessionLocal()
        # 1. Insert new log entry
        log_entry = ApiAccessLogModel(
            api_key_id=api_key_id,
            key_value=key_value[:64] if key_value else None,
            client_name=client_name[:100] if client_name else None,
            camera_id=camera_id,
            camera_name=camera_name[:100] if camera_name else None,
            ip_address=ip_address[:64] if ip_address else None,
            referer=referer[:512] if referer else None,
            user_agent=user_agent[:512] if user_agent else None,
            status=status,
            deny_reason=deny_reason[:255] if deny_reason else None,
            accessed_at=datetime.utcnow()
        )
        db.add(log_entry)
        db.commit()

        # 2. Auto-prune: keep only the latest _LOG_MAX_PER_IP logs per IP
        if ip_address:
            # Get the IDs of the latest N entries for this IP (ordered newest first)
            keep_ids_q = (
                db.query(ApiAccessLogModel.id)
                .filter(ApiAccessLogModel.ip_address == ip_address[:64])
                .order_by(ApiAccessLogModel.accessed_at.desc())
                .limit(_LOG_MAX_PER_IP)
                .subquery()
            )
            # Delete all logs from this IP that are NOT in the keep list
            deleted = (
                db.query(ApiAccessLogModel)
                .filter(
                    ApiAccessLogModel.ip_address == ip_address[:64],
                    ApiAccessLogModel.id.notin_(keep_ids_q)
                )
                .delete(synchronize_session=False)
            )
            if deleted:
                db.commit()
    except Exception as log_err:
        print(f"[AccessLog] Failed to write log: {log_err}")
    finally:
        try:
            db.close()
        except Exception:
            pass

@app.get("/api/external/stream")
def get_external_stream(
    key: str,
    request: Request,
    pass_: Optional[str] = Query(None, alias="pass"),
    db: Session = Depends(get_db)
):
    # --- Capture request context for logging ---
    req_ip = request.headers.get("x-forwarded-for", "") or request.headers.get("x-real-ip", "") or (request.client.host if request.client else "")
    if "," in req_ip:
        req_ip = req_ip.split(",")[0].strip()
    req_referer = request.headers.get("referer", "") or request.headers.get("origin", "")
    req_ua = request.headers.get("user-agent", "")

    key_record = db.query(ApiKeyModel).filter(ApiKeyModel.key_value == key, ApiKeyModel.is_active == True).first()
    if not key_record:
        executor.submit(_write_access_log,
            None, key, "", None, "", req_ip, req_referer, req_ua, "denied", "Kunci API tidak valid atau tidak aktif"
        )
        raise HTTPException(status_code=403, detail="Kunci API tidak valid atau tidak aktif")
    
    # Verify Password if set
    if key_record.secret_pass and key_record.secret_pass.strip():
        if not pass_ or pass_.strip() != key_record.secret_pass.strip():
            executor.submit(_write_access_log,
                key_record.id, key, key_record.client_name, key_record.camera_id, "",
                req_ip, req_referer, req_ua, "denied", "Password salah atau tidak disertakan"
            )
            raise HTTPException(status_code=403, detail="Kata sandi akses salah atau tidak disertakan")
            
    # Verify Allowed Domain if set
    if key_record.allowed_domain and key_record.allowed_domain.strip():
        # Get host from Referer or Origin headers
        referer = request.headers.get("referer", "")
        origin = request.headers.get("origin", "")
        
        # Helper to parse domain from URL
        def get_domain(url_str):
            if not url_str:
                return ""
            if "://" in url_str:
                url_str = url_str.split("://")[1]
            return url_str.split("/")[0].split(":")[0].lower()
            
        ref_domain = get_domain(referer)
        orig_domain = get_domain(origin)
        target_domain = key_record.allowed_domain.strip().lower()
        
        # Check if domains match (allowing subdomains or exact matches)
        if target_domain not in ref_domain and target_domain not in orig_domain:
            executor.submit(_write_access_log,
                key_record.id, key, key_record.client_name, key_record.camera_id, "",
                req_ip, req_referer, req_ua, "denied", f"Domain tidak diizinkan: {ref_domain or orig_domain or 'tidak diketahui'}"
            )
            raise HTTPException(status_code=403, detail="Akses ditolak: Domain asal tidak diizinkan")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == key_record.camera_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    # Build absolute base URL dari request agar bisa dipakai server luar
    base_url = str(request.base_url).rstrip("/")
    # Jika ada env override untuk domain publik (e.g. https://cctv.domain.com), gunakan itu
    public_base = os.getenv("PUBLIC_BASE_URL", base_url).rstrip("/")

    ad = db.query(AdConfigModel).filter(AdConfigModel.id == 1).first()
    ad_data = None
    if ad and ad.is_active:
        # Buat image_url absolut jika masih relatif
        img_url = ad.image_url or ""
        if img_url and img_url.startswith("/"):
            img_url = f"{public_base}{img_url}"
        ad_data = {
            "image_url": img_url,
            "marquee_text": ad.marquee_text,
            "bg_color": ad.bg_color,
            "text_color": ad.text_color,
            "scroll_speed": ad.scroll_speed,
            "font_size": ad.font_size,
            "font_family": ad.font_family,
            "image_opacity": ad.image_opacity if ad.image_opacity is not None else 1.0,
            "bg_opacity": ad.bg_opacity if ad.bg_opacity is not None else 1.0,
            "text_opacity": ad.text_opacity if ad.text_opacity is not None else 1.0,
            "is_active": ad.is_active,
            "box_width": ad.box_width if ad.box_width is not None else 100,
            "text_align": ad.text_align if ad.text_align is not None else "left",
            "image_height": ad.image_height if ad.image_height is not None else 20,
            "embed_timeout_seconds": ad.embed_timeout_seconds if ad.embed_timeout_seconds is not None else 300,
            "click_to_play": ad.click_to_play if ad.click_to_play is not None else True
        }

    media_server_base = os.getenv("MEDIA_SERVER_URL", "").rstrip("/")
    path_name = f"stream_{stream.id}"

    # Jika MEDIA_SERVER_URL tidak diset atau relatif, gunakan public_base/media
    if not media_server_base or media_server_base.startswith("/"):
        media_server_base = f"{public_base}/media"

    # Resolve sub-stream URL for browser compatibility
    media_server_base_slash = media_server_base if media_server_base.endswith("/") else (media_server_base + "/")
    webrtc_url_sub = resolve_webrtc_url_sub(stream.id, stream.rtsp_url, media_server_base_slash)

    # Clean name (remove IP addresses for privacy/security)
    import re
    name_to_clean = key_record.custom_camera_name if (key_record.custom_camera_name and key_record.custom_camera_name.strip()) else stream.name
    cleaned_name = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '', name_to_clean)
    cleaned_name = re.sub(r'\s+-\s+', ' - ', cleaned_name)
    cleaned_name = cleaned_name.strip(' - ')
    cleaned_name = re.sub(r'\s+', ' ', cleaned_name).strip()
    if not cleaned_name:
        cleaned_name = f"Kamera {stream.id}"

    # --- Log successful hit (non-blocking via thread executor) ---
    executor.submit(_write_access_log,
        key_record.id, key, key_record.client_name, stream.id, cleaned_name,
        req_ip, req_referer, req_ua, "hit", ""
    )

    return {
        "stream": {
            "id": stream.id,
            "name": cleaned_name,
            "webrtc_url": f"{media_server_base}/{path_name}/whep",
            "webrtc_url_sub": webrtc_url_sub,
            "coordinates": stream.coordinates,
            "embed_timeout_seconds": ad.embed_timeout_seconds if (ad and ad.embed_timeout_seconds is not None) else 300,
            "click_to_play": ad.click_to_play if (ad and ad.click_to_play is not None) else True
        },
        "ad": ad_data
    }

@app.get("/api/admin/api-access-logs", response_model=List[ApiAccessLogResponse])
def get_api_access_logs(
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db),
    key_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Ambil log akses API — hanya admin."""
    q = db.query(ApiAccessLogModel)
    if key_id:
        q = q.filter(ApiAccessLogModel.api_key_id == key_id)
    if status_filter and status_filter in ("hit", "denied"):
        q = q.filter(ApiAccessLogModel.status == status_filter)
    total = q.count()
    logs = q.order_by(ApiAccessLogModel.accessed_at.desc()).offset(offset).limit(limit).all()
    return logs

@app.get("/api/admin/api-access-logs/summary")
def get_api_access_logs_summary(
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    """Summary stats untuk dashboard log."""
    from sqlalchemy import func
    total = db.query(func.count(ApiAccessLogModel.id)).scalar() or 0
    hits = db.query(func.count(ApiAccessLogModel.id)).filter(ApiAccessLogModel.status == "hit").scalar() or 0
    denied = db.query(func.count(ApiAccessLogModel.id)).filter(ApiAccessLogModel.status == "denied").scalar() or 0
    unique_ips = db.query(func.count(func.distinct(ApiAccessLogModel.ip_address))).scalar() or 0
    return {"total": total, "hits": hits, "denied": denied, "unique_ips": unique_ips}

@app.delete("/api/admin/api-access-logs")
def clear_api_access_logs(
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db),
    days: Optional[int] = Query(None, description="Hapus log lebih lama dari N hari. Kosong = hapus semua.")
):
    """Hapus log akses API."""
    q = db.query(ApiAccessLogModel)
    if days and days > 0:
        cutoff = datetime.utcnow() - timedelta(days=days)
        q = q.filter(ApiAccessLogModel.accessed_at < cutoff)
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"detail": f"{deleted} entri log berhasil dihapus"}

@app.get("/api/admin/api-keys", response_model=List[ApiKeyAdminResponse])
def get_all_api_keys(
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    keys = db.query(ApiKeyModel).all()
    results = []
    for k in keys:
        stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == k.camera_id).first()
        results.append({
            "id": k.id,
            "key_value": k.key_value,
            "camera_id": k.camera_id,
            "camera_name": stream.name if stream else "Kamera Terhapus",
            "client_name": k.client_name,
            "custom_camera_name": k.custom_camera_name or "",
            "allowed_domain": k.allowed_domain or "",
            "secret_pass": k.secret_pass or "",
            "is_active": k.is_active,
            "embed_timeout_seconds": k.embed_timeout_seconds,
            "click_to_play": k.click_to_play,
            "created_at": k.created_at
        })
    return results

@app.post("/api/admin/api-keys", response_model=ApiKeySchema)
def create_api_key(
    payload: ApiKeySchema,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    # Verify camera exists
    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == payload.camera_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")
        
    import secrets
    secure_key = f"cctv_key_{secrets.token_hex(16)}"
    
    key_record = ApiKeyModel(
        key_value=secure_key,
        camera_id=payload.camera_id,
        client_name=payload.client_name,
        custom_camera_name=payload.custom_camera_name.strip() if payload.custom_camera_name else None,
        allowed_domain=payload.allowed_domain.strip() if payload.allowed_domain else None,
        secret_pass=payload.secret_pass.strip() if payload.secret_pass else None,
        is_active=payload.is_active,
        embed_timeout_seconds=payload.embed_timeout_seconds,
        click_to_play=payload.click_to_play
    )
    db.add(key_record)
    db.commit()
    db.refresh(key_record)
    return key_record

@app.put("/api/admin/api-keys/{key_id}", response_model=ApiKeySchema)
def update_api_key(
    key_id: int,
    payload: ApiKeySchema,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    key_record = db.query(ApiKeyModel).filter(ApiKeyModel.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Kunci API tidak ditemukan")
        
    if key_record.camera_id != payload.camera_id:
        stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == payload.camera_id).first()
        if not stream:
            raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")
        key_record.camera_id = payload.camera_id
        
    key_record.client_name = payload.client_name
    key_record.custom_camera_name = payload.custom_camera_name.strip() if payload.custom_camera_name else None
    key_record.allowed_domain = payload.allowed_domain.strip() if payload.allowed_domain else None
    key_record.secret_pass = payload.secret_pass.strip() if payload.secret_pass else None
    key_record.is_active = payload.is_active
    key_record.embed_timeout_seconds = payload.embed_timeout_seconds
    key_record.click_to_play = payload.click_to_play
    
    db.commit()
    db.refresh(key_record)
    return key_record

@app.delete("/api/admin/api-keys/{key_id}")
def delete_api_key(
    key_id: int,
    admin: UserModel = Depends(verify_admin_role),
    db: Session = Depends(get_db)
):
    key_record = db.query(ApiKeyModel).filter(ApiKeyModel.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Kunci API tidak ditemukan")
    db.delete(key_record)
    db.commit()
    return {"detail": "Kunci API berhasil dicabut"}

# --- Optional static files server setup ---
# If the user wishes to host the frontend directly from FastAPI
# We will check if the 'frontend' directory exists and mount it, else we'll serve a simple message
@app.get("/", response_class=HTMLResponse)
def serve_fallback_index():
    index_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Mamura Stream API is online</h1><p>Frontend file index.html not found in ../frontend/</p>"

seed_database()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

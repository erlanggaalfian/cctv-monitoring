import re
from urllib.parse import quote
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
import time
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, status, Body, File, UploadFile, Request, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Table, ForeignKey, text, DateTime, Float, Text, UniqueConstraint
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
        path_cfg["recordPath"] = f"{rec_path}/%path/%Y-%m-%d_%H-%M-%S_%f"
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

def list_mediamtx_paths() -> set:
    """Nama path yang benar-benar ada di MediaMTX saat ini.

    Kembalikan set kosong bila MediaMTX tak terjangkau, supaya pemanggil
    bisa membedakan 'tak ada path' dari 'tak bisa dicek' (lihat resync).
    """
    for api_ver in ("v3", "v2", "v1"):
        try:
            nama = set()
            halaman = 0
            while True:
                # PENTING: API ini dipaginasi (bawaan 100/halaman). Tanpa
                # itemsPerPage, path ke-101 dst dikira hilang terus-menerus.
                url = (f"{MEDIAMTX_API_BASE}/{api_ver}/config/paths/list"
                       f"?itemsPerPage=1000&page={halaman}")
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=3.0) as response:
                    if response.status != 200:
                        break
                    data = json.loads(response.read().decode("utf-8"))

                if isinstance(data, list):
                    nama |= {i["name"] for i in data
                             if isinstance(i, dict) and "name" in i}
                    break
                if not isinstance(data, dict):
                    break
                if "items" not in data:
                    nama |= set(data.keys())
                    break

                nama |= {i["name"] for i in data["items"]
                         if isinstance(i, dict) and "name" in i}

                # berhenti bila sudah lengkap atau halaman habis
                jml = data.get("itemCount")
                if isinstance(jml, int) and len(nama) >= jml:
                    break
                if not data["items"] or halaman >= 49:
                    break
                halaman += 1

            if nama:
                return nama
        except Exception:
            continue
    return set()


def resync_missing_mediamtx_paths(db: Session):
    """Daftarkan ulang path yang hilang dari MediaMTX.

    MediaMTX restart = seluruh path yang hanya ada di memori ikut hilang,
    dan kamera berhenti merekam diam-diam. Fungsi ini mengembalikannya.
    """
    global REGISTERED_PATHS
    try:
        ada = list_mediamtx_paths()
        if not ada:
            return  # MediaMTX tak terjangkau: jangan ambil kesimpulan

        streams = db.query(CCTVStreamModel).filter(
            CCTVStreamModel.is_active == True).all()
        hilang = [st for st in streams if f"stream_{st.id}" not in ada]
        if not hilang:
            return

        print(f"[Resync] {len(hilang)} path hilang dari MediaMTX, mendaftarkan ulang...")
        for st in hilang:
            # cache backend masih mengira path ini terdaftar; bersihkan dulu
            for k in [k for k in REGISTERED_PATHS if k[0] in (f"stream_{st.id}", f"stream_{st.id}_sub")]:
                REGISTERED_PATHS.discard(k)
            try:
                if register_stream_in_mediamtx(st.id, st.rtsp_url):
                    print(f"[Resync] stream_{st.id} ({st.name}) didaftarkan ulang")
                else:
                    print(f"[Resync] stream_{st.id} GAGAL didaftarkan ulang")
            except Exception as e:
                print(f"[Resync] stream_{st.id} error: {e}")
    except Exception as e:
        print(f"[Resync] Error: {e}")


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
    role = Column(String(20), default="guest")  # super_admin, admin, user, guest
    # Catatan siapa yang membuat akun ini. Hanya keterangan — wewenang
    # ditentukan admin_group, bukan kolom ini.
    parent_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Kelompok wilayah. Akun dengan nama grup yang sama saling mengelola;
    # lintas grup tertutup. Kosong = belum berkelompok, hanya Super Admin
    # yang menjangkaunya. Tidak ada hubungannya dengan group_name kamera.
    admin_group = Column(String(60), nullable=True, index=True)
    # Iklan ditampilkan untuk user ini? Diatur SERENTAK per grup lewat
    # endpoint /api/admin/groups/{nama}/ads, bukan diedit satu-satu.
    show_ads = Column(Boolean, default=True, nullable=False)

    # Relationship
    streams = relationship("CCTVStreamModel", secondary=user_cctv_access, back_populates="users")

class StreamAdminGrantModel(Base):
    """Kamera Super Admin yang dibagikan kepada seorang Admin.

    can_view dan can_playback dipisah persis seperti pemberian kepada User:
    seseorang dapat diberi siaran langsung tanpa riwayat rekamannya.

    can_reshare mengizinkan Admin meneruskan kamera itu kepada bawahannya.

    can_manage sudah tidak dipakai. Sejak kredensial RTSP disandarkan pada
    catatan pemasang (cctv_streams.created_by), kolom ini tidak menentukan
    apa pun. Dibiarkan ada agar data lama tidak hilang.
    """
    __tablename__ = "stream_admin_grants"
    stream_id = Column(Integer, ForeignKey("cctv_streams.id"), primary_key=True)
    admin_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    can_view = Column(Boolean, default=True)
    can_playback = Column(Boolean, default=True)
    can_manage = Column(Boolean, default=False)
    can_reshare = Column(Boolean, default=True)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class StreamPermissionModel(Base):
    """Izin berbutir seorang User atau Guest atas satu kamera.

    granted_by menegakkan aturan pengelolaan Guest: Admin hanya boleh
    menyunting baris yang ia berikan sendiri.
    """
    __tablename__ = "stream_permissions"
    stream_id = Column(Integer, ForeignKey("cctv_streams.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    can_view = Column(Boolean, default=True)
    can_playback = Column(Boolean, default=False)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class CCTVStreamModel(Base):
    __tablename__ = "cctv_streams"
    id = Column(Integer, primary_key=True, index=True)
    # Pemilik kamera. Super Admin pembuatnya; menentukan siapa yang
    # boleh menyunting dan siapa yang hanya menerima bagian.
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Siapa yang memasang kamera ini. Diisi sekali saat dibuat dan tidak
    # pernah berubah — kepemilikan boleh berpindah, fakta pemasangan tidak.
    # Inilah dasar masking kredensial RTSP.
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
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
    include_playback = Column(Boolean, default=False)
    # Pemilik kunci: dipakai menyaring agar Admin tidak melihat atau
    # menghapus kunci milik Super Admin maupun Admin lain.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                      nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class ApiKeyCameraModel(Base):
    """Kamera yang boleh diakses satu kunci API (many-to-many)."""
    __tablename__ = "api_key_cameras"
    id         = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False, index=True)
    camera_id  = Column(Integer, ForeignKey("cctv_streams.id", ondelete="CASCADE"), nullable=False, index=True)
    position   = Column(Integer, nullable=False, default=0)  # 0 = kamera utama
    __table_args__ = (UniqueConstraint("api_key_id", "camera_id", name="uq_apikey_camera"),)


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
            
            # MIGRASI: kolom position pada api_key_cameras
            try:
                with engine.connect() as _c:
                    _cols = [r[0] for r in _c.execute(text("SHOW COLUMNS FROM api_key_cameras")).fetchall()]
                    if 'position' not in _cols:
                        _c.execute(text('ALTER TABLE api_key_cameras ADD COLUMN position INT NOT NULL DEFAULT 0'))
                        _c.execute(text('''UPDATE api_key_cameras akc
                            JOIN api_keys k ON k.id = akc.api_key_id
                            SET akc.position = IF(akc.camera_id = k.camera_id, 0, akc.id + 1000)'''))
                        _c.commit()
                        print('[MIGRASI] kolom position ditambahkan ke api_key_cameras')
            except Exception as _e:
                print(f'[MIGRASI] position dilewati: {_e}')

            if "include_playback" not in columns_api_keys:
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("ALTER TABLE api_keys ADD COLUMN include_playback TINYINT(1) NOT NULL DEFAULT 0"))
                print("[DB] Column 'include_playback' successfully added to 'api_keys' table.")

            # Tabel penghubung: satu kunci API boleh banyak kamera.
            # Kunci lama disalin ke sini supaya perilaku lama tidak berubah.
            if "api_key_cameras" not in inspector.get_table_names():
                with engine.begin() as migration_conn:
                    migration_conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS api_key_cameras (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            api_key_id INT NOT NULL,
                            camera_id INT NOT NULL,
                            UNIQUE KEY uq_apikey_camera (api_key_id, camera_id),
                            KEY idx_akc_key (api_key_id),
                            KEY idx_akc_cam (camera_id),
                            CONSTRAINT fk_akc_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
                            CONSTRAINT fk_akc_cam FOREIGN KEY (camera_id) REFERENCES cctv_streams(id) ON DELETE CASCADE
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                print("[DB] Table 'api_key_cameras' created.")

            # Seed dijalankan TERPISAH dari pembuatan tabel: SQLAlchemy create_all()
            # bisa membuat tabelnya lebih dulu, sehingga guard di atas tidak pernah benar.
            # INSERT IGNORE + UNIQUE(api_key_id,camera_id) membuat ini aman diulang.
            with engine.begin() as migration_conn:
                seeded = migration_conn.execute(text("""
                    INSERT IGNORE INTO api_key_cameras (api_key_id, camera_id)
                    SELECT id, camera_id FROM api_keys WHERE camera_id IS NOT NULL
                """)).rowcount
            if seeded:
                print(f"[DB] api_key_cameras: {seeded} baris kunci lama disalin.")

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
                # Pulihkan path yang hilang (mis. setelah MediaMTX restart).
                # Tanpa ini kamera berhenti merekam diam-diam sampai ada
                # yang mengedit kamera itu.
                resync_missing_mediamtx_paths(db)

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

        # Automated Schema Migration: kelompok wilayah (admin_group)
        try:
            db.execute(text("SELECT admin_group FROM users LIMIT 1"))
        except Exception:
            print("Database Migration: Adding admin_group column to users...")
            db.rollback()
            try:
                db.execute(text(
                    "ALTER TABLE users ADD COLUMN admin_group VARCHAR(60) NULL"))
                db.execute(text(
                    "CREATE INDEX ix_users_admin_group ON users (admin_group)"))
                # Admin yang sudah ada masing-masing diberi grup sendiri,
                # dinamai menurut namanya, dan akun bawahannya ikut serta.
                # Tanpa ini mereka mendadak kehilangan wilayah.
                admins = db.execute(text(
                    "SELECT id, username FROM users WHERE role = 'admin'"
                )).fetchall()
                for aid, uname in admins:
                    nama = f"grup-{uname}"[:60]
                    db.execute(
                        text("UPDATE users SET admin_group = :g WHERE id = :i"),
                        {"g": nama, "i": aid})
                    db.execute(
                        text("UPDATE users SET admin_group = :g "
                             "WHERE parent_admin_id = :i"),
                        {"g": nama, "i": aid})
                db.commit()
                print(f"Database Migration: admin_group added, "
                      f"{len(admins)} grup dibuat dari admin yang ada.")
            except Exception as e:
                print(f"Database Migration Error (admin_group): {e}")
                db.rollback()

        # Automated Schema Migration: pisahkan live/rekaman pada grant Admin
        try:
            db.execute(text("SELECT can_view FROM stream_admin_grants LIMIT 1"))
        except Exception:
            print("Database Migration: Adding can_view/can_playback to stream_admin_grants...")
            db.rollback()
            try:
                db.execute(text(
                    "ALTER TABLE stream_admin_grants "
                    "ADD COLUMN can_view TINYINT(1) NOT NULL DEFAULT 1"))
                db.execute(text(
                    "ALTER TABLE stream_admin_grants "
                    "ADD COLUMN can_playback TINYINT(1) NOT NULL DEFAULT 1"))
                # Pemberian lama berarti keduanya, jadi keduanya dinyalakan —
                # tidak ada yang kehilangan akses karena pemisahan ini.
                db.commit()
                print("Database Migration: can_view/can_playback added successfully.")
            except Exception as e:
                print(f"Database Migration Error (grant live/rekaman): {e}")
                db.rollback()

        # Automated Schema Migration: catat pemasang kamera (created_by)
        try:
            db.execute(text("SELECT created_by FROM cctv_streams LIMIT 1"))
        except Exception:
            print("Database Migration: Adding created_by column to cctv_streams...")
            db.rollback()
            try:
                db.execute(text(
                    "ALTER TABLE cctv_streams ADD COLUMN created_by INT NULL"))
                # Kamera lama: pemasangnya dianggap pemiliknya. Satu-satunya
                # tebakan yang tersedia, dan yang mempertahankan perilaku lama.
                db.execute(text(
                    "UPDATE cctv_streams SET created_by = owner_id "
                    "WHERE created_by IS NULL"))
                db.commit()
                print("Database Migration: created_by column added successfully.")
            except Exception as e:
                print(f"Database Migration Error (created_by): {e}")
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
            # Berperan user, bukan guest: peran guest disediakan lewat akun
            # bawaan bernama 'guest' saja, agar tidak ada dua guest.
            viewer_user = UserModel(username="viewer", password_hash=hashed_pass, role="user")
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
    # Opsional karena dikosongkan saat masking: Admin yang hanya berhak
    # melihat kamera Super Admin tidak menerima kredensial RTSP-nya.
    rtsp_url: Optional[str] = ""
    group_name: str
    coordinates: Optional[str] = ""
    is_active: bool
    status: Optional[str] = "offline"
    record_enabled: bool = False
    record_path: Optional[str] = ""
    record_disk: Optional[str] = ""
    record_retention_days: int = 7
    # Dipakai layar untuk memutuskan menawarkan tombol sunting/hapus atau
    # tidak. Ditentukan server; layar tidak menghitungnya sendiri.
    dipasang_sendiri: bool = True

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
    camera_ids: Optional[List[int]] = None
    include_playback: bool = False
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
    camera_ids: List[int] = []
    camera_names: List[str] = []
    include_playback: bool = False
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
    # Catatan siapa yang membuat akun ini. Tidak memberi wewenang apa pun;
    # yang menentukan adalah admin_group.
    parent_admin_id: Optional[int] = None
    # Nama pembuatnya, supaya layar tidak perlu menebak dari id.
    dibuat_oleh: Optional[str] = None
    # Kelompok wilayah. Kosong berarti belum berkelompok.
    admin_group: Optional[str] = None
    show_ads: bool = True
    stream_ids: List[int]

class PenerimaKamera(BaseModel):
    """Satu penerima izin atas sebuah kamera.

    can_view dan can_playback sengaja terpisah: menonton siaran langsung dan
    menelusuri rekaman adalah dua kewenangan berbeda.
    """
    user_id: int
    can_view: bool = True
    can_playback: bool = False


class KameraUntukAdmin(BaseModel):
    """Satu baris pemberian kamera kepada Admin.

    can_view dan can_playback dipisah seperti pemberian kepada User.
    can_manage masih diterima demi pemanggil lama, tetapi diabaikan.
    """
    stream_id: int
    can_view: bool = True
    can_playback: bool = True
    can_reshare: bool = True
    can_manage: bool = False

class AksesAdminUpdate(BaseModel):
    kamera: List[KameraUntukAdmin] = []


class KameraDiberikan(BaseModel):
    """Satu kamera yang diberikan kepada sebuah akun."""
    stream_id: int
    can_view: bool = True
    can_playback: bool = False


class AksesAkunUpdate(BaseModel):
    kamera: List[KameraDiberikan] = []


class BerbagiKameraUpdate(BaseModel):
    penerima: List[PenerimaKamera] = []


class PemilikKameraUpdate(BaseModel):
    # None atau 0 berarti kamera dilepas, tidak dimiliki Admin mana pun.
    owner_id: Optional[int] = None


class UserAccessUpdate(BaseModel):
    stream_ids: List[int]

# Peran yang sah. Harus sepadan dengan ENUM kolom users.role; peran di luar
# daftar ini ditolak di gerbang API, bukan dibiarkan menjadi galat 500 dari
# basis data.
PERAN_SAH = ("super_admin", "admin", "user", "guest")


def _periksa_peran(nilai: str) -> str:
    bersih = (nilai or "").strip().lower()
    if bersih not in PERAN_SAH:
        raise ValueError(
            f"Peran tidak dikenal: {nilai!r}. Pilihan: {', '.join(PERAN_SAH)}")
    return bersih


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    # Admin yang mengelola akun ini. Hanya Super Admin yang boleh mengisinya;
    # bagi Admin, nilainya selalu dipaksa menjadi dirinya sendiri.
    parent_admin_id: Optional[int] = None
    # Grup wilayah. Bagi Admin nilainya dipaksa mengikuti grupnya sendiri.
    admin_group: Optional[str] = None

    @field_validator("role")
    @classmethod
    def _peran(cls, v):
        return _periksa_peran(v)


class UserUpdate(BaseModel):
    username: str
    password: Optional[str] = None
    role: str
    # None berarti "jangan ubah". Untuk melepas pengelolaan, kirim 0.
    parent_admin_id: Optional[int] = None
    # None berarti "jangan ubah"; string kosong melepas akun dari grupnya.
    admin_group: Optional[str] = None
    # Hanya dipakai utk akun SUPER_ADMIN: perannya independen, tak ikut
    # toggle grup/tanpa-grup krn wewenangnya beda dari akun biasa.
    show_ads: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _peran(cls, v):
        return _periksa_peran(v)

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
def kamera_dapat_ditonton(pengguna, db):
    """Semua kamera aktif yang berhak ditonton pengguna ini.

    Admin memperoleh kamera lewat tiga jalan yang berbeda — pivot lama,
    kepemilikan, dan pemberian Super Admin — dan ketiganya harus tampil di
    daftar yang sama. Memakai hanya pivot lama membuat kamera pemberian
    tidak pernah dapat ditemukan meskipun izinnya sudah benar.
    """
    kamera = {s.id: s for s in getattr(pengguna, "streams", []) if s.is_active}

    if _peran(pengguna) == "admin":
        uid = _id_pengguna(pengguna)

        for s in db.query(CCTVStreamModel).filter(
                CCTVStreamModel.owner_id == uid,
                CCTVStreamModel.is_active == True).all():
            kamera[s.id] = s

        # Hanya pemberian yang mencakup siaran langsung. Kamera yang
        # diberikan untuk rekamannya saja tidak muncul di daftar ini —
        # halaman rekaman punya daftarnya sendiri.
        beri = [g for g in db.query(StreamAdminGrantModel).filter(
            StreamAdminGrantModel.admin_id == uid).all()
            if bool(getattr(g, "can_view", True))]
        if beri:
            for s in db.query(CCTVStreamModel).filter(
                    CCTVStreamModel.id.in_([g.stream_id for g in beri]),
                    CCTVStreamModel.is_active == True).all():
                kamera[s.id] = s

    # Urutan tetap: grup lalu nama, supaya halaman demi halaman tidak
    # berpindah-pindah isi di antara permintaan.
    return sorted(kamera.values(),
                  key=lambda s: ((s.group_name or "").lower(), (s.name or "").lower()))


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

    if kuasa_penuh(user):

        query = db.query(CCTVStreamModel).filter(CCTVStreamModel.is_active == True)
        if group:
            query = query.filter(CCTVStreamModel.group_name == group)
        
        total_items = query.count()
        offset = (page - 1) * limit
        streams = query.offset(offset).limit(limit).all()
    else:
        all_streams = kamera_dapat_ditonton(user, db)
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
    if kuasa_penuh(user):
        stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    else:
        stream = next((s for s in kamera_dapat_ditonton(user, db)
                       if s.id == stream_id), None)
        
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

KUASA_PENUH = ("super_admin",)


def kuasa_penuh(user) -> bool:
    """Benar bila pengguna memegang kuasa penuh atas seluruh kamera.

    Sejak peran digeser menjadi empat tingkat, hanya `super_admin` yang
    setara dengan `admin` lama. Peran `admin` yang sekarang adalah bekas
    `user`: ia mengelola bawahannya sendiri, bukan segalanya, dan wewenang
    itu diberikan pada tahap berikutnya.
    """
    return (getattr(user, "role", "") or "").lower() in KUASA_PENUH


# --- Admin API Endpoints (Admin Role Guarded) ---

# ── Lapisan otorisasi berbutir ──────────────────────────────────────────────
#
# Empat pertanyaan berbeda tentang satu kamera, sengaja dipisah:
#
#   boleh_tonton   — siaran langsung
#   boleh_playback — rekaman (bisa diberikan terpisah dari siaran langsung)
#   boleh_ubah     — sunting/hapus kamera; inilah dasar masking
#   boleh_bagi     — teruskan akses kepada bawahan; inilah reshare
#
# Semua menerima UserModel maupun ApiKeyPrincipal. Kunci API berperan
# "apikey" sehingga tidak pernah lolos jalur kuasa penuh.


def _peran(pengguna) -> str:
    return (getattr(pengguna, "role", "") or "").lower()


def _id_pengguna(pengguna):
    return getattr(pengguna, "id", None)


def _grant_admin(db, stream_id, admin_id):
    """Baris pembagian kamera Super Admin kepada seorang Admin."""
    if not admin_id:
        return None
    return db.query(StreamAdminGrantModel).filter(
        StreamAdminGrantModel.stream_id == stream_id,
        StreamAdminGrantModel.admin_id == admin_id,
    ).first()


def _izin_pengguna(db, stream_id, user_id):
    """Baris izin seorang User/Guest atas satu kamera."""
    if not user_id:
        return None
    return db.query(StreamPermissionModel).filter(
        StreamPermissionModel.stream_id == stream_id,
        StreamPermissionModel.user_id == user_id,
    ).first()


def boleh_tonton(pengguna, stream_id, db) -> bool:
    """Boleh melihat siaran langsung kamera ini?"""
    if kuasa_penuh(pengguna):
        return True

    peran = _peran(pengguna)
    uid = _id_pengguna(pengguna)

    # Kunci API: aksesnya sudah dibatasi daftar kamera pada kunci itu sendiri.
    if peran == "apikey":
        return any(s.id == stream_id for s in getattr(pengguna, "streams", []))

    if peran == "admin":
        # Kamera miliknya sendiri, atau kamera yang dibagikan kepadanya.
        stream = db.query(CCTVStreamModel).filter(
            CCTVStreamModel.id == stream_id).first()
        if stream and stream.owner_id == uid:
            return True
        pemberian = _grant_admin(db, stream_id, uid)
        return pemberian is not None and bool(
            getattr(pemberian, "can_view", True))

    izin = _izin_pengguna(db, stream_id, uid)
    if izin is not None:
        return bool(izin.can_view)

    # Selama Tahap B tabel izin masih kosong: jatuh kembali ke pivot lama
    # supaya tidak ada yang kehilangan akses sebelum Tahap C memindahkannya.
    return any(s.id == stream_id for s in getattr(pengguna, "streams", []))


def boleh_playback(pengguna, stream_id, db) -> bool:
    """Boleh membuka rekaman kamera ini?

    Dipisah dari boleh_tonton agar seseorang dapat diberi siaran langsung
    tanpa riwayat rekamannya.
    """
    if kuasa_penuh(pengguna):
        return True

    peran = _peran(pengguna)
    uid = _id_pengguna(pengguna)

    if peran == "apikey":
        kunci = getattr(pengguna, "key_record", None)
        if kunci is not None and not getattr(kunci, "include_playback", False):
            return False
        return any(s.id == stream_id for s in getattr(pengguna, "streams", []))

    if peran == "admin":
        stream = db.query(CCTVStreamModel).filter(
            CCTVStreamModel.id == stream_id).first()
        if stream and stream.owner_id == uid:
            return True
        pemberian = _grant_admin(db, stream_id, uid)
        return pemberian is not None and bool(
            getattr(pemberian, "can_playback", True))

    izin = _izin_pengguna(db, stream_id, uid)
    if izin is not None:
        return bool(izin.can_playback)

    return any(s.id == stream_id for s in getattr(pengguna, "streams", []))


def dipasang_sendiri(stream, uid) -> bool:
    """Kamera ini dipasang oleh pengguna ini?

    Kamera lama tanpa catatan pemasang jatuh kembali ke pemilik, sebab
    dahulu keduanya selalu sama.
    """
    if stream is None:
        return False
    pemasang = getattr(stream, "created_by", None)
    if pemasang is None:
        pemasang = stream.owner_id
    return pemasang == uid


def boleh_lihat_rtsp(pengguna, stream_id, db) -> bool:
    """Boleh melihat kredensial RTSP kamera ini?

    Sengaja dipisahkan dari boleh_ubah(). Admin dapat diberi wewenang
    menyunting kamera Super Admin, tetapi kredensialnya tetap bukan
    miliknya untuk dilihat — kamera itu bukan pasangannya.
    """
    if kuasa_penuh(pengguna):
        return True
    if _peran(pengguna) != "admin":
        return False
    stream = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id == stream_id).first()
    return dipasang_sendiri(stream, _id_pengguna(pengguna))


def boleh_ubah(pengguna, stream_id, db) -> bool:
    """Boleh menyunting atau menghapus kamera ini?

    Inilah dasar masking. Admin yang menerima kamera Super Admin menjawab
    tidak di sini, sehingga rtsp_url tidak pernah dikirim kepadanya.
    """
    if kuasa_penuh(pengguna):
        return True

    if _peran(pengguna) != "admin":
        return False

    uid = _id_pengguna(pengguna)
    stream = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id == stream_id).first()
    if stream is None:
        return False

    # Kamera pasangannya sendiri: bebas disunting.
    if dipasang_sendiri(stream, uid):
        return True

    # Kamera pasangan Super Admin tidak dapat disunting maupun dihapus
    # Admin, sekalipun kepemilikannya berpindah atau ia diberi can_manage:
    # yang dibagikan adalah tontonan, bukan kendali atas perangkatnya.
    return False


def boleh_bagi(pengguna, stream_id, db) -> bool:
    """Boleh meneruskan akses kamera ini kepada bawahan?

    Sengaja terpisah dari boleh_ubah: Admin boleh membagikan kamera Super
    Admin kepada User bawahannya tanpa boleh menyunting kameranya.
    """
    if kuasa_penuh(pengguna):
        return True

    if _peran(pengguna) != "admin":
        return False

    uid = _id_pengguna(pengguna)
    stream = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id == stream_id).first()
    if stream is None:
        return False

    if stream.owner_id == uid:
        return True

    grant = _grant_admin(db, stream_id, uid)
    return bool(grant and grant.can_reshare)


def boleh_kelola_izin(pengguna, stream_id, target_user_id, db) -> bool:
    """Boleh menyunting atau mencabut izin orang lain atas kamera ini?

    Menegakkan aturan Guest: seorang Admin hanya boleh menyentuh pemberian
    yang ia buat sendiri. Pemberian dari Super Admin atau Admin lain ditolak,
    bukan sekadar disembunyikan di layar.
    """
    if kuasa_penuh(pengguna):
        return True

    if _peran(pengguna) != "admin":
        return False

    if not boleh_bagi(pengguna, stream_id, db):
        return False

    izin = _izin_pengguna(db, stream_id, target_user_id)
    if izin is None:
        return True  # pemberian baru

    return izin.granted_by == _id_pengguna(pengguna)


def verify_pengelola_pengguna(user: UserModel = Depends(get_authenticated_user)):
    """Gerbang pengelolaan pengguna: Super Admin dan Admin.

    Ruang gerak Admin dipersempit di dalam tiap endpoint, bukan di gerbang
    ini: ia hanya menyentuh akun bawahannya sendiri.
    """
    if _peran(user) not in ("super_admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return user


# Nama akun guest bawaan. Peran guest hanya boleh melekat pada akun ini.
NAMA_GUEST = "guest"


def tolak_guest_baru(peran, db, target=None):
    """Cegah lahirnya akun guest kedua.

    Peran guest dipakai bersama lewat satu akun bawaan tanpa sandi. Akun
    guest tambahan berarti pintu masuk tanpa sandi yang tidak terlacak, jadi
    ditolak bagi siapa pun — Super Admin sekalipun.
    """
    if (peran or "").strip().lower() != "guest":
        return
    # Akun guest bawaan sendiri boleh tetap berperan guest.
    if target is not None and target.username == NAMA_GUEST:
        return
    raise HTTPException(
        status_code=400,
        detail=(f"Akun guest hanya satu, yaitu '{NAMA_GUEST}'. "
                "Gunakan peran user untuk akses terbatas lainnya."))


def grup_akun_baru(pengelola, user_data, db):
    """Grup untuk akun yang sedang dibuat.

    Admin selalu mewarisi grup pembuatnya. Yang perlu penanganan khusus
    hanya Admin baru tanpa grup: bila dibiarkan kosong ia tidak akan dapat
    mengelola akun yang kelak ia buat sendiri.
    """
    grup = tentukan_grup(pengelola, user_data.admin_group)
    if grup:
        return grup
    if _peran(user_data) == "admin":
        return grup_bawaan_admin(user_data.username)
    return None


def grup_bawaan_admin(nama_akun):
    """Nama grup untuk Admin yang lahir tanpa grup.

    Sama dengan pola migrasi admin lama, supaya nama grup yang muncul di
    layar tidak berbeda bentuk antara akun lama dan akun baru.
    """
    return f"grup-{nama_akun}"[:60]


def tentukan_grup(pengelola, diminta, bawaan=None):
    """Grup mana yang berlaku untuk akun yang sedang dibuat atau diubah.

    Admin tidak dapat menaruh akun di luar grupnya sendiri. Kirimannya
    diabaikan diam-diam alih-alih ditolak: layar tidak pernah menawarkan
    pilihan itu kepadanya, jadi kiriman menyimpang hanya datang dari
    pemanggil yang mengarang sendiri.
    """
    if not kuasa_penuh(pengelola):
        return getattr(pengelola, "admin_group", None)
    if diminta is None:
        return bawaan
    bersih = (diminta or "").strip()[:60]
    return bersih or None


def periksa_pengelola(nilai, target_id, db):
    """Pastikan calon pengelola benar-benar seorang Admin yang sah.

    Mengembalikan id pengelola, atau None bila pengelolaan dilepas. Nilai 0
    dipakai sebagai isyarat "lepaskan", sebab None sudah berarti "jangan
    ubah" pada permintaan pembaruan.
    """
    if nilai in (None, 0):
        return None

    calon = db.query(UserModel).filter(UserModel.id == nilai).first()
    if calon is None:
        raise HTTPException(
            status_code=404, detail="Admin pengelola tidak ditemukan")

    if _peran(calon) not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=400,
            detail="Pengelola harus berperan admin atau super admin")

    if target_id is not None and calon.id == target_id:
        raise HTTPException(
            status_code=400,
            detail="Akun tidak dapat mengelola dirinya sendiri")

    return calon.id


def bawahan_saya(pengelola, target, db) -> bool:
    """Apakah akun `target` berada di bawah `pengelola`?

    Super Admin membawahi semua. Admin hanya membawahi akun yang ia buat,
    ditandai parent_admin_id. Tanpa batas ini seorang Admin dapat mengubah
    sandi Admin lain dan mengambil alih kameranya.
    """
    if kuasa_penuh(pengelola):
        return True
    if _peran(pengelola) != "admin":
        return False

    grup_saya = getattr(pengelola, "admin_group", None)
    grup_target = getattr(target, "admin_group", None)

    # Grup adalah satu-satunya penentu wewenang. parent_admin_id hanya
    # catatan siapa yang membuat akun dan tidak memberi hak apa pun —
    # kalau ia ikut menentukan, memindahkan akun antar-grup tidak benar-
    # benar memindahkan wilayahnya.
    if not grup_saya:
        return False
    if grup_target != grup_saya:
        return False

    # Sesama Admin tidak saling mengelola, sekalipun segrup. Hanya Super
    # Admin yang menata Admin; tanpa batas ini satu Admin dapat mengubah
    # sandi rekan segrupnya dan mengambil alih wilayah bersama.
    return _peran(target) not in ("admin", "super_admin")


def verify_pengelola_kamera(user: UserModel = Depends(get_authenticated_user)):
    """Gerbang panel kamera: Super Admin dan Admin.

    Terpisah dari verify_admin_role dengan sengaja. Panel kamera kini dibagi
    per pemilik sehingga aman dibuka untuk Admin, sedangkan pengelolaan
    pengguna, kunci API, pemindaian jaringan, dan log tetap tertutup baginya.
    """
    peran = (getattr(user, "role", "") or "").strip().lower()
    if peran not in ("super_admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return user


def saring_rtsp(stream, pengguna, db):
    """Kosongkan rtsp_url bila pengguna tak berhak mengubah kamera ini.

    Inilah titik masking. Dikerjakan di lapisan tanggapan, bukan dengan
    menyandikan kolomnya, sebab perekaman butuh kredensial apa adanya.
    """
    if boleh_lihat_rtsp(pengguna, stream.id, db):
        salinan = StreamAdminResponse.model_validate(stream)
        salinan.dipasang_sendiri = True
        return salinan
    # Bukan pasangannya: kredensial disamarkan dan layar diberi tahu supaya
    # tombol sunting/hapus tidak ditawarkan.
    salinan = StreamAdminResponse.model_validate(stream)
    salinan.rtsp_url = ""
    salinan.dipasang_sendiri = False
    return salinan


def verify_admin_role(user: UserModel = Depends(get_authenticated_user)):
    if not kuasa_penuh(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return user

# 3. CRUD: Get All Streams (Admin version with RTSP details)
@app.get("/api/admin/streams", response_model=List[StreamAdminResponse])
async def admin_get_streams(
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    # Super Admin melihat seluruh inventaris; Admin hanya kamera miliknya
    # sendiri dan kamera yang dibagikan kepadanya.
    if kuasa_penuh(admin):
        streams = db.query(CCTVStreamModel).all()
        hasil = [StreamAdminResponse.model_validate(s) for s in streams]
        for r in hasil:
            r.dipasang_sendiri = True
    else:
        semua = db.query(CCTVStreamModel).all()
        streams = [s for s in semua if boleh_tonton(admin, s.id, db)]
        # Kredensial kamera yang tak berhak ia ubah disembunyikan di sini.
        hasil = [saring_rtsp(s, admin, db) for s in streams]

    # Status koneksi dibaca dari cache background monitor supaya halaman
    # tak menunggu probe RTSP langsung (bisa lambat/timeout).
    for s, r in zip(streams, hasil):
        cached = RTSP_STATUS_CACHE.get(s.id)
        r.status = cached["status"] if cached else "offline"

    return hasil

# 4. CRUD: Create Stream
@app.post("/api/admin/streams", response_model=StreamAdminResponse)
async def admin_create_stream(
    stream: StreamCreateUpdate,
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    # Pemilik dicatat sejak awal: tanpa itu penyaringan daftar kamera
    # tidak punya dasar dan Admin dapat menyunting kamera orang lain.
    db_stream = CCTVStreamModel(
        owner_id=admin.id,
        created_by=admin.id,
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
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    db_stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    # Admin dapat melihat kamera pemberian Super Admin, tetapi tidak
    # menyuntingnya. Pemeriksaan di sini, bukan di layar, supaya permintaan
    # yang dibuat langsung ke API tetap ditolak.
    if not boleh_ubah(admin, stream_id, db):
        raise HTTPException(
            status_code=403,
            detail="Anda tidak berwenang mengubah kamera ini")

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
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    db_stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    if not boleh_ubah(admin, stream_id, db):
        raise HTTPException(
            status_code=403,
            detail="Anda tidak berwenang menghapus kamera ini")

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
    admin: UserModel = Depends(verify_pengelola_pengguna),
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
    if not kuasa_penuh(admin):
        # Admin melihat dirinya sendiri dan akun yang ia buat, tidak lebih.
        users = [u for u in users
                 if u.id == admin.id or bawahan_saya(admin, u, db)]
    # Nama pembuat dikumpulkan sekali; menanyakannya per baris berarti
    # satu kueri untuk tiap akun.
    nama_pembuat = {}
    id_pembuat = {u.parent_admin_id for u in users if u.parent_admin_id}
    if id_pembuat:
        nama_pembuat = {
            p.id: p.username for p in db.query(UserModel).filter(
                UserModel.id.in_(id_pembuat)).all()}

    return [
        UserAdminResponse(
            id=u.id,
            username=u.username,
            role=u.role,
            parent_admin_id=u.parent_admin_id,
            dibuat_oleh=nama_pembuat.get(u.parent_admin_id),
            admin_group=u.admin_group,
            show_ads=u.show_ads,
            stream_ids=[s.id for s in u.streams]
        ) for u in users
    ]

class GroupAdsToggle(BaseModel):
    show_ads: bool

@app.put("/api/admin/groups/{group_name}/ads")
def toggle_group_ads(
    group_name: str,
    payload: GroupAdsToggle,
    admin: UserModel = Depends(verify_pengelola_pengguna),
    db: Session = Depends(get_db)
):
    """Nyalakan/matikan iklan untuk SEMUA anggota satu grup sekaligus.

    group_name == "__tanpa_grup__" menyasar user dengan admin_group NULL.
    """
    query = db.query(UserModel)
    if group_name == "__tanpa_grup__":
        # SUPER_ADMIN independen dari toggle ini (diatur sendiri lewat
        # PUT /admin/users/{id}), walau admin_group-nya sama-sama NULL.
        query = query.filter(
            UserModel.admin_group.is_(None),
            UserModel.role != "super_admin",
        )
    else:
        query = query.filter(UserModel.admin_group == group_name)

    if not kuasa_penuh(admin):
        query = query.filter(UserModel.id.in_(
            [u.id for u in query.all() if bawahan_saya(admin, u, db)]
        ))

    jumlah = query.update({UserModel.show_ads: payload.show_ads}, synchronize_session=False)
    db.commit()
    return {"group": group_name, "show_ads": payload.show_ads, "updated": jumlah}

# 8. User Manager: Update user access mapping (Many-to-Many)
@app.get("/api/admin/admins/{admin_id}/camera-grants")
def admin_lihat_pemberian_admin(
    admin_id: int,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Kamera apa saja yang dipegang seorang Admin, berikut caranya."""
    if not kuasa_penuh(pengelola):
        raise HTTPException(
            status_code=403,
            detail="Hanya Super Admin yang dapat mengatur pemberian ke Admin")

    sasaran = db.query(UserModel).filter(UserModel.id == admin_id).first()
    if not sasaran:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    if _peran(sasaran) != "admin":
        raise HTTPException(
            status_code=400,
            detail=f"Akun '{sasaran.username}' berperan {sasaran.role}, "
                   "bukan admin")

    beri = {g.stream_id: g for g in db.query(StreamAdminGrantModel).filter(
        StreamAdminGrantModel.admin_id == admin_id).all()}

    daftar = []
    for k in db.query(CCTVStreamModel).order_by(
            CCTVStreamModel.group_name, CCTVStreamModel.name).all():
        g = beri.get(k.id)
        milik = (k.owner_id == admin_id)
        daftar.append({
            "stream_id": k.id,
            "stream_name": k.name,
            "group_name": k.group_name or "Default",
            # Kamera miliknya sendiri tidak perlu diberikan; ditandai supaya
            # layar tidak menawarkan pemberian yang tak ada gunanya.
            "pemilik": milik,
            "diberikan": g is not None,
            "can_view": bool(getattr(g, "can_view", True)) if g else False,
            "can_playback": bool(getattr(g, "can_playback", True)) if g else False,
            "can_reshare": bool(g.can_reshare) if g else False,
        })

    return {"admin_id": sasaran.id, "username": sasaran.username,
            "kamera": daftar}


@app.post("/api/admin/admins/{admin_id}/camera-grants")
def admin_atur_pemberian_admin(
    admin_id: int,
    data: AksesAdminUpdate,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Tetapkan kamera apa saja yang dibagikan kepada seorang Admin."""
    if not kuasa_penuh(pengelola):
        raise HTTPException(
            status_code=403,
            detail="Hanya Super Admin yang dapat mengatur pemberian ke Admin")

    sasaran = db.query(UserModel).filter(UserModel.id == admin_id).first()
    if not sasaran:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    if _peran(sasaran) != "admin":
        raise HTTPException(
            status_code=400,
            detail=f"Akun '{sasaran.username}' berperan {sasaran.role}, "
                   "bukan admin")

    diminta = {k.stream_id: k for k in data.kamera}
    if diminta:
        kamera = {s.id: s for s in db.query(CCTVStreamModel).filter(
            CCTVStreamModel.id.in_(diminta)).all()}
        hilang = set(diminta) - set(kamera)
        if hilang:
            raise HTTPException(
                status_code=404,
                detail=f"Kamera tidak ditemukan: {sorted(hilang)}")
        for sid, s in kamera.items():
            # Kamera miliknya sendiri sudah sepenuhnya di tangannya;
            # pemberian tambahan hanya membingungkan.
            if s.owner_id == admin_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kamera '{s.name}' sudah milik "
                           f"'{sasaran.username}'")

    lama = db.query(StreamAdminGrantModel).filter(
        StreamAdminGrantModel.admin_id == admin_id).all()
    ada = {g.stream_id: g for g in lama}

    for g in lama:
        if g.stream_id not in diminta:
            db.delete(g)

    for sid, k in diminta.items():
        g = ada.get(sid)
        if g is None:
            db.add(StreamAdminGrantModel(
                stream_id=sid, admin_id=admin_id,
                can_view=k.can_view, can_playback=k.can_playback,
                can_reshare=k.can_reshare,
                granted_by=pengelola.id))
            continue
        g.can_view = k.can_view
        g.can_playback = k.can_playback
        g.can_reshare = k.can_reshare
        g.granted_by = pengelola.id

    db.commit()

    return {"message": "Pemberian kamera diperbarui",
            "jumlah_kamera": len(diminta)}


@app.post("/api/admin/users/{user_id}/camera-access")
def admin_atur_akses_akun(
    user_id: int,
    data: AksesAkunUpdate,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Tetapkan kamera apa saja yang dipegang satu akun.

    Live dan rekaman ditetapkan terpisah. Berlaku untuk User dan Guest saja:
    Super Admin sudah melihat segalanya, dan Admin memperoleh kamera lewat
    kepemilikan, bukan lewat daftar ini.
    """
    akun = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not akun:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    if akun.role not in ("user", "guest"):
        raise HTTPException(
            status_code=400,
            detail=f"Akun '{akun.username}' berperan {akun.role} dan tidak "
                   "menerima izin per kamera")

    penuh = kuasa_penuh(pengelola)
    if not penuh and not bawahan_saya(pengelola, akun, db):
        raise HTTPException(
            status_code=403, detail="Akun ini bukan bawahan Anda")

    diminta = {k.stream_id: k for k in data.kamera}
    if diminta:
        kamera = {s.id: s for s in db.query(CCTVStreamModel).filter(
            CCTVStreamModel.id.in_(diminta)).all()}
        hilang = set(diminta) - set(kamera)
        if hilang:
            raise HTTPException(
                status_code=404,
                detail=f"Kamera tidak ditemukan: {sorted(hilang)}")
        for sid in diminta:
            if not boleh_bagi(pengelola, sid, db):
                raise HTTPException(
                    status_code=403,
                    detail=f"Anda tidak berwenang membagikan kamera {sid}")
        for sid, k in diminta.items():
            if not k.can_view and not k.can_playback:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kamera {sid} tanpa izin apa pun; keluarkan saja "
                           "dari daftar")

    lama = db.query(StreamPermissionModel).filter(
        StreamPermissionModel.user_id == user_id).all()
    ada = {i.stream_id: i for i in lama}

    dilewati = []
    for i in lama:
        if i.stream_id in diminta:
            continue
        # Admin hanya boleh mencabut pemberiannya sendiri; pemberian Super
        # Admin atau Admin lain dibiarkan utuh.
        if penuh or i.granted_by == pengelola.id:
            db.delete(i)
        else:
            dilewati.append(i.stream_id)

    for sid, k in diminta.items():
        i = ada.get(sid)
        if i is None:
            db.add(StreamPermissionModel(
                stream_id=sid, user_id=user_id,
                can_view=k.can_view, can_playback=k.can_playback,
                granted_by=pengelola.id))
            continue
        if not penuh and i.granted_by not in (None, pengelola.id):
            dilewati.append(sid)
            continue
        i.can_view = k.can_view
        i.can_playback = k.can_playback
        i.granted_by = pengelola.id

    db.commit()

    # Tabel lama tetap disinkron agar layar dan laporan yang masih
    # membacanya tidak menampilkan angka yang bertentangan.
    sid_akhir = {i.stream_id for i in db.query(StreamPermissionModel).filter(
        StreamPermissionModel.user_id == user_id).all()}
    akun.streams = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id.in_(sid_akhir)).all() if sid_akhir else []
    db.commit()

    return {
        "message": "Akses akun diperbarui",
        "jumlah_kamera": len(diminta),
        "dilewati_bukan_milik_anda": sorted(set(dilewati)),
    }


@app.get("/api/admin/users/{user_id}/camera-access")
def admin_lihat_akses_akun(
    user_id: int,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Kamera apa saja yang dapat diberikan ke akun ini, berikut keadaannya."""
    akun = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not akun:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    if akun.role not in ("user", "guest"):
        raise HTTPException(
            status_code=400,
            detail=f"Akun '{akun.username}' berperan {akun.role} dan tidak "
                   "menerima izin per kamera")

    penuh = kuasa_penuh(pengelola)
    if not penuh and not bawahan_saya(pengelola, akun, db):
        raise HTTPException(
            status_code=403, detail="Akun ini bukan bawahan Anda")

    izin = {i.stream_id: i for i in db.query(StreamPermissionModel).filter(
        StreamPermissionModel.user_id == user_id).all()}

    kamera = db.query(CCTVStreamModel).order_by(
        CCTVStreamModel.group_name, CCTVStreamModel.name).all()
    if not penuh:
        kamera = [k for k in kamera if boleh_bagi(pengelola, k.id, db)]

    daftar = []
    for k in kamera:
        i = izin.get(k.id)
        milik_saya = penuh or i is None or i.granted_by in (None, pengelola.id)
        daftar.append({
            "stream_id": k.id,
            "stream_name": k.name,
            "group_name": k.group_name or "Default",
            "can_view": bool(i.can_view) if i else False,
            "can_playback": bool(i.can_playback) if i else False,
            # Pemberian orang lain: tampil, tetapi tidak dapat diubah.
            "terkunci": not milik_saya,
        })

    return {"user_id": akun.id, "username": akun.username,
            "role": akun.role, "kamera": daftar}


def _anggota_grup(nama_grup, db):
    """Admin anggota sebuah grup. Kosong berarti grupnya tidak ada."""
    return db.query(UserModel).filter(
        UserModel.admin_group == nama_grup).order_by(
        UserModel.username).all()


def _admin_grup(nama_grup, db):
    orang = [u for u in _anggota_grup(nama_grup, db) if _peran(u) == "admin"]
    if not orang:
        raise HTTPException(
            status_code=404,
            detail=f"Grup '{nama_grup}' tidak punya admin")
    return orang


class GrupRename(BaseModel):
    nama_baru: str

    @field_validator("nama_baru")
    @classmethod
    def _nama(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Nama grup tidak boleh kosong")
        if len(v) > 60:
            raise ValueError("Nama grup maksimal 60 karakter")
        return v


@app.put("/api/admin/groups/{nama_grup}")
def admin_ganti_nama_grup(
    nama_grup: str,
    data: GrupRename,
    pengelola: UserModel = Depends(verify_pengelola_pengguna),
    db: Session = Depends(get_db)
):
    """Pindahkan seluruh anggota sebuah grup ke nama baru.

    Satu transaksi: entah semua anggota ikut pindah, atau tak satu pun.
    Memindahkan mereka satu per satu dari frontend membuat grup terbelah
    bila salah satu permintaan gagal di tengah jalan.
    """
    # Nama grup menentukan wewenang orang lain, jadi hanya kuasa penuh
    # yang boleh mengubahnya -- sama seperti penyerahan kamera ke grup.
    if not kuasa_penuh(pengelola):
        raise HTTPException(
            status_code=403,
            detail="Hanya Super Admin yang dapat mengubah nama grup")

    lama = (nama_grup or "").strip()
    baru = data.nama_baru
    if not lama:
        raise HTTPException(status_code=400, detail="Nama grup tidak sah")

    anggota = db.query(UserModel).filter(UserModel.admin_group == lama).all()
    if not anggota:
        raise HTTPException(
            status_code=404, detail=f"Grup '{lama}' tidak ditemukan")

    if baru == lama:
        return {"pesan": "Nama grup tidak berubah", "jumlah": 0}

    # Menggabungkan dua grup mengubah siapa melihat apa tanpa diminta,
    # jadi nama yang sudah dipakai ditolak.
    bentrok = db.query(UserModel).filter(UserModel.admin_group == baru).count()
    if bentrok:
        raise HTTPException(
            status_code=409,
            detail=f"Grup '{baru}' sudah ada; pilih nama lain")

    try:
        for a in anggota:
            a.admin_group = baru
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Gagal mengubah nama grup")

    return {"pesan": f"Grup '{lama}' menjadi '{baru}'", "jumlah": len(anggota)}


@app.get("/api/admin/groups/{nama_grup}/camera-grants")
def admin_lihat_pemberian_grup(
    nama_grup: str,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Kamera apa saja yang dipegang sebuah grup."""
    if not kuasa_penuh(pengelola):
        raise HTTPException(
            status_code=403,
            detail="Hanya Super Admin yang dapat menyerahkan kamera ke grup")

    orang = _admin_grup(nama_grup, db)
    id_orang = {o.id for o in orang}

    # Izin sebuah kamera dianggap dipegang grup bila SEMUA anggotanya
    # memegangnya. Bila hanya sebagian, keadaan itu tidak utuh dan layar
    # perlu menampilkannya sebagai belum diberikan supaya penyimpanan
    # berikutnya merapikannya.
    per_kamera = {}
    for g in db.query(StreamAdminGrantModel).filter(
            StreamAdminGrantModel.admin_id.in_(id_orang)).all():
        per_kamera.setdefault(g.stream_id, []).append(g)

    daftar = []
    for k in db.query(CCTVStreamModel).order_by(
            CCTVStreamModel.group_name, CCTVStreamModel.name).all():
        baris = per_kamera.get(k.id, [])
        utuh = len(baris) == len(orang)
        milik = k.owner_id in id_orang
        daftar.append({
            "stream_id": k.id,
            "stream_name": k.name,
            "group_name": k.group_name or "Default",
            "pemilik": milik,
            "diberikan": utuh,
            "can_view": utuh and all(
                bool(getattr(g, "can_view", True)) for g in baris),
            "can_playback": utuh and all(
                bool(getattr(g, "can_playback", True)) for g in baris),
            "can_reshare": utuh and all(bool(g.can_reshare) for g in baris),
        })

    return {"grup": nama_grup,
            "anggota": [{"user_id": o.id, "username": o.username}
                        for o in orang],
            "kamera": daftar}


@app.post("/api/admin/groups/{nama_grup}/camera-grants")
def admin_atur_pemberian_grup(
    nama_grup: str,
    data: AksesAdminUpdate,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Serahkan sekumpulan kamera kepada seluruh anggota sebuah grup."""
    if not kuasa_penuh(pengelola):
        raise HTTPException(
            status_code=403,
            detail="Hanya Super Admin yang dapat menyerahkan kamera ke grup")

    orang = _admin_grup(nama_grup, db)
    id_orang = [o.id for o in orang]

    diminta = {k.stream_id: k for k in data.kamera}
    if diminta:
        kamera = {s.id: s for s in db.query(CCTVStreamModel).filter(
            CCTVStreamModel.id.in_(diminta)).all()}
        hilang = set(diminta) - set(kamera)
        if hilang:
            raise HTTPException(
                status_code=404,
                detail=f"Kamera tidak ditemukan: {sorted(hilang)}")

    lama = db.query(StreamAdminGrantModel).filter(
        StreamAdminGrantModel.admin_id.in_(id_orang)).all()
    ada = {(g.admin_id, g.stream_id): g for g in lama}

    for g in lama:
        if g.stream_id not in diminta:
            db.delete(g)

    for sid, k in diminta.items():
        for uid in id_orang:
            # Pemilik kamera tidak perlu diberi kameranya sendiri; barisnya
            # akan mubazir dan menyesatkan saat dibaca kembali.
            pemilik = db.query(CCTVStreamModel).filter(
                CCTVStreamModel.id == sid).first()
            if pemilik is not None and pemilik.owner_id == uid:
                continue
            g = ada.get((uid, sid))
            if g is None:
                db.add(StreamAdminGrantModel(
                    stream_id=sid, admin_id=uid,
                    can_view=k.can_view, can_playback=k.can_playback,
                    can_reshare=k.can_reshare,
                    granted_by=pengelola.id))
                continue
            g.can_view = k.can_view
            g.can_playback = k.can_playback
            g.can_reshare = k.can_reshare
            g.granted_by = pengelola.id

    db.commit()

    return {"message": f"Kamera grup '{nama_grup}' diperbarui",
            "jumlah_kamera": len(diminta),
            "jumlah_anggota": len(id_orang)}


@app.get("/api/admin/access-overview")
def admin_ikhtisar_akses(
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Akun mana memegang kamera mana, seluruh peran sekaligus.

    Dikembalikan dua arah dari data yang sama supaya layar dapat menukar
    tampilan tanpa memanggil ulang: per akun, dan per kamera.
    """
    penuh = kuasa_penuh(pengelola)

    kamera = db.query(CCTVStreamModel).order_by(CCTVStreamModel.name).all()
    if not penuh:
        # Admin hanya melihat kamera yang benar-benar ia pegang.
        kamera = [k for k in kamera if boleh_bagi(pengelola, k.id, db)]
    id_kamera = {k.id for k in kamera}
    nama_kamera = {k.id: k.name for k in kamera}

    akun = db.query(UserModel).order_by(UserModel.username).all()
    if not penuh:
        akun = [u for u in akun
                if u.id == pengelola.id or bawahan_saya(pengelola, u, db)]

    grant_admin = {}
    for g in db.query(StreamAdminGrantModel).all():
        grant_admin.setdefault(g.admin_id, []).append(g)

    izin = db.query(StreamPermissionModel).all()
    per_akun = {}
    for i in izin:
        if i.stream_id in id_kamera:
            per_akun.setdefault(i.user_id, []).append(i)

    # Admin tidak berbaris sendiri: kameranya mengikuti grupnya, dan
    # baris grup itulah tempat mengaturnya. User tetap berbaris walau
    # punya grup, sebab kamera User diberikan satu per satu, bukan
    # diwarisi dari grup — tanpa baris ini ia tak dapat diatur di mana pun.
    def _kamera_akun(u):
        """Kamera satu akun bukan-Admin, dari izin atas namanya sendiri.

        Dipakai baris akun maupun baris anggota grup. Satu sumber, agar
        angka di kedua tempat tidak dapat berselisih.
        """
        daftar = []
        if kuasa_penuh(u):
            # Tanpa satu baris izin pun; kewenangannya melekat pada peran.
            for k in kamera:
                daftar.append({"stream_id": k.id, "stream_name": k.name,
                               "cara": "penuh", "can_view": True,
                               "can_playback": True})
        else:
            dimiliki = {d["stream_id"] for d in daftar}
            for i in per_akun.get(u.id, []):
                if i.stream_id in dimiliki:
                    continue
                daftar.append({
                    "stream_id": i.stream_id,
                    "stream_name": nama_kamera.get(i.stream_id, "?"),
                    "cara": "pemberian",
                    "can_view": bool(i.can_view),
                    "can_playback": bool(i.can_playback)})
        daftar.sort(key=lambda d: d["stream_name"])
        return daftar

    baris_akun = []
    for u in akun:
        # Penghuni grup tampil di dalam grupnya, tidak berbaris dua kali.
        if _peran(u) == "admin" or (u.admin_group or "").strip():
            continue
        daftar = _kamera_akun(u)
        baris_akun.append({
            "user_id": u.id, "username": u.username, "role": u.role,
            "jumlah": len(daftar), "kamera": daftar,
            # Super Admin tidak punya baris untuk disunting; Admin diatur
            # lewat kepemilikan kamera, bukan lewat daftar centang.
            "cara_atur": ("tidak_perlu" if kuasa_penuh(u)
                          else "pemberian")})

    # ── Baris grup ──────────────────────────────────────────────────────
    # Satu baris untuk tiap grup yang punya Admin. Kamera yang tampil adalah
    # gabungan: milik anggotanya, dan yang diserahkan kepada grup.
    # Semua penghuni dihimpun, Admin maupun User, agar satu grup terbaca
    # sebagai satu kesatuan. Admin lebih dulu, lalu menurut nama.
    anggota = {}
    for u in db.query(UserModel).order_by(UserModel.username).all():
        if u.admin_group and not kuasa_penuh(u):
            anggota.setdefault(u.admin_group, []).append(u)
    for _daftar in anggota.values():
        _daftar.sort(key=lambda o: (_peran(o) != "admin", o.username))

    def _kamera_anggota_bagi(orang, kamera_grup):
        """Kamera yang dipegang satu penghuni grup.

        Admin mewarisi seluruh kamera grupnya. User tidak mewarisi apa pun
        — kameranya diberikan satu per satu — jadi yang tampil hanyalah
        pemberian atas namanya sendiri. Menyamakan keduanya akan
        menjanjikan kamera yang tak sungguh dapat ia buka.
        """
        if _peran(orang) == "admin":
            return sorted(kamera_grup.values(),
                          key=lambda d: d["stream_name"])
        return _kamera_akun(orang)

    baris_grup = []
    for nama_grup in sorted(anggota):
        semua = anggota[nama_grup]
        orang = semua
        if not penuh and not any(
                o.id == pengelola.id or bawahan_saya(pengelola, o, db)
                for o in semua):
            continue

        # Yang menyumbang kamera ke grup hanyalah Admin. Kamera User adalah
        # pemberian atas namanya sendiri; menyertakannya di sini akan
        # membuat kamera itu tampak dimiliki seluruh grup.
        penyumbang = [o for o in orang if _peran(o) == "admin"]

        per_kamera_grup = {}
        for o in penyumbang:
            for k in kamera:
                if k.owner_id == o.id:
                    per_kamera_grup[k.id] = {
                        "stream_id": k.id, "stream_name": k.name,
                        "cara": "pemilik", "can_view": True,
                        "can_playback": True, "can_reshare": True}
            for g in grant_admin.get(o.id, []):
                if g.stream_id not in id_kamera:
                    continue
                if per_kamera_grup.get(g.stream_id, {}).get("cara") == "pemilik":
                    continue
                # Bila anggota berbeda memegang izin yang berbeda atas kamera
                # yang sama, yang ditampilkan adalah yang terluas — itulah
                # yang sesungguhnya dapat dilakukan grup ini.
                lama = per_kamera_grup.get(g.stream_id)
                baru = {
                    "stream_id": g.stream_id,
                    "stream_name": nama_kamera.get(g.stream_id, "?"),
                    "cara": "dibagikan",
                    "can_view": bool(getattr(g, "can_view", True)),
                    "can_playback": bool(getattr(g, "can_playback", True)),
                    "can_reshare": bool(g.can_reshare)}
                if lama:
                    for kunci in ("can_view", "can_playback", "can_reshare"):
                        baru[kunci] = lama.get(kunci) or baru[kunci]
                per_kamera_grup[g.stream_id] = baru

        daftar_grup = sorted(per_kamera_grup.values(),
                             key=lambda d: d["stream_name"])

        def _kamera_anggota(o, _kg=per_kamera_grup):
            return _kamera_anggota_bagi(o, _kg)

        baris_grup.append({
            "grup": nama_grup,
            "anggota": [{"user_id": o.id, "username": o.username,
                         "role": o.role,
                         # Admin mengikuti kamera grupnya dengan sendirinya;
                         # User diatur satu per satu oleh Super Admin.
                         "otomatis": _peran(o) == "admin",
                         "jumlah_kamera": len(_kamera_anggota(o)),
                         # Nama kameranya ikut dikirim: baris anggota
                         # berdiri sejajar kolom tabel, dan kolom Kamera
                         # di sana tidak dapat diisi oleh angka saja.
                         "kamera": _kamera_anggota(o)}
                        for o in semua],
            "jumlah": len(daftar_grup),
            "kamera": daftar_grup,
            # Hanya Super Admin yang menyerahkan kamera kepada grup, dan
            # hanya bila grup itu punya Admin untuk menerimanya.
            "cara_atur": ("grup" if (penuh and penyumbang)
                          else "tidak_perlu")})

    baris_kamera = []
    for k in kamera:
        pemegang = []
        # Grup lebih dulu: itulah pemegang sesungguhnya bagi sisi Admin.
        for bg in baris_grup:
            for d in bg["kamera"]:
                if d["stream_id"] == k.id:
                    pemegang.append({
                        "user_id": None, "username": bg["grup"],
                        "role": "grup", "cara": d["cara"],
                        "can_view": d["can_view"],
                        "can_playback": d["can_playback"]})
        # Anggota grup memegang kameranya sendiri-sendiri: Admin ikut
        # kamera grupnya, User diberi satu per satu. Tanpa ini, arah
        # Per Kamera hanya menyebut grupnya dan orang yang benar-benar
        # dapat menonton tidak kelihatan.
        for bg in baris_grup:
            for o in bg["anggota"]:
                for d in o.get("kamera", []):
                    if d["stream_id"] == k.id:
                        pemegang.append({
                            "user_id": o["user_id"], "username": o["username"],
                            "role": o["role"], "cara": d["cara"],
                            "can_view": d["can_view"],
                            "can_playback": d["can_playback"]})
        for b in baris_akun:
            for d in b["kamera"]:
                if d["stream_id"] == k.id:
                    pemegang.append({
                        "user_id": b["user_id"], "username": b["username"],
                        "role": b["role"], "cara": d["cara"],
                        "can_view": d["can_view"],
                        "can_playback": d["can_playback"]})
        baris_kamera.append({
            "stream_id": k.id, "stream_name": k.name,
            "group_name": k.group_name, "owner_id": k.owner_id,
            "jumlah": len(pemegang), "pemegang": pemegang})

    return {"per_akun": baris_akun, "per_grup": baris_grup,
            "per_kamera": baris_kamera,
            "boleh_pindah_pemilik": penuh}


def _kamera_terjangkau(stream_id, pengelola, db):
    """Ambil kamera itu, atau tolak kalau di luar wewenangnya."""
    stream = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")
    if not boleh_bagi(pengelola, stream_id, db):
        raise HTTPException(
            status_code=403,
            detail="Anda tidak berwenang membagikan kamera ini")
    return stream


@app.get("/api/admin/streams/{stream_id}/sharing")
def admin_lihat_berbagi_kamera(
    stream_id: int,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Siapa saja yang berhak atas satu kamera.

    Mengembalikan seluruh akun yang dapat diberi izin, masing-masing dengan
    keadaannya sekarang, sehingga layar tidak perlu memadukan dua daftar
    sendiri. Baris pemberian orang lain ditandai terkunci — Admin hanya boleh
    mencabut pemberiannya sendiri.
    """
    stream = _kamera_terjangkau(stream_id, pengelola, db)
    penuh = kuasa_penuh(pengelola)

    izin = {
        i.user_id: i for i in db.query(StreamPermissionModel).filter(
            StreamPermissionModel.stream_id == stream_id).all()
    }
    pemberi = {
        u.id: u.username for u in db.query(UserModel).filter(
            UserModel.id.in_({i.granted_by for i in izin.values()
                              if i.granted_by})).all()
    } if izin else {}

    # Hanya akun yang memang menerima izin lewat daftar ini. Admin memperoleh
    # kamera lewat kepemilikan, bukan lewat pencentangan.
    calon = db.query(UserModel).filter(
        UserModel.role.in_(["user", "guest"])).all()
    if not penuh:
        calon = [u for u in calon if bawahan_saya(pengelola, u, db)]

    daftar = []
    for u in sorted(calon, key=lambda x: x.username):
        i = izin.get(u.id)
        milik_saya = penuh or (i is not None and i.granted_by == pengelola.id)
        daftar.append({
            "user_id": u.id,
            "username": u.username,
            "role": u.role,
            "can_view": bool(i.can_view) if i else False,
            "can_playback": bool(i.can_playback) if i else False,
            "granted_by": i.granted_by if i else None,
            "granted_by_username": pemberi.get(i.granted_by) if i else None,
            # Baris pemberian orang lain: tampil, tetapi tidak dapat diubah.
            "terkunci": bool(i is not None and not milik_saya),
        })

    admin_list = [
        {"id": a.id, "username": a.username}
        for a in db.query(UserModel).filter(
            UserModel.role == "admin").order_by(UserModel.username).all()
    ] if penuh else []

    return {
        "stream_id": stream.id,
        "stream_name": stream.name,
        "owner_id": stream.owner_id,
        "boleh_pindah_pemilik": penuh,
        "penerima": daftar,
        "admin_tersedia": admin_list,
    }


@app.post("/api/admin/streams/{stream_id}/sharing")
def admin_atur_berbagi_kamera(
    stream_id: int,
    data: BerbagiKameraUpdate,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Tetapkan siapa saja yang berhak atas satu kamera."""
    _kamera_terjangkau(stream_id, pengelola, db)
    penuh = kuasa_penuh(pengelola)

    diminta = {p.user_id: p for p in data.penerima}
    if diminta:
        akun = {u.id: u for u in db.query(UserModel).filter(
            UserModel.id.in_(diminta)).all()}
        hilang = set(diminta) - set(akun)
        if hilang:
            raise HTTPException(
                status_code=404,
                detail=f"Akun tidak ditemukan: {sorted(hilang)}")
        for uid, u in akun.items():
            # Super Admin melihat segalanya; Admin memperoleh kamera lewat
            # kepemilikan. Keduanya tidak menerima izin per kamera.
            if u.role not in ("user", "guest"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Akun '{u.username}' berperan {u.role} dan tidak "
                           "menerima izin per kamera")
            if not penuh and not bawahan_saya(pengelola, u, db):
                raise HTTPException(
                    status_code=403,
                    detail=f"'{u.username}' bukan bawahan Anda")
        for uid, p in diminta.items():
            # Baris tanpa kewenangan apa pun sama saja dengan tidak diberi,
            # dan menyimpannya membuat daftar tampak berisi padahal kosong.
            if not p.can_view and not p.can_playback:
                raise HTTPException(
                    status_code=400,
                    detail=f"Penerima {uid} tanpa izin apa pun; keluarkan "
                           "saja dari daftar")

    lama = db.query(StreamPermissionModel).filter(
        StreamPermissionModel.stream_id == stream_id).all()
    ada = {i.user_id: i for i in lama}

    ditolak = []
    for i in lama:
        if i.user_id in diminta:
            continue
        # Admin hanya boleh mencabut pemberiannya sendiri; pemberian Super
        # Admin atau Admin lain dibiarkan utuh.
        if penuh or i.granted_by == pengelola.id:
            db.delete(i)
        else:
            ditolak.append(i.user_id)

    for uid, p in diminta.items():
        i = ada.get(uid)
        if i is None:
            db.add(StreamPermissionModel(
                stream_id=stream_id, user_id=uid,
                can_view=p.can_view, can_playback=p.can_playback,
                granted_by=pengelola.id))
            continue
        if not penuh and i.granted_by not in (None, pengelola.id):
            ditolak.append(uid)
            continue
        i.can_view = p.can_view
        i.can_playback = p.can_playback
        i.granted_by = pengelola.id

    db.commit()

    # Tabel lama tetap disinkron agar layar dan laporan yang masih
    # membacanya tidak menampilkan angka yang bertentangan.
    for uid in set(diminta) | set(ada):
        u = db.query(UserModel).filter(UserModel.id == uid).first()
        if not u:
            continue
        sid = {i.stream_id for i in db.query(StreamPermissionModel).filter(
            StreamPermissionModel.user_id == uid).all()}
        u.streams = db.query(CCTVStreamModel).filter(
            CCTVStreamModel.id.in_(sid)).all() if sid else []
    db.commit()

    return {
        "message": "Izin kamera diperbarui",
        "jumlah_penerima": len(diminta),
        # Bukan galat: pemberian orang lain memang dibiarkan utuh. Dikembalikan
        # supaya layar dapat menerangkannya, bukan diam-diam.
        "dilewati_bukan_milik_anda": sorted(set(ditolak)),
    }


@app.post("/api/admin/streams/{stream_id}/owner")
def admin_pindah_pemilik_kamera(
    stream_id: int,
    data: PemilikKameraUpdate,
    pengelola: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    """Pindahkan kepemilikan kamera ke Admin lain, atau lepaskan.

    Khusus Super Admin. Kalau Admin boleh memindahkannya, ia dapat melempar
    kameranya ke Admin lain atau merebut kamera orang.

    Pemberian yang sudah ada TIDAK dicabut; jumlahnya dikembalikan agar layar
    dapat memperingatkan.
    """
    if not kuasa_penuh(pengelola):
        raise HTTPException(
            status_code=403,
            detail="Hanya Super Admin yang dapat memindahkan pemilik kamera")

    stream = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    baru = data.owner_id or None
    if baru is not None:
        calon = db.query(UserModel).filter(UserModel.id == baru).first()
        if not calon:
            raise HTTPException(status_code=404, detail="Admin tidak ditemukan")
        if calon.role not in ("admin", "super_admin"):
            raise HTTPException(
                status_code=400,
                detail=f"'{calon.username}' berperan {calon.role}; hanya Admin "
                       "yang dapat memiliki kamera")

    lama = stream.owner_id
    stream.owner_id = baru
    db.commit()

    terdampak = db.query(StreamPermissionModel).filter(
        StreamPermissionModel.stream_id == stream_id).count()

    return {
        "message": "Pemilik kamera diperbarui",
        "owner_id": baru,
        "owner_id_sebelumnya": lama,
        # Sengaja dibiarkan: mencabut diam-diam membuat orang kehilangan
        # tontonan tanpa ada yang tahu sebabnya.
        "pemberian_dipertahankan": terdampak,
    }


@app.post("/api/admin/users/{user_id}/access")
def admin_update_user_access(
    user_id: int,
    access_data: UserAccessUpdate,
    admin: UserModel = Depends(verify_pengelola_pengguna),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if kuasa_penuh(user):
        raise HTTPException(status_code=400, detail="Admin access mappings cannot be modified (admins automatically inherit all streams)")

    if not kuasa_penuh(admin) and not bawahan_saya(admin, user, db):
        raise HTTPException(
            status_code=403,
            detail="Anda hanya dapat mengatur akses bawahan Anda")

    diminta = set(access_data.stream_ids)
    streams = db.query(CCTVStreamModel).filter(
        CCTVStreamModel.id.in_(diminta)).all() if diminta else []
    sah = {s.id for s in streams}
    hilang = diminta - sah
    if hilang:
        raise HTTPException(
            status_code=404,
            detail=f"Kamera tidak ditemukan: {sorted(hilang)}")

    # Hanya kamera yang benar-benar boleh ia bagikan.
    if not kuasa_penuh(admin):
        ditolak = [s.id for s in streams if not boleh_bagi(admin, s.id, db)]
        if ditolak:
            raise HTTPException(
                status_code=403,
                detail=f"Anda tidak berwenang membagikan kamera: {ditolak}")

    # Pemberian ditulis ke stream_permissions, tempat boleh_tonton dan
    # boleh_playback membacanya. Menulis ke user.streams saja tidak lagi
    # cukup sejak izin tonton dan izin rekaman dipisah.
    lama = db.query(StreamPermissionModel).filter(
        StreamPermissionModel.user_id == user_id).all()
    for izin in lama:
        # Admin hanya boleh mencabut pemberiannya sendiri; pemberian Super
        # Admin atau Admin lain dibiarkan utuh.
        if izin.stream_id in sah:
            continue
        if kuasa_penuh(admin) or izin.granted_by == admin.id:
            db.delete(izin)

    ada = {i.stream_id for i in lama}
    for sid in sah:
        if sid in ada:
            continue
        db.add(StreamPermissionModel(
            stream_id=sid, user_id=user_id,
            can_view=True, can_playback=True, granted_by=admin.id))

    # Tabel lama tetap diperbarui agar layar dan laporan yang masih
    # membacanya tidak menampilkan angka yang bertentangan.
    user.streams = streams
    db.commit()

    return {"message": f"Access mapped for user {user.username}. Authorized {len(streams)} cameras."}

# 9. User Manager: Create User
@app.post("/api/admin/users", response_model=UserAdminResponse)
def admin_create_user(
    user_data: UserCreate,
    admin: UserModel = Depends(verify_pengelola_pengguna),
    db: Session = Depends(get_db)
):
    existing = db.query(UserModel).filter(UserModel.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    tolak_guest_baru(user_data.role, db)

    # Admin boleh mencetak sesamanya — akun itu tetap terkurung di grupnya,
    # jadi wewenangnya tidak melebar. Super Admin tetap tidak dapat dicetak
    # dari bawah; kalau boleh, batas ini dapat dilangkahi hanya dengan
    # membuat akun baru.
    if not kuasa_penuh(admin):
        if user_data.role not in ("admin", "user", "guest"):
            raise HTTPException(
                status_code=403,
                detail="Anda tidak dapat membuat akun super admin")
        # Admin tanpa grup tidak punya wilayah untuk menampung akun baru.
        if user_data.role == "admin" and not getattr(admin, "admin_group", None):
            raise HTTPException(
                status_code=403,
                detail="Anda belum tergabung dalam grup, "
                       "sehingga belum dapat membuat admin")

    hashed_pass = get_password_hash(user_data.password)
    new_user = UserModel(
        username=user_data.username,
        password_hash=hashed_pass,
        role=user_data.role,
        # Super Admin memilih siapa pengelolanya; Admin selalu menjadi
        # pengelola akun yang ia buat sendiri.
        parent_admin_id=(periksa_pengelola(user_data.parent_admin_id, None, db)
                         if kuasa_penuh(admin) else admin.id),
        # Super Admin memilih grupnya; Admin selalu menaruh di grupnya sendiri.
        admin_group=grup_akun_baru(admin, user_data, db)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserAdminResponse(
        id=new_user.id,
        username=new_user.username,
        role=new_user.role,
        parent_admin_id=new_user.parent_admin_id,
        dibuat_oleh=(db.query(UserModel).filter(
            UserModel.id == new_user.parent_admin_id).first().username
            if new_user.parent_admin_id else None),
        admin_group=new_user.admin_group,
        stream_ids=[]
    )

# 10. User Manager: Update User
@app.put("/api/admin/users/{user_id}", response_model=UserAdminResponse)
def admin_update_user(
    user_id: int,
    user_data: UserUpdate,
    admin: UserModel = Depends(verify_pengelola_pengguna),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not kuasa_penuh(admin):
        if not bawahan_saya(admin, user, db):
            raise HTTPException(
                status_code=403,
                detail="Anda hanya dapat mengubah akun bawahan Anda")
        # Super Admin tidak dapat dicetak dari bawah.
        if user_data.role not in ("admin", "user", "guest"):
            raise HTTPException(
                status_code=403,
                detail="Anda tidak dapat menetapkan peran super admin")
    
    if user.username != user_data.username:
        existing = db.query(UserModel).filter(UserModel.username == user_data.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
    
    # Mengubah peran akun lain menjadi guest sama saja dengan membuat guest
    # baru, hanya lewat jalur belakang.
    tolak_guest_baru(user_data.role, db, target=user)

    user.username = user_data.username
    user.role = user_data.role

    # Hanya Super Admin yang boleh memindahkan pengelolaan. Kalau Admin
    # boleh, ia dapat menarik bawahan Admin lain menjadi miliknya.
    if user_data.parent_admin_id is not None:
        if not kuasa_penuh(admin):
            raise HTTPException(
                status_code=403,
                detail="Hanya super admin yang dapat mengubah admin pengelola")
        user.parent_admin_id = periksa_pengelola(
            user_data.parent_admin_id, user.id, db)

    # Memindahkan akun antar-grup mengubah siapa saja yang menjangkaunya,
    # jadi hanya Super Admin yang boleh. Admin yang mengirimnya diabaikan.
    if user_data.admin_group is not None and kuasa_penuh(admin):
        user.admin_group = tentukan_grup(
            admin, user_data.admin_group, user.admin_group)
    
    # Akun yang baru naik menjadi Admin pun tidak boleh terdampar tanpa
    # grup, dengan alasan yang sama seperti saat pembuatan.
    if user.role == "admin" and not user.admin_group:
        user.admin_group = grup_bawaan_admin(user.username)

    # SUPER_ADMIN independen dari toggle grup/tanpa-grup: nilainya
    # diatur langsung di sini, bukan lewat endpoint groups/*/ads.
    if user.role == "super_admin" and user_data.show_ads is not None:
        user.show_ads = user_data.show_ads

    if user_data.password and user_data.password.strip():
        user.password_hash = get_password_hash(user_data.password)
        
    db.commit()
    db.refresh(user)
    return UserAdminResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        parent_admin_id=user.parent_admin_id,
        dibuat_oleh=(db.query(UserModel).filter(
            UserModel.id == user.parent_admin_id).first().username
            if user.parent_admin_id else None),
        admin_group=user.admin_group,
        stream_ids=[s.id for s in user.streams]
    )

# 11. User Manager: Delete User
@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    admin: UserModel = Depends(verify_pengelola_pengguna),
    db: Session = Depends(get_db)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    # Akun guest bawaan dipakai bersama. Kalau dihapus, login tamu akan
    # membuatnya ulang diam-diam dengan sandi acak, sehingga pemberian akses
    # yang menempel padanya ikut hilang tanpa jejak.
    if user.username == NAMA_GUEST:
        raise HTTPException(
            status_code=400,
            detail="Akun guest bawaan tidak dapat dihapus")

    # Admin hanya boleh menutup akun yang ia buat sendiri.
    if not kuasa_penuh(admin) and not bawahan_saya(admin, user, db):
        raise HTTPException(
            status_code=403,
            detail="Anda hanya dapat menghapus akun bawahan Anda")
        
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

def _enforce_key_domain(key_record, request):
    """Tolak bila allowed_domain diisi dan Referer/Origin tidak cocok."""
    if not (key_record.allowed_domain and key_record.allowed_domain.strip()):
        return

    def _dom(u):
        if not u:
            return ""
        if "://" in u:
            u = u.split("://")[1]
        return u.split("/")[0].split(":")[0].lower()

    ref = _dom(request.headers.get("referer", ""))
    org = _dom(request.headers.get("origin", ""))
    target = key_record.allowed_domain.strip().lower()
    if target not in ref and target not in org:
        raise HTTPException(status_code=403, detail="Akses ditolak: Domain asal tidak diizinkan")


def _strip_paths_for_key(user, items):
    """Buang path absolut server bila pemanggilnya kunci API (bukan admin/user login)."""
    if not isinstance(user, ApiKeyPrincipal):
        return items
    for it in items:
        if isinstance(it, dict):
            it.pop("path", None)
    return items


def _sync_key_cameras(db, key_id, camera_ids, primary_id):
    """Samakan isi api_key_cameras dengan daftar yang dikirim admin.

    Kamera utama selalu ikut supaya URL tanpa ?camera= tetap punya sasaran.
    """
    # Urutan daftar DIPERTAHANKAN: index 0 = kamera utama = URL tanpa ?camera=
    urut = []
    for cid in (camera_ids or []):
        if cid not in urut:
            urut.append(cid)
    if primary_id and primary_id not in urut:
        urut.append(primary_id)
    if not urut:
        return
    valid = {r.id for r in db.query(CCTVStreamModel.id).filter(CCTVStreamModel.id.in_(urut)).all()}
    hilang = [c for c in urut if c not in valid]
    if hilang:
        raise HTTPException(status_code=404, detail=f"Kamera tidak ditemukan: {hilang}")
    db.query(ApiKeyCameraModel).filter(ApiKeyCameraModel.api_key_id == key_id).delete()
    for pos, cid in enumerate(urut):
        db.add(ApiKeyCameraModel(api_key_id=key_id, camera_id=cid, position=pos))


def _resolve_camera_ref(ref, cam_ids):
    """Terjemahkan nilai ?camera= menjadi id kamera sungguhan.

    Utamakan NOMOR URUT (1 = kamera pertama/utama, 2 = kedua, ...) sesuai
    permintaan: klien tak perlu tahu id internal. Bila nilai bukan nomor urut
    yang sah tapi cocok dengan id milik kunci, id itu tetap diterima supaya
    URL lama yang memakai id tidak mendadak mati.
    """
    if ref is None:
        return cam_ids[0] if cam_ids else None
    if 1 <= ref <= len(cam_ids):
        return cam_ids[ref - 1]
    if ref in cam_ids:
        return ref
    return None


def _key_camera_ids(key_record, db):
    """Semua id kamera yang boleh diakses satu kunci API.

    Gabungan tabel penghubung api_key_cameras + camera_id utama (kompatibilitas).
    """
    ids = [r.camera_id for r in db.query(ApiKeyCameraModel).filter(
        ApiKeyCameraModel.api_key_id == key_record.id).order_by(
        ApiKeyCameraModel.position, ApiKeyCameraModel.id).all()]
    if key_record.camera_id and key_record.camera_id not in ids:
        ids.append(key_record.camera_id)
    return ids


class ApiKeyPrincipal:
    """Peniru UserModel untuk kunci API.

    Punya .role dan .streams supaya _user_has_stream_access() dan filter
    [s.id for s in user.streams] di endpoint recordings jalan apa adanya.
    role sengaja BUKAN 'admin' agar tidak pernah lolos jalur admin.
    """
    def __init__(self, key_record, streams):
        self.id = None
        self.role = "apikey"
        self.username = f"apikey:{key_record.client_name}"
        self.streams = streams
        self.key_record = key_record


async def get_playback_principal(
    request: Request,
    key: Optional[str] = Query(None, description="Kunci API (alternatif token login)"),
    token_creds: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db),
):
    """Terima token login ATAU kunci API.

    Kunci API hanya diterima bila include_playback menyala, dan aksesnya
    terbatas pada kamera yang terdaftar di kunci tersebut.
    """
    if token_creds:
        user = _get_user_from_token(token_creds.credentials, db)
        touch_client_activity()
        return user

    if not key:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    key_record = db.query(ApiKeyModel).filter(
        ApiKeyModel.key_value == key, ApiKeyModel.is_active == True).first()
    if not key_record:
        raise HTTPException(status_code=403, detail="Kunci API tidak valid atau tidak aktif")
    if not key_record.include_playback:
        raise HTTPException(status_code=403, detail="Kunci API ini tidak diizinkan mengakses rekaman")

    _enforce_key_domain(key_record, request)

    ids = _key_camera_ids(key_record, db)
    streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(ids)).all() if ids else []
    return ApiKeyPrincipal(key_record, streams)


def _user_has_stream_access(user, stream_id, db):
    """Boleh membuka rekaman kamera ini?

    Pembungkus tipis boleh_playback(), dipertahankan supaya pemanggil lama
    tidak perlu diubah sekaligus memastikan hanya ada satu sumber kebenaran
    tentang izin rekaman.
    """
    return boleh_playback(user, stream_id, db)


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
MEDIAMTX_LIST_TIMEOUT = float(os.getenv("MEDIAMTX_LIST_TIMEOUT", "30"))
# Mengambil potongan dari titik jauh pada kamera dengan ribuan segmen
# bisa memakan ~20 detik. Batas lama (15 detik) memutus permintaan yang
# sebenarnya akan berhasil.
MEDIAMTX_PLAYBACK_TIMEOUT = float(os.getenv("MEDIAMTX_PLAYBACK_TIMEOUT", "60"))


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


# Cache daftar segmen: {path_name: (waktu_ambil, data)}. Kamera dengan RTSP
# putus-sambung bisa punya ~20rb segmen dan butuh ~7 detik untuk dipindai
# MediaMTX; tanpa cache, tiap ganti tanggal membayar ongkos itu lagi.
_SEGMEN_CACHE: dict = {}
_SEGMEN_CACHE_TTL = float(os.getenv("MEDIAMTX_LIST_CACHE_TTL", "60"))


def _mediamtx_segments(path_name: str):
    now = time.time()
    memo = _SEGMEN_CACHE.get(path_name)
    if memo and (now - memo[0]) < _SEGMEN_CACHE_TTL:
        return memo[1]

    url = f"{MEDIAMTX_PLAYBACK_BASE}/list?path={urllib.parse.quote(path_name)}"
    # Kamera dengan puluhan ribu segmen butuh >5s; timeout lama bikin
    # timeline kosong walau rekaman ada (dates baca disk, jadi tetap terisi).
    try:
        with urllib.request.urlopen(url, timeout=MEDIAMTX_LIST_TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
        _SEGMEN_CACHE[path_name] = (now, data)
        return data
    except Exception as e:
        print(f"[Playback] list error path={path_name}: {type(e).__name__}: {e}")
        raise

@app.get("/api/recordings/cameras")
def get_recording_cameras(
    user = Depends(get_playback_principal),
    db: Session = Depends(get_db)
):
    """List cameras with recording enabled, filtered by user access."""
    if kuasa_penuh(user):
        streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.record_enabled == True).all()
    else:
        # Disaring lewat boleh_playback agar izin rekaman yang diberikan
        # terpisah dari izin tonton benar-benar dihormati di daftar ini.
        semua = db.query(CCTVStreamModel).filter(
            CCTVStreamModel.record_enabled == True).all()
        streams = [s for s in semua if boleh_playback(user, s.id, db)]

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
            "record_path": ("" if isinstance(user, ApiKeyPrincipal) else rec_path),
            "has_recordings": has_recordings
        })
    return cameras

@app.get("/api/recordings/{stream_id}/dates")
def get_recording_dates(
    stream_id: int,
    user = Depends(get_playback_principal),
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
    user = Depends(get_playback_principal),
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
        "disk_segments": _strip_paths_for_key(user, disk_segments)
    }


@app.get("/api/recordings/{stream_id}/file")
def get_recording_file(
    stream_id: int,
    rel: str = Query(..., description="Path relative to the camera recording dir"),
    user = Depends(get_playback_principal),
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
    segments: bool = Query(False, description="Sertakan daftar segmen mentah (berat)"),
    user = Depends(get_playback_principal),
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
        # Daftar segmen mentah bisa puluhan ribu entri (kamera yang RTSP-nya
        # putus-sambung). Pemutar hanya butuh `ranges`, jadi segmen dikirim
        # hanya bila diminta eksplisit.
        "segments": segs if segments else [],
        "segment_count": len(segs),
        "ranges": ranges,
        "total_duration": sum(r["duration"] for r in ranges),
    }


@app.get("/api/recordings/{stream_id}/next-playable")
def cari_range_terisi(
    stream_id: int,
    start: str = Query(..., description="ISO8601: cari dari titik ini"),
    limit: int = Query(12, ge=1, le=40, description="Maksimal range yang dicoba"),
    user = Depends(get_playback_principal),
    db: Session = Depends(get_db)
):
    """Range pertama yang BENAR-BENAR berisi video, mulai dari `start`.

    `ranges` dari MediaMTX tak bisa dipercaya pada kamera yang RTSP-nya
    putus-sambung: metadata durasi bohong, sehingga range panjang bisa
    kosong dan range pendek bisa berisi. Satu-satunya cara memastikan
    adalah menarik potongannya. Di sini beberapa range diperiksa paralel
    supaya pemutar tak perlu mencoba satu per satu.
    """
    if not _user_has_stream_access(user, stream_id, db):
        raise HTTPException(status_code=403, detail="Access denied")
    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    try:
        titik = datetime.fromisoformat(start).timestamp()
    except ValueError:
        raise HTTPException(status_code=400, detail="Format `start` tidak sah")

    path_name = _mediamtx_path_for(stream, stream_id)
    raw = _mediamtx_segments(path_name)

    kandidat = []
    for seg in raw:
        st, dur = seg.get("start"), float(seg.get("duration") or 0)
        if not st or dur <= 0:
            continue
        try:
            ep = datetime.fromisoformat(st).timestamp()
        except ValueError:
            continue
        if ep > titik + 0.5:
            kandidat.append((ep, st))
    kandidat.sort()
    kandidat = kandidat[:limit]

    if not kandidat:
        return {"found": False, "start": None, "checked": 0}

    def berisi(item):
        ep, st = item
        url = (f"{MEDIAMTX_PLAYBACK_BASE}/get?path={urllib.parse.quote(path_name)}"
               f"&start={urllib.parse.quote(st)}&duration=8")
        try:
            with urllib.request.urlopen(url, timeout=12) as r:
                # Cukup baca kepala berkas: fMP4 kosong hanya berisi
                # moov/ftyp tanpa data gambar berarti.
                data = r.read(65536)
            return (ep, st, len(data) >= 40000)
        except Exception:
            return (ep, st, False)

    # Diperiksa bergelombang kecil dan berhenti begitu ketemu: sebagian besar
    # range sebenarnya berisi, jadi memeriksa semua kandidat sekaligus
    # membayar ongkos berkali-kali untuk jawaban yang ada di urutan pertama.
    GELOMBANG = 4
    diperiksa = 0
    with ThreadPoolExecutor(max_workers=GELOMBANG) as ex:
        for i in range(0, len(kandidat), GELOMBANG):
            batch = kandidat[i:i + GELOMBANG]
            hasil = sorted(ex.map(berisi, batch), key=lambda x: x[0])
            diperiksa += len(hasil)
            for ep, st, ok in hasil:
                if ok:
                    return {"found": True, "start": st, "start_epoch": ep,
                            "checked": diperiksa}

    return {"found": False, "start": None, "checked": diperiksa,
            "next_after": kandidat[-1][0] if kandidat else None}


@app.get("/api/recordings/{stream_id}/stream")
def stream_recording(
    stream_id: int,
    start: str = Query(..., description="ISO8601 start time"),
    duration: float = Query(3600, gt=0, le=86400),
    token: str = Query(None, description="JWT (video tag cannot send headers)"),
    key: str = Query(None, description="Kunci API (alternatif token login)"),
    pass_: Optional[str] = Query(None, alias="pass"),
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Proxy MediaMTX playback: one continuous fMP4 across segments.

    Kredensial lewat query karena tag <video> tak bisa kirim header.
    Diterima: JWT pengguna login ATAU kunci API dengan izin playback.
    """
    user = None

    if key:
        key_record = db.query(ApiKeyModel).filter(
            ApiKeyModel.key_value == key, ApiKeyModel.is_active == True).first()
        if not key_record:
            raise HTTPException(status_code=403, detail="Kunci API tidak valid atau tidak aktif")
        if key_record.secret_pass and key_record.secret_pass.strip():
            if not pass_ or pass_.strip() != key_record.secret_pass.strip():
                raise HTTPException(status_code=403, detail="Password salah atau tidak disertakan")
        if not key_record.include_playback:
            raise HTTPException(status_code=403, detail="Kunci API ini tidak diizinkan mengakses rekaman")
        ids = _key_camera_ids(key_record, db)
        streams_izin = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(ids)).all() if ids else []
        user = ApiKeyPrincipal(key_record, streams_izin)
    else:
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

    # Sambungan dibuka di sini, bukan di dalam generator: begitu
    # StreamingResponse dikembalikan, status 200 sudah terkirim dan kegagalan
    # apa pun hanya tampak sebagai badan kosong di sisi klien.
    try:
        resp = urllib.request.urlopen(url, timeout=MEDIAMTX_PLAYBACK_TIMEOUT)
        kepala = resp.read(65536)
    except Exception as e:
        print(f"[Playback] stream error: {e}")
        raise HTTPException(
            status_code=504,
            detail="Server rekaman tidak menjawab untuk rentang waktu ini")

    if not kepala:
        resp.close()
        raise HTTPException(
            status_code=404,
            detail="Tidak ada rekaman pada rentang waktu ini")

    def pump():
        try:
            yield kepala
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                yield chunk
        except Exception as e:
            print(f"[Playback] stream error: {e}")
        finally:
            resp.close()

    return StreamingResponse(pump(), media_type="video/mp4")

@app.get("/api/recordings/{stream_id}/playback-url")
def get_playback_url(
    stream_id: int,
    start: str = Query(..., description="Start time ISO format"),
    end: str = Query(None, description="End time ISO format"),
    user = Depends(get_playback_principal),
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
    user = Depends(get_playback_principal),
    db: Session = Depends(get_db)
):
    # API key (bukan user login) tak punya show_ads -> anggap boleh tampil.
    if isinstance(user, UserModel) and not user.show_ads and user.role != "super_admin":
        return AdConfigSchema(
            image_url="", marquee_text="", bg_color="#1e293b", text_color="#ffffff",
            scroll_speed=5, font_size=10, font_family="monospace",
            image_opacity=1.0, bg_opacity=1.0, text_opacity=1.0, is_active=False,
            box_width=100, text_align="left", image_height=20,
            embed_timeout_seconds=300, click_to_play=True
        )
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

@app.get("/api/external/cameras")
def get_external_cameras(
    key: str,
    request: Request,
    pass_: Optional[str] = Query(None, alias="pass"),
    db: Session = Depends(get_db)
):
    """Daftar kamera yang boleh diakses satu kunci API.

    Dipakai embed.php untuk menampilkan pemilih kamera. Hanya memuat kamera
    milik kunci tersebut, bukan seluruh inventaris.
    """
    key_record = db.query(ApiKeyModel).filter(
        ApiKeyModel.key_value == key, ApiKeyModel.is_active == True).first()
    if not key_record:
        raise HTTPException(status_code=403, detail="Kunci API tidak valid atau tidak aktif")

    if key_record.secret_pass and key_record.secret_pass.strip():
        if not pass_ or pass_.strip() != key_record.secret_pass.strip():
            raise HTTPException(status_code=403, detail="Kata sandi akses salah atau tidak disertakan")

    _enforce_key_domain(key_record, request)

    ids = _key_camera_ids(key_record, db)
    streams = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(ids)).all() if ids else []

    items = []
    for st in streams:
        nm = _re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '', st.name or '')
        nm = _re.sub(r'\s+', ' ', nm).strip(' -') or f"Kamera {st.id}"
        items.append({
            "id": st.id,
            "name": nm,
            "is_primary": st.id == key_record.camera_id,
            "has_recording": bool(st.record_enabled),
        })
    items.sort(key=lambda x: (not x["is_primary"], x["name"]))

    return {
        "client_name": key_record.client_name,
        "include_playback": bool(key_record.include_playback),
        "cameras": items,
    }


def _daftar_kamera_kunci(key_record, cam_ids, db):
    """Daftar kamera satu kunci sebagai nomor urut + nama.

    Id internal sengaja TIDAK disertakan; klien memakai nomor urut saja.
    """
    rows = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(cam_ids)).all() if cam_ids else []
    peta = {c.id: c.name for c in rows}
    kustom = (key_record.custom_camera_name or "").strip()
    hasil = []
    for i, cid in enumerate(cam_ids):
        label = peta.get(cid, f"Kamera {cid}")
        if kustom and i == 0:
            label = kustom
        hasil.append({"camera": i + 1, "name": label})
    return hasil


@app.get("/api/external/playback")
def external_playback(
    key: str,
    request: Request,
    camera: Optional[int] = Query(None, description="nomor urut kamera (1=utama); id kamera juga diterima"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD; kosong = daftar tanggal yang tersedia"),
    pass_: Optional[str] = Query(None, alias="pass"),
    db: Session = Depends(get_db),
):
    """Playback untuk klien kunci API, memakai nomor urut kamera.

    Tanpa ?date=  -> daftar tanggal yang punya rekaman.
    Dengan ?date= -> daftar segmen tanggal itu + URL putar tiap segmen.
    """
    key_record = db.query(ApiKeyModel).filter(
        ApiKeyModel.key_value == key, ApiKeyModel.is_active == True).first()
    if not key_record:
        raise HTTPException(status_code=403, detail="Kunci API tidak valid atau tidak aktif")

    if key_record.secret_pass and key_record.secret_pass.strip():
        if not pass_ or pass_.strip() != key_record.secret_pass.strip():
            raise HTTPException(status_code=403, detail="Password salah atau tidak disertakan")

    if not key_record.include_playback:
        raise HTTPException(status_code=403, detail="Kunci API ini tidak diizinkan mengakses rekaman")

    _enforce_key_domain(key_record, request)

    cam_ids = _key_camera_ids(key_record, db)
    target_id = _resolve_camera_ref(camera, cam_ids)
    if target_id is None or target_id not in cam_ids:
        raise HTTPException(
            status_code=403,
            detail=f"Nomor kamera tidak sah. Kunci ini punya {len(cam_ids)} kamera (camera=1..{len(cam_ids)})")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == target_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    nomor = cam_ids.index(target_id) + 1
    nama = (key_record.custom_camera_name or "").strip() or stream.name
    berkas = _scan_rec_files(_camera_rec_dir(stream))

    # tanpa date: ringkas jadi daftar tanggal
    if not date:
        jumlah = {}
        for f in berkas:
            jumlah[f["date"]] = jumlah.get(f["date"], 0) + 1
        tanggal = [{"date": d, "segment_count": n} for d, n in jumlah.items()]
        tanggal.sort(key=lambda x: x["date"], reverse=True)
        return {
            "camera": nomor,
            "camera_name": nama,
            "total_cameras": len(cam_ids),
            "cameras": _daftar_kamera_kunci(key_record, cam_ids, db),
            "dates": tanggal,
        }

    # dengan date: daftar segmen + URL putar
    q = f"key={quote(key)}" + (f"&pass={quote(pass_)}" if pass_ else "")
    rec_dir = os.path.realpath(_camera_rec_dir(stream))
    segmen = []
    for f in berkas:
        if f["date"] != date:
            continue
        # endpoint /file menerima `rel` = path relatif terhadap dir kamera
        rel = os.path.relpath(f["path"], rec_dir)
        segmen.append({
            "start": f.get("start"),
            "time": f.get("time"),
            "size_bytes": f.get("size_bytes"),
            "size_human": f.get("size_human"),
            "url": f"/api/recordings/{target_id}/file?rel={quote(rel)}&{q}",
        })
    segmen.sort(key=lambda x: x.get("start") or "")

    # Rentang kontinu untuk timeline (dipakai pemutar agar bisa digeser).
    # Sumbernya MediaMTX, sama seperti halaman playback internal.
    ranges = []
    try:
        raw = _mediamtx_segments(_mediamtx_path_for(stream, target_id))
        potong = []
        for r in raw:
            mulai = r.get("start")
            durasi = float(r.get("duration") or 0)
            if not mulai or durasi <= 0:
                continue
            try:
                dt = datetime.fromisoformat(mulai)
            except ValueError:
                continue
            if dt.strftime("%Y-%m-%d") != date:
                continue
            potong.append({"start": mulai, "start_epoch": dt.timestamp(), "duration": durasi})
        potong.sort(key=lambda x: x["start_epoch"])
        for p in potong:
            if ranges and p["start_epoch"] - (ranges[-1]["start_epoch"] + ranges[-1]["duration"]) <= 5:
                ranges[-1]["duration"] = p["start_epoch"] + p["duration"] - ranges[-1]["start_epoch"]
            else:
                ranges.append(dict(p))
    except Exception:
        ranges = []

    return {
        "camera": nomor,
        "camera_name": nama,
        "total_cameras": len(cam_ids),
        "cameras": _daftar_kamera_kunci(key_record, cam_ids, db),
        "date": date,
        "segment_count": len(segmen),
        "segments": segmen,
        "ranges": ranges,
        "total_duration": sum(r["duration"] for r in ranges),
    }


@app.get("/api/external/stream")
def get_external_stream(
    key: str,
    request: Request,
    pass_: Optional[str] = Query(None, alias="pass"),
    camera: Optional[int] = Query(None, description="nomor urut kamera (1=utama); id kamera juga diterima"),
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

    # Kamera yang diminta harus salah satu milik kunci ini.
    # ?camera= dibaca sebagai NOMOR URUT (1 = kamera utama, 2 = kedua, ...).
    # Id kamera asli juga masih diterima demi URL lama.
    allowed_ids = _key_camera_ids(key_record, db)
    target_id = _resolve_camera_ref(camera, allowed_ids)
    if target_id is None or target_id not in allowed_ids:
        executor.submit(_write_access_log,
            key_record.id, key, key_record.client_name, target_id, "",
            req_ip, req_referer, req_ua, "denied", f"camera={camera} tidak sah untuk kunci ini (tersedia 1..{len(allowed_ids)})"
        )
        raise HTTPException(status_code=403, detail=f"Nomor kamera tidak sah. Kunci ini punya {len(allowed_ids)} kamera (camera=1..{len(allowed_ids)})")

    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == target_id).first()
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

def tolak_bukan_super(pengguna):
    """Hentikan siapa pun selain Super Admin.

    Dipakai seluruh endpoint kunci API. Satu tempat supaya tidak ada
    endpoint yang tertinggal saat aturannya berubah.
    """
    if not kuasa_penuh(pengguna):
        raise HTTPException(
            status_code=403,
            detail="Integrasi API hanya untuk Super Admin")


@app.get("/api/admin/api-keys", response_model=List[ApiKeyAdminResponse])
def get_all_api_keys(
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    # Kunci API menerbitkan tautan sematan publik yang melewati login,
    # jadi wewenangnya melampaui peran Admin. Hanya Super Admin.
    tolak_bukan_super(admin)
    keys = db.query(ApiKeyModel).all()
    results = []
    for k in keys:
        stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == k.camera_id).first()
        cam_ids = _key_camera_ids(k, db)
        cam_rows = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(cam_ids)).all() if cam_ids else []
        cam_map = {c.id: c.name for c in cam_rows}
        cam_names = [cam_map.get(i, f"Kamera {i}") for i in cam_ids]
        results.append({
            "id": k.id,
            "key_value": k.key_value,
            "camera_id": k.camera_id,
            "camera_name": stream.name if stream else "Kamera Terhapus",
            "camera_ids": cam_ids,
            "camera_names": cam_names,
            "include_playback": bool(k.include_playback),
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
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    tolak_bukan_super(admin)
    # Verify camera exists
    stream = db.query(CCTVStreamModel).filter(CCTVStreamModel.id == payload.camera_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    # Kunci API menembus login, jadi hanya boleh dibuat untuk kamera yang
    # memang berhak ia bagikan.
    if not boleh_bagi(admin, payload.camera_id, db):
        raise HTTPException(
            status_code=403,
            detail="Anda tidak berwenang membuat kunci untuk kamera ini")
        
    import secrets
    secure_key = f"cctv_key_{secrets.token_hex(16)}"
    
    key_record = ApiKeyModel(
        key_value=secure_key,
        # Tanpa pemilik, penyaringan kunci tidak punya dasar.
        owner_id=admin.id,
        camera_id=payload.camera_id,
        client_name=payload.client_name,
        custom_camera_name=payload.custom_camera_name.strip() if payload.custom_camera_name else None,
        allowed_domain=payload.allowed_domain.strip() if payload.allowed_domain else None,
        secret_pass=payload.secret_pass.strip() if payload.secret_pass else None,
        is_active=payload.is_active,
        embed_timeout_seconds=payload.embed_timeout_seconds,
        click_to_play=payload.click_to_play,
        include_playback=payload.include_playback
    )
    db.add(key_record)
    db.commit()
    db.refresh(key_record)
    _sync_key_cameras(db, key_record.id, payload.camera_ids, key_record.camera_id)
    db.commit()

    # Objek ORM tidak memuat kolom turunan; kirim dict agar bentuk respons POST
    # sama dengan GET (UI memakai hasil POST langsung).
    cam_ids = _key_camera_ids(key_record, db)
    cam_rows = db.query(CCTVStreamModel).filter(CCTVStreamModel.id.in_(cam_ids)).all() if cam_ids else []
    cam_map = {c.id: c.name for c in cam_rows}
    return {
        "id": key_record.id,
        "key_value": key_record.key_value,
        "camera_id": key_record.camera_id,
        "camera_name": stream.name if stream else "Kamera Terhapus",
        "camera_ids": cam_ids,
        "camera_names": [cam_map.get(x, f"Kamera {x}") for x in cam_ids],
        "include_playback": bool(key_record.include_playback),
        "client_name": key_record.client_name,
        "custom_camera_name": key_record.custom_camera_name or "",
        "allowed_domain": key_record.allowed_domain or "",
        "secret_pass": key_record.secret_pass or "",
        "is_active": key_record.is_active,
        "embed_timeout_seconds": key_record.embed_timeout_seconds,
        "click_to_play": key_record.click_to_play,
        "created_at": key_record.created_at,
    }

@app.put("/api/admin/api-keys/{key_id}", response_model=ApiKeySchema)
def update_api_key(
    key_id: int,
    payload: ApiKeySchema,
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    tolak_bukan_super(admin)
    key_record = db.query(ApiKeyModel).filter(ApiKeyModel.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Kunci API tidak ditemukan")

    if not kuasa_penuh(admin) and key_record.owner_id != admin.id:
        raise HTTPException(
            status_code=403,
            detail="Anda tidak berwenang mengubah kunci ini")
        
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
    key_record.include_playback = payload.include_playback

    if payload.camera_ids is not None:
        _sync_key_cameras(db, key_record.id, payload.camera_ids, payload.camera_id)

    db.commit()
    db.refresh(key_record)
    return key_record

@app.delete("/api/admin/api-keys/{key_id}")
def delete_api_key(
    key_id: int,
    admin: UserModel = Depends(verify_pengelola_kamera),
    db: Session = Depends(get_db)
):
    tolak_bukan_super(admin)
    key_record = db.query(ApiKeyModel).filter(ApiKeyModel.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Kunci API tidak ditemukan")

    # Menyembunyikan kunci dari daftar saja tidak cukup: id-nya berurutan.
    if not kuasa_penuh(admin) and key_record.owner_id != admin.id:
        raise HTTPException(
            status_code=403,
            detail="Anda tidak berwenang mencabut kunci ini")

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

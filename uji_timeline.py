#!/usr/bin/env python3
"""Uji regresi: timeline harus terisi untuk kamera bersegmen banyak.

Bug asal: _mediamtx_segments() pakai timeout=5s; kamera dengan ~20rb segmen
butuh ~7.5s, jadi timeout -> except menelan error -> return [] -> timeline
kosong walau /dates (baca disk) menunjukkan ribuan segmen.
"""
import os
import json, sys, urllib.request

BASE = "http://127.0.0.1:8000"
KEY = os.getenv("CCTV_TEST_KEY", "")
if not KEY:
    raise SystemExit("Set CCTV_TEST_KEY dulu: CCTV_TEST_KEY=cctv_key_xxx python3 uji_timeline.py")

def ambil(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.loads(r.read().decode())

gagal = 0
for cam in (361, 356):
    dates = ambil(f"{BASE}/api/recordings/{cam}/dates?key={KEY}")
    if not dates:
        print(f"  kamera {cam}: tidak ada tanggal, dilewati")
        continue
    for d in dates:
        tgl, n = d["date"], d["segment_count"]
        tl = ambil(f"{BASE}/api/recordings/{cam}/timeline?date={tgl}&key={KEY}")
        rng = len(tl.get("ranges", []))
        cnt = tl.get("segment_count", 0)
        # `segments` sengaja kosong kecuali diminta (?segments=1) — 85% muatan
        # yang tak dipakai pemutar. Penanda timeline sehat adalah `ranges`.
        if n > 0 and rng == 0:
            print(f"  GAGAL kamera {cam} {tgl}: disk={n} tapi ranges=0")
            gagal += 1
        else:
            print(f"  OK    kamera {cam} {tgl}: disk={n} ranges={rng} segmen_dilihat={cnt}")

# ?segments=1 harus tetap mengembalikan segmen mentah (kompatibilitas).
tl = ambil(f"{BASE}/api/recordings/361/timeline?date=2026-09-03&segments=1&key={KEY}")
if len(tl.get("segments", [])) > 0:
    print(f"  OK    ?segments=1 tetap kirim segmen ({len(tl['segments'])})")
else:
    print("  GAGAL ?segments=1 tidak mengembalikan segmen")
    gagal += 1

print("GAGAL" if gagal else "SEMUA LOLOS")
sys.exit(1 if gagal else 0)

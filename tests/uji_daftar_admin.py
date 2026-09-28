#!/usr/bin/env python3
"""Uji: kamera pemberian tampil di halaman tontonan Admin.

Cacat aslinya: izinnya benar tetapi daftarnya tidak memakainya, sehingga
Admin lolos pemeriksaan saat membuka kamera langsung namun tidak pernah
dapat menemukannya. Uji ini menuntut keduanya sejalan — apa yang boleh
ditonton harus tampil di daftar.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiDaftar123"
VENV = "/var/www/development.netbackup.web.id/backend/venv/bin/python"

lolos = gagal = 0


def uji(nama, kondisi, info=""):
    global lolos, gagal
    if kondisi:
        lolos += 1
        print(f"  ok   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama} {info}")


def dbpass():
    return subprocess.run(
        ["grep", "-oP", r"DB_PASS=\K[^\"]+",
         "/etc/systemd/system/cctv-backend.service"],
        capture_output=True, text=True).stdout.strip()


def sql(perintah):
    return subprocess.run(
        ["mariadb", "-u", "cctv_user", f"-p{dbpass()}", "cctv_monitoring",
         "-N", "-B", "-e", perintah], capture_output=True, text=True).stdout.strip()


def minta(jalur, token=None, metode="GET", muatan=None):
    req = urllib.request.Request(f"{BASIS}{jalur}", method=metode)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if muatan is not None:
        data = json.dumps(muatan).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=25) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)


def masuk(nama):
    kode, isi = minta("/api/auth/login", metode="POST",
                      muatan={"username": nama, "password": SANDI})
    return json.loads(isi).get("access_token") if kode == 200 else None


def daftar(token, batas=100):
    kode, isi = minta(f"/api/streams?limit={batas}", token)
    if kode != 200:
        return kode, []
    return kode, [s["name"] for s in json.loads(isi)["items"]]


NAMA = ["dft_sa", "dft_a1", "dft_a2"]
KAM = ["dft_beri", "dft_milik", "dft_lain", "dft_mati"]


def bersihkan():
    for n in KAM:
        sid = sql(f'SELECT id FROM cctv_streams WHERE name="{n}";')
        if sid:
            for t in ("stream_admin_grants", "stream_permissions", "user_cctv_access"):
                sql(f"DELETE FROM {t} WHERE stream_id={sid};")
            sql(f"DELETE FROM cctv_streams WHERE id={sid};")
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
            sql(f"DELETE FROM stream_admin_grants WHERE admin_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
    for n in NAMA:
        sql(f'DELETE FROM users WHERE username="{n}";')


try:
    bersihkan()
    h = subprocess.run(
        [VENV, "-c", f'import bcrypt;print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())'],
        capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit("GAGAL: hash tidak terbuat")

    for n, p in (("dft_sa", "super_admin"), ("dft_a1", "admin"), ("dft_a2", "admin")):
        sql(f'INSERT INTO users (username,password_hash,role) VALUES ("{n}","{h}","{p}");')
    id_a1 = sql('SELECT id FROM users WHERE username="dft_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="dft_a2";')

    sql('INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active) '
        'VALUES ("dft_beri","rtsp://x/1","UjiDft",1);')
    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("dft_milik","rtsp://x/2","UjiDft",{id_a1},1);')
    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("dft_lain","rtsp://x/3","UjiDft",{id_a2},1);')
    # Kamera nonaktif yang diberikan: tidak boleh tampil.
    sql('INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active) '
        'VALUES ("dft_mati","rtsp://x/4","UjiDft",0);')

    id_beri = sql('SELECT id FROM cctv_streams WHERE name="dft_beri";')
    id_milik = sql('SELECT id FROM cctv_streams WHERE name="dft_milik";')
    id_mati = sql('SELECT id FROM cctv_streams WHERE name="dft_mati";')

    t_sa, t_a1 = masuk("dft_sa"), masuk("dft_a1")
    uji("akun uji bisa masuk", all([t_sa, t_a1]))
    if not all([t_sa, t_a1]):
        sys.exit("GAGAL: login gagal")

    print("\n=== sebelum diberi ===")
    kode, nama = daftar(t_a1)
    uji("daftar terbuka", kode == 200, f"HTTP {kode}")
    uji("kamera miliknya sudah tampil", "dft_milik" in nama, str(nama))
    uji("kamera belum diberi tidak tampil", "dft_beri" not in nama, str(nama))
    uji("kamera admin lain tidak tampil", "dft_lain" not in nama, str(nama))

    print("\n=== setelah Super Admin memberi ===")
    kode, isi = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_beri), "can_manage": False,
                    "can_reshare": True},
                   {"stream_id": int(id_mati), "can_manage": False,
                    "can_reshare": True}]})
    uji("pemberian diterima", kode == 200, f"HTTP {kode} {isi[:140]}")

    kode, nama = daftar(t_a1)
    uji("kamera pemberian TAMPIL di daftar", "dft_beri" in nama,
        f"inilah cacat yang dilaporkan: {nama}")
    uji("kamera miliknya tetap tampil", "dft_milik" in nama, str(nama))
    uji("kamera admin lain tetap tidak tampil", "dft_lain" not in nama, str(nama))
    uji("kamera nonaktif tidak ikut tampil", "dft_mati" not in nama, str(nama))
    uji("tidak ada duplikat", len(nama) == len(set(nama)), str(nama))

    print("\n=== daftar sejalan dengan izin ===")
    # Kalau boleh ditonton tetapi tak ada di daftar, kamera itu tak dapat
    # ditemukan; kalau ada di daftar tetapi tak boleh ditonton, itu bocor.
    kode, isi = minta(f"/api/streams/{id_beri}/reconnect", t_a1, "POST")
    uji("kamera pemberian dapat disambung ulang", kode in (200, 500),
        f"HTTP {kode} — 404 berarti daftar dan izin tidak sejalan")

    print("\n=== penyaringan grup tetap jalan ===")
    kode, isi = minta("/api/streams?limit=100&group=UjiDft", t_a1)
    if kode == 200:
        n = [s["name"] for s in json.loads(isi)["items"]]
        uji("grup menyaring dengan benar", "dft_beri" in n and "dft_lain" not in n, str(n))
    else:
        uji("grup menyaring dengan benar", False, f"HTTP {kode}")

    print("\n=== halaman demi halaman utuh ===")
    kode, isi = minta("/api/streams?limit=1&page=1", t_a1)
    h1 = json.loads(isi) if kode == 200 else {}
    kode2, isi2 = minta("/api/streams?limit=1&page=2", t_a1)
    h2 = json.loads(isi2) if kode2 == 200 else {}
    uji("jumlah total menghitung kamera pemberian",
        h1.get("total_items", 0) >= 2, str(h1.get("total_items")))
    uji("halaman berbeda memberi kamera berbeda",
        h1.get("items", [{}])[0].get("id") != h2.get("items", [{}])[0].get("id"),
        "urutan tidak tetap antar permintaan")

    print("\n=== pencabutan ikut berlaku ===")
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST",
                    {"kamera": []})
    uji("pencabutan diterima", kode == 200, f"HTTP {kode}")
    kode, nama = daftar(t_a1)
    uji("kamera tercabut hilang dari daftar", "dft_beri" not in nama, str(nama))
    uji("kamera miliknya tidak ikut hilang", "dft_milik" in nama, str(nama))

    print("\n=== super admin tidak terpengaruh ===")
    kode, nama = daftar(t_sa)
    uji("super admin melihat semua kamera uji",
        all(k in nama for k in ("dft_beri", "dft_milik", "dft_lain")), str(nama))

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

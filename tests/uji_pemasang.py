#!/usr/bin/env python3
"""Uji: kredensial RTSP hanya untuk yang memasang kameranya.

Dasar masking dipindahkan dari kepemilikan ke catatan pemasangan. Bedanya
menentukan: kepemilikan dapat dipindahkan, pemasangan tidak. Kalau masking
masih bersandar pada kepemilikan, menyerahkan kamera kepada Admin sekaligus
menyerahkan kredensialnya — yang justru hendak dicegah.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiPasang123"
VENV = "/var/www/development.netbackup.web.id/backend/venv/bin/python"
RAHASIA = "rtsp://admin:sandirahasia@192.168.9.9:554/utama"

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


def kamera(token, nama):
    kode, isi = minta("/api/admin/streams", token)
    if kode != 200:
        return None
    return next((s for s in json.loads(isi) if s["name"] == nama), None)


NAMA = ["psg_sa", "psg_a1"]
KAM = ["psg_sendiri", "psg_super", "psg_pindah", "psg_kelola"]


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
            sql(f"UPDATE cctv_streams SET created_by=NULL WHERE created_by={uid};")
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

    for n, p in (("psg_sa", "super_admin"), ("psg_a1", "admin")):
        sql(f'INSERT INTO users (username,password_hash,role) VALUES ("{n}","{h}","{p}");')
    id_sa = sql('SELECT id FROM users WHERE username="psg_sa";')
    id_a1 = sql('SELECT id FROM users WHERE username="psg_a1";')

    t_sa, t_a1 = masuk("psg_sa"), masuk("psg_a1")
    uji("akun uji bisa masuk", all([t_sa, t_a1]))
    if not all([t_sa, t_a1]):
        sys.exit("GAGAL: login gagal")

    print("\n=== pemasang dicatat saat kamera dibuat ===")
    kode, isi = minta("/api/admin/streams", t_a1, "POST", {
        "name": "psg_sendiri", "rtsp_url": RAHASIA, "group_name": "UjiPsg",
        "coordinates": "", "is_active": True, "record_enabled": False,
        "record_path": "", "record_disk": "/", "record_retention_days": 7})
    uji("admin dapat membuat kamera", kode == 200, f"HTTP {kode} {isi[:140]}")
    cb = sql('SELECT IFNULL(created_by,"NULL") FROM cctv_streams WHERE name="psg_sendiri";')
    uji("pemasang tercatat sebagai admin itu", cb == id_a1, f"created_by={cb}")

    kode, isi = minta("/api/admin/streams", t_sa, "POST", {
        "name": "psg_super", "rtsp_url": RAHASIA, "group_name": "UjiPsg",
        "coordinates": "", "is_active": True, "record_enabled": False,
        "record_path": "", "record_disk": "/", "record_retention_days": 7})
    uji("super admin dapat membuat kamera", kode == 200, f"HTTP {kode}")
    cb2 = sql('SELECT IFNULL(created_by,"NULL") FROM cctv_streams WHERE name="psg_super";')
    uji("pemasang tercatat sebagai super admin", cb2 == id_sa, f"created_by={cb2}")

    id_sendiri = sql('SELECT id FROM cctv_streams WHERE name="psg_sendiri";')
    id_super = sql('SELECT id FROM cctv_streams WHERE name="psg_super";')

    print("\n=== kamera pasangannya sendiri: kredensial tampak ===")
    k = kamera(t_a1, "psg_sendiri")
    uji("kamera sendiri tampil di daftar", k is not None)
    uji("kredensial rtsp tampak", k and k.get("rtsp_url") == RAHASIA,
        f"rtsp={k and k.get('rtsp_url')}")
    uji("ditandai dipasang sendiri", k and k.get("dipasang_sendiri") is True,
        str(k and k.get("dipasang_sendiri")))

    print("\n=== kamera pasangan super admin: kredensial disamarkan ===")
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_super), "can_manage": False,
                    "can_reshare": True}]})
    uji("pemberian diterima", kode == 200, f"HTTP {kode}")
    k = kamera(t_a1, "psg_super")
    uji("kamera pemberian tampil di daftar", k is not None)
    uji("kredensial rtsp DISAMARKAN", k and not k.get("rtsp_url"),
        f"BOCOR: {k and k.get('rtsp_url')}")
    uji("ditandai bukan pasangannya", k and k.get("dipasang_sendiri") is False,
        str(k and k.get("dipasang_sendiri")))

    print("\n=== sunting dan hapus ditolak ===")
    kode, _ = minta(f"/api/admin/streams/{id_super}", t_a1, "PUT", {
        "name": "psg_super", "rtsp_url": "rtsp://ubah/", "group_name": "UjiPsg",
        "coordinates": "", "is_active": True, "record_enabled": False,
        "record_path": "", "record_disk": "/", "record_retention_days": 7})
    uji("sunting ditolak", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_super}", t_a1, "DELETE")
    uji("hapus ditolak", kode == 403, f"HTTP {kode}")
    uji("kamera masih utuh",
        sql(f'SELECT COUNT(*) FROM cctv_streams WHERE id={id_super};') == "1")

    print("\n=== can_manage TIDAK membuka kredensial ===")
    # Inilah pemisahan yang diminta: wewenang mengelola bukan izin melihat
    # kredensial perangkat orang lain.
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_super), "can_manage": True,
                    "can_reshare": True}]})
    uji("pemberian dengan kelola diterima", kode == 200, f"HTTP {kode}")
    k = kamera(t_a1, "psg_super")
    uji("kredensial tetap disamarkan walau can_manage",
        k and not k.get("rtsp_url"), f"BOCOR: {k and k.get('rtsp_url')}")
    kode, _ = minta(f"/api/admin/streams/{id_super}", t_a1, "DELETE")
    uji("hapus tetap ditolak walau can_manage", kode == 403, f"HTTP {kode}")

    print("\n=== kepemilikan berpindah tidak membuka kredensial ===")
    # Uji terpenting: dahulu masking bersandar pada owner_id, jadi
    # menyerahkan kamera sekaligus menyerahkan kredensialnya.
    kode, isi = minta(f"/api/admin/streams/{id_super}/owner", t_sa, "POST",
                      {"owner_id": int(id_a1)})
    uji("pemilik dapat dipindahkan", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("pemilik memang berpindah di basis data",
        sql(f'SELECT owner_id FROM cctv_streams WHERE id={id_super};') == id_a1)
    k = kamera(t_a1, "psg_super")
    uji("kredensial TETAP disamarkan sesudah jadi pemilik",
        k and not k.get("rtsp_url"),
        f"BOCOR setelah pemindahan: {k and k.get('rtsp_url')}")
    kode, _ = minta(f"/api/admin/streams/{id_super}", t_a1, "DELETE")
    uji("hapus tetap ditolak sesudah jadi pemilik", kode == 403, f"HTTP {kode}")
    uji("catatan pemasang tidak ikut berubah",
        sql(f'SELECT created_by FROM cctv_streams WHERE id={id_super};') == id_sa)

    print("\n=== super admin tidak terpengaruh ===")
    k = kamera(t_sa, "psg_super")
    uji("super admin tetap melihat kredensial", k and k.get("rtsp_url") == RAHASIA)
    k = kamera(t_sa, "psg_sendiri")
    uji("termasuk kamera pasangan admin", k and k.get("rtsp_url") == RAHASIA)

    print("\n=== kamera lama tanpa catatan pemasang ===")
    sql('INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active) '
        f'VALUES ("psg_pindah","{RAHASIA}","UjiPsg",1);')
    id_lama = sql('SELECT id FROM cctv_streams WHERE name="psg_pindah";')
    sql(f"UPDATE cctv_streams SET owner_id={id_a1}, created_by=NULL WHERE id={id_lama};")
    k = kamera(t_a1, "psg_pindah")
    uji("kamera lama jatuh kembali ke pemilik", k and k.get("rtsp_url") == RAHASIA,
        "kamera lama kehilangan akses kredensial pemiliknya")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

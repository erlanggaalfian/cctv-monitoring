#!/usr/bin/env python3
"""Uji Tahap C: lapisan otorisasi benar-benar terpasang di endpoint.

Tahap B membuktikan fungsinya benar. Tahap ini membuktikan endpoint sungguhan
memakainya — yang berbeda, sebab fungsi yang benar tapi tak dipanggil tidak
melindungi apa pun.

Semua lewat HTTP ke server hidup. Akun dan kamera uji dibuat lalu dihapus.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiTahapC123"
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
         "-N", "-B", "-e", perintah],
        capture_output=True, text=True).stdout.strip()


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


def masuk(nama, sandi=SANDI):
    kode, isi = minta("/api/auth/login", metode="POST",
                      muatan={"username": nama, "password": sandi})
    if kode != 200:
        return None
    return json.loads(isi).get("access_token")


NAMA = ["tc_sa", "tc_a1", "tc_a2", "tc_u1"]


def bersihkan():
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid} "
                f"OR granted_by={uid};")
            sql(f"DELETE FROM stream_admin_grants WHERE admin_id={uid} "
                f"OR granted_by={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
    sql('DELETE FROM stream_admin_grants WHERE stream_id IN '
        '(SELECT id FROM cctv_streams WHERE name LIKE "tc\\_%");')
    sql('DELETE FROM stream_permissions WHERE stream_id IN '
        '(SELECT id FROM cctv_streams WHERE name LIKE "tc\\_%");')
    sql('DELETE FROM cctv_streams WHERE name LIKE "tc\\_%";')
    for n in NAMA:
        sql(f'DELETE FROM users WHERE username="{n}";')


try:
    bersihkan()

    h = subprocess.run(
        [VENV, "-c", "import bcrypt;"
         f'print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())'],
        capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit("GAGAL: hash sandi tidak terbuat")

    for n, p in (("tc_sa", "super_admin"), ("tc_a1", "admin"),
                 ("tc_a2", "admin"), ("tc_u1", "user")):
        sql(f'INSERT INTO users (username,password_hash,role) '
            f'VALUES ("{n}","{h}","{p}");')

    id_sa = sql('SELECT id FROM users WHERE username="tc_sa";')
    id_a1 = sql('SELECT id FROM users WHERE username="tc_a1";')
    id_u1 = sql('SELECT id FROM users WHERE username="tc_u1";')

    t_sa = masuk("tc_sa")
    t_a1 = masuk("tc_a1")
    t_a2 = masuk("tc_a2")
    t_u1 = masuk("tc_u1")
    uji("keempat akun bisa masuk", all([t_sa, t_a1, t_a2, t_u1]))
    if not all([t_sa, t_a1, t_a2, t_u1]):
        sys.exit("GAGAL: login gagal")

    print("\n=== kamera baru mencatat pemiliknya ===")
    kode, isi = minta("/api/admin/streams", t_sa, "POST", {
        "name": "tc_kamera_sa", "rtsp_url": "rtsp://uji/sa",
        "group_name": "Uji", "coordinates": "0,0", "is_active": True,
        "record_enabled": False, "record_path": "", "record_disk": "/",
        "record_retention_days": 7})
    uji("super_admin bisa membuat kamera", kode == 200, f"HTTP {kode} {isi[:120]}")
    id_kam = sql('SELECT id FROM cctv_streams WHERE name="tc_kamera_sa";')
    uji("owner_id tercatat = pembuatnya",
        sql(f'SELECT owner_id FROM cctv_streams WHERE id={id_kam};') == id_sa,
        f"owner={sql(f'SELECT owner_id FROM cctv_streams WHERE id={id_kam};')} sa={id_sa}")

    print("\n=== daftar kamera disaring per pemilik ===")
    kode, isi = minta("/api/admin/streams", t_sa)
    terlihat_sa = [s["name"] for s in json.loads(isi)] if kode == 200 else []
    uji("super_admin melihat kamera itu", "tc_kamera_sa" in terlihat_sa,
        f"HTTP {kode}")

    print("\n=== admin TIDAK bisa menyunting/menghapus kamera Super Admin ===")
    # admin belum punya wewenang gerbang; beri dulu agar sampai ke boleh_ubah
    kode, _ = minta(f"/api/admin/streams/{id_kam}", t_a1, "PUT", {
        "name": "dibajak", "rtsp_url": "rtsp://jahat", "group_name": "x",
        "coordinates": "0,0", "is_active": True, "record_enabled": False,
        "record_path": "", "record_disk": "/", "record_retention_days": 7})
    uji("sunting oleh admin ditolak", kode == 403, f"HTTP {kode}")
    uji("nama kamera tidak berubah",
        sql(f'SELECT name FROM cctv_streams WHERE id={id_kam};') == "tc_kamera_sa")

    kode, _ = minta(f"/api/admin/streams/{id_kam}", t_a1, "DELETE")
    uji("hapus oleh admin ditolak", kode == 403, f"HTTP {kode}")
    uji("kamera masih ada",
        sql(f'SELECT COUNT(*) FROM cctv_streams WHERE id={id_kam};') == "1")

    print("\n=== masking: admin diberi lihat saja ===")
    sql(f"INSERT INTO stream_admin_grants "
        f"(stream_id,admin_id,can_manage,can_reshare,granted_by) "
        f"VALUES ({id_kam},{id_a1},0,1,{id_sa});")
    kode, isi = minta("/api/admin/streams", t_a1)
    if kode == 200:
        nama_a1 = [s["name"] for s in json.loads(isi)]
        uji("admin kini melihat kamera pemberian", "tc_kamera_sa" in nama_a1,
            f"terlihat: {nama_a1}")
    else:
        uji("admin melihat daftar kamera", False, f"HTTP {kode}")

    kode, _ = minta(f"/api/admin/streams/{id_kam}", t_a1, "PUT", {
        "name": "dibajak2", "rtsp_url": "rtsp://jahat", "group_name": "x",
        "coordinates": "0,0", "is_active": True, "record_enabled": False,
        "record_path": "", "record_disk": "/", "record_retention_days": 7})
    uji("tetap tidak boleh menyunting walau bisa melihat", kode == 403,
        f"HTTP {kode}")

    # Inti masking: kamera terlihat, kredensialnya tidak.
    kode, isi = minta("/api/admin/streams", t_a1)
    if kode == 200:
        kam = [s for s in json.loads(isi) if s["name"] == "tc_kamera_sa"]
        uji("kamera pemberian tampil bagi admin", len(kam) == 1)
        if kam:
            uji("rtsp_url DISEMBUNYIKAN dari admin",
                not kam[0].get("rtsp_url"),
                f"bocor: {kam[0].get('rtsp_url')!r}")
            uji("nama kamera tetap terlihat",
                kam[0]["name"] == "tc_kamera_sa")
    else:
        uji("admin melihat daftar kamera (masking)", False, f"HTTP {kode}")

    # Super Admin harus tetap menerima kredensial itu.
    kode, isi = minta("/api/admin/streams", t_sa)
    if kode == 200:
        kam = [s for s in json.loads(isi) if s["name"] == "tc_kamera_sa"]
        uji("super_admin tetap menerima rtsp_url",
            kam and kam[0].get("rtsp_url") == "rtsp://uji/sa",
            f"dapat {kam[0].get('rtsp_url') if kam else None!r}")

    print("\n=== can_manage=1 baru membuka penyuntingan ===")
    sql(f"UPDATE stream_admin_grants SET can_manage=1 "
        f"WHERE stream_id={id_kam} AND admin_id={id_a1};")
    kode, _ = minta(f"/api/admin/streams/{id_kam}", t_a1, "PUT", {
        "name": "tc_kamera_sa", "rtsp_url": "rtsp://uji/sa", "group_name": "Uji",
        "coordinates": "0,0", "is_active": True, "record_enabled": False,
        "record_path": "", "record_disk": "/", "record_retention_days": 7})
    # Kamera pasangan Super Admin tetap terkunci: can_manage tidak
    # mengubah siapa yang memasangnya.
    uji("can_manage=1 tetap TIDAK membuka penyuntingan", kode == 403,
        f"HTTP {kode}")

    kode, isi = minta("/api/admin/streams", t_a1)
    if kode == 200:
        kam = [s for s in json.loads(isi) if s["name"] == "tc_kamera_sa"]
        uji("can_manage=1: rtsp_url tetap disamarkan",
            bool(kam) and not kam[0].get("rtsp_url"),
            f"BOCOR: {kam[0].get('rtsp_url') if kam else None!r}")

    print("\n=== admin lain tetap tertutup ===")
    kode, isi = minta("/api/admin/streams", t_a2)
    if kode == 200:
        uji("admin2 tidak melihat kamera itu",
            "tc_kamera_sa" not in [s["name"] for s in json.loads(isi)])
    kode, _ = minta(f"/api/admin/streams/{id_kam}", t_a2, "DELETE")
    uji("admin2 tidak boleh menghapus", kode == 403, f"HTTP {kode}")

    print("\n=== izin rekaman terpisah dari izin tonton ===")
    sql(f"UPDATE cctv_streams SET record_enabled=1 WHERE id={id_kam};")
    sql(f"INSERT INTO stream_permissions "
        f"(stream_id,user_id,can_view,can_playback,granted_by) "
        f"VALUES ({id_kam},{id_u1},1,0,{id_sa});")
    kode, isi = minta("/api/recordings/cameras", t_u1)
    if kode == 200:
        uji("user tanpa can_playback tidak melihat kamera rekaman",
            id_kam not in [str(c["id"]) for c in json.loads(isi)],
            f"dapat {isi[:150]}")
    else:
        uji("daftar kamera rekaman terbuka untuk user", False, f"HTTP {kode}")

    sql(f"UPDATE stream_permissions SET can_playback=1 "
        f"WHERE stream_id={id_kam} AND user_id={id_u1};")
    kode, isi = minta("/api/recordings/cameras", t_u1)
    if kode == 200:
        uji("can_playback=1: kamera muncul",
            id_kam in [str(c["id"]) for c in json.loads(isi)],
            f"dapat {isi[:150]}")

    kode, _ = minta(f"/api/recordings/{id_kam}/dates", t_u1)
    uji("user boleh membuka tanggal rekaman", kode == 200, f"HTTP {kode}")

    sql(f"UPDATE stream_permissions SET can_playback=0 "
        f"WHERE stream_id={id_kam} AND user_id={id_u1};")
    kode, _ = minta(f"/api/recordings/{id_kam}/dates", t_u1)
    uji("can_playback dicabut: ditolak", kode == 403, f"HTTP {kode}")

    print("\n=== user biasa tetap tak boleh menyentuh panel ===")
    for e in ("/api/admin/streams", "/api/admin/users"):
        kode, _ = minta(e, t_u1)
        uji(f"user ditolak di {e}", kode == 403, f"HTTP {kode}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

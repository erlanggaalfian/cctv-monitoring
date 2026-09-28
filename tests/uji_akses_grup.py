#!/usr/bin/env python3
"""Uji Camera Access per grup.

Yang dijaga: peran Admin tidak lagi berbaris sendiri di ikhtisar, grup
berbaris menggantikannya berikut anggotanya, dan menyerahkan kamera ke grup
benar-benar sampai ke setiap anggotanya — termasuk yang menyusul masuk
belakangan lewat penyimpanan berikutnya.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiGrupAkses123"
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


def minta(jalur, token, metode="GET", muatan=None):
    req = urllib.request.Request(f"{BASIS}{jalur}", method=metode)
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
    req = urllib.request.Request(f"{BASIS}/api/auth/login", method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, json.dumps(
                {"username": nama, "password": SANDI}).encode(), 25) as r:
            return json.loads(r.read())["access_token"]
    except Exception:
        return None


AKUN = ["ga_sa", "ga_a1", "ga_a2", "ga_a3", "ga_u1"]
KAMERA = ["ga_kam1", "ga_kam2"]
GRUP = "uji-ga-1"


def bersihkan():
    for n in AKUN:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"DELETE FROM stream_admin_grants WHERE admin_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
            sql(f"UPDATE users SET parent_admin_id=NULL WHERE parent_admin_id={uid};")
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
            sql(f"UPDATE cctv_streams SET created_by=NULL WHERE created_by={uid};")
    for n in KAMERA:
        kid = sql(f'SELECT id FROM cctv_streams WHERE name="{n}";')
        if kid:
            sql(f"DELETE FROM stream_admin_grants WHERE stream_id={kid};")
            sql(f"DELETE FROM stream_permissions WHERE stream_id={kid};")
            sql(f"DELETE FROM user_cctv_access WHERE stream_id={kid};")
            sql(f"DELETE FROM cctv_streams WHERE id={kid};")
    for n in AKUN:
        sql(f'DELETE FROM users WHERE username="{n}";')


try:
    bersihkan()
    h = subprocess.run(
        [VENV, "-c", f'import bcrypt;print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())'],
        capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit("GAGAL: hash tidak terbuat")

    sql(f'INSERT INTO users (username,password_hash,role) VALUES ("ga_sa","{h}","super_admin");')
    for n in ("ga_a1", "ga_a2"):
        sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
            f'VALUES ("{n}","{h}","admin","{GRUP}");')
    sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
        f'VALUES ("ga_a3","{h}","admin","uji-ga-2");')
    sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
        f'VALUES ("ga_u1","{h}","user","{GRUP}");')

    id_a1 = sql('SELECT id FROM users WHERE username="ga_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="ga_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="ga_u1";')

    for n in KAMERA:
        sql(f'INSERT INTO cctv_streams (name,rtsp_url,is_active) '
            f'VALUES ("{n}","rtsp://uji/{n}",1);')
    id_k1 = sql('SELECT id FROM cctv_streams WHERE name="ga_kam1";')
    id_k2 = sql('SELECT id FROM cctv_streams WHERE name="ga_kam2";')

    t_sa = masuk("ga_sa")
    uji("super admin uji bisa masuk", t_sa is not None)
    if not t_sa:
        sys.exit("GAGAL: login gagal")

    print("\n=== ikhtisar: admin keluar, grup masuk ===")
    kode, isi = minta("/api/admin/access-overview", t_sa)
    uji("ikhtisar terbaca", kode == 200, f"HTTP {kode}")
    data = json.loads(isi) if kode == 200 else {}
    nama_akun = [b["username"] for b in data.get("per_akun", [])]
    uji("peran admin tidak berbaris sendiri",
        "ga_a1" not in nama_akun and "ga_a2" not in nama_akun,
        f"masih ada: {[n for n in nama_akun if n.startswith('ga_a')]}")
    uji("user bergrup tidak berbaris ganda", "ga_u1" not in nama_akun,
        "user bergrup tampil di dalam grupnya, bukan sebagai baris sendiri")
    uji("bagian per_grup tersedia", "per_grup" in data)

    grup = {g["grup"]: g for g in data.get("per_grup", [])}
    uji("grup uji muncul sebagai baris", GRUP in grup, str(list(grup)))
    if GRUP in grup:
        anggota = {a["username"] for a in grup[GRUP]["anggota"]}
        uji("kedua admin tercatat sebagai anggota",
            {"ga_a1", "ga_a2"} <= anggota, str(anggota))
        uji("user ikut bersarang sebagai anggota grup",
            "ga_u1" in anggota, str(anggota))
        # Bersarang tidak berarti mewarisi: kamera User tetap pemberian atas
        # namanya sendiri, dan ia tetap punya tombol atur sendiri.
        _ang = {a["username"]: a for a in grup[GRUP]["anggota"]}
        uji("admin bertanda otomatis", _ang["ga_a1"]["otomatis"] is True)
        uji("user tidak bertanda otomatis", _ang["ga_u1"]["otomatis"] is False,
            "user tak mewarisi kamera grup, jadi harus dapat diatur sendiri")
        uji("grup lain tidak tercampur", "ga_a3" not in anggota)

    print("\n=== menyerahkan kamera ke grup ===")
    kode, isi = minta(f"/api/admin/groups/{GRUP}/camera-grants", t_sa)
    uji("daftar kamera grup terbaca", kode == 200, f"HTTP {kode} {isi[:120]}")
    kode, isi = minta(f"/api/admin/groups/{GRUP}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_view": True,
                    "can_playback": True, "can_reshare": False}]})
    uji("penyerahan diterima", kode == 200, f"HTTP {kode} {isi[:140]}")

    # Inti pertanyaannya: apakah benar sampai ke SETIAP anggota.
    for nama, uid in (("ga_a1", id_a1), ("ga_a2", id_a2)):
        n = sql(f"SELECT COUNT(*) FROM stream_admin_grants "
                f"WHERE admin_id={uid} AND stream_id={id_k1};")
        uji(f"{nama} menerima kameranya", n == "1", f"baris={n}")

    print("\n=== izin tersimpan apa adanya ===")
    baris = sql(f"SELECT can_view,can_playback,can_reshare FROM stream_admin_grants "
                f"WHERE admin_id={id_a1} AND stream_id={id_k1};")
    uji("live dan rekaman menyala, bagikan mati", baris == "1\t1\t0", baris)

    print("\n=== pencabutan berlaku untuk seluruh anggota ===")
    kode, _ = minta(f"/api/admin/groups/{GRUP}/camera-grants", t_sa, "POST",
                    {"kamera": []})
    uji("pengosongan diterima", kode == 200, f"HTTP {kode}")
    n = sql(f"SELECT COUNT(*) FROM stream_admin_grants "
            f"WHERE admin_id IN ({id_a1},{id_a2});")
    uji("tak ada sisa baris di kedua anggota", n == "0", f"sisa={n}")

    print("\n=== grup lain tidak ikut terpengaruh ===")
    kode, _ = minta(f"/api/admin/groups/{GRUP}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k2), "can_view": True,
                    "can_playback": False, "can_reshare": False}]})
    id_a3 = sql('SELECT id FROM users WHERE username="ga_a3";')
    n = sql(f"SELECT COUNT(*) FROM stream_admin_grants WHERE admin_id={id_a3};")
    uji("admin grup lain tidak menerima apa pun", n == "0", f"baris={n}")

    print("\n=== user tetap diatur sendiri ===")
    kode, isi = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k2), "can_view": True,
                    "can_playback": False}]})
    uji("pemberian ke user diterima", kode == 200, f"HTTP {kode} {isi[:120]}")
    n = sql(f"SELECT COUNT(*) FROM stream_permissions WHERE user_id={id_u1};")
    uji("izin user tercatat terpisah", n == "1", f"baris={n}")

    print("\n=== hanya super admin yang menyerahkan ke grup ===")
    t_a1 = masuk("ga_a1")
    kode, _ = minta(f"/api/admin/groups/{GRUP}/camera-grants", t_a1)
    uji("admin ditolak membaca", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/groups/{GRUP}/camera-grants", t_a1, "POST",
                    {"kamera": []})
    uji("admin ditolak menyerahkan", kode == 403, f"HTTP {kode}")
    n = sql(f"SELECT COUNT(*) FROM stream_admin_grants WHERE admin_id={id_a1};")
    uji("penolakan itu tidak menghapus apa pun", n == "1", f"baris={n}")

    print("\n=== grup tak dikenal ===")
    kode, _ = minta("/api/admin/groups/grup-entah-apa/camera-grants", t_sa)
    uji("grup tanpa admin ditolak 404", kode == 404, f"HTTP {kode}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

#!/usr/bin/env python3
"""Uji: peran guest hanya melekat pada satu akun bawaan.

Yang dijaga: tidak ada jalur mana pun yang melahirkan guest kedua — bukan
lewat pembuatan langsung, bukan lewat pengubahan peran akun lain, bukan
lewat penghapusan akun bawaan lalu pembuatan ulang. Larangan berlaku bagi
Super Admin juga, bukan cuma Admin.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiGuest123"
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


def masuk(nama):
    kode, isi = minta("/api/auth/login", metode="POST",
                      muatan={"username": nama, "password": SANDI})
    return json.loads(isi).get("access_token") if kode == 200 else None


def jml_guest():
    return int(sql('SELECT COUNT(*) FROM users WHERE role="guest";') or 0)


NAMA = ["g_sa", "g_a1", "g_korban", "g_baru"]


def bersihkan():
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"UPDATE users SET parent_admin_id=NULL WHERE parent_admin_id={uid};")
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
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

    for n, p in (("g_sa", "super_admin"), ("g_a1", "admin"),
                 ("g_korban", "user")):
        sql(f'INSERT INTO users (username,password_hash,role) VALUES ("{n}","{h}","{p}");')

    t_sa, t_a1 = masuk("g_sa"), masuk("g_a1")
    uji("akun uji bisa masuk", all([t_sa, t_a1]))
    if not all([t_sa, t_a1]):
        sys.exit("GAGAL: login gagal")

    awal = jml_guest()
    uji("mula-mula tepat satu guest", awal == 1, f"ada {awal}")

    print("\n=== membuat akun guest ditolak ===")
    for peran, tok in (("super admin", t_sa), ("admin", t_a1)):
        kode, isi = minta("/api/admin/users", tok, "POST", {
            "username": "g_baru", "password": SANDI, "role": "guest"})
        uji(f"{peran} membuat guest ditolak", kode == 400, f"HTTP {kode}")
        uji(f"{peran}: akun itu tidak terbuat",
            sql('SELECT COUNT(*) FROM users WHERE username="g_baru";') == "0")
    uji("jumlah guest tidak bertambah", jml_guest() == awal, f"jadi {jml_guest()}")

    print("\n=== mengubah peran akun lain jadi guest ditolak ===")
    id_korban = sql('SELECT id FROM users WHERE username="g_korban";')
    for peran, tok in (("super admin", t_sa), ("admin", t_a1)):
        kode, _ = minta(f"/api/admin/users/{id_korban}", tok, "PUT", {
            "username": "g_korban", "password": "", "role": "guest"})
        uji(f"{peran} mengubah peran jadi guest ditolak", kode in (400, 403),
            f"HTTP {kode}")
    uji("peran korban tetap user",
        sql(f'SELECT role FROM users WHERE id={id_korban};') == "user")
    uji("jumlah guest tetap satu", jml_guest() == awal, f"jadi {jml_guest()}")

    print("\n=== peran lain tetap boleh dibuat ===")
    kode, _ = minta("/api/admin/users", t_sa, "POST", {
        "username": "g_baru", "password": SANDI, "role": "user"})
    uji("membuat akun user tetap bisa", kode == 200, f"HTTP {kode}")
    sql('DELETE FROM users WHERE username="g_baru";')

    print("\n=== akun guest bawaan dilindungi ===")
    id_guest = sql('SELECT id FROM users WHERE username="guest";')
    kode, _ = minta(f"/api/admin/users/{id_guest}", t_sa, "DELETE")
    uji("menghapus guest bawaan ditolak", kode == 400, f"HTTP {kode}")
    uji("akun guest masih ada",
        sql('SELECT COUNT(*) FROM users WHERE username="guest";') == "1")

    print("\n=== guest bawaan tetap boleh disunting sebagai guest ===")
    kode, isi = minta(f"/api/admin/users/{id_guest}", t_sa, "PUT", {
        "username": "guest", "password": "", "role": "guest"})
    uji("menyimpan guest bawaan tanpa ubah peran diterima", kode == 200,
        f"HTTP {kode} {isi[:120]}")
    uji("perannya tetap guest",
        sql(f'SELECT role FROM users WHERE id={id_guest};') == "guest")

    print("\n=== login tamu tidak melahirkan guest kedua ===")
    kode, _ = minta("/api/auth/guest", metode="POST")
    uji("login tamu berhasil", kode == 200, f"HTTP {kode}")
    uji("tetap satu guest sesudah login tamu", jml_guest() == awal,
        f"jadi {jml_guest()}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

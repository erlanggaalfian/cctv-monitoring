#!/usr/bin/env python3
"""Uji Tahap 1: grup wilayah menentukan siapa mengelola siapa.

Yang paling mudah bocor: Admin menjangkau akun grup lain, atau Admin baru
buatan Admin mendarat di grup yang salah sehingga wewenangnya melebar.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiGrup123"
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


BUATAN = ["grp_sa", "grp_a1", "grp_a3", "grp_u1", "grp_a2", "grp_u2", "grp_x"]


def bersihkan():
    for n in BUATAN:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"UPDATE users SET parent_admin_id=NULL WHERE parent_admin_id={uid};")
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
            sql(f"UPDATE cctv_streams SET created_by=NULL WHERE created_by={uid};")
            for t in ("stream_admin_grants", "stream_permissions"):
                sql(f"DELETE FROM {t} WHERE granted_by={uid};")
            sql(f"DELETE FROM stream_admin_grants WHERE admin_id={uid};")
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
    for n in BUATAN:
        sql(f'DELETE FROM users WHERE username="{n}";')


try:
    bersihkan()
    h = subprocess.run(
        [VENV, "-c", f'import bcrypt;print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())'],
        capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit("GAGAL: hash tidak terbuat")

    # grp_a1 di grup 1, grp_a3 di grup 2 — dua wilayah terpisah.
    sql(f'INSERT INTO users (username,password_hash,role) VALUES ("grp_sa","{h}","super_admin");')
    sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
        f'VALUES ("grp_a1","{h}","admin","uji-grup-1");')
    sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
        f'VALUES ("grp_a3","{h}","admin","uji-grup-2");')
    id_sa = sql('SELECT id FROM users WHERE username="grp_sa";')
    id_a1 = sql('SELECT id FROM users WHERE username="grp_a1";')
    id_a3 = sql('SELECT id FROM users WHERE username="grp_a3";')

    t_sa, t_a1, t_a3 = masuk("grp_sa"), masuk("grp_a1"), masuk("grp_a3")
    uji("akun uji bisa masuk", all([t_sa, t_a1, t_a3]))
    if not all([t_sa, t_a1, t_a3]):
        sys.exit("GAGAL: login gagal")

    print("\n=== admin membuat user: ikut grupnya sendiri ===")
    kode, isi = minta("/api/admin/users", t_a1, "POST", {
        "username": "grp_u1", "password": SANDI, "role": "user"})
    uji("admin dapat membuat user", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("user mendarat di grup pembuatnya",
        sql('SELECT admin_group FROM users WHERE username="grp_u1";') == "uji-grup-1")

    print("\n=== admin membuat admin: tetap di grup yang sama ===")
    kode, isi = minta("/api/admin/users", t_a1, "POST", {
        "username": "grp_a2", "password": SANDI, "role": "admin"})
    uji("admin kini dapat membuat admin", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("admin baru mendarat di grup yang sama",
        sql('SELECT admin_group FROM users WHERE username="grp_a2";') == "uji-grup-1")
    uji("pembuatnya tercatat",
        sql('SELECT parent_admin_id FROM users WHERE username="grp_a2";') == id_a1)

    print("\n=== admin tidak dapat mencetak super admin ===")
    kode, _ = minta("/api/admin/users", t_a1, "POST", {
        "username": "grp_x", "password": SANDI, "role": "super_admin"})
    uji("pembuatan super admin ditolak", kode == 403, f"HTTP {kode}")
    uji("akunnya tidak tercipta",
        sql('SELECT COUNT(*) FROM users WHERE username="grp_x";') == "0")

    print("\n=== admin tidak dapat menaruh akun di grup lain ===")
    kode, _ = minta("/api/admin/users", t_a1, "POST", {
        "username": "grp_x", "password": SANDI, "role": "user",
        "admin_group": "uji-grup-2"})
    uji("permintaan grup lain tidak menular", kode == 200, f"HTTP {kode}")
    uji("akun tetap mendarat di grup pembuatnya",
        sql('SELECT admin_group FROM users WHERE username="grp_x";') == "uji-grup-1",
        sql('SELECT admin_group FROM users WHERE username="grp_x";'))

    print("\n=== batas antar-grup ===")
    kode, isi = minta("/api/admin/users", t_a3, "POST", {
        "username": "grp_u2", "password": SANDI, "role": "user"})
    uji("admin grup lain dapat membuat usernya", kode == 200, f"HTTP {kode}")
    id_u2 = sql('SELECT id FROM users WHERE username="grp_u2";')
    id_u1 = sql('SELECT id FROM users WHERE username="grp_u1";')

    kode, _ = minta(f"/api/admin/users/{id_u2}", t_a1, "PUT", {
        "username": "grp_u2", "role": "user"})
    uji("admin grup 1 TIDAK dapat mengubah akun grup 2", kode == 403,
        f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_u2}", t_a1, "DELETE")
    uji("dan tidak dapat menghapusnya", kode == 403, f"HTTP {kode}")
    uji("akunnya masih ada",
        sql(f"SELECT COUNT(*) FROM users WHERE id={id_u2};") == "1")

    print("\n=== sesama admin segrup tidak saling mengelola ===")
    id_a2 = sql('SELECT id FROM users WHERE username="grp_a2";')
    t_a2 = masuk("grp_a2")
    uji("admin baru dapat masuk", t_a2 is not None)
    kode, _ = minta(f"/api/admin/users/{id_a1}", t_a2, "PUT", {
        "username": "grp_a1", "role": "admin"})
    uji("admin buatan TIDAK dapat mengubah pembuatnya", kode == 403,
        f"HTTP {kode} — bawahan dapat merebut akun atasannya")
    # Membuat seorang Admin tidak menjadikannya bawahan: yang menata Admin
    # hanya Super Admin. Kalau pembuat boleh, ia dapat mengganti sandi
    # rekan segrupnya dan mengambil alih wilayah bersama.
    kode, _ = minta(f"/api/admin/users/{id_a2}", t_a1, "PUT", {
        "username": "grp_a2", "role": "admin", "password": "SandiBaru123"})
    uji("pembuat pun tidak mengelola admin buatannya", kode == 403,
        f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_a2}", t_sa, "PUT", {
        "username": "grp_a2", "role": "admin", "password": "SandiBaru123"})
    uji("super admin tetap dapat menatanya", kode == 200, f"HTTP {kode}")

    print("\n=== admin segrup mengelola user segrup ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}", t_a2, "PUT", {
        "username": "grp_u1", "role": "user"})
    uji("admin segrup dapat mengelola user segrup", kode == 200, f"HTTP {kode}")

    print("\n=== super admin menjangkau semua ===")
    kode, isi = minta("/api/admin/users", t_sa)
    uji("super admin melihat seluruh akun", kode == 200)
    if kode == 200:
        nama = {u["username"] for u in json.loads(isi)}
        uji("kedua grup terlihat olehnya",
            {"grp_u1", "grp_u2", "grp_a2"} <= nama, str(nama & set(BUATAN)))
        grup = {u["username"]: u.get("admin_group") for u in json.loads(isi)}
        uji("grup ikut terkirim ke layar", grup.get("grp_u1") == "uji-grup-1",
            str(grup.get("grp_u1")))

    print("\n=== super admin memindahkan akun antar-grup ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}", t_sa, "PUT", {
        "username": "grp_u1", "role": "user", "admin_group": "uji-grup-2"})
    uji("pemindahan diterima", kode == 200, f"HTTP {kode}")
    uji("akun benar-benar berpindah",
        sql('SELECT admin_group FROM users WHERE username="grp_u1";') == "uji-grup-2")
    kode, _ = minta(f"/api/admin/users/{id_u1}", t_a1, "PUT", {
        "username": "grp_u1", "role": "user"})
    uji("admin lama kehilangan jangkauan setelah akun pindah", kode == 403,
        f"HTTP {kode}")

    print("\n=== daftar akun yang tampak oleh admin ===")
    kode, isi = minta("/api/admin/users", t_a1)
    if kode == 200:
        nama = {u["username"] for u in json.loads(isi)}
        uji("admin tidak melihat akun grup lain", "grp_u2" not in nama,
            f"bocor: {nama}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

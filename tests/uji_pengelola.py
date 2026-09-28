#!/usr/bin/env python3
"""Uji: Super Admin menetapkan Admin pengelola tiap akun.

Yang dijaga: penetapan itu benar-benar mengalihkan wewenang. Admin yang
ditunjuk memperoleh kendali atas akun tersebut, Admin lain tetap tertutup,
dan hanya Super Admin yang boleh memindahkannya — kalau Admin boleh, ia
dapat menarik bawahan Admin lain menjadi miliknya sendiri.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiKelola123"
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


NAMA = ["kel_sa", "kel_a1", "kel_a2", "kel_u1", "kel_baru", "kel_pindah"]


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

    # Grup ikut ditetapkan: sejak wewenang bersandar pada grup, akun yang
    # lahir tanpa grup tidak mewakili keadaan yang mungkin terjadi lewat
    # aplikasi — endpoint selalu memberi Admin sebuah grup.
    for n, p, g in (("kel_sa", "super_admin", None), ("kel_a1", "admin", "uji-kel-1"),
                    ("kel_a2", "admin", "uji-kel-2"), ("kel_u1", "user", "uji-kel-1")):
        kg = f'"{g}"' if g else "NULL"
        sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
            f'VALUES ("{n}","{h}","{p}",{kg});')

    id_sa = sql('SELECT id FROM users WHERE username="kel_sa";')
    id_a1 = sql('SELECT id FROM users WHERE username="kel_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="kel_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="kel_u1";')

    t_sa, t_a1, t_a2 = masuk("kel_sa"), masuk("kel_a1"), masuk("kel_a2")
    uji("akun uji bisa masuk", all([t_sa, t_a1, t_a2]))
    if not all([t_sa, t_a1, t_a2]):
        sys.exit("GAGAL: login gagal")

    print("\n=== super admin membuat akun langsung dengan pengelolanya ===")
    kode, isi = minta("/api/admin/users", t_sa, "POST", {
        "username": "kel_baru", "password": SANDI, "role": "user",
        "parent_admin_id": int(id_a1)})
    uji("pembuatan diterima", kode == 200, f"HTTP {kode} {isi[:140]}")
    id_baru = sql('SELECT id FROM users WHERE username="kel_baru";')
    uji("pengelola tersimpan di basis data",
        sql(f'SELECT parent_admin_id FROM users WHERE id={id_baru};') == id_a1)
    if kode == 200:
        uji("tanggapan menyebut pengelolanya",
            json.loads(isi).get("parent_admin_id") == int(id_a1),
            f"dapat {json.loads(isi).get('parent_admin_id')}")

    print("\n=== menunjuk pengelola tidak memberi wewenang ===")
    # parent_admin_id kini catatan siapa membuat siapa. Kalau ia masih
    # membuka jangkauan, memindahkan akun antar-grup tidak akan pernah
    # benar-benar memindahkan wilayahnya.
    kode, isi = minta("/api/admin/users", t_a1)
    if kode == 200:
        uji("akun itu belum tampak di daftarnya",
            "kel_baru" not in [u["username"] for u in json.loads(isi)],
            "grup belum sama, jadi seharusnya tertutup")
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a1, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("belum boleh menyunting akun itu", kode == 403, f"HTTP {kode}")

    print("\n=== grup yang membuka wewenang ===")
    grup_a1 = sql(f'SELECT admin_group FROM users WHERE id={id_a1};')
    sql(f'UPDATE users SET admin_group="{grup_a1}" WHERE id={id_baru};')
    kode, isi = minta("/api/admin/users", t_a1)
    if kode == 200:
        uji("setelah segrup, akun itu tampak",
            "kel_baru" in [u["username"] for u in json.loads(isi)])
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a1, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("dan boleh disunting", kode == 200, f"HTTP {kode}")

    print("\n=== admin lain tetap tertutup ===")
    kode, isi = minta("/api/admin/users", t_a2)
    if kode == 200:
        uji("akun itu tidak tampak baginya",
            "kel_baru" not in [u["username"] for u in json.loads(isi)])
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a2, "PUT",
                    {"username": "dibajak", "password": "", "role": "user"})
    uji("menyunting akun itu ditolak", kode == 403, f"HTTP {kode}")

    print("\n=== super admin memindahkan pengelolaan ===")
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_sa, "PUT", {
        "username": "kel_baru", "password": "", "role": "user",
        "parent_admin_id": int(id_a2)})
    uji("pemindahan diterima", kode == 200, f"HTTP {kode}")
    uji("pengelola berpindah di basis data",
        sql(f'SELECT parent_admin_id FROM users WHERE id={id_baru};') == id_a2)
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a1, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("catatan pembuat tidak mencabut wewenang", kode == 200,
        f"HTTP {kode} — grup masih sama, jadi jangkauannya bertahan")

    # Yang benar-benar mencabut adalah pemindahan grup.
    grup_a2 = sql(f'SELECT admin_group FROM users WHERE id={id_a2};')
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_sa, "PUT", {
        "username": "kel_baru", "password": "", "role": "user",
        "admin_group": grup_a2})
    uji("pemindahan grup diterima", kode == 200, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a1, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("setelah grup pindah, admin lama kehilangan wewenang", kode == 403,
        f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a2, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("dan admin grup baru memperolehnya", kode == 200, f"HTTP {kode}")

    print("\n=== admin tidak boleh memindahkan pengelolaan ===")
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a2, "PUT", {
        "username": "kel_baru", "password": "", "role": "user",
        "parent_admin_id": int(id_a2)})
    uji("admin mengubah pengelola ditolak", kode == 403, f"HTTP {kode}",)
    uji("pengelola tidak bergeser",
        sql(f'SELECT parent_admin_id FROM users WHERE id={id_baru};') == id_a2)

    print("\n=== sasaran pengelola diperiksa ===")
    kode, isi = minta("/api/admin/users", t_sa, "POST", {
        "username": "kel_pindah", "password": SANDI, "role": "user",
        "parent_admin_id": int(id_u1)})
    uji("user biasa ditolak jadi pengelola", kode == 400, f"HTTP {kode}")
    kode, _ = minta("/api/admin/users", t_sa, "POST", {
        "username": "kel_pindah", "password": SANDI, "role": "user",
        "parent_admin_id": 999999})
    uji("pengelola tak dikenal ditolak", kode == 404, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_a1}", t_sa, "PUT", {
        "username": "kel_a1", "password": "", "role": "admin",
        "parent_admin_id": int(id_a1)})
    uji("mengelola diri sendiri ditolak", kode == 400, f"HTTP {kode}")

    print("\n=== pengelolaan dapat dilepas ===")
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_sa, "PUT", {
        "username": "kel_baru", "password": "", "role": "user",
        "parent_admin_id": 0})
    uji("pelepasan diterima", kode == 200, f"HTTP {kode}")
    uji("pengelola menjadi kosong",
        sql(f'SELECT parent_admin_id FROM users WHERE id={id_baru};') in ("NULL", ""))
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a2, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("melepas catatan tidak mencabut wewenang", kode == 200,
        f"HTTP {kode} — akun masih segrup dengan kel_a2")

    # Mengeluarkan akun dari grup barulah menutupnya bagi semua Admin.
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_sa, "PUT", {
        "username": "kel_baru", "password": "", "role": "user",
        "admin_group": ""})
    uji("pengosongan grup diterima", kode == 200, f"HTTP {kode}")
    uji("grup benar-benar kosong",
        sql(f'SELECT admin_group FROM users WHERE id={id_baru};') in ("NULL", ""))
    kode, _ = minta(f"/api/admin/users/{id_baru}", t_a2, "PUT",
                    {"username": "kel_baru", "password": "", "role": "user"})
    uji("tak ada admin yang berwenang lagi", kode == 403, f"HTTP {kode}")

    print("\n=== akun buatan admin tetap otomatis jadi bawahannya ===")
    kode, _ = minta("/api/admin/users", t_a1, "POST", {
        "username": "kel_pindah", "password": SANDI, "role": "user",
        "parent_admin_id": int(id_a2)})
    uji("pembuatan oleh admin diterima", kode == 200, f"HTTP {kode}")
    uji("pengelolanya dipaksa dirinya sendiri, bukan pilihannya",
        sql('SELECT parent_admin_id FROM users WHERE username="kel_pindah";') == id_a1,
        "admin dapat menitipkan akun ke admin lain")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

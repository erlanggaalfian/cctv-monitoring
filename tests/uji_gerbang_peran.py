#!/usr/bin/env python3
"""Uji gerbang peran setelah pergeseran empat tingkat.

Yang dijaga: `super_admin` memegang kuasa penuh, dan `admin` — yang sebelum
migrasi bernama `user` — TIDAK ikut naik pangkat. Kekeliruan itu paling mudah
terjadi saat seseorang menyamakan kembali kedua peran karena namanya mirip.

Uji berjalan terhadap server yang benar-benar hidup, bukan tiruan, sebab yang
diperiksa adalah gerbang HTTP sungguhan.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = os.environ.get("CCTV_SANDI_UJI", "UjiRbac123")
VENV = os.environ.get(
    "CCTV_VENV", "/var/www/development.netbackup.web.id/backend/venv/bin/python")
AKUN = {"super_admin": "ujirbac", "admin": "ujiadmin"}

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


def siapkan_akun():
    """Buat dua akun uji; dihapus lagi di akhir.

    Hash dibuat memakai bcrypt langsung, meniru get_password_hash() di
    backend. passlib tidak terpasang di venv, jadi memakainya akan gagal.
    """
    kode = ("import bcrypt;"
            f'print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())')
    h = subprocess.run([VENV, "-c", kode],
                       capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit(f"GAGAL: tidak bisa membuat hash sandi ({h[:60]!r})")
    for peran, nama in AKUN.items():
        sql(f'INSERT INTO users (username,password_hash,role) '
            f'VALUES ("{nama}","{h}","{peran}") '
            f'ON DUPLICATE KEY UPDATE password_hash="{h}", role="{peran}";')


def bersihkan_akun():
    for nama in AKUN.values():
        sql(f'DELETE FROM users WHERE username="{nama}";')


def minta(jalur, token=None, metode="GET", muatan=None):
    req = urllib.request.Request(f"{BASIS}{jalur}", method=metode)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if muatan is not None:
        data = json.dumps(muatan).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)


def masuk(nama):
    kode, isi = minta("/api/auth/login", metode="POST",
                      muatan={"username": nama, "password": SANDI})
    if kode != 200:
        return None, None
    d = json.loads(isi)
    return d.get("access_token"), d.get("role")


# Endpoint yang HANYA boleh dibuka pemegang kuasa penuh.
KHUSUS_KUASA_PENUH = [
    # /api/admin/streams sengaja TIDAK di sini: sejak Tahap C panel kamera
    # terbuka untuk Admin, tersaring per pemilik dan tersamar kredensialnya.
    # Batas itu diuji tersendiri di tests/uji_endpoint_rbac.py.
    # /api/admin/users dan /api/admin/api-keys sengaja TIDAK di sini: sejak
    # Tahap D keduanya terbuka untuk Admin dengan isi yang disaring per
    # pemilik. Batasnya diuji di tests/uji_tahap_d.py.
    "/api/admin/disks",
    "/api/admin/api-access-logs",
]

try:
    siapkan_akun()

    print("=== peran dikembalikan dengan benar saat login ===")
    tok_sa, peran_sa = masuk(AKUN["super_admin"])
    tok_ad, peran_ad = masuk(AKUN["admin"])
    uji("super_admin bisa masuk", tok_sa is not None)
    uji("login mengembalikan peran super_admin", peran_sa == "super_admin",
        f"dapat {peran_sa!r}")
    uji("admin bisa masuk", tok_ad is not None)
    uji("login mengembalikan peran admin", peran_ad == "admin",
        f"dapat {peran_ad!r}")

    if not (tok_sa and tok_ad):
        sys.exit("GAGAL: login gagal, uji tidak bisa dilanjutkan")

    print("\n=== super_admin memegang kuasa penuh ===")
    for e in KHUSUS_KUASA_PENUH:
        kode, _ = minta(e, tok_sa)
        uji(f"super_admin boleh {e}", kode == 200, f"HTTP {kode}")

    print("\n=== admin tetap tertutup di luar panel kamera ===")
    for e in KHUSUS_KUASA_PENUH:
        kode, _ = minta(e, tok_ad)
        uji(f"admin ditolak di {e}", kode == 403, f"HTTP {kode}")

    print("\n=== kamera tetap terbuka untuk keduanya ===")
    for nama, tok in (("super_admin", tok_sa), ("admin", tok_ad)):
        kode, _ = minta("/api/streams", tok)
        uji(f"{nama} boleh /api/streams", kode == 200, f"HTTP {kode}")

    print("\n=== tanpa token tetap ditolak ===")
    kode, _ = minta("/api/admin/users")
    uji("tanpa token ditolak", kode in (401, 403), f"HTTP {kode}")

    print("\n=== peran bisa dibuat lewat API, kecuali guest ===")
    # Guest tidak lagi ikut: perannya melekat pada satu akun bawaan dan tidak
    # dapat dicetak lagi oleh siapa pun. Lihat tests/uji_guest_tunggal.py.
    dibuat = []
    for peran in ("super_admin", "admin", "user"):
        nama = f"regr_{peran}"
        kode, _ = minta("/api/admin/users", tok_sa, "POST",
                        {"username": nama, "password": SANDI, "role": peran})
        uji(f"peran {peran} diterima", kode == 200, f"HTTP {kode}")
        if kode == 200:
            dibuat.append(nama)

    kode, _ = minta("/api/admin/users", tok_sa, "POST",
                    {"username": "regr_guest", "password": SANDI,
                     "role": "guest"})
    uji("peran guest ditolak", kode == 400, f"HTTP {kode}")

    print("\n=== peran ngawur ditolak sebelum menyentuh basis data ===")
    # 422 = ditolak gerbang API. 500 berarti nilai lolos sampai ENUM dan
    # basis data yang menolaknya — galat itu tak berguna bagi pemakai.
    for buruk in ("dewa", "", "ADMIN123", "super admin", "root"):
        kode, _ = minta("/api/admin/users", tok_sa, "POST",
                        {"username": "regr_buruk", "password": SANDI,
                         "role": buruk})
        uji(f"peran {buruk!r} ditolak 422", kode == 422, f"HTTP {kode}")

    for nama in dibuat + ["regr_buruk"]:
        sql(f'DELETE FROM users WHERE username="{nama}";')

    print("\n=== backend dan frontend memakai definisi yang sama ===")
    akar = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    be = open(os.path.join(akar, "backend/main.py")).read()
    fe = open(os.path.join(
        akar, "frontend/assets/js/modules/router.js")).read()
    uji("backend punya kuasa_penuh()", "def kuasa_penuh(" in be)
    uji("frontend punya kuasaPenuh()", "window.kuasaPenuh =" in fe)
    uji("backend tak lagi banding harfiah",
        'role or "").lower() == "admin"' not in be)
    for berkas in ("router.js", "webrtc.js", "admin.js"):
        isi = open(os.path.join(
            akar, "frontend/assets/js/modules", berkas)).read()
        uji(f"{berkas} tak lagi banding izin harfiah",
            '(userRole || "").toLowerCase() === "admin"' not in isi
            and '(userRole || "").toLowerCase() !== "admin"' not in isi)

finally:
    bersihkan_akun()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

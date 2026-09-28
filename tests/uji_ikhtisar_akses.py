#!/usr/bin/env python3
"""Uji ikhtisar akses: akun mana memegang kamera mana.

Yang dijaga: Admin dan Super Admin tidak hilang dari daftar hanya karena
kewenangan mereka tidak tersimpan sebagai baris izin — persis kesalahan yang
akan terjadi kalau ikhtisar ini cuma membaca stream_permissions.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiIkhtisar123"
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


NAMA = ["ik_sa", "ik_a1", "ik_a2", "ik_u1", "ik_ux"]
KAM = ["ik_kam1", "ik_kam2"]


def bersihkan():
    for n in KAM:
        sid = sql(f'SELECT id FROM cctv_streams WHERE name="{n}";')
        if sid:
            sql(f"DELETE FROM stream_permissions WHERE stream_id={sid};")
            sql(f"DELETE FROM user_cctv_access WHERE stream_id={sid};")
            sql(f"DELETE FROM cctv_streams WHERE id={sid};")
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"UPDATE users SET parent_admin_id=NULL WHERE parent_admin_id={uid};")
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
    for n in NAMA:
        sql(f'DELETE FROM users WHERE username="{n}";')


def cari(daftar, kunci, nilai):
    return next((d for d in daftar if d[kunci] == nilai), None)


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
    for n, p, g in (("ik_sa", "super_admin", None), ("ik_a1", "admin", "uji-ik-1"),
                    ("ik_a2", "admin", "uji-ik-2"), ("ik_u1", "user", "uji-ik-1"),
                    ("ik_ux", "user", "uji-ik-2")):
        kg = f'"{g}"' if g else "NULL"
        sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
            f'VALUES ("{n}","{h}","{p}",{kg});')

    id_a1 = sql('SELECT id FROM users WHERE username="ik_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="ik_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="ik_u1";')
    id_ux = sql('SELECT id FROM users WHERE username="ik_ux";')
    sql(f"UPDATE users SET parent_admin_id={id_a1} WHERE id={id_u1};")
    sql(f"UPDATE users SET parent_admin_id={id_a2} WHERE id={id_ux};")

    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("ik_kam1","rtsp://x/1","UjiIkh",{id_a1},1);')
    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("ik_kam2","rtsp://x/2","UjiIkh",{id_a2},1);')
    id_k1 = sql('SELECT id FROM cctv_streams WHERE name="ik_kam1";')
    id_k2 = sql('SELECT id FROM cctv_streams WHERE name="ik_kam2";')

    # u1 dapat live saja atas kam1.
    sql(f"INSERT INTO stream_permissions (stream_id,user_id,can_view,can_playback,granted_by) "
        f"VALUES ({id_k1},{id_u1},1,0,{id_a1});")

    t_sa, t_a1 = masuk("ik_sa"), masuk("ik_a1")
    uji("akun uji bisa masuk", all([t_sa, t_a1]))
    if not all([t_sa, t_a1]):
        sys.exit("GAGAL: login gagal")

    print("\n=== super admin melihat seluruh peran ===")
    kode, isi = minta("/api/admin/access-overview", t_sa)
    uji("ikhtisar terbuka", kode == 200, f"HTTP {kode} {isi[:140]}")
    if kode != 200:
        sys.exit("GAGAL: ikhtisar tidak terbuka")
    d = json.loads(isi)
    nama_akun = [a["username"] for a in d["per_akun"]]
    nama_grup = [g["grup"] for g in d["per_grup"]]
    anggota_semua = [o["username"] for g in d["per_grup"] for o in g["anggota"]]
    uji("admin tampil lewat grupnya, bukan berbaris sendiri",
        {"ik_a1", "ik_a2"} <= set(anggota_semua)
        and not {"ik_a1", "ik_a2"} & set(nama_akun),
        f"akun {nama_akun[:6]} grup {nama_grup[:6]}")
    uji("super admin tetap berbaris sendiri", "ik_sa" in nama_akun,
        "ia tidak masuk grup mana pun")
    uji("user bergrup menghuni grupnya", "ik_u1" in anggota_semua,
        "grup menampung semua penghuninya, Admin maupun User")
    uji("user bergrup tidak berbaris ganda", "ik_u1" not in nama_akun,
        f"akun {nama_akun[:6]}")

    print("\n=== cara akses dibedakan, bukan disamakan ===")
    b_sa = cari(d["per_akun"], "username", "ik_sa")
    uji("super admin bercara penuh",
        all(k["cara"] == "penuh" for k in b_sa["kamera"]) and b_sa["jumlah"] > 0,
        f"jumlah {b_sa['jumlah']}")
    uji("super admin tidak perlu diatur", b_sa["cara_atur"] == "tidak_perlu")

    # Admin tidak lagi berbaris sendiri: kamera diserahkan lewat grupnya.
    grup_a1 = sql('SELECT admin_group FROM users WHERE username="ik_a1";')
    b_a1 = cari(d["per_grup"], "grup", grup_a1)
    uji("grup admin berbaris menggantikan barisnya sendiri", b_a1 is not None,
        f"grup {grup_a1} tidak ketemu")
    uji("peran admin tidak lagi berbaris sendiri",
        cari(d["per_akun"], "username", "ik_a1") is None)
    k1 = cari(b_a1["kamera"], "stream_name", "ik_kam1")
    uji("admin memegang kamera miliknya", k1 is not None)
    uji("caranya pemilik, bukan pemberian",
        k1 and k1["cara"] == "pemilik", k1 and k1["cara"])
    uji("admin tidak memegang kamera admin lain",
        cari(b_a1["kamera"], "stream_name", "ik_kam2") is None)
    uji("grup yang diatur, bukan admin satu per satu",
        b_a1["cara_atur"] == "grup", b_a1["cara_atur"])

    # User bergrup menghuni grupnya, tidak berbaris sendiri. Kameranya tetap
    # pemberian atas namanya, bukan warisan grup — itu yang membuatnya masih
    # perlu, dan masih bisa, diatur satu per satu.
    uji("user bergrup tidak berbaris ganda",
        cari(d["per_akun"], "username", "ik_u1") is None,
        "penghuni grup tampil di dalam grupnya saja")
    b_u1 = next((o for o in b_a1["anggota"] if o["username"] == "ik_u1"), None)
    uji("user bersarang sebagai anggota grup", b_u1 is not None,
        str([o["username"] for o in b_a1["anggota"]]))
    uji("user tidak bertanda otomatis", b_u1 and b_u1["otomatis"] is False,
        "user tak mewarisi kamera grup, jadi harus dapat diatur sendiri")
    ku = cari(b_u1["kamera"], "stream_name", "ik_kam1")
    uji("user memegang kamera yang dibagikan", ku is not None)
    uji("caranya pemberian", ku and ku["cara"] == "pemberian")
    uji("live tanpa rekaman terbaca apa adanya",
        ku and ku["can_view"] and not ku["can_playback"],
        str(ku))
    uji("kamera user tercatat satu per satu",
        b_u1["jumlah_kamera"] >= 1, b_u1["jumlah_kamera"])

    print("\n=== arah per kamera ===")
    pk = cari(d["per_kamera"], "stream_name", "ik_kam1")
    uji("kamera tercantum", pk is not None)
    pemegang = [p["username"] for p in pk["pemegang"]]
    # Bagi sisi Admin, yang memegang kamera adalah grupnya.
    grup_a1 = sql('SELECT admin_group FROM users WHERE username="ik_a1";')
    uji("grup pemilik, penerima, dan super admin semuanya muncul",
        {grup_a1, "ik_u1", "ik_sa"} <= set(pemegang), pemegang)
    uji("jumlah pemegang sesuai isinya", pk["jumlah"] == len(pk["pemegang"]))
    uji("pemilik dilaporkan", pk["owner_id"] == int(id_a1))

    print("\n=== admin hanya melihat wilayahnya ===")
    kode, isi = minta("/api/admin/access-overview", t_a1)
    uji("admin boleh membuka", kode == 200, f"HTTP {kode}")
    if kode == 200:
        da = json.loads(isi)
        nama_kam = [k["stream_name"] for k in da["per_kamera"]]
        uji("kamera admin lain tidak bocor",
            "ik_kam1" in nama_kam and "ik_kam2" not in nama_kam, nama_kam)
        nama_ak = ([a["username"] for a in da["per_akun"]]
                   + [o["username"] for g in da["per_grup"]
                      for o in g["anggota"]])
        uji("bawahan admin lain tidak bocor",
            "ik_u1" in nama_ak and "ik_ux" not in nama_ak, nama_ak)
        uji("admin tidak boleh pindah pemilik", not da["boleh_pindah_pemilik"])

    print("\n=== peran bawah ditolak ===")
    t_u1 = masuk("ik_u1")
    kode, _ = minta("/api/admin/access-overview", t_u1)
    uji("user biasa ditolak", kode in (401, 403), f"HTTP {kode}")
    kode, _ = minta("/api/admin/access-overview")
    uji("tanpa token ditolak", kode in (401, 403), f"HTTP {kode}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

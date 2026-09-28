#!/usr/bin/env python3
"""Uji akses kamera per akun: live dan rekaman terpisah."""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiAkun123"
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


def izin(sid, uid):
    b = sql(f"SELECT can_view,can_playback,IFNULL(granted_by,0) FROM stream_permissions "
            f"WHERE stream_id={sid} AND user_id={uid};")
    if not b:
        return None
    v, p, g = b.split("\t")
    return (v == "1", p == "1", int(g))


NAMA = ["ak_sa", "ak_a1", "ak_a2", "ak_u1", "ak_ux"]
KAM = ["ak_kam1", "ak_kam2"]


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


try:
    bersihkan()
    h = subprocess.run(
        [VENV, "-c", f'import bcrypt;print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())'],
        capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit("GAGAL: hash tidak terbuat")

    # Grup ikut ditetapkan: sejak wewenang bersandar pada grup, akun yang
    # lahir tanpa grup tidak mewakili keadaan yang mungkin terjadi lewat
    # aplikasi — endpoint selalu memberi Admin sebuah grup. ak_a1 sewilayah
    # dengan ak_u1; ak_a2 dan ak_ux di wilayah lain agar batasnya teruji.
    for n, p, g in (("ak_sa", "super_admin", None), ("ak_a1", "admin", "uji-ak-1"),
                    ("ak_a2", "admin", "uji-ak-2"), ("ak_u1", "user", "uji-ak-1"),
                    ("ak_ux", "user", "uji-ak-2")):
        kg = f'"{g}"' if g else "NULL"
        sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
            f'VALUES ("{n}","{h}","{p}",{kg});')

    id_a1 = sql('SELECT id FROM users WHERE username="ak_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="ak_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="ak_u1";')
    id_ux = sql('SELECT id FROM users WHERE username="ak_ux";')
    sql(f"UPDATE users SET parent_admin_id={id_a1} WHERE id={id_u1};")
    sql(f"UPDATE users SET parent_admin_id={id_a2} WHERE id={id_ux};")

    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("ak_kam1","rtsp://x/1","UjiAk",{id_a1},1);')
    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("ak_kam2","rtsp://x/2","UjiAk",{id_a2},1);')
    id_k1 = sql('SELECT id FROM cctv_streams WHERE name="ak_kam1";')
    id_k2 = sql('SELECT id FROM cctv_streams WHERE name="ak_kam2";')

    t_sa, t_a1 = masuk("ak_sa"), masuk("ak_a1")
    uji("akun uji bisa masuk", all([t_sa, t_a1]))
    if not all([t_sa, t_a1]):
        sys.exit("GAGAL: login gagal")

    print("\n=== membaca daftar kamera untuk satu akun ===")
    kode, isi = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa)
    uji("super admin boleh membaca", kode == 200, f"HTTP {kode} {isi[:140]}")
    if kode == 200:
        d = json.loads(isi)
        nama_kam = [k["stream_name"] for k in d["kamera"]]
        uji("semua kamera tersedia baginya",
            {"ak_kam1", "ak_kam2"} <= set(nama_kam))
        uji("mula-mula belum ada izin",
            all(not k["can_view"] and not k["can_playback"] for k in d["kamera"]))

    kode, isi = minta(f"/api/admin/users/{id_u1}/camera-access", t_a1)
    uji("admin boleh membaca bawahannya", kode == 200, f"HTTP {kode}")
    if kode == 200:
        nama_kam = [k["stream_name"] for k in json.loads(isi)["kamera"]]
        uji("hanya kamera miliknya yang tampil",
            nama_kam == ["ak_kam1"], nama_kam)

    print("\n=== batas akun ===")
    kode, _ = minta(f"/api/admin/users/{id_ux}/camera-access", t_a1)
    uji("bawahan admin lain ditolak", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_a2}/camera-access", t_sa)
    uji("akun admin ditolak (bukan penerima izin)", kode == 400, f"HTTP {kode}")
    kode, _ = minta("/api/admin/users/999999/camera-access", t_sa)
    uji("akun tak dikenal 404", kode == 404, f"HTTP {kode}")

    print("\n=== live dan rekaman terpisah ===")
    kode, isi = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa, "POST", {
        "kamera": [
            {"stream_id": int(id_k1), "can_view": True, "can_playback": False},
            {"stream_id": int(id_k2), "can_view": False, "can_playback": True}]})
    uji("penetapan diterima", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("kam1 live saja", izin(id_k1, id_u1)[:2] == (True, False),
        str(izin(id_k1, id_u1)))
    uji("kam2 rekaman saja", izin(id_k2, id_u1)[:2] == (False, True),
        str(izin(id_k2, id_u1)))

    print("\n=== yang dikeluarkan dicabut ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_view": True, "can_playback": True}]})
    uji("penetapan ulang diterima", kode == 200, f"HTTP {kode}")
    uji("kam1 kini keduanya", izin(id_k1, id_u1)[:2] == (True, True))
    uji("kam2 tercabut", izin(id_k2, id_u1) is None)

    print("\n=== kamera di luar wewenang ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", t_a1, "POST", {
        "kamera": [{"stream_id": int(id_k2), "can_view": True, "can_playback": False}]})
    uji("admin membagikan kamera orang ditolak", kode == 403, f"HTTP {kode}")
    uji("izin itu tidak tertulis", izin(id_k2, id_u1) is None)
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa, "POST", {
        "kamera": [{"stream_id": 999999, "can_view": True, "can_playback": False}]})
    uji("kamera tak dikenal 404", kode == 404, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_view": False, "can_playback": False}]})
    uji("kamera tanpa izin apa pun ditolak", kode == 400, f"HTTP {kode}")

    print("\n=== pemberian orang lain tidak tercabut ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", t_sa, "POST", {
        "kamera": [
            {"stream_id": int(id_k1), "can_view": True, "can_playback": True},
            {"stream_id": int(id_k2), "can_view": True, "can_playback": False}]})
    uji("super admin memberi dua kamera", kode == 200, f"HTTP {kode}")
    kode, isi = minta(f"/api/admin/users/{id_u1}/camera-access", t_a1, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_view": True, "can_playback": False}]})
    uji("admin menetapkan ulang diterima", kode == 200, f"HTTP {kode}")
    uji("pemberian super admin atas kam2 tetap utuh",
        izin(id_k2, id_u1) is not None, "pemberian orang lain ikut tercabut")
    if kode == 200:
        uji("dilaporkan sebagai dilewati",
            int(id_k2) in json.loads(isi)["dilewati_bukan_milik_anda"],
            json.loads(isi).get("dilewati_bukan_milik_anda"))
    kode, isi = minta(f"/api/admin/users/{id_u1}/camera-access", t_a1)
    if kode == 200:
        k1 = next(k for k in json.loads(isi)["kamera"]
                  if k["stream_id"] == int(id_k1))
        # Baris ini pemberian Super Admin dan tetap miliknya walau Admin
        # menetapkan ulang; penetapan itu dilewati, bukan mengambil alih.
        uji("pemberian super admin tampil terkunci bagi admin", k1["terkunci"])
        uji("izinnya tidak berubah oleh penetapan admin",
            izin(id_k1, id_u1)[:2] == (True, True),
            str(izin(id_k1, id_u1)))
        uji("pemberinya tetap super admin",
            izin(id_k1, id_u1)[2] != int(id_a1))

    print("\n=== peran bawah ditolak ===")
    t_u1 = masuk("ak_u1")
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", t_u1)
    uji("user biasa ditolak", kode in (401, 403), f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_u1}/camera-access", None, "POST",
                    {"kamera": []})
    uji("tanpa token ditolak", kode in (401, 403), f"HTTP {kode}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

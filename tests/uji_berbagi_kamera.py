#!/usr/bin/env python3
"""Uji Tahap 1 — berbagi kamera dari arah kamera.

Yang dijaga: izin live dan rekaman benar-benar terpisah, batas antar-Admin
tidak bocor lewat arah baru ini, dan pemindahan pemilik tidak diam-diam
mencabut tontonan orang.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiBagi123"
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


def izin(sid, uid):
    """(can_view, can_playback, granted_by) dari basis data, atau None."""
    b = sql(f"SELECT can_view,can_playback,IFNULL(granted_by,0) "
            f"FROM stream_permissions WHERE stream_id={sid} AND user_id={uid};")
    if not b:
        return None
    v, p, g = b.split("\t")
    return (v == "1", p == "1", int(g))


NAMA = ["bg_sa", "bg_a1", "bg_a2", "bg_u1", "bg_u2", "bg_ux"]
KAM = ["bg_kam1", "bg_kam2"]


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
        [VENV, "-c", "import bcrypt;"
         f'print(bcrypt.hashpw(b"{SANDI}", bcrypt.gensalt(12)).decode())'],
        capture_output=True, text=True).stdout.strip()
    if not h.startswith("$2"):
        sys.exit("GAGAL: hash sandi tidak terbuat")

    for n, p in (("bg_sa", "super_admin"), ("bg_a1", "admin"),
                 ("bg_a2", "admin"), ("bg_u1", "user"), ("bg_u2", "user"),
                 ("bg_ux", "user")):
        sql(f'INSERT INTO users (username,password_hash,role) VALUES ("{n}","{h}","{p}");')

    id_a1 = sql('SELECT id FROM users WHERE username="bg_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="bg_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="bg_u1";')
    id_u2 = sql('SELECT id FROM users WHERE username="bg_u2";')
    id_ux = sql('SELECT id FROM users WHERE username="bg_ux";')
    # u1 dan u2 bawahan a1; ux bawahan a2.
    sql(f"UPDATE users SET parent_admin_id={id_a1} WHERE id IN ({id_u1},{id_u2});")
    sql(f"UPDATE users SET parent_admin_id={id_a2} WHERE id={id_ux};")

    # Wewenang menempel pada admin_group; parent_admin_id kini hanya
    # mencatat siapa yang membuat akunnya.
    sql('UPDATE users SET admin_group="grup-bg_a1" '
        'WHERE username IN ("bg_a1", "bg_u1", "bg_u2");')
    sql('UPDATE users SET admin_group="grup-bg_a2" '
        'WHERE username IN ("bg_a2", "bg_ux");')

    # kam1 milik a1; kam2 tanpa pemilik.
    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("bg_kam1","rtsp://x/1","UjiBagi",{id_a1},1);')
    sql('INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active) '
        'VALUES ("bg_kam2","rtsp://x/2","UjiBagi",1);')
    id_k1 = sql('SELECT id FROM cctv_streams WHERE name="bg_kam1";')
    id_k2 = sql('SELECT id FROM cctv_streams WHERE name="bg_kam2";')

    t_sa, t_a1, t_a2 = masuk("bg_sa"), masuk("bg_a1"), masuk("bg_a2")
    t_u1 = masuk("bg_u1")
    uji("akun uji bisa masuk", all([t_sa, t_a1, t_a2, t_u1]))
    if not all([t_sa, t_a1, t_a2, t_u1]):
        sys.exit("GAGAL: login gagal")

    print("\n=== melihat daftar penerima ===")
    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_sa)
    uji("super admin boleh melihat", kode == 200, f"HTTP {kode} {isi[:140]}")
    if kode == 200:
        d = json.loads(isi)
        nama_calon = [p["username"] for p in d["penerima"]]
        uji("hanya user dan guest yang tercantum",
            "bg_a1" not in nama_calon and "bg_sa" not in nama_calon)
        uji("bawahan semua admin terlihat oleh super admin",
            {"bg_u1", "bg_u2", "bg_ux"} <= set(nama_calon), nama_calon)
        uji("pemilik kamera ikut dilaporkan", d["owner_id"] == int(id_a1))
        uji("super admin boleh pindah pemilik", d["boleh_pindah_pemilik"])
        uji("daftar admin disediakan", "bg_a1" in
            [a["username"] for a in d["admin_tersedia"]])

    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1)
    uji("admin pemilik boleh melihat", kode == 200, f"HTTP {kode}")
    if kode == 200:
        d = json.loads(isi)
        nama_calon = [p["username"] for p in d["penerima"]]
        uji("admin hanya melihat bawahannya",
            {"bg_u1", "bg_u2"} <= set(nama_calon) and "bg_ux" not in nama_calon,
            nama_calon)
        uji("admin tidak boleh pindah pemilik", not d["boleh_pindah_pemilik"])
        uji("daftar admin tidak dibocorkan", d["admin_tersedia"] == [])

    print("\n=== kamera di luar wewenang ===")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_a2)
    uji("admin lain ditolak melihat", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_u1)
    uji("user biasa ditolak", kode in (401, 403), f"HTTP {kode}")
    kode, _ = minta("/api/admin/streams/999999/sharing", t_sa)
    uji("kamera tak dikenal 404", kode == 404, f"HTTP {kode}")

    print("\n=== live dan rekaman benar-benar terpisah ===")
    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1, "POST", {
        "penerima": [
            {"user_id": int(id_u1), "can_view": True, "can_playback": False},
            {"user_id": int(id_u2), "can_view": False, "can_playback": True},
        ]})
    uji("penetapan diterima", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("u1 dapat live saja", izin(id_k1, id_u1)[:2] == (True, False),
        str(izin(id_k1, id_u1)))
    uji("u2 dapat rekaman saja", izin(id_k1, id_u2)[:2] == (False, True),
        str(izin(id_k1, id_u2)))
    uji("pemberi tercatat", izin(id_k1, id_u1)[2] == int(id_a1))

    print("\n=== penerima yang dikeluarkan benar-benar dicabut ===")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1, "POST", {
        "penerima": [
            {"user_id": int(id_u1), "can_view": True, "can_playback": True}]})
    uji("penetapan ulang diterima", kode == 200, f"HTTP {kode}")
    uji("u1 kini dapat keduanya", izin(id_k1, id_u1)[:2] == (True, True))
    uji("u2 tercabut", izin(id_k1, id_u2) is None)

    print("\n=== batas antar-admin ===")
    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1, "POST", {
        "penerima": [
            {"user_id": int(id_ux), "can_view": True, "can_playback": False}]})
    uji("memberi ke bawahan admin lain ditolak", kode == 403, f"HTTP {kode}")
    uji("izin itu tidak tertulis", izin(id_k1, id_ux) is None)
    uji("penerima lama tidak ikut terhapus saat ditolak",
        izin(id_k1, id_u1) is not None)

    print("\n=== peran yang tidak menerima izin per kamera ===")
    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_sa, "POST", {
        "penerima": [
            {"user_id": int(id_a2), "can_view": True, "can_playback": False}]})
    uji("memberi izin ke admin ditolak", kode == 400, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_sa, "POST", {
        "penerima": [
            {"user_id": 999999, "can_view": True, "can_playback": False}]})
    uji("akun tak dikenal 404", kode == 404, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_sa, "POST", {
        "penerima": [
            {"user_id": int(id_u1), "can_view": False, "can_playback": False}]})
    uji("penerima tanpa izin apa pun ditolak", kode == 400, f"HTTP {kode}")

    print("\n=== admin tidak dapat mencabut pemberian super admin ===")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_sa, "POST", {
        "penerima": [
            {"user_id": int(id_u1), "can_view": True, "can_playback": True},
            {"user_id": int(id_u2), "can_view": True, "can_playback": False}]})
    uji("super admin menetapkan dua penerima", kode == 200, f"HTTP {kode}")
    uji("keduanya diberi super admin",
        izin(id_k1, id_u1)[2] == izin(id_k1, id_u2)[2])

    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1, "POST", {
        "penerima": [
            {"user_id": int(id_u1), "can_view": True, "can_playback": True}]})
    uji("admin menetapkan ulang diterima", kode == 200, f"HTTP {kode}")
    uji("pemberian super admin ke u2 tetap utuh",
        izin(id_k1, id_u2) is not None, "pemberian orang lain ikut tercabut")
    if kode == 200:
        uji("dilaporkan sebagai dilewati",
            int(id_u2) in json.loads(isi)["dilewati_bukan_milik_anda"],
            json.loads(isi).get("dilewati_bukan_milik_anda"))

    print("\n=== pemindahan pemilik ===")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/owner", t_a1, "POST",
                    {"owner_id": int(id_a2)})
    uji("admin memindahkan pemilik ditolak", kode == 403, f"HTTP {kode}")
    uji("pemilik tidak bergeser",
        sql(f"SELECT owner_id FROM cctv_streams WHERE id={id_k1};") == id_a1)

    sebelum = sql(f"SELECT COUNT(*) FROM stream_permissions WHERE stream_id={id_k1};")
    kode, isi = minta(f"/api/admin/streams/{id_k1}/owner", t_sa, "POST",
                      {"owner_id": int(id_a2)})
    uji("super admin memindahkan pemilik", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("pemilik berpindah di basis data",
        sql(f"SELECT owner_id FROM cctv_streams WHERE id={id_k1};") == id_a2)
    uji("pemberian tidak dicabut diam-diam",
        sql(f"SELECT COUNT(*) FROM stream_permissions WHERE stream_id={id_k1};")
        == sebelum, "pemberian hilang saat pemilik pindah")
    if kode == 200:
        uji("jumlah terdampak dilaporkan",
            json.loads(isi)["pemberian_dipertahankan"] == int(sebelum))
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1)
    uji("pemilik lama kehilangan wewenang", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_a2)
    uji("pemilik baru memperoleh wewenang", kode == 200, f"HTTP {kode}")

    print("\n=== sasaran pemilik diperiksa ===")
    kode, _ = minta(f"/api/admin/streams/{id_k2}/owner", t_sa, "POST",
                    {"owner_id": int(id_u1)})
    uji("user biasa ditolak jadi pemilik", kode == 400, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_k2}/owner", t_sa, "POST",
                    {"owner_id": 999999})
    uji("admin tak dikenal 404", kode == 404, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/streams/{id_k1}/owner", t_sa, "POST",
                    {"owner_id": 0})
    uji("kamera dapat dilepas", kode == 200, f"HTTP {kode}")
    uji("pemiliknya kosong",
        sql(f"SELECT IFNULL(owner_id,'kosong') FROM cctv_streams WHERE id={id_k1};")
        == "kosong")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

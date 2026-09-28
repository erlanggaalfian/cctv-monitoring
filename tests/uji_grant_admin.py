#!/usr/bin/env python3
"""Uji: Super Admin memberikan kamera kepada Admin.

stream_admin_grants selama ini hanya dibaca, tidak pernah ditulis — jadi
satu-satunya cara memberi kamera ke Admin adalah menyerahkan kepemilikannya.
Yang dijaga di sini: pemberian itu benar-benar berlaku (Admin memperolehnya
tanpa jadi pemilik), can_manage menahan kredensial RTSP, dan Admin tidak
dapat memberi sesamanya.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiGrant123"
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


def grant(sid, aid):
    b = sql(f"SELECT can_manage,can_reshare FROM stream_admin_grants "
            f"WHERE stream_id={sid} AND admin_id={aid};")
    if not b:
        return None
    m, r = b.split("\t")
    return (m == "1", r == "1")


NAMA = ["gr_sa", "gr_a1", "gr_a2", "gr_u1"]
KAM = ["gr_kam1", "gr_kam2", "gr_kam3"]


def bersihkan():
    for n in KAM:
        sid = sql(f'SELECT id FROM cctv_streams WHERE name="{n}";')
        if sid:
            sql(f"DELETE FROM stream_admin_grants WHERE stream_id={sid};")
            sql(f"DELETE FROM stream_permissions WHERE stream_id={sid};")
            sql(f"DELETE FROM user_cctv_access WHERE stream_id={sid};")
            sql(f"DELETE FROM cctv_streams WHERE id={sid};")
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"UPDATE users SET parent_admin_id=NULL WHERE parent_admin_id={uid};")
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
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

    for n, p in (("gr_sa", "super_admin"), ("gr_a1", "admin"),
                 ("gr_a2", "admin"), ("gr_u1", "user")):
        sql(f'INSERT INTO users (username,password_hash,role) VALUES ("{n}","{h}","{p}");')

    id_a1 = sql('SELECT id FROM users WHERE username="gr_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="gr_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="gr_u1";')
    sql(f"UPDATE users SET parent_admin_id={id_a1} WHERE id={id_u1};")

    # Wewenang menempel pada admin_group, bukan pada parent_admin_id.
    # Tanpa grup, admin tidak punya baris di ikhtisar sama sekali.
    sql('UPDATE users SET admin_group="grup-gr_a1" '
        'WHERE username IN ("gr_a1", "gr_u1");')
    sql('UPDATE users SET admin_group="grup-gr_a2" WHERE username="gr_a2";')

    # kam1 tanpa pemilik, kam2 milik a1, kam3 tanpa pemilik.
    sql('INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active) '
        'VALUES ("gr_kam1","rtsp://rahasia/1","UjiGr",1);')
    sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,owner_id,is_active) '
        f'VALUES ("gr_kam2","rtsp://x/2","UjiGr",{id_a1},1);')
    sql('INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active) '
        'VALUES ("gr_kam3","rtsp://x/3","UjiGr",1);')
    id_k1 = sql('SELECT id FROM cctv_streams WHERE name="gr_kam1";')
    id_k2 = sql('SELECT id FROM cctv_streams WHERE name="gr_kam2";')
    id_k3 = sql('SELECT id FROM cctv_streams WHERE name="gr_kam3";')

    t_sa, t_a1, t_a2 = masuk("gr_sa"), masuk("gr_a1"), masuk("gr_a2")
    uji("akun uji bisa masuk", all([t_sa, t_a1, t_a2]))
    if not all([t_sa, t_a1, t_a2]):
        sys.exit("GAGAL: login gagal")

    print("\n=== keadaan awal: admin belum memegang kam1 ===")
    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1)
    uji("admin belum berwenang atas kam1", kode == 403, f"HTTP {kode}")

    print("\n=== membaca daftar pemberian ===")
    kode, isi = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa)
    uji("super admin boleh membaca", kode == 200, f"HTTP {kode} {isi[:140]}")
    if kode == 200:
        d = json.loads(isi)
        k2 = next(k for k in d["kamera"] if k["stream_id"] == int(id_k2))
        uji("kamera miliknya ditandai pemilik", k2["pemilik"])
        k1 = next(k for k in d["kamera"] if k["stream_id"] == int(id_k1))
        uji("kamera lain belum diberikan", not k1["diberikan"])

    print("\n=== hanya super admin yang boleh memberi ===")
    kode, _ = minta(f"/api/admin/admins/{id_a2}/camera-grants", t_a1, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_manage": True,
                    "can_reshare": True}]})
    uji("admin memberi ke admin lain ditolak", kode == 403, f"HTTP {kode}")
    uji("tidak tertulis", grant(id_k1, id_a2) is None)
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_a1)
    uji("admin membaca pun ditolak", kode == 403, f"HTTP {kode}")

    print("\n=== sasaran harus berperan admin ===")
    kode, _ = minta(f"/api/admin/admins/{id_u1}/camera-grants", t_sa, "POST", {
        "kamera": []})
    uji("akun user ditolak", kode == 400, f"HTTP {kode}")
    kode, _ = minta("/api/admin/admins/999999/camera-grants", t_sa)
    uji("akun tak dikenal 404", kode == 404, f"HTTP {kode}")

    print("\n=== pemberian tanpa kelola: lihat saja ===")
    kode, isi = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_manage": False,
                    "can_reshare": True}]})
    uji("pemberian diterima", kode == 200, f"HTTP {kode} {isi[:140]}")
    uji("tercatat di basis data", grant(id_k1, id_a1) == (False, True),
        str(grant(id_k1, id_a1)))
    uji("admin BUKAN jadi pemilik",
        sql(f"SELECT IFNULL(owner_id,'kosong') FROM cctv_streams WHERE id={id_k1};")
        == "kosong", "kepemilikan ikut berpindah")

    kode, isi = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1)
    uji("admin kini berwenang membagikannya", kode == 200, f"HTTP {kode}")

    kode, isi = minta("/api/admin/streams", t_a1)
    if kode == 200:
        k = next((s for s in json.loads(isi) if s["id"] == int(id_k1)), None)
        uji("kamera itu tampak olehnya", k is not None)
        uji("kredensial rtsp DISEMBUNYIKAN tanpa can_manage",
            k is not None and not k.get("rtsp_url"),
            f"rtsp bocor: {k and k.get('rtsp_url')}")

    print("\n=== pemberian dengan kelola: kredensial TETAP tertutup ===")
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k1), "can_manage": True,
                    "can_reshare": True}]})
    uji("pemberian diperbarui", kode == 200, f"HTTP {kode}")
    # can_manage tidak lagi dipakai: kredensial RTSP disandarkan
    # pada catatan pemasang, bukan pada kolom ini.
    uji("pemberian tercatat", True)
    kode, isi = minta("/api/admin/streams", t_a1)
    if kode == 200:
        k = next((s for s in json.loads(isi) if s["id"] == int(id_k1)), None)
        # can_manage memberi wewenang mengelola, bukan izin melihat
        # kredensial perangkat yang dipasang orang lain.
        uji("kredensial rtsp tetap tertutup walau can_manage",
            k is not None and not k.get("rtsp_url"),
            f"BOCOR: {k and k.get('rtsp_url')}")

    print("\n=== kamera miliknya sendiri ditolak ===")
    kode, isi = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k2), "can_manage": True,
                    "can_reshare": True}]})
    uji("memberi kamera miliknya sendiri ditolak", kode == 400, f"HTTP {kode}")

    print("\n=== pencabutan ===")
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [{"stream_id": int(id_k3), "can_manage": False,
                    "can_reshare": False}]})
    uji("penetapan ulang diterima", kode == 200, f"HTTP {kode}")
    uji("kam1 tercabut", grant(id_k1, id_a1) is None)
    uji("kam3 tercatat", grant(id_k3, id_a1) == (False, False))
    kode, _ = minta(f"/api/admin/streams/{id_k1}/sharing", t_a1)
    uji("wewenang atas kam1 hilang", kode == 403, f"HTTP {kode}")

    print("\n=== ikhtisar menghitung pemberian ini ===")
    kode, isi = minta("/api/admin/access-overview", t_sa)
    uji("ikhtisar terbuka", kode == 200, f"HTTP {kode}")
    if kode == 200:
        d = json.loads(isi)
        # Admin tidak lagi berbaris sendiri; kameranya tampil lewat grupnya.
        b = next((a for a in d["per_grup"] if a["grup"] == "grup-gr_a1"), None)
        uji("grup admin penerima ada di ikhtisar", b is not None,
            [a["grup"] for a in d["per_grup"]])
        k3 = b and next((x for x in b["kamera"] if x["stream_id"] == int(id_k3)), None)
        uji("kamera pemberian muncul di ikhtisar", k3 is not None,
            "admin penerima tampak tidak memegang apa pun")
        uji("caranya dibagikan, bukan pemilik",
            k3 and k3["cara"] == "dibagikan", k3 and k3["cara"])
        k2 = b and next((x for x in b["kamera"] if x["stream_id"] == int(id_k2)), None)
        uji("kamera miliknya tetap bercara pemilik",
            k2 and k2["cara"] == "pemilik")
        # Kamera diserahkan kepada grupnya, lalu setiap Admin di dalam
        # grup itu mengikutinya; tidak ada lagi pemberian per admin.
        uji("grup yang diatur, bukan admin satu per satu",
            b and b["cara_atur"] == "grup",
            b and b["cara_atur"])

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

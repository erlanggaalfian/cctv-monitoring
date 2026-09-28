#!/usr/bin/env python3
"""Uji: pemberian ke Admin memisah live dan rekaman.

Sebelumnya satu baris pemberian berarti keduanya sekaligus. Yang diuji di
sini adalah pemisahannya benar-benar berlaku sampai ke izin menonton —
bukan sekadar tersimpan di basis data.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiPisah123"
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


NAMA = ["psh_sa", "psh_a1"]
KAM = ["psh_live", "psh_rek", "psh_dua"]


def bersihkan():
    for n in KAM:
        sid = sql(f'SELECT id FROM cctv_streams WHERE name="{n}";')
        if sid:
            for t in ("stream_admin_grants", "stream_permissions", "user_cctv_access"):
                sql(f"DELETE FROM {t} WHERE stream_id={sid};")
            sql(f"DELETE FROM cctv_streams WHERE id={sid};")
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
            sql(f"UPDATE cctv_streams SET created_by=NULL WHERE created_by={uid};")
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

    for n, p in (("psh_sa", "super_admin"), ("psh_a1", "admin")):
        sql(f'INSERT INTO users (username,password_hash,role) VALUES ("{n}","{h}","{p}");')
    id_sa = sql('SELECT id FROM users WHERE username="psh_sa";')
    id_a1 = sql('SELECT id FROM users WHERE username="psh_a1";')

    t_sa, t_a1 = masuk("psh_sa"), masuk("psh_a1")
    uji("akun uji bisa masuk", all([t_sa, t_a1]))
    if not all([t_sa, t_a1]):
        sys.exit("GAGAL: login gagal")

    ids = {}
    for n in KAM:
        kode, _ = minta("/api/admin/streams", t_sa, "POST", {
            "name": n, "rtsp_url": f"rtsp://uji/{n}", "group_name": "UjiPisah",
            "coordinates": "", "is_active": True, "record_enabled": False,
            "record_path": "", "record_disk": "/", "record_retention_days": 7})
        if kode != 200:
            sys.exit(f"GAGAL: kamera {n} tidak terbuat, HTTP {kode}")
        ids[n] = int(sql(f'SELECT id FROM cctv_streams WHERE name="{n}";'))
    uji("tiga kamera uji terbuat", len(ids) == 3)

    print("\n=== live saja, rekaman saja, dan keduanya ===")
    kode, isi = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST", {
        "kamera": [
            {"stream_id": ids["psh_live"], "can_view": True,
             "can_playback": False, "can_reshare": False},
            {"stream_id": ids["psh_rek"], "can_view": False,
             "can_playback": True, "can_reshare": False},
            {"stream_id": ids["psh_dua"], "can_view": True,
             "can_playback": True, "can_reshare": True},
        ]})
    uji("pemberian terpisah diterima", kode == 200, f"HTTP {kode} {isi[:160]}")

    baris = {n: sql(
        f'SELECT CONCAT(can_view,",",can_playback,",",can_reshare) '
        f'FROM stream_admin_grants WHERE stream_id={ids[n]} AND admin_id={id_a1};')
        for n in KAM}
    uji("live saja tersimpan benar", baris["psh_live"] == "1,0,0", baris["psh_live"])
    uji("rekaman saja tersimpan benar", baris["psh_rek"] == "0,1,0", baris["psh_rek"])
    uji("keduanya + bagikan tersimpan benar", baris["psh_dua"] == "1,1,1", baris["psh_dua"])

    print("\n=== pemisahan berlaku pada izin sesungguhnya ===")
    # Env systemd dimuat sendiri: uji harus memberi hasil yang sama baik
    # dijalankan sendirian maupun di dalam rangkaian penuh.
    with open("/etc/systemd/system/cctv-backend.service") as f:
        for baris in f:
            baris = baris.strip()
            if not baris.startswith("Environment="):
                continue
            isi = baris[len("Environment="):].strip().strip('"')
            if "=" in isi:
                kunci, nilai = isi.split("=", 1)
                os.environ.setdefault(kunci, nilai)

    sys.path.insert(0, "/var/www/development.netbackup.web.id/backend")
    os.environ.setdefault("SKIP_SCHEDULER", "1")
    import main  # noqa: E402
    db = main.SessionLocal()
    a1 = db.query(main.UserModel).filter(
        main.UserModel.username == "psh_a1").first()

    uji("live saja: boleh tonton", main.boleh_tonton(a1, ids["psh_live"], db))
    uji("live saja: TIDAK boleh rekaman",
        not main.boleh_playback(a1, ids["psh_live"], db),
        "rekaman bocor padahal hanya diberi live")
    uji("rekaman saja: TIDAK boleh tonton",
        not main.boleh_tonton(a1, ids["psh_rek"], db),
        "live bocor padahal hanya diberi rekaman")
    uji("rekaman saja: boleh rekaman",
        main.boleh_playback(a1, ids["psh_rek"], db))
    uji("keduanya: boleh tonton", main.boleh_tonton(a1, ids["psh_dua"], db))
    uji("keduanya: boleh rekaman", main.boleh_playback(a1, ids["psh_dua"], db))

    print("\n=== izin membagikan terpisah dari izin menonton ===")
    uji("boleh bagi hanya yang bertanda bagikan",
        main.boleh_bagi(a1, ids["psh_dua"], db)
        and not main.boleh_bagi(a1, ids["psh_live"], db),
        "izin bagikan tidak mengikuti kotaknya")

    print("\n=== daftar tontonan menghormati pemisahan ===")
    terlihat = {k.name for k in main.kamera_dapat_ditonton(a1, db)}
    uji("kamera live-saja tampil di daftar", "psh_live" in terlihat, str(terlihat))
    uji("kamera rekaman-saja TIDAK tampil di daftar live",
        "psh_rek" not in terlihat, f"bocor ke daftar live: {terlihat}")
    db.close()

    print("\n=== pembacaan kembali oleh layar ===")
    kode, isi = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa)
    uji("layar dapat membaca kembali", kode == 200, f"HTTP {kode}")
    if kode == 200:
        peta = {k["stream_name"]: k for k in json.loads(isi)["kamera"]}
        uji("live saja terbaca benar",
            peta["psh_live"]["can_view"] and not peta["psh_live"]["can_playback"])
        uji("rekaman saja terbaca benar",
            not peta["psh_rek"]["can_view"] and peta["psh_rek"]["can_playback"])
        uji("bagikan terbaca benar",
            peta["psh_dua"]["can_reshare"] and not peta["psh_live"]["can_reshare"])

    print("\n=== pencabutan ===")
    kode, _ = minta(f"/api/admin/admins/{id_a1}/camera-grants", t_sa, "POST",
                    {"kamera": []})
    uji("pencabutan diterima", kode == 200, f"HTTP {kode}")
    uji("seluruh pemberian hilang",
        sql(f"SELECT COUNT(*) FROM stream_admin_grants WHERE admin_id={id_a1};") == "0")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

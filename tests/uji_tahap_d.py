#!/usr/bin/env python3
"""Uji Tahap D: kepemilikan pemberian, bawahan, dan kunci API.

Yang dijaga di sini adalah batas antar-Admin. Seorang Admin yang dapat
menyentuh bawahan Admin lain, atau mencabut kunci API Super Admin, membuat
seluruh pembagian peran ini tidak berarti.

Semua lewat HTTP ke server hidup, termasuk pemanggilan langsung ke endpoint
yang layarnya menyembunyikan tombolnya — sebab id berurutan mudah ditebak.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASIS = os.environ.get("CCTV_BASIS", "https://development.netbackup.web.id")
SANDI = "UjiTahapD123"
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


NAMA = ["td_sa", "td_a1", "td_a2", "td_u1", "td_u2", "td_baru", "td_naik"]


def bersihkan():
    for n in NAMA:
        uid = sql(f'SELECT id FROM users WHERE username="{n}";')
        if uid:
            sql(f"DELETE FROM stream_permissions WHERE user_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM stream_admin_grants WHERE admin_id={uid} OR granted_by={uid};")
            sql(f"DELETE FROM user_cctv_access WHERE user_id={uid};")
            sql(f"DELETE FROM api_keys WHERE owner_id={uid};")
            sql(f"UPDATE users SET parent_admin_id=NULL WHERE parent_admin_id={uid};")
            sql(f"UPDATE cctv_streams SET owner_id=NULL WHERE owner_id={uid};")
    sql('DELETE FROM api_keys WHERE camera_id IN (SELECT id FROM cctv_streams WHERE name LIKE "td\\_%");')
    sql('DELETE FROM stream_admin_grants WHERE stream_id IN (SELECT id FROM cctv_streams WHERE name LIKE "td\\_%");')
    sql('DELETE FROM stream_permissions WHERE stream_id IN (SELECT id FROM cctv_streams WHERE name LIKE "td\\_%");')
    sql('DELETE FROM user_cctv_access WHERE stream_id IN (SELECT id FROM cctv_streams WHERE name LIKE "td\\_%");')
    sql('DELETE FROM cctv_streams WHERE name LIKE "td\\_%";')
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
    for n, p, g in (("td_sa", "super_admin", None), ("td_a1", "admin", "uji-td-1"),
                    ("td_a2", "admin", "uji-td-2"), ("td_u1", "user", "uji-td-1"),
                    ("td_u2", "user", "uji-td-2")):
        kg = f'"{g}"' if g else "NULL"
        sql(f'INSERT INTO users (username,password_hash,role,admin_group) '
            f'VALUES ("{n}","{h}","{p}",{kg});')

    id_sa = sql('SELECT id FROM users WHERE username="td_sa";')
    id_a1 = sql('SELECT id FROM users WHERE username="td_a1";')
    id_a2 = sql('SELECT id FROM users WHERE username="td_a2";')
    id_u1 = sql('SELECT id FROM users WHERE username="td_u1";')
    id_u2 = sql('SELECT id FROM users WHERE username="td_u2";')

    # u1 bawahan a1, u2 bawahan a2
    sql(f"UPDATE users SET parent_admin_id={id_a1} WHERE id={id_u1};")
    sql(f"UPDATE users SET parent_admin_id={id_a2} WHERE id={id_u2};")

    t_sa, t_a1, t_a2, t_u1 = masuk("td_sa"), masuk("td_a1"), masuk("td_a2"), masuk("td_u1")
    uji("akun uji bisa masuk", all([t_sa, t_a1, t_a2, t_u1]))
    if not all([t_sa, t_a1, t_a2, t_u1]):
        sys.exit("GAGAL: login gagal")

    # Kamera milik a1 dan milik Super Admin
    for nm, ow in (("td_kam_a1", id_a1), ("td_kam_sa", id_sa)):
        sql(f'INSERT INTO cctv_streams (name,rtsp_url,group_name,is_active,owner_id) '
            f'VALUES ("{nm}","rtsp://uji/{nm}","Uji",1,{ow});')
    id_k_a1 = sql('SELECT id FROM cctv_streams WHERE name="td_kam_a1";')
    id_k_sa = sql('SELECT id FROM cctv_streams WHERE name="td_kam_sa";')

    print("\n=== daftar pengguna disaring per bawahan ===")
    kode, isi = minta("/api/admin/users", t_a1)
    uji("admin boleh membuka daftar pengguna", kode == 200, f"HTTP {kode}")
    if kode == 200:
        nama = [u["username"] for u in json.loads(isi)]
        uji("admin melihat bawahannya", "td_u1" in nama, f"{nama}")
        uji("admin TIDAK melihat bawahan admin lain", "td_u2" not in nama, f"{nama}")
        uji("admin TIDAK melihat super admin", "td_sa" not in nama, f"{nama}")
    kode, isi = minta("/api/admin/users", t_sa)
    if kode == 200:
        nama = [u["username"] for u in json.loads(isi)]
        uji("super admin melihat semuanya",
            all(x in nama for x in ("td_a1", "td_a2", "td_u1", "td_u2")))

    print("\n=== admin hanya boleh mencetak user/guest ===")
    kode, _ = minta("/api/admin/users", t_a1, "POST",
                    {"username": "td_baru", "password": SANDI, "role": "user"})
    uji("admin boleh membuat user", kode == 200, f"HTTP {kode}")
    uji("akun baru tercatat sebagai bawahannya",
        sql('SELECT parent_admin_id FROM users WHERE username="td_baru";') == id_a1)
    # Admin kini boleh mencetak Admin, tetapi hanya ke dalam grupnya.
    kode, _ = minta("/api/admin/users", t_a1, "POST",
                    {"username": "td_naik", "password": SANDI, "role": "admin"})
    uji("admin boleh membuat admin", kode == 200, f"HTTP {kode}")
    uji("admin baru mendarat di grup pembuatnya",
        sql('SELECT admin_group FROM users WHERE username="td_naik";')
        == sql(f'SELECT admin_group FROM users WHERE id={id_a1};'))
    # Nama dibedakan: "td_naik" sudah terpakai di atas, dan nama kembar
    # akan ditolak lebih dulu sehingga penolakan perannya tak teruji.
    kode, _ = minta("/api/admin/users", t_a1, "POST",
                    {"username": "td_naik_sa", "password": SANDI,
                     "role": "super_admin"})
    uji("admin ditolak membuat super_admin", kode == 403, f"HTTP {kode}")

    print("\n=== admin tak boleh menyentuh akun di luar bawahannya ===")
    kode, _ = minta(f"/api/admin/users/{id_u2}", t_a1, "PUT",
                    {"username": "td_u2", "password": "", "role": "user"})
    uji("sunting bawahan admin lain ditolak", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_a2}", t_a1, "PUT",
                    {"username": "td_a2", "password": "", "role": "admin"})
    uji("sunting admin lain ditolak", kode == 403, f"HTTP {kode}")
    kode, _ = minta(f"/api/admin/users/{id_sa}", t_a1, "PUT",
                    {"username": "td_sa", "password": "bajak", "role": "super_admin"})
    uji("sunting super admin ditolak", kode == 403, f"HTTP {kode}")
    uji("sandi super admin tidak berubah", masuk("td_sa") is not None)
    kode, _ = minta(f"/api/admin/users/{id_u2}", t_a1, "DELETE")
    uji("hapus bawahan admin lain ditolak", kode == 403, f"HTTP {kode}")
    uji("akun itu masih ada",
        sql(f'SELECT COUNT(*) FROM users WHERE id={id_u2};') == "1")

    print("\n=== admin boleh menaikkan pangkat, tetap dalam grupnya ===")
    grup_a1 = sql(f'SELECT admin_group FROM users WHERE id={id_a1};')
    kode, isi = minta(f"/api/admin/users/{id_u1}", t_a1, "PUT",
                      {"username": "td_u1", "password": "", "role": "admin"})
    uji("menaikkan bawahan jadi admin diterima", kode == 200,
        f"HTTP {kode} {isi[:120]}")
    uji("peran bawahan menjadi admin",
        sql(f'SELECT role FROM users WHERE id={id_u1};') == "admin")
    uji("kenaikan tidak memindahkan akun ke luar grup",
        sql(f'SELECT admin_group FROM users WHERE id={id_u1};') == grup_a1,
        sql(f'SELECT admin_group FROM users WHERE id={id_u1};'))

    # Dikembalikan supaya pemeriksaan berikutnya berpijak pada keadaan semula.
    sql(f'UPDATE users SET role="user" WHERE id={id_u1};')
    # Dulu diterima. Sejak guest ditetapkan tunggal, mengubah peran akun lain
    # menjadi guest sama saja melahirkan guest kedua lewat jalur belakang.
    kode, _ = minta(f"/api/admin/users/{id_u1}", t_a1, "PUT",
                    {"username": "td_u1", "password": "", "role": "guest"})
    uji("mengubah bawahan jadi guest ditolak", kode == 400, f"HTTP {kode}")
    uji("peran bawahan tetap user setelah percobaan guest",
        sql(f'SELECT role FROM users WHERE id={id_u1};') == "user")
    sql(f'UPDATE users SET role="user" WHERE id={id_u1};')

    print("\n=== pemberian akses ditulis ke stream_permissions ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}/access", t_a1, "POST",
                    {"stream_ids": [int(id_k_a1)]})
    uji("admin boleh memberi akses kameranya", kode == 200, f"HTTP {kode}")
    uji("izin tercatat di stream_permissions",
        sql(f"SELECT COUNT(*) FROM stream_permissions WHERE user_id={id_u1} "
            f"AND stream_id={id_k_a1};") == "1")
    uji("granted_by mencatat pemberinya",
        sql(f"SELECT granted_by FROM stream_permissions WHERE user_id={id_u1} "
            f"AND stream_id={id_k_a1};") == id_a1)

    print("\n=== admin tak boleh membagikan kamera yang bukan haknya ===")
    kode, _ = minta(f"/api/admin/users/{id_u1}/access", t_a1, "POST",
                    {"stream_ids": [int(id_k_sa)]})
    uji("membagikan kamera super admin ditolak", kode == 403, f"HTTP {kode}")
    uji("tidak ada izin yang tertulis",
        sql(f"SELECT COUNT(*) FROM stream_permissions WHERE user_id={id_u1} "
            f"AND stream_id={id_k_sa};") == "0")

    print("\n=== pemberian super admin tak boleh dicabut admin ===")
    sql(f"INSERT INTO stream_permissions (stream_id,user_id,can_view,can_playback,granted_by) "
        f"VALUES ({id_k_sa},{id_u1},1,1,{id_sa});")
    kode, _ = minta(f"/api/admin/users/{id_u1}/access", t_a1, "POST",
                    {"stream_ids": [int(id_k_a1)]})
    uji("pengaturan ulang oleh admin diterima", kode == 200, f"HTTP {kode}")
    uji("pemberian super admin TETAP UTUH",
        sql(f"SELECT COUNT(*) FROM stream_permissions WHERE user_id={id_u1} "
            f"AND stream_id={id_k_sa} AND granted_by={id_sa};") == "1",
        "pemberian atasan terhapus oleh bawahan")

    print("\n=== kunci API disaring per pemilik ===")
    kode, isi = minta("/api/admin/api-keys", t_a1, "POST", {
        "camera_id": int(id_k_a1), "client_name": "td_klien",
        "custom_camera_name": "", "allowed_domain": "", "secret_pass": "",
        "is_active": True, "embed_timeout_seconds": 300,
        "click_to_play": True, "include_playback": False})
    # Kunci API menerbitkan tautan sematan publik yang melewati
    # login, jadi wewenangnya melampaui peran Admin.
    uji("admin DITOLAK membuat kunci API", kode == 403, f"HTTP {kode}")
    id_kunci_a1 = sql(f'SELECT id FROM api_keys WHERE owner_id={id_a1} LIMIT 1;')
    uji("tidak ada kunci yang tercipta",
        sql(f"SELECT COUNT(*) FROM api_keys WHERE owner_id={id_a1};") == "0")

    kode, _ = minta("/api/admin/api-keys", t_a1, "POST", {
        "camera_id": int(id_k_sa), "client_name": "td_klien2",
        "custom_camera_name": "", "allowed_domain": "", "secret_pass": "",
        "is_active": True, "embed_timeout_seconds": 300,
        "click_to_play": True, "include_playback": False})
    uji("kunci untuk kamera super admin ditolak", kode == 403, f"HTTP {kode}")

    # Kunci milik Super Admin, dipanggil langsung oleh Admin.
    sql(f'INSERT INTO api_keys (key_value,camera_id,client_name,is_active,'
        f'embed_timeout_seconds,click_to_play,include_playback,owner_id) '
        f'VALUES ("cctv_key_uji_td_sa",{id_k_sa},"td_klien_sa",1,300,1,0,{id_sa});')
    id_kunci_sa = sql('SELECT id FROM api_keys WHERE key_value="cctv_key_uji_td_sa";')

    kode, isi = minta("/api/admin/api-keys", t_a1)
    if kode == 200:
        ids = [str(k["id"]) for k in json.loads(isi)]
        uji("admin melihat kuncinya sendiri", id_kunci_a1 in ids)
        uji("admin TIDAK melihat kunci super admin", id_kunci_sa not in ids)

    kode, _ = minta(f"/api/admin/api-keys/{id_kunci_sa}", t_a1, "DELETE")
    uji("mencabut kunci super admin ditolak", kode == 403, f"HTTP {kode}")
    uji("kunci itu masih ada",
        sql(f'SELECT COUNT(*) FROM api_keys WHERE id={id_kunci_sa};') == "1")

    print("\n=== yang tetap tertutup bagi admin ===")
    for e in ("/api/admin/disks", "/api/admin/api-access-logs"):
        kode, _ = minta(e, t_a1)
        uji(f"admin ditolak di {e}", kode == 403, f"HTTP {kode}")

    print("\n=== user biasa tetap di luar ===")
    for e in ("/api/admin/users", "/api/admin/api-keys"):
        kode, _ = minta(e, t_u1)
        uji(f"user ditolak di {e}", kode == 403, f"HTTP {kode}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

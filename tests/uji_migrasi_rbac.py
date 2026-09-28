#!/usr/bin/env python3
"""Uji migrasi RBAC Tahap A tanpa membuat basis data baru.

`cctv_user` hanya berhak atas cctv_monitoring, jadi uji berjalan di dalam
basis data itu memakai tabel bersalinan berakhiran _ujirbac. Migrasi
dijalankan dengan nama tabel yang ditulis ulang ke salinan tersebut, sehingga
tabel sungguhan tidak pernah tersentuh. Seluruh salinan dihapus di akhir,
juga bila uji gagal di tengah.
"""
import os
import re
import subprocess
import sys

DB = "cctv_monitoring"
AKHIRAN = "_ujirbac"
SQL = "database/migrations/001_rbac.sql"

TABEL = ["users", "cctv_streams", "user_cctv_access", "api_keys",
         "stream_admin_grants", "stream_permissions"]

P = os.environ.get("DBPASS") or subprocess.run(
    ["grep", "-oP", r"DB_PASS=\K[^\"]+",
     "/etc/systemd/system/cctv-backend.service"],
    capture_output=True, text=True).stdout.strip()
if not P:
    sys.exit("GAGAL: password DB tidak ditemukan")

lolos = gagal = 0


def uji(nama, kondisi, info=""):
    global lolos, gagal
    if kondisi:
        lolos += 1
        print(f"  ok   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama} {info}")


def sql(perintah, boleh_gagal=False):
    p = subprocess.run(
        ["mariadb", "-u", "cctv_user", f"-p{P}", DB, "-N", "-B", "-e", perintah],
        capture_output=True, text=True)
    if p.returncode and not boleh_gagal:
        raise RuntimeError(f"SQL gagal: {perintah[:90]}\n{p.stderr}")
    return p.stdout.strip(), p.returncode


def bersihkan():
    # Urutan terbalik: anak dihapus sebelum induk agar kunci asing tidak
    # menahan penghapusan.
    sql("SET FOREIGN_KEY_CHECKS=0;", boleh_gagal=True)
    for t in reversed(TABEL):
        sql(f"DROP TABLE IF EXISTS `{t}{AKHIRAN}`;", boleh_gagal=True)
    sql("SET FOREIGN_KEY_CHECKS=1;", boleh_gagal=True)


def migrasi_untuk_salinan():
    """Ambil migrasi asli, arahkan setiap nama tabel ke salinannya."""
    teks = open(SQL).read()
    for t in TABEL:
        teks = re.sub(rf"\b{t}\b(?!{AKHIRAN})", f"{t}{AKHIRAN}", teks)
    # Nama kunci asing dan prosedur juga harus unik agar tak bentrok
    teks = re.sub(r"\bfk_(\w+)\b", rf"fk_\1{AKHIRAN}", teks)
    teks = teks.replace("tambah_kunci_asing", f"tambah_kunci_asing{AKHIRAN}")
    return teks


def jalankan_migrasi():
    p = subprocess.run(["mariadb", "-u", "cctv_user", f"-p{P}", DB],
                       input=migrasi_untuk_salinan(),
                       capture_output=True, text=True)
    return p.returncode, p.stderr


try:
    bersihkan()

    # ── Skema LAMA pada salinan ─────────────────────────────────────────────
    sql(f"""
    CREATE TABLE users{AKHIRAN} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'guest'
    ) ENGINE=InnoDB;
    CREATE TABLE cctv_streams{AKHIRAN} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      rtsp_url VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB;
    CREATE TABLE user_cctv_access{AKHIRAN} (
      user_id INT NOT NULL, stream_id INT NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, stream_id)
    ) ENGINE=InnoDB;
    CREATE TABLE api_keys{AKHIRAN} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      key_value VARCHAR(64) NOT NULL, camera_id INT
    ) ENGINE=InnoDB;
    """)

    # Data menyerupai produksi: 1 admin, 3 user, 1 guest, 4 kamera, 5 akses
    sql(f"""
    INSERT INTO users{AKHIRAN} (username, password_hash, role) VALUES
     ('nocmamura','x','admin'),('jatisrono','x','user'),
     ('kismantoro','x','user'),('ho','x','user'),('guest','x','guest');
    INSERT INTO cctv_streams{AKHIRAN} (name, rtsp_url) VALUES
     ('Kamera A','rtsp://a'),('Kamera B','rtsp://b'),
     ('Kamera C','rtsp://c'),('Kamera D','rtsp://d');
    INSERT INTO user_cctv_access{AKHIRAN} (user_id, stream_id) VALUES
     (2,1),(2,2),(3,3),(4,4),(5,1);
    INSERT INTO api_keys{AKHIRAN} (key_value, camera_id) VALUES
     ('kunci1',1),('kunci2',2);
    """)

    print("=== migrasi pertama ===")
    rc, err = jalankan_migrasi()
    uji("migrasi berhasil", rc == 0, err[-300:])

    peran, _ = sql(f"SELECT username, role FROM users{AKHIRAN} ORDER BY id;")
    pp = dict(b.split("\t") for b in peran.splitlines())

    uji("admin lama -> super_admin", pp.get("nocmamura") == "super_admin", pp)
    uji("user lama -> admin (3 akun)",
        [pp.get(u) for u in ("jatisrono", "kismantoro", "ho")] == ["admin"] * 3, pp)
    uji("guest tidak berubah", pp.get("guest") == "guest", pp)

    n, _ = sql(f"SELECT COUNT(*) FROM stream_permissions{AKHIRAN};")
    uji("5 akses lama dipindah", n == "5", f"ketemu {n}")

    n, _ = sql(f"SELECT COUNT(*) FROM user_cctv_access{AKHIRAN};")
    uji("tabel lama tetap utuh (cadangan)", n == "5", f"ketemu {n}")

    n, _ = sql(f"SELECT COUNT(*) FROM cctv_streams{AKHIRAN} WHERE owner_id IS NULL;")
    uji("semua kamera punya pemilik", n == "0", f"tanpa pemilik: {n}")

    n, _ = sql(f"SELECT COUNT(*) FROM cctv_streams{AKHIRAN} s "
               f"JOIN users{AKHIRAN} u ON u.id=s.owner_id WHERE u.role='super_admin';")
    uji("pemilik kamera = super_admin", n == "4", f"ketemu {n}")

    n, _ = sql(f"SELECT COUNT(*) FROM api_keys{AKHIRAN} WHERE owner_id IS NULL;")
    uji("API key punya pemilik", n == "0", f"tanpa pemilik: {n}")

    e, _ = sql(f"SHOW COLUMNS FROM users{AKHIRAN} LIKE 'role';")
    uji("ENUM empat peran", "super_admin" in e and "'user'" in e, e[:120])

    print("\n=== migrasi diulang (harus aman) ===")
    rc, err = jalankan_migrasi()
    uji("pengulangan tidak galat", rc == 0, err[-300:])

    peran2, _ = sql(f"SELECT username, role FROM users{AKHIRAN} ORDER BY id;")
    uji("peran TIDAK bergeser lagi", peran2 == peran,
        f"sebelum={peran!r} sesudah={peran2!r}")

    n, _ = sql(f"SELECT COUNT(*) FROM stream_permissions{AKHIRAN};")
    uji("izin tidak berlipat", n == "5", f"ketemu {n}")

    print("\n=== granted_by membedakan pemberi ===")
    sql(f"INSERT INTO stream_permissions{AKHIRAN} "
        f"(stream_id,user_id,can_view,granted_by) VALUES (2,5,1,2);")
    n, _ = sql(f"SELECT COUNT(*) FROM stream_permissions{AKHIRAN} "
               f"WHERE user_id=5 AND granted_by=2;")
    uji("pemberian oleh admin tercatat", n == "1", f"ketemu {n}")
    n, _ = sql(f"SELECT COUNT(*) FROM stream_permissions{AKHIRAN} "
               f"WHERE user_id=5 AND granted_by IS NULL;")
    uji("pemberian sistem terbedakan", n == "1", f"ketemu {n}")

    print("\n=== kunci asing menjaga keutuhan ===")
    _, rc2 = sql(f"INSERT INTO stream_permissions{AKHIRAN} "
                 f"(stream_id,user_id) VALUES (999,1);", boleh_gagal=True)
    uji("kamera tak ada ditolak", rc2 != 0)

    sql(f"DELETE FROM users{AKHIRAN} WHERE username='ho';")
    n, _ = sql(f"SELECT COUNT(*) FROM stream_permissions{AKHIRAN} WHERE user_id=4;")
    uji("izin ikut terhapus bersama penggunanya", n == "0", f"tersisa {n}")

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

#!/usr/bin/env python3
"""Uji skema dasar + migrasi menghasilkan struktur yang sama.

Instalasi dari NOL memuat database/schema.sql, lalu migrasi. Instalasi di
server LAMA hanya menjalankan migrasi. Keduanya harus berakhir pada struktur
yang sama; bila menyimpang, server baru dan server lama akan berperilaku
berbeda dan bug itu hanya muncul di salah satunya.

Uji memakai tabel bersalinan di basis data yang sama, sebab cctv_user tidak
berhak membuat basis data baru.
"""
import os
import re
import subprocess
import sys

DB = "cctv_monitoring"
AKH = "_ujiskema"
TABEL = ["users", "cctv_streams", "user_cctv_access", "api_keys",
         "api_key_cameras", "api_access_logs", "ad_config",
         "stream_admin_grants", "stream_permissions"]

P = subprocess.run(
    ["grep", "-oP", r"DB_PASS=\K[^\"]+",
     "/etc/systemd/system/cctv-backend.service"],
    capture_output=True, text=True).stdout.strip()

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
    return p.stdout.strip()


def salin(teks):
    """Arahkan seluruh nama tabel & constraint ke salinan uji."""
    for t in TABEL:
        teks = re.sub(rf"\b{t}\b(?!{AKH})", f"{t}{AKH}", teks)
    teks = re.sub(r"\bfk_(\w+)\b", rf"fk_\1{AKH}", teks)
    teks = re.sub(r"\bidx_(\w+)\b", rf"idx_\1{AKH}", teks)
    teks = teks.replace("tambah_kunci_asing", f"tambah_kunci_asing{AKH}")
    return teks


def jalankan(berkas):
    teks = salin(open(berkas).read())
    p = subprocess.run(["mariadb", "-u", "cctv_user", f"-p{P}", DB],
                       input=teks, capture_output=True, text=True)
    return p.returncode, p.stderr


def bersihkan():
    sql("SET FOREIGN_KEY_CHECKS=0;", True)
    for t in reversed(TABEL):
        sql(f"DROP TABLE IF EXISTS `{t}{AKH}`;", True)
    sql("SET FOREIGN_KEY_CHECKS=1;", True)


def struktur(tabel):
    """Kolom + tipe satu tabel, untuk dibandingkan."""
    baris = sql(f"SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS "
                f"WHERE TABLE_SCHEMA='{DB}' AND TABLE_NAME='{tabel}{AKH}' "
                f"ORDER BY COLUMN_NAME;")
    return baris


try:
    bersihkan()

    print("=== instalasi dari NOL: schema.sql + migrasi ===")
    rc, err = jalankan("database/schema.sql")
    uji("schema.sql berhasil", rc == 0, err[-300:])

    e = sql(f"SHOW COLUMNS FROM users{AKH} LIKE 'role';")
    uji("schema.sql sudah memuat 4 peran",
        "super_admin" in e,
        "instalasi baru akan menolak super_admin bila tidak")
    uji("schema.sql memuat parent_admin_id",
        "parent_admin_id" in sql(f"SHOW COLUMNS FROM users{AKH};"))

    rc, err = jalankan("database/migrations/001_rbac.sql")
    uji("migrasi jalan di atas schema baru", rc == 0, err[-300:])

    baru_users = struktur("users")
    baru_streams = struktur("cctv_streams")
    ada_sag = "stream_admin_grants" in sql("SHOW TABLES;")
    ada_sp = "stream_permissions" in sql("SHOW TABLES;")
    uji("stream_admin_grants terbentuk", ada_sag)
    uji("stream_permissions terbentuk", ada_sp)

    print("\n=== migrasi aman diulang di instalasi baru ===")
    rc, err = jalankan("database/migrations/001_rbac.sql")
    uji("pengulangan tidak galat", rc == 0, err[-300:])
    uji("struktur users tidak berubah", struktur("users") == baru_users)

    print("\n=== instalasi LAMA: skema tiga peran + migrasi ===")
    bersihkan()
    teks_lama = open("database/schema.sql").read()
    # Kembalikan ke bentuk sebelum Tahap B untuk meniru server lama.
    teks_lama = teks_lama.replace(
        "role ENUM('super_admin', 'admin', 'user', 'guest')",
        "role ENUM('admin', 'user', 'guest')")
    teks_lama = re.sub(r"\n *-- Admin yang menaungi[^\n]*\n *-- Super Admin\.\n"
                       r" *parent_admin_id INT NULL,", "", teks_lama)
    uji("tiruan skema lama benar-benar 3 peran",
        "super_admin" not in teks_lama.split("CREATE TABLE")[1])

    p = subprocess.run(["mariadb", "-u", "cctv_user", f"-p{P}", DB],
                       input=salin(teks_lama), capture_output=True, text=True)
    uji("skema lama termuat", p.returncode == 0, p.stderr[-300:])

    sql(f"INSERT INTO users{AKH} (username,password_hash,role) VALUES "
        f"('lama_admin','x','admin'),('lama_user','x','user');")

    rc, err = jalankan("database/migrations/001_rbac.sql")
    uji("migrasi jalan di atas skema lama", rc == 0, err[-300:])

    peran = dict(b.split("\t") for b in
                 sql(f"SELECT username,role FROM users{AKH};").splitlines())
    uji("admin lama -> super_admin", peran.get("lama_admin") == "super_admin",
        peran)
    uji("user lama -> admin", peran.get("lama_user") == "admin", peran)

    print("\n=== kedua jalur berakhir pada struktur yang sama ===")
    uji("struktur users sepadan", struktur("users") == baru_users,
        "server baru dan server lama harus identik")
    uji("struktur cctv_streams sepadan",
        struktur("cctv_streams") == baru_streams)

finally:
    bersihkan()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

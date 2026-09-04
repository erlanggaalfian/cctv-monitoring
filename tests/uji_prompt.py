#!/usr/bin/env python3
"""Uji baca_sandi dan keseragaman prompt install.sh.

baca_sandi diuji lewat PTY sungguhan (bukan pipa) karena jalur bertopeng
hanya aktif bila ada terminal. Yang diperiksa: nilai terbaca utuh, bintang
tampil sebanyak karakter, backspace menghapus, dan tanpa terminal tetap
berfungsi tanpa menggantung.
"""
import os
import pty
import re
import select
import subprocess
import time
import sys
import tempfile

SRC = "install.sh"
s = open(SRC).read()

m = re.search(r"^baca_sandi\(\) \{.*?^\}", s, re.S | re.M)
if not m:
    sys.exit("GAGAL: fungsi baca_sandi tidak ditemukan")
FUNGSI = m.group(0)

lolos = gagal = 0


def uji(nama, kondisi, info=""):
    global lolos, gagal
    if kondisi:
        lolos += 1
        print(f"  ok   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama} {info}")


def lewat_pty(skrip, ketikan, batas=10):
    """Jalankan skrip di terminal sungguhan, kirim ketikan, kembalikan keluaran."""
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as f:
        f.write(FUNGSI + "\n" + skrip)
        nama = f.name
    induk, anak = pty.openpty()
    try:
        p = subprocess.Popen(["bash", nama], stdin=anak, stdout=anak,
                             stderr=anak, close_fds=True)
        os.close(anak)
        # Beri bash waktu mematikan echo terminal sebelum ketikan dikirim.
        # Tanpa jeda, karakter masuk selagi echo masih aktif dan ter-echo
        # oleh terminal itu sendiri, bukan oleh fungsi yang sedang diuji.
        time.sleep(0.4)
        os.write(induk, ketikan)
        keluar = b""
        while True:
            r, _, _ = select.select([induk], [], [], batas)
            if not r:
                break
            try:
                potong = os.read(induk, 4096)
            except OSError:
                break
            if not potong:
                break
            keluar += potong
            if p.poll() is not None and not select.select([induk], [], [], 0.3)[0]:
                break
        p.wait(timeout=batas)
        return keluar.decode(errors="replace")
    finally:
        os.close(induk)
        os.unlink(nama)


print("=== baca_sandi di terminal sungguhan ===")

out = lewat_pty('baca_sandi X; echo "NILAI=[$X]"', b"rahasia\r")
uji("nilai terbaca utuh", "NILAI=[rahasia]" in out, repr(out[-120:]))
uji("sandi tidak tampil apa adanya",
    "rahasia" not in out.split("NILAI=")[0], repr(out[:80]))
uji("bintang sebanyak karakter",
    out.split("NILAI=")[0].count("*") == 7, repr(out[:80]))

out = lewat_pty('baca_sandi X; echo "NILAI=[$X]"', b"abc\x7f\x7fZ\r")
uji("backspace menghapus", "NILAI=[aZ]" in out, repr(out[-120:]))

out = lewat_pty('baca_sandi X; echo "NILAI=[$X]"', b"\r")
uji("enter langsung = kosong", "NILAI=[]" in out, repr(out[-120:]))

out = lewat_pty('baca_sandi X; echo "RC=$?"', b"aa\r")
uji("kembalian 0 saat berhasil", "RC=0" in out, repr(out[-120:]))

out = lewat_pty('baca_sandi X; echo "NILAI=[$X]"', b"p@ss w0rd!#\r")
uji("karakter khusus & spasi utuh", "NILAI=[p@ss w0rd!#]" in out, repr(out[-140:]))

print("\n=== tanpa terminal (pipa / CI) ===")


def lewat_pipa(skrip, masukan, batas=10):
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as f:
        f.write(FUNGSI + "\n" + skrip)
        nama = f.name
    try:
        p = subprocess.run(["bash", nama], input=masukan, capture_output=True,
                           text=True, timeout=batas)
        return p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        return "TIMEOUT"
    finally:
        os.unlink(nama)


out = lewat_pipa('baca_sandi X; echo "NILAI=[$X]"', "dari-pipa\n")
uji("pipa: nilai terbaca", "NILAI=[dari-pipa]" in out, repr(out[-120:]))
uji("pipa: tidak menggantung", out != "TIMEOUT", out)

out = lewat_pipa('baca_sandi X; echo "RC=$?"; echo "NILAI=[$X]"', "")
uji("EOF: kembalian bukan 0", "RC=1" in out, repr(out[-120:]))
uji("EOF: nilai kosong", "NILAI=[]" in out, repr(out[-120:]))
uji("EOF: tidak menggantung", out != "TIMEOUT", out)

print("\n=== keseragaman prompt ===")

harus_ada = [
    'read -p "  Database Host [localhost]: " DB_HOST',
    'read -p "  Database Port [3306]: " DB_PORT',
    'read -p "  Database Name [cctv_monitoring]: " DB_NAME',
    'read -p "  Database User [cctv_user]: " DB_USER',
    'echo -n "  Password User Database (kosong = auto generate): "',
    'echo -n "  Password root MariaDB/MySQL (kosongkan jika pakai auth socket tanpa password): "',
    'read -p "  Port HTTP [80]: " HTTP_PORT',
    'read -p "  Port HTTPS [443]: " HTTPS_PORT',
    'echo -n "  Password Admin Web (tidak boleh kosong): "',
]
for h in harus_ada:
    uji(f"ada: {h[:52]}", h in s)

uji("tidak ada lagi 'Masukkan ... [default:'",
    "[default:" not in s, [l for l in s.splitlines() if "[default:" in l][:2])

sisa = re.findall(r"read -s (\w+)", s)
uji("tidak ada read -s telanjang", not sisa, sisa)

n_baca = len(re.findall(r"\bbaca_sandi \w+", s))
uji("semua sandi lewat baca_sandi (5)", n_baca == 5, f"ketemu {n_baca}")

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

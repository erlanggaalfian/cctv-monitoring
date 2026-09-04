#!/usr/bin/env python3
"""Uji blok password root install.sh terhadap perilaku sungguhan.

Blok diambil apa adanya dari install.sh, hanya `mariadb` yang diganti tiruan
agar dapat dikendalikan. Yang diuji: password benar diterima, password salah
diulang, dan masukan habis (EOF) tidak membuat loop berputar selamanya.
"""
import re
import subprocess
import sys
import tempfile
import os

SRC = "install.sh"
s = open(SRC).read()

# Ambil blok Langkah 1 apa adanya
m = re.search(r"# Uji akses root MySQL\.\n.*?\n^fi$", s, re.S | re.M)
if not m:
    sys.exit("GAGAL: blok Langkah 1 tidak ditemukan")
blok1 = m.group(0)

# Ambil blok pasca-pasang apa adanya
m2 = re.search(
    r"# MariaDB kini pasti terpasang\..*?\necho -e \"  \$\{GREEN\}.*?siap\.\"",
    s, re.S)
if not m2:
    sys.exit("GAGAL: blok pasca-pasang tidak ditemukan")
blok2 = m2.group(0)

PROLOG = '''
RED=; GREEN=; YELLOW=; CYAN=; NC=
MARIADB_CMD="mariadb -u root"
# mariadb tiruan: hanya menerima -pbenar
mariadb() {
  for a in "$@"; do
    [ "$a" = "-pbenar" ] && return 0
  done
  [ "$SOKET_BEBAS" = "1" ] && return 0
  return 1
}
mariadb-admin() { return 0; }
systemctl() { return 0; }
command() { [ "$2" = "mariadb" ] && return "${KLIEN_ADA:-0}"; return 0; }
export -f mariadb 2>/dev/null || true
'''


def jalankan(blok, masukan, env, batas=15):
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as f:
        f.write(PROLOG + blok + '\necho "HASIL_ARG=[$DB_PASS_ARG]"\n')
        nama = f.name
    e = dict(os.environ, **env)
    try:
        p = subprocess.run(["bash", nama], input=masukan, capture_output=True,
                           text=True, timeout=batas, env=e)
        return p.returncode, p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        return "TIMEOUT", "loop tidak berhenti"
    finally:
        os.unlink(nama)


lolos = gagal = 0


def uji(nama, kondisi, info=""):
    global lolos, gagal
    if kondisi:
        lolos += 1
        print(f"  ok   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama} {info}")


print("=== Blok Langkah 1 (klien mariadb sudah ada) ===")

rc, out = jalankan(blok1, "benar\n", {"KLIEN_ADA": "0", "SOKET_BEBAS": "0"})
uji("password benar diterima", "HASIL_ARG=[-pbenar]" in out, out[-200:])
uji("tidak mengulang setelah benar", out.count("memerlukan password") == 1, out[-200:])

rc, out = jalankan(blok1, "salah\nsalah2\nbenar\n", {"KLIEN_ADA": "0", "SOKET_BEBAS": "0"})
uji("password salah diulang", out.count("salah, coba lagi") == 2, out[-300:])
uji("akhirnya menerima yang benar", "HASIL_ARG=[-pbenar]" in out, out[-200:])

rc, out = jalankan(blok1, "", {"KLIEN_ADA": "0", "SOKET_BEBAS": "0"})
uji("EOF tidak berputar selamanya", rc != "TIMEOUT", str(out)[-200:])
uji("EOF keluar dengan pesan", "Masukan tidak tersedia" in str(out), str(out)[-200:])

rc, out = jalankan(blok1, "", {"KLIEN_ADA": "0", "SOKET_BEBAS": "1"})
uji("root tanpa password: tak bertanya", "memerlukan password" not in out, out[-200:])
uji("root tanpa password: arg kosong", "HASIL_ARG=[]" in out, out[-200:])

print("\n=== Blok Langkah 1 (mariadb belum terpasang) ===")
rc, out = jalankan(blok1, "\n", {"KLIEN_ADA": "1", "SOKET_BEBAS": "0"})
uji("tetap menanyakan password", "belum terpasang" in out, out[-200:])
uji("kosong diterima sebagai sah", "HASIL_ARG=[]" in out, out[-200:])

rc, out = jalankan(blok1, "rahasia\n", {"KLIEN_ADA": "1", "SOKET_BEBAS": "0"})
uji("password dipakai bila diisi", "HASIL_ARG=[-prahasia]" in out, out[-200:])

print("\n=== Blok pasca-pasang MariaDB ===")
rc, out = jalankan(blok2, "benar\n", {"SOKET_BEBAS": "0"})
uji("password benar lolos", "HASIL_ARG=[-pbenar]" in out, out[-200:])

rc, out = jalankan(blok2, "", {"SOKET_BEBAS": "0"})
uji("EOF berhenti, tidak berputar", rc != "TIMEOUT", str(out)[-200:])
uji("EOF keluar dengan galat", rc == 1, f"rc={rc}")

rc, out = jalankan(blok2, "", {"SOKET_BEBAS": "1"})
uji("koneksi sudah baik: langsung lolos", "siap" in out, out[-200:])

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

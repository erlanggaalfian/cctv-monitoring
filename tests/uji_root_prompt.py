#!/usr/bin/env python3
"""Password root ditanyakan hanya bila koneksi root memang gagal.

Blok diambil apa adanya dari install.sh; hanya `mariadb` yang diganti tiruan
agar keadaannya dapat dikendalikan. Yang dijaga: mesin dengan auth socket
bebas password tidak ditanyai sama sekali, sedangkan root berpassword tetap
ditanyai sampai benar.
"""
import os
import pty
import re
import select
import subprocess
import sys
import tempfile
import time

SRC = "install.sh"
s = open(SRC).read()

# Blok memuat beberapa "fi", jadi batasnya header Langkah 2 berikutnya.
awal = s.index("# Koneksi root MariaDB diuji lebih dulu")
batas = s.index(">>> Langkah 2: Akun Administrator")
BLOK = s[awal:s.rindex("echo -e", awal, batas)].rstrip()

f2 = re.search(r"^baca_sandi\(\) \{.*?^\}", s, re.S | re.M)
if not f2:
    sys.exit("GAGAL: baca_sandi tidak ditemukan")
FUNGSI = f2.group(0)

PROLOG = '''
RED=; GREEN=; YELLOW=; CYAN=; NC=
MARIADB_CMD="mariadb -u root"
mariadb() {
  for a in "$@"; do [ "$a" = "-pbenar" ] && return 0; done
  [ "$SOKET_BEBAS" = "1" ] && return 0
  return 1
}
mariadb-admin() { return 0; }
systemctl() { return 0; }
command() { [ "$2" = "mariadb" ] && return "${KLIEN_ADA:-0}"; return 0; }
'''

lolos = gagal = 0


def uji(nama, kondisi, info=""):
    global lolos, gagal
    if kondisi:
        lolos += 1
        print(f"  ok   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama} {info}")


def jalankan(env, ketikan, batas=15):
    """Jalankan blok di terminal sungguhan (baca_sandi butuh PTY)."""
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as f:
        f.write(PROLOG + FUNGSI + "\n" + BLOK + '\necho "ARG=[$DB_PASS_ARG]"\n')
        nama = f.name
    e = dict(os.environ, **env)
    induk, anak = pty.openpty()
    try:
        p = subprocess.Popen(["bash", nama], stdin=anak, stdout=anak,
                             stderr=anak, close_fds=True, env=e)
        os.close(anak)
        for k in ketikan:
            time.sleep(0.4)
            os.write(induk, k)
        keluar = b""
        t0 = time.time()
        while time.time() - t0 < batas:
            r, _, _ = select.select([induk], [], [], 1)
            if not r:
                if p.poll() is not None:
                    break
                continue
            try:
                potong = os.read(induk, 4096)
            except OSError:
                break
            if not potong:
                break
            keluar += potong
            if p.poll() is not None and not select.select([induk], [], [], 0.3)[0]:
                break
        if p.poll() is None:
            p.kill()
            return "TIMEOUT", keluar.decode(errors="replace")
        return p.returncode, keluar.decode(errors="replace")
    finally:
        os.close(induk)
        os.unlink(nama)


PROMPT = "Password root MariaDB/MySQL:"

print("=== root lolos via auth socket (tidak boleh bertanya) ===")
rc, out = jalankan({"KLIEN_ADA": "0", "SOKET_BEBAS": "1"}, [])
uji("prompt TIDAK muncul", PROMPT not in out, repr(out[:200]))
uji("lanjut tanpa password", "ARG=[]" in out, repr(out[-150:]))
uji("memberi tahu koneksi siap", "siap" in out, repr(out[-200:]))
uji("tidak menggantung", rc != "TIMEOUT", str(out)[-150:])

print("\n=== root berpassword (harus bertanya) ===")
rc, out = jalankan({"KLIEN_ADA": "0", "SOKET_BEBAS": "0"}, [b"benar\r"])
uji("prompt muncul", PROMPT in out, repr(out[:250]))
uji("password dipakai", "ARG=[-pbenar]" in out, repr(out[-150:]))
uji("konfirmasi berhasil", "berhasil" in out, repr(out[-200:]))

print("\n=== password salah lalu benar ===")
rc, out = jalankan({"KLIEN_ADA": "0", "SOKET_BEBAS": "0"}, [b"salah\r", b"benar\r"])
uji("memberi tahu salah", "salah, coba lagi" in out, repr(out[-250:]))
uji("akhirnya diterima", "ARG=[-pbenar]" in out, repr(out[-150:]))
uji("bertanya dua kali", out.count(PROMPT) == 2, f"muncul {out.count(PROMPT)}x")

print("\n=== dikosongkan padahal password diperlukan ===")
rc, out = jalankan({"KLIEN_ADA": "0", "SOKET_BEBAS": "0"}, [b"\r", b"benar\r"])
uji("menolak kosong", "password diperlukan" in out, repr(out[-250:]))
uji("meminta lagi lalu diterima", "ARG=[-pbenar]" in out, repr(out[-150:]))

print("\n=== password tidak pernah benar ===")
rc, out = jalankan({"KLIEN_ADA": "0", "SOKET_BEBAS": "0"},
                   [b"x\r"] * 6, batas=30)
uji("berhenti, tidak berputar selamanya", rc != "TIMEOUT", str(out)[-150:])
uji("menyerah setelah 5 percobaan", "5 percobaan" in str(out), str(out)[-250:])
uji("keluar dengan galat", rc == 1, f"rc={rc}")

print("\n=== MariaDB belum terpasang ===")
rc, out = jalankan({"KLIEN_ADA": "1", "SOKET_BEBAS": "0"}, [])
uji("tidak bertanya di sini", PROMPT not in out, repr(out[:200]))
uji("memberi tahu akan dipasang", "belum terpasang" in out, repr(out[-200:]))
uji("arg kosong", "ARG=[]" in out, repr(out[-150:]))

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)

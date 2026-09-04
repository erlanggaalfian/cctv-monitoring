#!/usr/bin/env python3
"""Cari pemanggilan perintah yang tidak pernah didefinisikan di install.sh.

`warn` lolos ke produksi karena bash baru mengeluh saat baris itu benar-benar
dijalankan, dan cabang kegagalan Let's Encrypt jarang tersentuh. Pemeriksaan
ini menandai kata perintah yang bukan builtin, bukan fungsi yang dideklarasi
di skrip, dan tidak ada di PATH.

Isi heredoc dilewati: berkas konfigurasi Apache dan perintah SQL di dalamnya
bukan perintah shell.
"""
import re
import shutil
import sys

P = "install.sh"
baris_semua = open(P).read().splitlines()

fungsi = set(re.findall(r"^([a-zA-Z_][a-zA-Z0-9_-]*)\s*\(\)\s*\{",
                        "\n".join(baris_semua), re.M))

builtin = set("""
if then else elif fi for while do done case esac in function time select until
echo printf read cd pwd export local return break continue exit eval exec set
unset shift source trap wait test true false let declare typeset readonly
alias unalias getopts hash type ulimit umask jobs fg bg kill disown mapfile
command builtin enable help history logout pushd popd dirs suspend times
""".split())

kandidat = {}
penanda = None      # penanda heredoc yang sedang dinanti
dalam_kutip = False  # di tengah string kutip ganda berbaris banyak

for n, baris in enumerate(baris_semua, 1):
    if penanda is not None:
        if baris.strip() == penanda:
            penanda = None
        continue

    # Kode bahasa lain di dalam `python3 -c "..."` bukan perintah shell.
    if dalam_kutip:
        if baris.count('"') % 2 == 1:
            dalam_kutip = False
        continue
    if baris.count('"') % 2 == 1 and "<<" not in baris:
        dalam_kutip = True

    b = baris.strip()
    if not b or b.startswith("#"):
        continue

    # Awal heredoc: <<EOT, <<"EOF", <<-'X'
    m = re.search(r"<<-?\s*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?", baris)
    if m:
        penanda = m.group(1)
        # baris pembuka tetap diperiksa di bawah

    m = re.match(r"^([a-zA-Z_][a-zA-Z0-9_.-]*)\s", b)
    if not m:
        continue
    kata = m.group(1)
    if kata in builtin or kata in fungsi:
        continue
    kandidat.setdefault(kata, []).append(n)

hilang = {k: v for k, v in kandidat.items() if shutil.which(k) is None}

if hilang:
    print("PERINTAH TIDAK DITEMUKAN:")
    for kata, baris in sorted(hilang.items()):
        print(f"  {kata}  -> baris {', '.join(map(str, baris))}")
    sys.exit(1)

print(f"ok: {len(kandidat)} perintah dipakai, semuanya terdefinisi atau ada di PATH")
print(f"    fungsi lokal: {', '.join(sorted(fungsi)) or '(tidak ada)'}")

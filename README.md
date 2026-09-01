# Mamura Stream

Sistem pemantauan CCTV: streaming langsung WebRTC, rekaman, pemutaran ulang,
peta lokasi kamera, dan embed untuk pihak ketiga.

Produksi: `https://cctv.netbackup.web.id` — versi 2.0.0

## Susunan

```
backend/     FastAPI (:8000) — API, autentikasi, rekaman, kunci embed
frontend/    PHP + Tailwind — antarmuka pengguna
database/    Skema dan migrasi
system/      Salinan config /etc (arsip rujukan) — lihat system/README.md
install.sh   Pasang baru
update.sh    Perbarui instalasi yang ada
uninstall.sh Copot
```

## Pemasangan

```bash
sudo bash install.sh
```

Satu perintah, tanpa langkah manual. Skrip akan:

1. Memasang Apache, PHP 8.2, MariaDB, ffmpeg
2. Mengunduh dan memasang **MediaMTX** + layanan systemd-nya
3. Membuat basis data dan pengguna admin
4. Mengonfigurasi vhost Apache dan SSL
5. Mendeteksi IP publik untuk WebRTC di belakang NAT

Ditanyakan saat berjalan: domain, mode SSL, sandi admin, kredensial database.
`JWT_SECRET` dibuat acak otomatis.

### Penyimpanan rekaman

Bawaan: `/mnt/cctv-storage`, dengan rekaman di `/mnt/cctv-storage/recordings/`.

Skrip **tidak** memasang atau memformat disk — siapkan penyimpanan lebih dulu,
lalu pasang di titik yang diinginkan. Contoh dengan disk terpisah:

```bash
mkfs.ext4 /dev/sdb1
mkdir -p /mnt/cctv-storage
mount /dev/sdb1 /mnt/cctv-storage
echo '/dev/sdb1  /mnt/cctv-storage  ext4  defaults  0  2' >> /etc/fstab
```

Untuk lokasi lain, timpa saat memasang:

```bash
RECORDINGS_DIR=/data/cctv sudo -E bash install.sh
```

Nilai itu dipakai untuk izin folder dan `ReadWritePaths=` pada layanan
MediaMTX. Kalau folder belum ada saat instalasi, rekaman tidak akan berjalan
sampai folder dibuat dan `mediamtx` dimulai ulang.

Rekaman **tidak** dihapus oleh `uninstall.sh` — bersihkan manual bila perlu.

## Pembaruan

```bash
sudo bash update.sh
```

Mencadangkan database lebih dulu, lalu menyalin kode baru. `venv`,
`static/` (poster kamera & iklan), dan basis data dipertahankan.

Berkas aplikasi **tidak** dicadangkan otomatis — hanya database.

## Persyaratan

- Debian 12 atau turunannya (PHP 8.2 dari repo bawaan)
- Akses root
- Port terbuka: 80, 443, 8554 (RTSP), **UDP 8189** (video WebRTC)

Port sinyal WebRTC (8889) sengaja diikat ke localhost dan diakses lewat
proxy Apache `/media/`. UDP 8189 harus tetap terbuka — itu jalur video
sesungguhnya, dan menutupnya mematikan semua siaran.

Di server dengan PHP selain 8.2, sesuaikan `INSTALL_PKGS` di `install.sh`.

## Komponen

| Bagian | Keterangan |
|---|---|
| MediaMTX | Server media — RTSP masuk, WebRTC keluar, rekaman fMP4 |
| FastAPI | Backend `:8000`, di balik proxy Apache `/api/` |
| Apache | Melayani frontend, mem-proxy `/api/` dan `/media/` |
| MariaDB | Basis data `cctv_monitoring` |

Rahasia (`DB_PASS`, `JWT_SECRET`) disimpan di `Environment=` pada unit
systemd `cctv-backend.service`, bukan di dalam kode.

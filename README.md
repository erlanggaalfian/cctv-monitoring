# Mamura Stream

Sistem pemantauan CCTV berbasis web: siaran langsung WebRTC, rekaman ke disk,
pemutaran ulang berbasis linimasa, peta lokasi kamera, dan penyematan (embed)
untuk pihak ketiga.

Versi: **2.0.0**

---

## Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Kebutuhan Sistem](#kebutuhan-sistem)
- [Pemasangan](#pemasangan)
- [Penyimpanan Rekaman](#penyimpanan-rekaman)
- [Port dan Jaringan](#port-dan-jaringan)
- [Pembaruan](#pembaruan)
- [Pencopotan](#pencopotan)
- [Susunan Berkas](#susunan-berkas)
- [Basis Data](#basis-data)
- [API](#api)
- [Penyematan untuk Pihak Ketiga](#penyematan-untuk-pihak-ketiga)
- [Pemecahan Masalah](#pemecahan-masalah)
- [Catatan Keamanan](#catatan-keamanan)

---

## Gambaran Umum

Kamera IP berbicara RTSP, tetapi peramban tidak bisa memutar RTSP. Mamura Stream
menjembatani keduanya: MediaMTX menarik aliran RTSP dari kamera dan menyajikannya
ulang sebagai WebRTC, sehingga video tampil di peramban tanpa pemasang tambahan
dan dengan jeda rendah.

Di atas jembatan itu ada portal web dengan autentikasi, hak akses per kamera,
rekaman terjadwal, dan kunci API untuk mitra yang ingin menampilkan kamera
tertentu di situs mereka sendiri.

---

## Fitur

**Pemantauan**
- Siaran langsung WebRTC dengan jeda rendah
- Tata letak kisi yang dapat diatur (monitor kustom)
- Gambar pratinjau (poster) otomatis dari setiap kamera
- Sambung ulang aliran tanpa memuat ulang halaman

**Rekaman dan pemutaran ulang**
- Rekaman berkelanjutan ke disk, diaktifkan per kamera
- Linimasa dengan penggeser: lompat ke menit mana pun
- Unduh potongan rekaman
- Masa simpan (retensi) dapat diatur per kamera

**Peta**
- Letak kamera di peta dengan penanda yang dapat digeser
- Panel geser (sheet) yang ramah layar sentuh

**Administrasi**
- Tiga peran: `admin`, `user`, `guest`
- Hak akses kamera per pengguna
- Pemindaian kamera: pratinjau RTSP sebelum kamera disimpan
- Pemantauan kapasitas disk
- Pengaturan iklan/banner
- Catatan akses API

**Penyematan**
- Kunci API per kamera
- Penguncian domain, kata sandi opsional, batas waktu sesi
- Mode klik-untuk-putar
- Pencatatan setiap akses

**Antarmuka**
- Responsif: ponsel, tablet, dan desktop
- Mode gelap
- Sasaran sentuh minimal 44 piksel

---

## Arsitektur

```
Kamera IP (RTSP)
      |
      v
  MediaMTX  ──────────────►  WebRTC (video ke peramban)
      |                            ▲
      | rekam ke disk              │ lewat proxy Apache /media/
      v                            │
  /mnt/cctv-storage           ┌────┴─────┐
                              │  Apache  │  :80 / :443
                              └────┬─────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │                             │
              PHP (frontend)              FastAPI (backend)
              antarmuka web               :8000, lokal saja
                                                  │
                                                  v
                                             MariaDB
```

Semua lalu lintas masuk lewat Apache. Backend FastAPI dan MediaMTX hanya
mendengarkan di `127.0.0.1` — tidak terjangkau langsung dari luar.

**Komponen**

| Bagian | Teknologi |
|---|---|
| Server web | Apache 2 + PHP 8.2 |
| Antarmuka | PHP, Tailwind CSS, JavaScript |
| Backend | Python 3, FastAPI, Uvicorn |
| Basis data | MariaDB |
| Media | MediaMTX, ffmpeg |

---

## Kebutuhan Sistem

**Wajib**
- Debian 12 (diuji) atau turunan Ubuntu yang setara
- Akses `root`
- Arsitektur `x86_64`, `aarch64`, atau `armv7l`
- Koneksi internet saat pemasangan (mengunduh paket dan MediaMTX)

**Disarankan**
- Disk terpisah untuk rekaman
- IP publik jika kamera akan diakses dari luar jaringan
- Nama domain jika ingin memakai HTTPS Let's Encrypt

**Catatan versi PHP**

Skrip pemasang meminta paket `php8.2` secara eksplisit. Ini tersedia di
Debian 12. Pada distribusi dengan versi PHP bawaan berbeda — misalnya
Ubuntu 22.04 (PHP 8.1) atau Debian 13 (PHP 8.4) — pemasangan paket akan
gagal. Sunting variabel `INSTALL_PKGS` di `install.sh` agar cocok dengan
versi PHP distribusi Anda, atau tambahkan repositori pihak ketiga
(misalnya `ppa:ondrej/php`).

---

## Pemasangan

```bash
git clone https://github.com/erlanggaalfian/cctv-monitoring.git
cd cctv-monitoring
sudo bash install.sh
```

Satu perintah. Skrip memasang seluruh kebutuhan, termasuk MediaMTX yang
diunduh langsung dari rilis resmi.

### Yang ditanyakan saat pemasangan

Pemasang bersifat interaktif dan menanyakan:

1. **Basis data** — host, port, nama basis data, nama pengguna, kata sandi
2. **Admin web** — nama pengguna dan kata sandi untuk masuk pertama kali
3. **Domain** — nama domain atau alamat IP server
4. **Port** — HTTP (bawaan 80) dan HTTPS (bawaan 443)
5. **SSL** — empat pilihan:
   - Let's Encrypt (otomatis, butuh domain yang mengarah ke server)
   - Sertifikat mandiri (self-signed)
   - Sertifikat sendiri (Anda menyediakan berkas `.crt` dan `.key`)
   - Tanpa SSL
6. **IP publik** — dideteksi otomatis, dapat diubah manual

Semua jawaban ditampilkan ulang untuk dikonfirmasi sebelum ada perubahan
yang ditulis ke sistem.

### Yang dipasang

- **Paket sistem** — Apache, PHP 8.2, MariaDB, ffmpeg, OpenSSL, Python 3
- **MediaMTX** — diunduh dari rilis GitHub, dipasang sebagai layanan systemd
  dengan pengguna sistem tersendiri
- **Lingkungan Python** — `venv` terpisah, seluruh isi `requirements.txt`
- **Basis data** — skema dibuat, akun admin ditulis dengan kata sandi ter-hash
- **Layanan** — `mariadb`, `cctv-backend`, dan `mediamtx` diaktifkan otomatis

`JWT_SECRET` dibuat baru dan acak pada setiap pemasangan. Kata sandi admin
disimpan sebagai hash bcrypt, tidak pernah dalam bentuk teks biasa.

### Setelah selesai

Ringkasan akhir menampilkan URL portal dan kredensial admin. Buka URL
tersebut dan masuk.

Jika MediaMTX gagal dipasang — misalnya karena internet terputus di tengah
proses — pemasangan tetap dilanjutkan sampai selesai dan ringkasan akhir
memuat peringatan jelas: portal berjalan, tetapi belum ada video, disertai
cara memasang MediaMTX secara manual.

---

## Penyimpanan Rekaman

Lokasi bawaan rekaman adalah `/mnt/cctv-storage`. Pemasang akan membuat
folder ini jika belum ada.

### Menggunakan disk terpisah

Rekaman video tumbuh cepat. Disk khusus sangat disarankan.

Siapkan disk **sebelum** menjalankan `install.sh`:

```bash
# 1. Kenali disk yang akan dipakai
lsblk

# 2. Format (PERINGATAN: menghapus seluruh isi disk)
sudo mkfs.ext4 /dev/sdb1

# 3. Kaitkan
sudo mkdir -p /mnt/cctv-storage
sudo mount /dev/sdb1 /mnt/cctv-storage

# 4. Buat permanen agar tetap terkait setelah nyala ulang
echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1) /mnt/cctv-storage ext4 defaults 0 2" \
  | sudo tee -a /etc/fstab

# 5. Pastikan berhasil
sudo mount -a && df -h /mnt/cctv-storage
```

Langkah 3 pada perintah di atas menghapus seluruh isi disk yang dipilih.
Pastikan nama perangkat sudah benar sebelum menjalankannya.

### Mengubah lokasi rekaman

Jika ingin memakai lokasi selain `/mnt/cctv-storage`, gunakan variabel
`RECORDINGS_DIR`:

```bash
sudo RECORDINGS_DIR=/data/cctv bash install.sh
```

Variabel yang sama berlaku pada `update.sh`. Gunakan nilai yang konsisten
di kedua skrip agar rekaman lama tetap terbaca.

### Struktur folder

```
/mnt/cctv-storage/
└── recordings/
    └── stream_<id>/
        └── <berkas rekaman>
```

Masa simpan diatur per kamera lewat konsol admin, bukan dari berkas
konfigurasi.

---

## Port dan Jaringan

| Port | Protokol | Cakupan | Keterangan |
|---|---|---|---|
| 80 | TCP | Publik | HTTP, dialihkan ke HTTPS bila SSL aktif |
| 443 | TCP | Publik | HTTPS |
| **8189** | **UDP** | **Publik** | **Jalur video WebRTC — wajib terbuka** |
| 8000 | TCP | Lokal | Backend FastAPI |
| 8889 | TCP | Lokal | WebRTC MediaMTX, diakses lewat proxy Apache |
| 8554 | TCP | Lokal | RTSP MediaMTX |

**UDP 8189 sering terlewat.** Port ini membawa data video WebRTC yang
sesungguhnya. Jika diblokir, halaman portal tetap terbuka dan daftar kamera
tetap muncul, tetapi video tidak akan pernah tampil. Gejalanya menyesatkan:
semuanya terlihat normal kecuali gambarnya.

Pada jaringan ber-NAT, teruskan UDP 8189 ke server.

---

## Pembaruan

```bash
cd cctv-monitoring
git pull
sudo bash update.sh
```

Skrip menanyakan tiga hal: nomor versi, konfirmasi lanjut, dan apakah basis
data perlu dicadangkan lebih dulu. Jawab `y` pada pencadangan kecuali Anda
punya alasan kuat untuk melewatinya.

**Yang dipertahankan saat pembaruan**
- Basis data dan seluruh isinya
- `backend/venv/`
- `backend/static/` — poster kamera dan gambar iklan
- Berkas konfigurasi yang sudah ada

**Batas yang perlu diketahui:** `update.sh` mencadangkan basis data, bukan
berkas aplikasi. Untuk perubahan besar, salin dulu direktori produksi secara
manual.

---

## Pencopotan

```bash
sudo bash uninstall.sh
```

Skrip meminta tiga konfirmasi terpisah: konfirmasi umum, pencadangan basis
data, lalu apakah basis data dan penggunanya ikut dihapus. Bawaan untuk
penghapusan basis data adalah **tidak**.

**Rekaman di `/mnt/cctv-storage` tidak disentuh.** Ini disengaja — rekaman
sering kali justru bagian yang paling berharga. Hapus manual jika memang
tidak diperlukan lagi.

Skrip menebak lokasi pemasangan dari `WorkingDirectory` pada berkas layanan
systemd, dan jika tidak ditemukan, memindai `/var/www/`. Pada server yang
memuat banyak aplikasi, periksa lokasi yang ditampilkan sebelum menyetujui
penghapusan.

---

## Susunan Berkas

```
cctv-monitoring/
├── install.sh              Pemasang lengkap, termasuk MediaMTX
├── update.sh               Pembaru versi
├── uninstall.sh            Pencopot
├── VERSION                 Nomor versi
├── README.md               Berkas ini
│
├── backend/
│   ├── main.py             API FastAPI
│   ├── requirements.txt    Dependensi Python
│   └── static/             Poster kamera, gambar iklan
│
├── frontend/
│   ├── index.php           Titik masuk portal
│   ├── embed.php           Halaman sematan untuk pihak ketiga
│   ├── header.php          Kerangka bersama dan konfigurasi Tailwind
│   ├── .htaccess           Aturan Apache
│   ├── views/              Halaman: monitor, playback, peta, admin
│   └── assets/             CSS dan JavaScript
│
├── database/
│   └── schema.sql          Skema basis data
│
└── system/                 Salinan konfigurasi /etc sebagai rujukan
    ├── etc/mediamtx/
    ├── etc/systemd/
    └── etc/apache2/
```

Folder `system/` hanya arsip rujukan. `install.sh` menuliskan konfigurasinya
sendiri dan tidak membaca folder ini.

---

## Basis Data

Lima tabel:

| Tabel | Isi |
|---|---|
| `users` | Akun dan peran (`admin`, `user`, `guest`) |
| `cctv_streams` | Kamera: URL RTSP, nama, grup, koordinat peta |
| `user_cctv_access` | Kamera mana yang boleh dilihat pengguna mana |
| `api_keys` | Kunci sematan, penguncian domain, aturan rekaman |
| `ad_config` | Pengaturan banner iklan |

Seluruh perintah pembuatan tabel memakai `IF NOT EXISTS`, sehingga
`install.sh` aman dijalankan ulang pada basis data yang sudah terisi.

---

## API

37 endpoint. Autentikasi memakai JWT, kecuali endpoint publik.

**Autentikasi**
```
POST /api/auth/login          Masuk, mengembalikan JWT
POST /api/auth/guest          Sesi tamu
```

**Kamera**
```
GET  /api/streams                        Daftar kamera yang boleh diakses
POST /api/streams/{id}/reconnect         Paksa sambung ulang
GET  /api/posters/stream_{id}.jpg        Gambar pratinjau
```

**Rekaman**
```
GET /api/recordings/cameras              Kamera dengan rekaman aktif
GET /api/recordings/{id}/dates           Tanggal yang tersedia
GET /api/recordings/{id}/segments        Potongan rekaman
GET /api/recordings/{id}/timeline        Data linimasa
GET /api/recordings/{id}/playback-url    URL pemutaran
GET /api/recordings/{id}/stream          Aliran rekaman
GET /api/recordings/{id}/file            Unduh berkas
```

**Administrasi** (khusus peran `admin`)
```
GET|POST|PUT  /api/admin/users           Kelola pengguna
POST          /api/admin/users/{id}/access   Atur hak akses kamera
GET|POST|PUT  /api/admin/streams         Kelola kamera
GET|POST|PUT  /api/admin/api-keys        Kelola kunci sematan
POST          /api/admin/scan            Pindai kamera
POST          /api/admin/scan/preview    Pratinjau RTSP sebelum disimpan
GET           /api/admin/disks           Kapasitas disk
GET           /api/admin/api-access-logs/summary   Ringkasan akses API
GET|POST      /api/admin/ad-config       Pengaturan iklan
```

**Publik**
```
GET /api/health                Status layanan
GET /api/external/stream       Akses sematan dengan kunci API
```

---

## Penyematan untuk Pihak Ketiga

Mitra dapat menampilkan satu kamera di situs mereka lewat `iframe`, tanpa
akun portal.

**Langkah**

1. Konsol admin → API Keys → buat kunci baru
2. Pilih kamera, isi nama klien, dan tentukan domain yang diizinkan
3. Berikan potongan kode berikut kepada mitra:

```html
<iframe src="https://domain-anda/embed.php?key=KUNCI_API"
        width="640" height="360"
        allowfullscreen>
</iframe>
```

**Pengaman yang tersedia per kunci**

| Pengaman | Fungsi |
|---|---|
| Penguncian domain | Kunci hanya berfungsi pada domain terdaftar |
| Kata sandi | Tambahkan `&pass=SANDI` pada URL |
| Batas waktu | Sesi berakhir otomatis |
| Klik untuk putar | Video baru berjalan setelah pengunjung menekannya |
| Catatan akses | Setiap pemakaian dicatat: IP, perujuk, peramban |

Kunci dapat dinonaktifkan kapan saja lewat konsol admin.

---

## Pemecahan Masalah

**Portal terbuka, kamera terdaftar, tetapi video tidak muncul**

Hampir selalu UDP 8189. Periksa:
```bash
sudo systemctl status mediamtx
sudo ss -ulnp | grep 8189
```
Jika layanan berjalan tetapi video tetap kosong, periksa penerusan port pada
router dan aturan firewall.

**Portal tidak dapat dibuka sama sekali**
```bash
sudo systemctl status apache2
sudo apache2ctl configtest
sudo tail -50 /var/log/apache2/error.log
```

**Halaman terbuka tetapi API gagal**
```bash
sudo systemctl status cctv-backend
sudo journalctl -u cctv-backend -n 50 --no-pager
```

**Rekaman tidak tersimpan**
```bash
df -h /mnt/cctv-storage      # kapasitas masih ada?
mount | grep cctv-storage    # disk benar-benar terkait?
```
Pastikan juga rekaman sudah diaktifkan untuk kamera tersebut di konsol admin
— pengaturannya per kamera, tidak menyeluruh.

**Pemasangan gagal pada paket PHP**

Distribusi Anda kemungkinan tidak menyediakan PHP 8.2. Lihat catatan pada
bagian [Kebutuhan Sistem](#kebutuhan-sistem).

**Memeriksa status seluruh layanan**
```bash
sudo systemctl status apache2 mariadb cctv-backend mediamtx
```

---

## Catatan Keamanan

**Yang sudah diterapkan**
- Kata sandi disimpan sebagai hash bcrypt
- `JWT_SECRET` dibuat acak pada setiap pemasangan
- Backend dan MediaMTX hanya mendengarkan di `127.0.0.1`
- Kunci sematan mendukung penguncian domain dan kata sandi
- Seluruh akses API tercatat

**Yang belum diterapkan**
- Tidak ada pembatasan laju permintaan (rate limiting) pada endpoint publik.
  Jika portal dibuka ke internet luas, tambahkan pembatasan di tingkat
  Apache atau di depan server.
- Aliran video tidak memverifikasi ulang kunci API setelah URL WebRTC
  diberikan. Selama masa sesi, URL tersebut dapat dipakai ulang.

**Sebelum menjadikan repositori ini publik**

Folder `system/` memuat salinan konfigurasi produksi yang dapat berisi kata
sandi basis data, `JWT_SECRET`, dan kredensial RTSP kamera. Bersihkan berkas
tersebut dan ganti seluruh kredensial yang pernah tercatat sebelum
repositori dibuka untuk umum.

---

## Lisensi

Hak cipta pemilik proyek. Semua hak dilindungi.

# Berkas Sistem (system/)

Config yang dipakai Mamura Stream tapi letaknya di luar folder aplikasi.
Disalin ke sini 2026-09-02 supaya semua bagian sistem ada di satu tempat.

**Ini salinan, bukan sumber yang dipakai berjalan.** Sistem tetap membaca
dari `/etc`. Kalau mengubah di sini, salin balik lalu muat ulang layanan.

## Isi

| Berkas | Asal | Fungsi |
|---|---|---|
| `etc/mediamtx/mediamtx.yml` | `/etc/mediamtx/` | Server media: RTSP, WebRTC, rekaman per kamera |
| `etc/mediamtx/mediamtx.yml.pre-bind` | idem | Cadangan sebelum port 8889 diikat ke localhost |
| `etc/systemd/cctv-backend.service` | `/etc/systemd/system/` | Layanan FastAPI :8000 — **berisi rahasia, izin 600** |
| `etc/systemd/cctv-backend.service.example` | — | Versi aman dibagikan, rahasia diganti placeholder |
| `etc/systemd/mediamtx.service` | `/etc/systemd/system/` | Layanan MediaMTX |
| `etc/apache2/cctv.netbackup.web.id.conf` | `/etc/apache2/sites-available/` | Vhost + proxy `/api/` dan `/media/` |

## Rahasia

`cctv-backend.service` memuat `DB_PASS` dan `JWT_SECRET` mentah di baris
`Environment=`. Berkas itu diberi izin `600` (hanya root). Kalau folder ini
dimasukkan ke Git, tambahkan ke `.gitignore` dan bagikan `.example` saja.

## Menerapkan balik

```bash
cp system/etc/mediamtx/mediamtx.yml       /etc/mediamtx/
cp system/etc/systemd/*.service           /etc/systemd/system/
cp system/etc/apache2/*.conf              /etc/apache2/sites-available/
systemctl daemon-reload
systemctl restart mediamtx cctv-backend
apache2ctl configtest && systemctl reload apache2
```

## Catatan port

`webrtcAddress` diikat ke `127.0.0.1:8889` (2026-09-02). Apache mem-proxy
`/media/` ke sana, jadi akses sah tetap jalan sementara jalan pintas
langsung ke MediaMTX tertutup.

**UDP 8189 harus tetap terbuka** — itu jalur video WebRTC yang sebenarnya,
dan server ada di belakang NAT (`webrtcICEHostNAT1To1IPs: 103.210.52.66`).
Menutupnya mematikan semua video.

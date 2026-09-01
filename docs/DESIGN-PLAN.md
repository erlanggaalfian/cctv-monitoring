# Rencana Perbaikan Desain — Mamura Stream

Disusun 2026-09-02. Dikerjakan bertahap, satu tahap per sesi kerja.
Aturan: tiap tahap harus lulus gerbang uji sebelum tahap berikutnya dimulai.

## Prinsip

1. Memusatkan, bukan mendesain ulang. Semua fungsi tetap; yang berubah cara style ditulis.
2. Identitas biru-oranye Mamura dipertahankan.
3. Desktop dan mobile dikerjakan bersamaan di tiap tahap, bukan mobile belakangan.
4. Tidak ada tahap yang menyentuh backend, database, atau MediaMTX.

## Gerbang uji (wajib tiap tahap)

- `php -l` bersih untuk tiap file .php yang disentuh
- `node --check` untuk tiap file .js yang disentuh
- HTTP 200 di 5 halaman: monitor, admin, custom, maps, playback
- Cek lebar 390px / 768px / 1440px
- Backup file sebelum diubah; kalau gerbang gagal, kembalikan lalu laporkan

---

## TAHAP 1 — Fondasi token

Risiko: sangat kecil. Tidak ada file view disentuh, hanya menambah token di CSS.

- Skala teks 6 langkah: 11 / 12 / 13 / 14 / 16 / 20px
- Radius 3 langkah: 8 / 12 / 16px (+ full untuk pil dan avatar)
- Spasi kelipatan 4px
- Tangga z-index bernama: base 0, sticky 30, nav 40, overlay 100, toast 200
- Breakpoint disederhanakan jadi 3: <640 HP, 640-1024 tablet, >1024 desktop
- Token bayangan, easing, dan durasi transisi

Hasil: token siap pakai. Tampilan belum berubah.

## TAHAP 2 — Komponen dasar

Risiko: kecil. Menambah kelas baru, belum mencabut yang lama.

- `.ms-btn` (primary / ghost / danger) — tinggi sentuh minimal 44px di mobile
- `.ms-card`, `.ms-badge`, `.ms-field`, `.ms-table`
- `.ms-modal` — satu kelas menggantikan 10 salinan
- Mobile: modal jadi sheet dari bawah, hormat safe-area
- Skeleton saat memuat

Hasil: pustaka komponen ada. Tampilan belum berubah.

## TAHAP 3 — Modal disatukan

Risiko: sedang. 10 modal dipindah ke `.ms-modal`.

- 9 modal di modals.php + 1 di playback.php + 1 di webrtc.js
- Menyeragamkan backdrop yang sekarang menyimpang (/60, /70, white/15)
- Semua modal dipastikan lahir di luar app-shell (hindari bug containing block)
- Uji tiap modal benar-benar dibuka satu per satu

## TAHAP 4 — System Admin

Risiko: sedang. Halaman terpadat, 29 panel-card, 5 tabel.

- Desktop: tetap tabel, dirapikan pakai .ms-table
- Mobile: tiap baris tabel jadi kartu, hilangkan geser samping
- Toolbar dan filter dibuat konsisten
- Pagination dirapikan

## TAHAP 5 — Semua Kamera dan Monitor

Risiko: sedang. webrtc.js 3619 baris, hati-hati.

- Desktop: grid 2x2 / 3x3 / 4x4 tetap
- Mobile: dipaksa 1 kolom, 2 kolom saat landscape
- Toolbar jadi baris gulir horizontal di HP
- Telemetri tetap monospace, nama kamera tetap sans

## TAHAP 6 — Playback

Risiko: kecil. Baru ditulis ulang, strukturnya masih bersih.

- Desktop: grid poster + modal tengah
- Mobile: modal jadi sheet, timeline ditinggikan agar bisa di-scrub jari
- Tombol -30s / Play / +30s minimal 44px

## TAHAP 7 — Peta

Risiko: kecil.

- Desktop: peta + sidebar kiri
- Mobile: pola sekarang dipertahankan, daftar kamera bisa ditarik naik-turun
- maps.php sekarang 0 kelas responsif, perlu paling banyak tambahan

## TAHAP 8 — Bersih-bersih warna

Risiko: kecil per langkah, tapi menyentuh banyak baris. Dikerjakan per file.

- 1009 warna Tailwind mentah dipetakan ke token
- 543 kelas dark: dihapus, dark mode jadi urusan token
- 209 ukuran teks arbitrer dinaikkan ke skala; text-[8px] naik ke 11px
- Radius 5 sistem disatukan jadi 3

Hasil akhir: ganti tema cukup dari satu blok token.

---

## Tidak boleh disederhanakan

- Fokus keyboard (:focus-visible) di semua kontrol
- prefers-reduced-motion
- Kontras teks minimal 4.5:1
- Target sentuh minimal 44px di mobile

---

## Status pelaksanaan (2026-09-02)

Semua 8 tahap SELESAI dan terpasang di produksi (v2.0.0).

Temuan penting saat tahap 8: palet slate (526 dari 1009 pemakaian)
ternyata SUDAH dipetakan ke warna Mamura di tailwind.config sejak
awal. Yang benar-benar lepas token hanya 463. Itu diikat lewat
config di includes/header.php, bukan dengan menyunting 11 berkas.

Bug nyata yang ikut terperbaiki:
1. webrtc.js — className= menghapus kelas monitor-camera-grid pada
   4 tempat; gap mobile hilang setiap ganti ukuran grid.
2. playback.php — timeline hanya punya handler click, tidak bisa
   digeser jari. Diganti Pointer Events.
3. Modal playback terjebak containing block .view-section.

Berkas baru: assets/js/modules/table-labels.js, maps-sheet.js
Backup tiap tahap: *.pre-t3 sampai *.pre-t8

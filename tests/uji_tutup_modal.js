#!/usr/bin/env node
/**
 * Penjaga penutupan popup: Esc dan klik di luar panel.
 *
 * Modal yang hanya bisa ditutup lewat tombol silang memaksa pengguna
 * mencari sasaran kecil di pojok. Dua jalan keluar lain wajib ada, dan
 * keduanya harus lewat fungsi tutup milik modal itu sendiri supaya
 * pembersihan isinya (borang, peta, stream) tidak terlewat.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const JS = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/modal-tutup.js"), "utf8");
const MODALS = fs.readFileSync(path.join(AKAR, "frontend/views/modals.php"), "utf8");
const FOOTER = fs.readFileSync(path.join(AKAR, "frontend/includes/footer.php"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

console.log("=== berkas terpasang ===");
uji("modal-tutup.js dimuat di footer",
    /modal-tutup\.js\?v=/.test(FOOTER),
    "tanpa ini seluruh berkas mati diam-diam");
uji("dimuat dengan cache-buster",
    /modal-tutup\.js\?v=<\?= \$js_versi \?>/.test(FOOTER),
    "tanpa versi, peramban menahan salinan lama");

console.log("\n=== dua jalan keluar ===");
uji("menangkap tombol Escape", /e\.key !== "Escape"/.test(JS));
uji("menangkap klik latar", /addEventListener\("click"/.test(JS));
uji("mencatat tekan tetikus", /addEventListener\("mousedown"/.test(JS));

console.log("\n=== memakai jalur tutup milik modal ===");
// Menyembunyikan panel lewat classList saja akan melewatkan pembersihan
// yang dikerjakan closeXxxModal: borang tidak dikosongkan, peta tidak
// dilepas, stream tetap berjalan di latar.
uji("memanggil tombol tutup yang sudah ada",
    /querySelector\("\[onclick\*='close'\], \[onclick\*='tutup'\]"\)/.test(JS),
    "menutup sendiri lewat classList melewatkan pembersihan isi modal");
uji("tidak menyimpan daftar nama modal",
    !/stream-modal|user-modal|akses-modal/.test(JS),
    "daftar nama membuat modal baru terlewat");

console.log("\n=== tidak menutup saat tidak seharusnya ===");
uji("seret dari dalam ke luar tidak menutup",
    /turunDiLatar/.test(JS) && /e\.target !== latar/.test(JS),
    "menyeret teks keluar panel akan membuang isian yang sedang diketik");
uji("mengabaikan Esc saat menyusun IME",
    /e\.isComposing/.test(JS),
    "Esc pertama milik penyusun aksara, bukan modal");
uji("modal bertumpuk: yang teratas dulu",
    /tampak\[tampak\.length - 1\]/.test(JS),
    "menutup yang terbawah meninggalkan modal melayang");
uji("hanya modal yang terlihat",
    /\.ms-modal:not\(\.hidden\)/.test(JS));

console.log("\n=== semua modal memenuhi syarat ===");
// Berkas ini bersandar pada dua hal di markup: kelas .ms-modal sebagai
// latar, dan sebuah tombol tutup di dalamnya. Modal yang melanggar salah
// satunya tidak akan pernah tertutup oleh Esc maupun klik luar.
const idModal = [...MODALS.matchAll(/<div id="([a-z0-9-]+)" class="hidden ms-modal"/g)].map(m => m[1]);
uji("modal terbaca di markup", idModal.length >= 10, `baru ${idModal.length}`);
for (const id of idModal) {
    const awal = MODALS.indexOf(`<div id="${id}" class="hidden ms-modal"`);
    const berikut = idModal
        .map(x => MODALS.indexOf(`<div id="${x}" class="hidden ms-modal"`))
        .filter(i => i > awal)
        .sort((a, b) => a - b)[0];
    const blok = MODALS.slice(awal, berikut === undefined ? MODALS.length : berikut);
    uji(`${id} punya tombol tutup`,
        /onclick="[^"]*(close|tutup)/i.test(blok),
        "tanpa tombol tutup, Esc hanya menyembunyikan tanpa membersihkan");
}

console.log("\n=== tiap popup punya judul dan keterangan ===");
// Judul telanjang memaksa pengguna menebak akibat dari borang yang
// dibukanya. Aturannya sama dengan kepala panel: judul Inggris,
// keterangan Indonesia, di bawah 60 huruf.
const PLAYBACK = fs.readFileSync(path.join(AKAR, "frontend/views/playback.php"), "utf8");
const SEMUA_MODAL = MODALS + PLAYBACK;

const kepala = [...SEMUA_MODAL.matchAll(/class="ms-modal__title[^"]*">([^<]+)<\/h3>/g)].map(m => m[1].trim());
uji("judul memakai komponen bersama", kepala.length >= 10, `baru ${kepala.length}`);
uji("tidak ada judul tulis-tangan",
    !/font-bold text-sm uppercase tracking-wider font-mono/.test(SEMUA_MODAL),
    "kelas tulis-tangan mengabaikan tema dan harus disunting satu per satu");

const INDO = /\b(kelola|konfigurasi|pengaturan|kunci|akses|space|iklan|baru|panduan|integrasi|gruping|layar|kamera)\b/i;
for (const j of kepala) {
    uji(`judul Inggris: ${j}`, !INDO.test(j), "judul disepakati Inggris");
}

const ket = [...SEMUA_MODAL.matchAll(/class="ms-modal__desc[^"]*">([^<]*)<\/p>/g)].map(m => m[1].trim());
uji("jumlah keterangan sama dengan jumlah judul",
    ket.length >= kepala.length, `${ket.length} keterangan, ${kepala.length} judul`);
for (const d of ket.filter(Boolean)) {
    uji(`keterangan <=60 huruf: ${d.slice(0, 34)}`, d.length <= 60, `${d.length} huruf`);
    uji(`tanpa titik akhir: ${d.slice(0, 34)}`, !d.endsWith("."));
}

console.log("\n=== gaya judul benar-benar sampai ke layar ===");
const CSS = fs.readFileSync(path.join(AKAR, "frontend/assets/css/global.css"), "utf8");
// Selektor turunan .ms-modal__panel h3 (0,1,1) mengalahkan .ms-modal__title
// (0,1,0), sehingga ukuran yang disetel di kelas judul tidak pernah berlaku.
const h3 = CSS.match(/\.ms-modal__panel h3 \{[^}]*\}/);
uji("penyeragam h3 tidak memaksa ukuran",
    h3 !== null && !/font-size/.test(h3[0]),
    "selektor turunan ini mengalahkan .ms-modal__title");
uji("judul popup seukuran judul panel",
    /\.ms-modal__title \{[^}]*font-size: 0\.8125rem/.test(CSS),
    "popup dan panel harus satu bahasa visual");
uji("warna judul ikut tema",
    /\.ms-modal__title \{[^}]*color: var\(--c-text\)/.test(CSS),
    "warna dipatok akan salah di salah satu tema");
uji("warna keterangan ikut tema",
    /\.ms-modal__desc \{[^}]*color: var\(--c-text-muted\)/.test(CSS));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

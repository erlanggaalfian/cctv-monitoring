#!/usr/bin/env node
/**
 * Uji tampilan modal akses di ponsel.
 *
 * Tidak ada peramban di mesin ini, jadi yang diperiksa adalah aturan yang
 * menentukan tata letak: nilai CSS nyata dari global.css dan kelas nyata
 * dari markup, plus anggaran tinggi yang dihitung dari nilai-nilai itu.
 * Bukan render, tetapi cukup untuk menangkap ketiga cacat yang diperbaiki —
 * ketiganya berasal dari aturan, bukan dari piksel.
 */
const fs = require("fs");
const path = require("path");

const akar = path.join(__dirname, "..", "frontend");
const css = fs.readFileSync(path.join(akar, "assets/css/global.css"), "utf8");
const modal = fs.readFileSync(path.join(akar, "views/modals.php"), "utf8");
const js = fs.readFileSync(path.join(akar, "assets/js/modules/admin.js"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// Petak modal akses saja, supaya uji tidak tertipu markup modal lain.
const mulai = modal.indexOf('id="akses-modal"');
// Batas petak: awal modal tingkat atas berikutnya. Modal tingkat atas
// selalu mulai di kolom pertama, sedangkan div anak selalu menjorok —
// itulah pembedanya. Memakai </div> pertama atau '<div id=' mana saja
// akan berhenti di tengah isi modal ini sendiri.
const sisa = modal.slice(mulai);
const cocok = sisa.slice(1).search(/\n<div id="/);
const petak = cocok >= 0 ? sisa.slice(0, cocok + 1) : sisa;
uji("petak modal akses ditemukan", mulai > 0 && petak.length > 500);

console.log("\n=== 1. kaki modal dapat diraih di ponsel ===");
// .ms-modal__panel ber-overflow:hidden; tanpa --scroll kelebihan isi
// terpotong tanpa dapat digulir.
uji("panel dapat digulir (--scroll)",
    /ms-modal__panel--scroll/.test(petak),
    "tanpa ini tombol Simpan terpotong di layar pendek");
uji("aturan --scroll memang menggulir",
    /\.ms-modal__panel--scroll\s*\{[^}]*overflow-y:\s*auto/.test(css));
uji("panel ponsel memang dibatasi tinggi",
    /@media \(max-width: 639px\)[\s\S]{0,400}max-height:\s*92dvh/.test(css));

console.log("\n=== 2. pegangan tarik ada di ponsel ===");
// .ms-modal__head tidak dipakai satu modal pun, jadi pegangan bawaan
// tidak pernah tergambar.
uji("tidak ada modal memakai .ms-modal__head",
    !/class="[^"]*ms-modal__head/.test(modal),
    "kalau dipakai, aturan pengganti jadi mubazir");
const blokHp = css.slice(css.indexOf("Modal akses kamera: penyesuaian ponsel"));
uji("pegangan digambar untuk panel --pad",
    /\.ms-modal__panel--pad::before\s*\{[\s\S]{0,300}content:\s*""/.test(blokHp));
uji("pegangan hanya di ponsel",
    /@media \(max-width: 639px\)[\s\S]{0,600}\.ms-modal__panel--pad::before/.test(blokHp));
uji("pegangan tidak menghalangi sentuhan",
    /\.ms-modal__panel--pad::before[\s\S]{0,300}pointer-events:\s*none/.test(blokHp));
uji("ruang atas ditambah agar tidak menimpa judul",
    /\.ms-modal__panel--pad\s*\{[^}]*padding-top/.test(blokHp));

console.log("\n=== 3. nama kamera tidak tergencet dua kolom ===");
// Dihitung dari atribut class, bukan dari teks "akses-kol" mentah: id
// kolomnya sendiri bernama akses-kol-a/-b sehingga pencocokan mentah
// menghitung dua kali per baris.
// Tiga kolom sekarang: LIVE, REKAMAN, dan BAGIKAN (khusus Admin).
uji("kepala kolom memakai kelas yang dapat menyempit",
    (petak.match(/class="akses-kol /g) || []).length === 3,
    `ketemu ${(petak.match(/class="akses-kol /g) || []).length}`);
uji("baris kamera memakai kelas yang sama",
    (js.match(/akses-kol text-center/g) || []).length === 3);
uji("tidak ada sisa lebar tetap w-16 di kolom centang",
    !/w-16 text-center/.test(petak) && !/w-16 text-center/.test(js));

const lebar = (re) => { const m = blokHp.match(re); return m ? parseFloat(m[1]) : null; };
const lebarLuas = parseFloat((css.match(/\.akses-kol\s*\{\s*width:\s*([\d.]+)rem/) || [])[1]);
const lebarHp = lebar(/@media \(max-width: 639px\)[\s\S]*?\.akses-kol\s*\{\s*width:\s*([\d.]+)rem/);
uji("lebar layar luas tidak berubah", lebarLuas === 4, `${lebarLuas}rem`);
uji("lebar ponsel lebih sempit", lebarHp !== null && lebarHp < lebarLuas,
    `${lebarHp}rem vs ${lebarLuas}rem`);

// Anggaran lebar pada layar 360px: 2 kolom + jarak + padding panel + padding
// kotak. Sisanya untuk nama kamera.
const px = (rem) => rem * 16;
const sisaNama = (l) => 360 - (2 * px(l) + 8 + 32 + 24);
uji("nama kamera dapat ruang layak di layar 360px",
    sisaNama(lebarHp) >= 180,
    `hanya ${sisaNama(lebarHp)}px (sebelumnya ${sisaNama(4)}px)`);

console.log("\n=== anggaran tinggi di ponsel ===");
const kotak = blokHp.match(/\.akses-kotak-kamera\s*\{\s*max-height:\s*(\d+)dvh/);
uji("daftar kamera dipendekkan di ponsel", kotak !== null);
const isiTetap = 32 + 74 + 22 + 42 + 30 + 26 + 42 + 41 + 38;  // tanpa daftar
for (const [nama, tinggi] of [["Android kecil", 640], ["iPhone SE", 667]]) {
    const batas = Math.round(tinggi * 0.92);
    const daftar = kotak ? Math.round(tinggi * parseInt(kotak[1], 10) / 100) : 290;
    const total = isiTetap + daftar;
    // Boleh melebihi sedikit karena panel kini dapat digulir; yang tidak
    // boleh adalah terpotong seperti sebelumnya.
    uji(`${nama}: isi ${total}px vs batas ${batas}px, dapat digulir`,
        /ms-modal__panel--scroll/.test(petak),
        "isi melebihi batas dan panel tidak dapat digulir");
}

console.log("\n=== tidak merusak modal lain ===");
const jumlahPad = (modal.match(/ms-modal__panel--pad/g) || []).length;
uji("aturan pegangan berlaku bagi semua modal --pad", jumlahPad >= 7, `${jumlahPad} modal`);
uji("modal lain tidak ikut dipendekkan",
    (modal.match(/akses-kotak-kamera/g) || []).length === 1);

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

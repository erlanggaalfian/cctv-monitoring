#!/usr/bin/env node
/**
 * Penjaga: nama variabel tak dikenal di berkas JS.
 *
 * Ditulis setelah `authToken is not defined` lolos ke pengguna. Berkas
 * lolos `node --check` karena sintaksnya sah; yang salah adalah namanya —
 * di admin.js token bernama userToken. Uji logika biasa tidak menangkapnya
 * karena tidak pernah menjalankan fetch.
 *
 * Pemeriksaannya sengaja sempit: hanya nama yang memang dipakai di berkas
 * ini dan pernah salah tulis. Analisis lingkup penuh berlebihan; yang
 * dibutuhkan cuma jaring untuk salah ketik yang sudah terbukti terjadi.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "frontend", "assets", "js");
let lolos = 0, gagal = 0;

function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// Nama yang TIDAK ADA di mana pun, tetapi mudah tertulis karena lazim di
// proyek lain. Kemunculannya hampir pasti salah ketik.
const TERLARANG = ["authToken", "apiUrl", "API_BASE", "accessToken"];

const berkas = [];
(function kumpulkan(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) kumpulkan(p);
        else if (f.name.endsWith(".js")) berkas.push(p);
    }
})(DIR);

uji("berkas js ditemukan", berkas.length > 0, `${berkas.length}`);

console.log("\n=== nama variabel tak dikenal ===");
for (const nama of TERLARANG) {
    const kena = [];
    for (const b of berkas) {
        const isi = fs.readFileSync(b, "utf8");
        // Lewati yang memang dideklarasikan di berkas itu sendiri.
        const dideklarasi = new RegExp(
            `(let|const|var|function)\\s+${nama}\\b`).test(isi);
        if (dideklarasi) continue;
        const re = new RegExp(`\\b${nama}\\b`, "g");
        const n = (isi.match(re) || []).length;
        if (n) kena.push(`${path.basename(b)}:${n}`);
    }
    uji(`${nama} tidak dipakai tanpa deklarasi`, kena.length === 0, kena.join(" "));
}

console.log("\n=== token dipanggil dengan nama yang benar ===");
const adminJs = fs.readFileSync(
    path.join(DIR, "modules", "admin.js"), "utf8");
const bearer = adminJs.match(/Bearer \$\{(\w+)\}/g) || [];
const namaDipakai = new Set(
    bearer.map(m => m.match(/\$\{(\w+)\}/)[1]));
uji("semua Bearer memakai satu nama yang sama",
    namaDipakai.size === 1, [...namaDipakai].join(","));
uji("namanya userToken", namaDipakai.has("userToken"),
    [...namaDipakai].join(","));

console.log("\n=== fungsi modal akses terpasang ===");
for (const f of ["bukaAksesKamera", "tutupAksesKamera", "muatKameraAkses",
                 "simpanAksesKamera", "muatIkhtisarAkses"]) {
    uji(`window.${f} terdefinisi`,
        new RegExp(`window\\.${f}\\s*=`).test(adminJs));
}

console.log("\n=== tombol lama tidak lagi menunjuk modal lama ===");
uji("baris Users memakai bukaAksesKamera",
    /openPermissionsModal\(\$\{user\.id\}\)/.test(adminJs) === false,
    "masih memanggil openPermissionsModal");

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

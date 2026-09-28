#!/usr/bin/env node
/**
 * Uji perilaku kuasaPenuh() di frontend.
 *
 * Sintaks yang sah tidak menjamin logikanya benar. Yang dijaga di sini: hanya
 * `super_admin` yang membuka panel manajemen, dan `admin` — bekas `user` —
 * tidak. Definisi ini harus sepadan dengan kuasa_penuh() di backend, sebab
 * tombol yang muncul tanpa wewenang hanya menghasilkan galat 403 di layar.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const AKAR = path.resolve(__dirname, "..");
const MODUL = path.join(AKAR, "frontend/assets/js/modules");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// Ambil hanya definisi pembantunya; memuat seluruh router.js akan menuntut
// DOM yang tidak ada di sini.
const router = fs.readFileSync(path.join(MODUL, "router.js"), "utf8");
const cocok = router.match(/window\.kuasaPenuh\s*=\s*function[\s\S]*?\n};/);
if (!cocok) {
    console.error("GAGAL: definisi window.kuasaPenuh tidak ditemukan di router.js");
    process.exit(1);
}

const konteks = { window: {} };
vm.createContext(konteks);
vm.runInContext(cocok[0], konteks);
const kuasaPenuh = konteks.window.kuasaPenuh;

console.log("=== hanya super_admin yang berkuasa penuh ===");
uji("super_admin -> benar", kuasaPenuh("super_admin") === true);
uji("admin -> salah (bekas user, belum berwenang)",
    kuasaPenuh("admin") === false, `dapat ${kuasaPenuh("admin")}`);
uji("user -> salah", kuasaPenuh("user") === false);
uji("guest -> salah", kuasaPenuh("guest") === false);

console.log("\n=== masukan aneh tidak meloloskan siapa pun ===");
uji("kosong -> salah", kuasaPenuh("") === false);
uji("null -> salah", kuasaPenuh(null) === false);
uji("undefined -> salah", kuasaPenuh(undefined) === false);
uji("apikey -> salah", kuasaPenuh("apikey") === false);
uji("SUPER_ADMIN (huruf besar) -> benar", kuasaPenuh("SUPER_ADMIN") === true);
uji("  super_admin (berspasi) -> salah",
    kuasaPenuh(" super_admin") === false,
    "spasi tidak dipangkas; peran dari server tidak pernah berspasi");

console.log("\n=== tidak ada lagi perbandingan izin harfiah ===");
for (const f of ["router.js", "webrtc.js", "admin.js"]) {
    const isi = fs.readFileSync(path.join(MODUL, f), "utf8");
    uji(`${f} bersih`,
        !isi.includes('(userRole || "").toLowerCase() === "admin"') &&
        !isi.includes('(userRole || "").toLowerCase() !== "admin"'));
}

console.log("\n=== lencana peran tetap menampilkan keempat peran ===");
const admin = fs.readFileSync(path.join(MODUL, "admin.js"), "utf8");
uji("lencana mengenali super_admin",
    admin.includes('["super_admin", "admin"].includes(p)'),
    "admin dan super admin berbagi satu warna");
uji("lencana masih punya warna user", admin.includes('p === "user"'),
    "user biru, guest kelabu -- bukan keduanya kelabu");

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

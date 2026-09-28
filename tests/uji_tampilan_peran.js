#!/usr/bin/env node
/**
 * Uji tampilan peran di panel manajemen pengguna.
 *
 * Peran baru tidak cukup ada di basis data: ia harus bisa DIPILIH saat
 * membuat akun, dan TERBACA saat akun itu ditampilkan. Uji ini menjaga
 * keduanya, sebab peran yang tak bisa dipilih membuat Super Admin hanya
 * dapat dibuat lewat SQL langsung.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const MODALS = path.join(AKAR, "frontend/views/modals.php");
const ADMINJS = path.join(AKAR, "frontend/assets/js/modules/admin.js");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

const modals = fs.readFileSync(MODALS, "utf8");

console.log("=== keempat peran bisa dipilih saat membuat akun ===");
for (const p of ["super_admin", "admin", "user", "guest"]) {
    uji(`pilihan ${p} ada`, modals.includes(`<option value="${p}">`));
}

console.log("\n=== label tidak lagi menyesatkan ===");
uji("ADMIN bukan lagi 'Full Console Control'",
    !modals.includes("ADMIN (Full Console Control)"),
    "label lama menyiratkan kuasa penuh yang kini dipegang Super Admin");
uji("SUPER ADMIN ditandai berkuasa penuh",
    /super_admin">SUPER ADMIN \(Kuasa Penuh\)/.test(modals));

console.log("\n=== urutan pilihan menaik menurut wewenang ===");
const urut = ["user", "guest", "admin", "super_admin"]
    .map(p => modals.indexOf(`<option value="${p}">`));
uji("super_admin berada di akhir daftar",
    Math.max(...urut) === urut[3],
    "peran paling berkuasa ditaruh terakhir agar tidak terpilih tak sengaja");

console.log("\n=== lencana peran di daftar pengguna ===");
const adminjs = fs.readFileSync(ADMINJS, "utf8");
uji("super_admin diberi warna", adminjs.includes('["super_admin", "admin"].includes(p)'));
uji("peran ditampilkan apa adanya",
    adminjs.includes('(user.role || "").toUpperCase()'),
    "SUPER_ADMIN harus terbaca di kolom peran");

console.log("\n=== tombol Access hanya untuk yang butuh ===");
// Akses kamera dikelola sepenuhnya di subtab Camera Access;
// tabel Users tidak lagi menawarkan pintu kedua ke sana.
uji("tabel Users tidak menawarkan pintu akses",
    !/permissionsBtn/.test(adminjs));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

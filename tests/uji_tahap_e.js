#!/usr/bin/env node
/**
 * Uji Tahap E: layar mengikuti kewenangan server.
 *
 * Dijalankan tanpa peramban, jadi yang diuji adalah logika penentu tampilan —
 * bukan hasil gambarnya. Peramban tetap perlu dilihat manusia sekali.
 *
 * Yang paling penting di sini: bolehKelola dan kuasaPenuh TIDAK boleh sama.
 * Kalau keduanya menjadi sama, Admin ikut melihat pemindai jaringan dan log
 * seluruh sistem, atau justru terkunci dari konsol yang sudah jadi haknya.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
let lolos = 0, gagal = 0;

function uji(nama, kondisi, info) {
  if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info || ""}`); }
}

function baca(p) { return fs.readFileSync(path.join(AKAR, p), "utf8"); }

// Ambil kedua penolong dari router.js apa adanya.
const router = baca("frontend/assets/js/modules/router.js");
const window = {};
const potongBolehKelola = router.match(
  /window\.bolehKelola = function[\s\S]*?\n};/);
const potongKuasaPenuh = router.match(
  /window\.kuasaPenuh = function[\s\S]*?\n};/);

if (!potongBolehKelola || !potongKuasaPenuh) {
  console.log("GAGAL: penolong peran tidak ditemukan di router.js");
  process.exit(1);
}
eval(potongBolehKelola[0]);
eval(potongKuasaPenuh[0]);

console.log("=== siapa boleh membuka konsol ===");
uji("super_admin boleh", window.bolehKelola("super_admin") === true);
uji("admin boleh", window.bolehKelola("admin") === true);
uji("user tidak boleh", window.bolehKelola("user") === false);
uji("guest tidak boleh", window.bolehKelola("guest") === false);
uji("apikey tidak boleh", window.bolehKelola("apikey") === false);
uji("null tidak meledak", window.bolehKelola(null) === false);
uji("huruf besar tetap dikenali", window.bolehKelola("ADMIN") === true);
uji("spasi tepi diabaikan", window.bolehKelola("  admin  ") === true);

console.log("\n=== kuasa penuh tetap sempit ===");
uji("super_admin berkuasa penuh", window.kuasaPenuh("super_admin") === true);
uji("admin TIDAK berkuasa penuh", window.kuasaPenuh("admin") === false,
    "admin ikut naik pangkat — pemindai dan log sistem akan bocor");
uji("kedua penolong berbeda untuk admin",
    window.bolehKelola("admin") !== window.kuasaPenuh("admin"));

console.log("\n=== menu Admin di desktop dan mobile ===");
uji("menu desktop memakai bolehKelola",
    /nav-admin[\s\S]{0,160}bolehKelola\(userRole\)/.test(router));
uji("menu mobile memakai bolehKelola",
    /mobile-nav-admin[\s\S]{0,160}bolehKelola\(userRole\)/.test(router));

console.log("\n=== konsol: terbuka untuk Admin, sebagian ditutup ===");
const admin = baca("frontend/assets/js/modules/admin.js");
uji("konsol dimuat memakai bolehKelola",
    /loadAdminData[\s\S]{0,200}bolehKelola\(userRole\)/.test(admin));
uji("scanner dan ads disembunyikan dari Admin",
    /\["scanner", "ads"\]\.forEach/.test(admin));
uji("panel log disembunyikan dari Admin",
    /api-log-section[\s\S]{0,120}add\("hidden"\)/.test(admin));

console.log("\n=== log akses tidak dimuat tanpa kuasa penuh ===");
const core = baca("frontend/assets/js/modules/core.js");
uji("pemuat log dijaga kuasaPenuh",
    /tabName === 'api' && window\.kuasaPenuh\(userRole\)/.test(core),
    "tanpa ini muncul aliran galat 403 berulang");

console.log("\n=== kamera tersamar ditandai, bukan tampak rusak ===");
uji("kolom RTSP tersamar diberi tanda",
    /rtspTersamar[\s\S]{0,200}tersembunyi/.test(admin));
uji("modal sunting dikunci saat tersamar",
    /mRtsp\.readOnly = tersamar/.test(admin),
    "tanpa ini nilai kosong dapat menimpa URL asli");
uji("alasannya terbaca sebelum menyimpan",
    /tidak berwenang atas kamera ini/.test(admin));

console.log("\n=== panel log punya id yang dipakai ===");
const php = baca("frontend/views/admin-console.php");
uji("id api-log-section ada di HTML",
    /id="api-log-section"/.test(php));

console.log("\n=== tombol Access mengikuti peran sasaran ===");
// Akses kamera dikelola sepenuhnya di subtab Camera Access;
// tabel Users tidak lagi menawarkan pintu kedua ke sana.
uji("tabel Users tidak menawarkan pintu akses",
    !/permissionsBtn/.test(php));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

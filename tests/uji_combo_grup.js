/**
 * Uji Grup Pengguna: sebentuk dengan Account Role, plus jalur grup baru.
 *
 * Combobox buatan sendiri dibuang: chrome select di berkas gaya dikunci ke
 * .app-field-wrap:has(select), sehingga kotak ketik tidak akan pernah sama
 * tampilannya. Yang dijaga sekarang: bentuknya benar-benar select yang
 * sama, dan "grup baru" tetap dapat diketik.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const JS = fs.readFileSync(
    path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");
const PHP = fs.readFileSync(
    path.join(AKAR, "frontend/views/modals.php"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// Potongan markup masing-masing kolom, untuk dibandingkan langsung.
const blokPeran = PHP.match(
    /<label for="modal-user-role"[\s\S]*?<\/div>\s*<\/div>/)[0];
const blokGrup = PHP.match(
    /<div id="modal-user-grup-wrap"[\s\S]*?<p class=/)[0];

console.log("=== bentuknya sama dengan Account Role ===");
for (const kelas of ["app-field-wrap app-select-field",
                     "app-input app-select app-select-icon-left",
                     "app-field-icon app-field-icon-right"]) {
    uji(`grup memakai "${kelas}" seperti peran`,
        blokPeran.includes(kelas) && blokGrup.includes(kelas),
        `peran=${blokPeran.includes(kelas)} grup=${blokGrup.includes(kelas)}`);
}
uji("keduanya select sungguhan, bukan kotak ketik bergaya",
    /<select id="modal-user-grup"/.test(blokGrup),
    "chrome select dikunci ke :has(select); input tak akan pernah cocok");
uji("ikon panah sama persis",
    (blokGrup.match(/M19 9l-7 7-7-7/g) || []).length === 1);
uji("sisa combobox lama sudah bersih",
    !PHP.includes("modal-user-grup-panel") &&
    !PHP.includes("modal-user-grup-panah") &&
    !JS.includes("pasangPanelGrup"));

console.log("\n=== pilih grup yang ada, atau buat baru ===");
uji("pilihan kosong tersedia", /<option value="">Belum masuk grup</.test(blokGrup));
uji("daftar grup disusun dari akun yang ada",
    /\[\.\.\.new Set\(\(adminUsers \|\| \[\]\)\s*\n?\s*\.map\(u => u\.admin_group\)\.filter\(Boolean\)\)\]\.sort\(\)/.test(JS));
uji("pilihan 'Buat grup baru' ditambahkan",
    /opsiBaru\.textContent = "Buat grup baru"/.test(JS));
uji("penanda grup baru bukan nama grup yang mungkin diketik",
    /const GRUP_BARU = "__grup_baru__"/.test(JS));
uji("isian nama muncul hanya saat memilih grup baru",
    /const baru = isian\.value === GRUP_BARU;[\s\S]{0,120}classList\.toggle\("hidden", !baru\)/.test(JS));
uji("isian nama dikosongkan lagi bila pilihan dibatalkan",
    /if \(baru\) nama\.focus\(\); else nama\.value = "";/.test(JS));
uji("isian nama tersembunyi di markup awal",
    /id="modal-user-grup-baru"[\s\S]{0,220}hidden/.test(PHP));

console.log("\n=== grup akun yang sedang disunting tidak hilang ===");
uji("grup terpilih ikut ditawarkan walau tak ada di daftar",
    /if \(terpilih && !ada\.includes\(terpilih\)\) ada\.push\(terpilih\)/.test(JS),
    "tanpa ini menyunting akun bergrup tunggal akan mengosongkan grupnya");
uji("nilai terpilih dipasang setelah pilihan disusun",
    JS.indexOf("opsiBaru.textContent") < JS.indexOf('isian.value = terpilih || ""'));

console.log("\n=== muatan ===");
uji("grup baru dikirim dari isian namanya",
    /payload\.admin_group = isianGrup\.value === GRUP_BARU\s*\n?\s*\? \(namaBaru \? namaBaru\.value\.trim\(\) : ""\)/.test(JS));
uji("grup yang ada dikirim apa adanya",
    /: isianGrup\.value;/.test(JS));
uji("penanda grup baru tidak pernah lolos jadi nama grup",
    !/payload\.admin_group = isianGrup\.value;/.test(JS));

console.log("\n=== hanya Super Admin yang menentukan grup ===");
uji("kolom disembunyikan bagi non-super-admin",
    /if \(!window\.kuasaPenuh\(userRole\)\)[\s\S]{0,200}classList\.add\("hidden"\)/.test(JS));
uji("muatan hanya berisi grup bila kuasa penuh",
    /if \(window\.kuasaPenuh\(userRole\)\)[\s\S]{0,260}payload\.admin_group/.test(JS));

console.log("\n=== pemasangan penangan ===");
uji("penangan change dipasang sekali walau modal dibuka berulang",
    /dataset\.siap === "1"/.test(JS) && /dataset\.siap = "1"/.test(JS));
uji("dipanggil pada Add maupun Edit",
    (JS.match(/siapkanPilihanGrup\(/g) || []).length >= 3);

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

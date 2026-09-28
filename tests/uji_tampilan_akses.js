#!/usr/bin/env node
/**
 * Penjaga tampilan modal Camera Access dan larangan em dash di layar.
 *
 * Em dash dipakai sebagai pengapit teks pilihan kosong ("— Pilih akun —").
 * Pemakai memintanya dibuang: tanda itu tidak menambah arti, hanya membuat
 * pilihan kosong tampak seperti pemisah daftar. Uji ini menjaga agar ia
 * tidak diam-diam kembali lewat penyuntingan berikutnya.
 *
 * Camera Access dulu memakai <select> polos yang berbeda sendiri dari
 * pemilih lain di layar, dan barisnya menempel rapat tanpa pemisah — pada
 * daftar panjang, centang milik kamera mana mudah tertukar.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const modals = fs.readFileSync(path.join(AKAR, "frontend/views/modals.php"), "utf8");
const adminjs = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");
const css = fs.readdirSync(path.join(AKAR, "frontend/assets/css"))
    .filter(f => f.endsWith(".css"))
    .map(f => fs.readFileSync(path.join(AKAR, "frontend/assets/css", f), "utf8"))
    .join("\n");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

console.log("=== em dash tidak dipakai sebagai pengapit teks pilihan ===");
// Yang dilarang hanya em dash yang MENGAPIT teks — bukan em dash di dalam
// komentar kode, yang memang tanda baca sah dan tak pernah sampai ke layar.
const barisKode = (isi) => isi.split("\n")
    .filter(b => !/^\s*(\/\/|\*|\/\*)/.test(b));
for (const [nama, isi] of [["modals.php", modals], ["admin.js", adminjs]]) {
    const nakal = barisKode(isi).filter(b => /\u2014[^\n]*\u2014/.test(b));
    uji(`${nama} bebas teks berapit em dash`, nakal.length === 0,
        nakal.slice(0, 2).map(b => b.trim().slice(0, 70)).join(" | "));
}
uji("pilihan grup kosong berbunyi polos",
    modals.includes('<option value="">Belum masuk grup</option>'));
uji("pilihan akun kosong berbunyi polos",
    modals.includes('<option value="">Pilih akun</option>'));
uji("pilihan grup baru tanpa tanda plus dan elipsis",
    adminjs.includes('opsiBaru.textContent = "Buat grup baru";'));
uji("peran akun dipisah kurung, bukan em dash",
    /\$\{u\.username\} \(\$\{\(u\.role \|\| ""\)\.toUpperCase\(\)\}\)/.test(adminjs));

console.log("\n=== pemilih Akun setara dengan pemilih lain di layar ===");
const idx = modals.indexOf('id="akses-modal-akun"');
uji("pemilih akun ada", idx > 0);
const awal = modals.lastIndexOf("app-field-wrap", idx);
uji("dibungkus app-field-wrap", awal > 0 && awal < idx,
    "sebelumnya app-select-block polos, berbeda sendiri");
uji("punya ikon kiri", modals.slice(awal, idx).includes("app-field-icon-left"));
uji("tidak lagi memakai app-select-block",
    !modals.slice(Math.max(0, idx - 500), idx + 200).includes("app-select-block"));

console.log("\n=== baris kamera terbaca terpisah ===");
uji("baris punya kelas sendiri, bukan utilitas lepas",
    adminjs.includes('class="akses-baris${mati ? " akses-baris--mati" : ""}"'));
for (const aturan of [".akses-baris", ".akses-baris:hover",
                      ".akses-baris + .akses-baris", ".akses-baris--mati"]) {
    uji(`CSS ${aturan} ada`, css.includes(aturan + " {"));
}
uji("baris mati tidak ikut menyala saat disentuh",
    css.includes(".akses-baris--mati:hover { background: transparent; }"),
    "baris yang tak dapat diubah tidak boleh tampak dapat ditekan");

console.log("\n=== kepala grup memberi tahu isinya ===");
uji("kepala grup punya kelas sendiri", css.includes(".akses-grup-kepala {"));
uji("jumlah kamera ditampilkan",
    adminjs.includes('<span class="akses-grup-jumlah">${grup[nama].length}</span>'));
uji("jumlah berubah mengikuti centang",
    adminjs.includes('tandaGrup.textContent = punya.size ? `${punya.size}/${total}`'));
uji("grup bercentang ditandai", css.includes(".akses-grup-jumlah--isi {"));

console.log("\n=== penghitung terpilih berupa lencana ===");
uji("markup memakai kelas lencana",
    modals.includes('id="akses-modal-hitung" class="akses-lencana"'));
uji("CSS lencana ada", css.includes(".akses-lencana {"));
uji("lencana kosong disembunyikan", css.includes(".akses-lencana:empty"));
// className pernah ditimpa seluruhnya di sini, sehingga kelas lencana yang
// datang dari markup langsung hilang pada pemanggilan pertama.
// Pemeriksaan dipersempit ke fungsi yang bersangkutan: className dipakai
// sah di banyak tempat lain yang tidak menyentuh lencana ini.
const blokHitung = adminjs.slice(adminjs.indexOf("window.hitungAksesTerpilih"),
                                 adminjs.indexOf("window.simpanAksesKamera"));
uji("kelas lencana tidak ditimpa",
    !/\bel\.className\s*=/.test(blokHitung)
        && blokHitung.includes('el.classList.toggle("akses-lencana--isi"'),
    "menimpa className menghapus kelas lencana yang datang dari markup");

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

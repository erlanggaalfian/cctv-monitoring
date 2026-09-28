#!/usr/bin/env node
/**
 * Penjaga: kelas tata letak yang dipakai markup tetapi tidak ada di CSS.
 *
 * Ditulis setelah `app-select-wrap` dan `app-select-icon` lolos ke ponsel.
 * Keduanya tidak pernah terdefinisi, jadi <span> pembungkusnya tampil
 * sebagai elemen biasa dan SVG di dalamnya — tanpa width/height — memuai
 * memenuhi induknya: panah sebesar layar. Sintaksnya sah dan `php -l`
 * bersih, jadi tidak ada uji lain yang dapat menangkapnya.
 *
 * Dua hal yang diperiksa:
 *   1. Setiap kelas milik proyek yang MENGATUR TATA LETAK punya aturan CSS.
 *      Kelas penanda untuk JS (dipakai querySelector, bukan untuk tampilan)
 *      dikecualikan — ia memang tidak perlu aturan.
 *   2. Setiap <svg> tanpa batas ukuran berada di dalam pembungkus yang
 *      membatasinya. Inilah bedanya `app-field-icon` (punya aturan
 *      `svg { width: .875rem }`) dengan `app-select-icon` yang tidak ada.
 */
const fs = require("fs");
const path = require("path");

const akar = path.join(__dirname, "..", "frontend");
let lolos = 0, gagal = 0;

function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

const berkasCss = fs.readdirSync(path.join(akar, "assets/css"))
    .filter(f => f.endsWith(".css"));
const css = berkasCss
    .map(f => fs.readFileSync(path.join(akar, "assets/css", f), "utf8"))
    .join("\n");

// Nama kelas diambil dari bagian SELEKTOR saja. Mengambilnya dari seluruh
// berkas ikut menyapu isi aturan (mis. url data:image), tetapi yang lebih
// penting: harus menangkap tiap nama dalam selektor gabungan.
// Aturan di dalam @media tetap terhitung: pembungkus @media dilepas dulu,
// sebab `@media { ... }` akan terbaca sebagai satu aturan raksasa dan
// seluruh selektor di dalamnya hilang.
const cssRata = css.replace(/@(media|supports|container)[^{]*\{/g, "");
const terdefinisi = new Set();
for (const m of cssRata.matchAll(/([^{}]+)\{[^}]*\}/g)) {
    for (const k of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) terdefinisi.add(k[1]);
}

console.log("=== sumber ===");
uji(`berkas css terbaca (${berkasCss.length})`, berkasCss.length > 0);
uji(`kelas terdefinisi terkumpul (${terdefinisi.size})`, terdefinisi.size > 100);

function kumpulkan(dir, ext) {
    const hasil = [];
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) hasil.push(...kumpulkan(p, ext));
        else if (ext.some(e => f.endsWith(e))) hasil.push(p);
    }
    return hasil;
}

const berkasView = kumpulkan(path.join(akar, "views"), [".php"]);
const berkasJs = kumpulkan(path.join(akar, "assets/js"), [".js"]);
const sumber = [...berkasView, ...berkasJs];
uji(`berkas markup/js terbaca (${sumber.length})`, sumber.length > 5);

const isiSemua = sumber.map(p => fs.readFileSync(p, "utf8")).join("\n");
const AWALAN = /^(app|ms|akses|cyber)-/;

const dipakai = new Map();
for (const p of sumber) {
    const isi = fs.readFileSync(p, "utf8");
    for (const m of isi.matchAll(/class="([^"]*)"/g)) {
        for (const k of m[1].split(/\s+/)) {
            if (!k || k.includes("${") || k.includes("<?")) continue;
            if (!AWALAN.test(k)) continue;
            if (!dipakai.has(k)) dipakai.set(k, new Set());
            dipakai.get(k).add(path.relative(akar, p));
        }
    }
}

// Kelas penanda: dicari oleh JS lewat pemilih, bukan untuk tampilan.
// Keberadaannya di CSS memang tidak diperlukan.
function penandaJs(k) {
    return new RegExp(`["'.\\[]${k}[
"'\\]:,)]`).test(isiSemua)
        || isiSemua.includes(`.${k}`)
        || isiSemua.includes(`"${k}"`);
}

console.log("\n=== kelas tata letak tanpa aturan CSS ===");
const hantu = [...dipakai.entries()]
    .filter(([k]) => !terdefinisi.has(k))
    .filter(([k]) => !penandaJs(k))
    .sort();

for (const [k, berkas] of hantu) {
    console.log(`       ${k}  <- ${[...berkas].join(", ")}`);
}
uji(`tidak ada kelas hantu (ketemu ${hantu.length})`, hantu.length === 0,
    hantu.map(([k]) => k).join(", "));

const penanda = [...dipakai.keys()].filter(k => !terdefinisi.has(k) && penandaJs(k));
console.log(`       (${penanda.length} kelas penanda JS dikecualikan: ${penanda.join(", ")})`);

console.log("\n=== kelas yang pernah bermasalah ===");
for (const k of ["app-select-wrap", "app-select-icon"]) {
    const ada = dipakai.has(k);
    uji(`${k} tidak dipakai lagi`, !ada,
        ada ? `masih di ${[...dipakai.get(k)].join(", ")}` : "");
}

// ── SVG tanpa ukuran harus punya pembungkus yang membatasinya ───────────────
console.log("\n=== svg tanpa batas ukuran ===");

// Pembungkus yang aturannya membatasi svg anaknya, mis.
// `.app-field-icon svg { width: .875rem; height: .875rem }`.
// Selektor sering ditulis gabungan, mis.
// `.app-search-icon svg, .app-field-icon svg { width: .875rem }`.
// Membaca hanya satu nama per aturan akan melewatkan yang lain dan
// melaporkan svg aman sebagai liar.
const pembungkusAman = new Set();
for (const m of cssRata.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/\bwidth\s*:/.test(m[2])) continue;
    for (const bagian of m[1].split(",")) {
        const s = bagian.trim();
        if (!/\bsvg\s*$/.test(s)) continue;
        const k = s.match(/\.([\w-]+)\s+svg\s*$/);
        if (k) pembungkusAman.add(k[1]);
    }
}
uji(`ada pembungkus yang membatasi svg (${pembungkusAman.size})`,
    pembungkusAman.size > 0, "tidak satu pun aturan `.x svg { width }`");

const svgLiar = [];
for (const p of berkasView) {
    const isi = fs.readFileSync(p, "utf8");
    for (const m of isi.matchAll(/<svg\b[^>]*>/g)) {
        const tag = m[0];
        if (/class="[^"]*\b(w-\d|h-\d|size-\d)/.test(tag)) continue;
        if (/\b(width|height)=/.test(tag)) continue;

        // Cari pembungkus terdekat sebelum tag ini.
        const sebelum = isi.slice(Math.max(0, m.index - 400), m.index);
        const kelasInduk = [...sebelum.matchAll(/class="([^"]*)"/g)]
            .flatMap(x => x[1].split(/\s+/));
        const aman = kelasInduk.some(k => pembungkusAman.has(k));
        if (!aman) {
            svgLiar.push(`${path.relative(akar, p)}:${
                isi.slice(0, m.index).split("\n").length}`);
        }
    }
}
for (const s of svgLiar) console.log(`       ${s}`);
uji(`setiap svg dibatasi ukurannya (${svgLiar.length} liar)`,
    svgLiar.length === 0, svgLiar.join(", "));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

#!/usr/bin/env node
/**
 * Penjaga kepala panel: tiap panel menyebut namanya dan tugasnya.
 *
 * Judul sendirian terbaca sebagai nama fitur, bukan sebagai apa yang
 * dapat dikerjakan di sana. Keterangan satu barislah yang menjawab
 * "ini buat apa" tanpa perlu membuka isinya lebih dulu.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const PHP = fs.readFileSync(path.join(AKAR, "frontend/views/admin-console.php"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// Tiap subtab dipotong sampai awal subtab berikutnya, supaya judul
// milik panel tetangga tidak terhitung sebagai miliknya.
const SUBTAB = ["streams", "users", "access", "scanner", "ads", "api"];
function potong(id) {
    const awal = PHP.indexOf(`<div id="admin-subtab-${id}"`);
    if (awal < 0) return "";
    let akhir = PHP.length;
    for (const lain of SUBTAB) {
        if (lain === id) continue;
        const p = PHP.indexOf(`<div id="admin-subtab-${lain}"`);
        if (p > awal && p < akhir) akhir = p;
    }
    return PHP.slice(awal, akhir);
}

console.log("=== tiap subtab punya judul dan keterangan ===");
for (const id of SUBTAB) {
    const blok = potong(id);
    const judul = blok.match(/<h3 class="panel-card-title">([^<]+)<\/h3>/);
    const ket = blok.match(/<p class="panel-card-desc">([^<]+)<\/p>/);
    uji(`${id} berjudul`, !!judul, "panel tanpa judul membuka langsung ke isinya");
    uji(`${id} berketerangan`, !!ket, "judul saja tidak menyebut apa yang dikerjakan di sini");
}

console.log("\n=== dua panel yang dulu telanjang ===");
const streams = potong("streams");
uji("Camera Streams diberi judul",
    /<h3 class="panel-card-title">Camera Streams<\/h3>/.test(streams),
    "dulu ia langsung membuka toolbar pencarian tanpa judul apa pun");
uji("judul Camera Streams mendahului toolbarnya",
    streams.indexOf('panel-card-title') < streams.indexOf('admin-filter-bar'));
const access = potong("access");
uji("Camera Access diberi keterangan",
    /<p class="panel-card-desc">Atur kamera mana yang dapat dilihat/.test(access),
    "dulu ia berjudul tanpa keterangan");

console.log("\n=== keterangan ditulis seragam ===");
const KET = [...PHP.matchAll(/<p class="panel-card-desc">([^<]+)<\/p>/g)].map(m => m[1].trim());
uji("keterangan tidak diakhiri titik",
    KET.every(k => !k.endsWith(".")),
    "satu baris keterangan bukan kalimat utuh");
uji("keterangan tidak memakai tanda pisah",
    KET.every(k => !/[—–]|\s-\s/.test(k)),
    KET.filter(k => /[—–]|\s-\s/.test(k)).join(" | "));
uji("keterangan panel yang baru cukup ringkas",
    ["Kelola kamera terdaftar, alamat RTSP, dan status koneksi",
     "Atur kamera mana yang dapat dilihat tiap grup dan akun"]
        .every(k => PHP.includes(k) && k.length <= 60));

console.log("\n=== judul kolom seragam satu bahasa ===");
// Kepala tabel sekaligus jadi label kartu di ponsel: table-labels.js
// menyalinnya ke tiap sel. Satu kolom berbahasa lain akan tampak dua
// kali, di tabel dan di kartunya.
const TH = [...PHP.matchAll(/<th\b[^>]*>([^<>]+)<\/th>/g)]
    .map(m => m[1].trim()).filter(Boolean);
const INDONESIA = ["Akun", "Peran", "Grup", "Kamera", "Aksi", "Waktu",
                   "Keamanan", "Keterangan", "IP Asal", "Dibuat Oleh",
                   "Klien / Kamera", "Pemegang", "Anggota"];
uji("tidak ada judul kolom berbahasa Indonesia",
    TH.every(t => !INDONESIA.includes(t)),
    TH.filter(t => INDONESIA.includes(t)).join(" | "));
uji("kolom aksi memakai satu bentuk saja",
    !TH.includes("Action"),
    "bentuk tunggal dan jamak bercampur antar tabel");
uji("kolom terbaca semua", TH.length >= 30, `baru ${TH.length}`);

// Judul yang berganti mengikuti arah tampilan disetel dari JS, bukan
// dari markup, jadi ia perlu dijaga terpisah.
const ADMINJS = fs.readFileSync(
    path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");
for (const [id, a, b] of [["akses-kol-1", "Group / Account", "Camera"],
                          ["akses-kol-2", "Members", "Group"],
                          ["akses-kol-jml", "Cameras", "Holders"]]) {
    uji(`${id} berganti dalam bahasa yang sama`,
        new RegExp(`${id}"\\)\\.textContent = perAkun \\? "${a}" : "${b}"`).test(ADMINJS));
}

console.log("\n=== keterangan tidak menjanjikan yang tak ada ===");
uji("Console Users tidak lagi mengaku mengatur akses kamera",
    !/Kelola akun pengguna, peran, dan hak akses kamera/.test(PHP),
    "barisnya cuma punya Edit dan Delete; kamera diatur di Camera Access");
uji("keterangan Console Users menyebut grup",
    /<p class="panel-card-desc">Kelola akun pengguna, peran, dan grupnya<\/p>/.test(PHP));
uji("semua keterangan di bawah enam puluh huruf",
    KET.every(k => k.length <= 60),
    KET.filter(k => k.length > 60).map(k => `${k.length}: ${k.slice(0, 40)}`).join(" | "));

console.log("\n=== judul panel satu bahasa, keterangan bahasa lainnya ===");
// Judul memakai istilah antarmuka yang dicari orang (Inggris), keterangan
// memakai bahasa penggunanya (Indonesia). Campur di dalam satu lapis membuat
// daftar panel terbaca seperti dua aplikasi yang ditempel.
const JUDUL = [...PHP.matchAll(/<h3 class="panel-card-title">([^<]+)<\/h3>/g)]
    .map(m => m[1].trim());
const KATA_ID = /\b(Kelola|Atur|Pengaturan|Konfigurasi|Kunci|Log Akses|Gruping|Layar|Daftar|Ruang|Pemutar|Jejak)\b/;
uji("judul panel tidak berbahasa Indonesia",
    JUDUL.every(j => !KATA_ID.test(j)),
    JUDUL.filter(j => KATA_ID.test(j)).join(" | "));
uji("judul panel terbaca semua", JUDUL.length >= 8, `baru ${JUDUL.length}`);
uji("keterangan panel berbahasa Indonesia",
    KET.every(k => /\b(Kelola|Atur|Pilih|Simpan|Pantau|Putar|Parameter|Batas|Kamera|Jejak|Kunci)\b/.test(k)),
    KET.filter(k => !/\b(Kelola|Atur|Pilih|Simpan|Pantau|Putar|Parameter|Batas|Kamera|Jejak|Kunci)\b/.test(k)).join(" | "));

console.log("\n=== halaman non-admin punya kepala yang sama bentuknya ===");
// Judul halaman harus sama persis dengan nama menunya di sidebar,
// supaya pengguna tidak menebak apakah ia sampai di tempat yang diklik.
const SIDEBAR = fs.readFileSync(
    path.join(AKAR, "frontend/includes/sidebar.php"), "utf8");
const HALAMAN = {
    "live-monitor.php": "Semua Kamera",
    "custom-monitor.php": "Screen",
    "maps.php": "Peta Kamera",
    "playback.php": "Playback",
    "admin-console.php": "Admin Console",
};
for (const [berkas, judul] of Object.entries(HALAMAN)) {
    const isi = fs.readFileSync(path.join(AKAR, "frontend/views", berkas), "utf8");
    const t = isi.match(/\$tabIntroTitle = '([^']+)'/);
    const d = isi.match(/\$tabIntroDesc = '([^']+)'/);
    uji(`${berkas} memakai kotak intro bersama`,
        /include __DIR__ \. '\/\.\.\/includes\/tab-intro-box\.php'/.test(isi),
        "judul tulis tangan menyimpang ukurannya dari halaman lain");
    uji(`${berkas} berjudul ${judul}`, !!t && t[1] === judul,
        t ? `tertulis ${t[1]}` : "tanpa judul");
    uji(`${berkas} judulnya ada di sidebar`, SIDEBAR.includes(`>${judul}<`),
        "nama menu dan judul halaman harus sama");
    uji(`${berkas} keterangannya ringkas`,
        !!d && d[1].length <= 60, d ? `${d[1].length} huruf` : "tanpa keterangan");
    uji(`${berkas} keterangan satu kalimat`,
        !!d && !d[1].slice(0, -1).includes(". "),
        "petunjuk pemakaian bukan tugas kepala halaman");
}

console.log("\n=== kode mati tidak ikut terpasang ===");
// viewer.php tak pernah di-include, tapi ketiga idnya sama dengan
// live-monitor.php. Bila ia kembali, getElementById hanya menemukan
// yang pertama dan grid video muncul di tempat yang salah.
uji("viewer.php sudah tidak ada",
    !fs.existsSync(path.join(AKAR, "frontend/views/viewer.php")),
    "id tab-viewer, cctv-grid, viewer-empty-state kembar dengan live-monitor.php");
const INDEX = fs.readFileSync(path.join(AKAR, "frontend/index.php"), "utf8");
for (const berkas of Object.keys(HALAMAN)) {
    uji(`${berkas} benar-benar dipasang`, INDEX.includes(`views/${berkas}`));
}
uji("tidak ada view yang tidak dipasang",
    fs.readdirSync(path.join(AKAR, "frontend/views"))
        .filter(f => f.endsWith(".php") && f !== "modals.php")
        .every(f => INDEX.includes(`views/${f}`)),
    "berkas yang tak pernah dipanggil menumpuk sebagai ranjau id kembar");

console.log("\n=== tombol subtab berjudul, tanpa keterangan ===");
// Tombol tab cukup judul: keterangannya sudah ada di kepala panel yang
// terbuka setelah diklik. Ditulis dua kali, kotak tab jadi tinggi dan
// halaman terbaca mengulang dirinya sendiri.
const TOMBOL = {};
for (const id of SUBTAB) {
    const m = PHP.match(new RegExp(`admin-subtab-btn-${id}"[\\s\\S]*?</button>`));
    const blokTombol = m ? m[0] : "";
    const j = blokTombol.match(/admin-tab-box-title">([^<]+)</);
    const k = blokTombol.match(/admin-tab-box-desc">([^<]+)</);
    TOMBOL[id] = { judul: j && j[1].trim(), ket: k && k[1].trim() };
    uji(`tombol ${id} berjudul`, !!TOMBOL[id].judul, "judul hilang");
    uji(`tombol ${id} tanpa keterangan`, !TOMBOL[id].ket,
        "tombol tab cukup judul; keterangan ada di kepala panelnya");
}

console.log("\n=== subtab berisi satu panel: tombol dan panel senama ===");
// Hanya berlaku untuk subtab yang isinya persis satu panel. Scanner, ads,
// dan api memuat beberapa panel, jadi namanya memang wadah, bukan isi.
for (const id of ["streams", "users", "access"]) {
    const isi = potong(id);
    const p = isi.match(/<h3 class="panel-card-title">([^<]+)<\/h3>/);
    const judulPanel = p && p[1].trim();
    uji(`${id}: nama tombol sama dengan judul panelnya`,
        TOMBOL[id].judul === judulPanel,
        `tombol "${TOMBOL[id].judul}" vs panel "${judulPanel}"`);
}

console.log("\n=== keadaan kosong tidak meminjam kelas kepala panel ===");
// panel-card-title milik kepala panel. Dipinjam pesan kartu kosong, tiap
// penjaga judul baru harus menyaringnya manual dan cepat luput.
for (const berkas of ["live-monitor.php", "custom-monitor.php", "playback.php"]) {
    const isi = fs.readFileSync(path.join(AKAR, "frontend/views", berkas), "utf8");
    uji(`${berkas} memakai empty-state-title`, isi.includes("empty-state-title"));
    uji(`${berkas}: panel-card-title tidak dipakai <p>`,
        !/<p[^>]*class="panel-card-title/.test(isi),
        "kelas kepala panel dipinjam pesan kartu kosong");
}
const CSS = fs.readFileSync(
    path.join(AKAR, "frontend/assets/css/global.css"), "utf8");
uji("empty-state-title bergaya di css", CSS.includes(".empty-state-title {"));
uji("empty-state-desc bergaya di css", CSS.includes(".empty-state-desc {"));
uji("kelas admin-tab-box-desc tidak menyisa di css",
    !CSS.includes("admin-tab-box-desc"),
    "gaya tanpa markup yang memakainya");

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

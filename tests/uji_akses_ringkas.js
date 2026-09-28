#!/usr/bin/env node
/**
 * Penjaga kesederhanaan Camera Access.
 *
 * Layar ini sempat mencetak nama tiap kamera di dalam sel tabel. Satu
 * akun dapat memegang puluhan kamera, dan 15 kamera saja sudah membuat
 * satu baris setinggi 329px pada layar 577px — satu baris menenggelamkan
 * seluruh tabel. Jumlahnya cukup untuk memindai; rinciannya ada di balik
 * tombol Atur.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const PHP = fs.readFileSync(path.join(AKAR, "frontend/views/admin-console.php"), "utf8");
const MOD = fs.readFileSync(path.join(AKAR, "frontend/views/modals.php"), "utf8");
const JS = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");
const CSS = fs.readFileSync(path.join(AKAR, "frontend/assets/css/global.css"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

const awal = PHP.indexOf('<div id="admin-subtab-access"');
const bagian = PHP.slice(awal, PHP.indexOf('<div id="admin-subtab-scanner"'));

console.log("=== daftar kamera tidak dicetak per baris ===");
uji("bagian Camera Access ditemukan", awal > 0);
uji("kolom Kamera dihapus dari kepala tabel",
    !/id="akses-kol-3"/.test(bagian),
    "15 kamera membuat baris setinggi 329px pada layar 577px");
uji("kolom jumlah menggantikannya", /id="akses-kol-jml"/.test(bagian));
uji("tabel tinggal lima kolom",
    (bagian.match(/<th[\s>]/g) || []).length === 5,
    "No, Grup/Akun, Anggota, Kamera, Aksi");
uji("baris kosong memakai colspan lima",
    /colspan="5"/.test(bagian) && !/colspan="6"/.test(bagian));

console.log("\n=== nama kamera benar-benar hilang dari tabel ===");
uji("sel rincian kamera tidak dicetak",
    !/\$\{rinci\}/.test(JS) && !/\$\{rinciKam\}/.test(JS));
uji("penanda cara tidak lagi disusun",
    !/function labelCara/.test(JS),
    "penanda hanya dipakai daftar kamera yang sudah dihapus");
uji("penanda izin tidak lagi disusun", !/function labelIzin/.test(JS));
uji("tidak ada sisa pembentang kamera",
    !/kam-lagi|bentangKamera|BATAS_KAMERA/.test(JS + CSS),
    "membatasi daftar tidak lagi perlu bila daftarnya tidak ada");
uji("baris anggota ikut tanpa kolom kamera",
    !/<td class="py-2 px-4 text-\[10px\]">/.test(JS));

console.log("\n=== judul kolom mengikuti arah tampilan ===");
uji("judul kolom jumlah diganti saat arah berubah",
    /akses-kol-jml"\)\.textContent = perAkun \? "Cameras" : "Holders"/.test(JS),
    "kolom itu menghitung kamera per akun, tapi akun per kamera");
uji("judul kolom kedua tetap mengikuti arah",
    /akses-kol-2"\)\.textContent = perAkun \? "Members" : "Group"/.test(JS));
uji("judul kolom ketiga tidak lagi disetel",
    !/akses-kol-3"\)\.textContent/.test(JS),
    "kolomnya sudah tidak ada");

console.log("\n=== keterangan penanda ikut hilang ===");
uji("popup arti penanda dihapus",
    !/arti-akses-modal/.test(MOD + JS + CSS),
    "ia menjelaskan penanda yang tidak lagi tampil di mana pun");
uji("tombol tanya dihapus", !/akses-tanya/.test(PHP + CSS));
uji("fungsi popup dihapus", !/bukaArtiAkses|tutupArtiAkses/.test(JS));
uji("keterangan empat baris tidak kembali",
    !bagian.includes("tanpa pemberian") && !bagian.includes("kamera yang dibagikan Super Admin"));

console.log("\n=== kalimat penjelas yang mengulang tetap dibuang ===");
uji("judul layar tanpa kalimat penjelas",
    !/panel-card-desc">Akun mana memegang kamera mana/.test(bagian));
uji("modal tanpa kalimat perintah",
    !/Pilih akun, lalu tentukan kamera dan jenis aksesnya/.test(MOD));
uji("catatan LIVE dan REKAMAN dibuang",
    !/LIVE = menonton siaran langsung/.test(JS),
    "judul kolom LIVE dan REKAMAN berdiri tepat di atas centangnya");
uji("keterangan BAGIKAN dipertahankan",
    /BAGIKAN = boleh meneruskan kamera ke bawahannya/.test(JS),
    "wewenang meneruskan tidak terbaca dari kata 'bagikan' saja");
uji("catatan disembunyikan bila bukan Admin",
    /catatan\.classList\.toggle\("hidden", !keAdmin\)/.test(JS));

console.log("\n=== teks pendek di tempat yang jelas ===");
uji("pencarian tabel ringkas", /placeholder="Cari…"/.test(bagian));
uji("pencarian kamera menyebut isinya", /placeholder="Cari kamera…"/.test(MOD));
uji("pesan memuat ringkas", /<span>Memuat…<\/span>/.test(bagian));
uji("judul modal ringkas", />Camera Access<\/h3>/.test(MOD));
uji("tidak ada tiga titik yang tersisa",
    !/Cari akun atau kamera\.\.\.|Memuat data akses\.\.\.|Cari kamera atau grup\.\.\./.test(PHP + MOD));

// ── Kolom Akun: memilih hanya saat menambah ──────────────────────────
// Tombol Atur ditekan dari baris yang sudah tertentu, jadi tak ada yang
// perlu dipilih di sana. Dropdown tetap hidup di balik layar sebagai sumber
// nilai: delapan tempat membaca sel.value untuk menentukan alamat simpan,
// jadi menggantinya dengan teks akan memutus penyimpanan.
console.log("\n=== kolom akun: pilih saat tambah, tetap saat atur ===");
uji("pembungkus teks statis ada", /id="akses-modal-akun-tetap"/.test(MOD));
uji("wadah nama akun ada", /id="akses-modal-akun-nama"/.test(MOD));
uji("dropdown tetap ada sebagai sumber nilai",
    /<select id="akses-modal-akun"/.test(MOD),
    "menghapusnya memutus delapan pembaca sel.value");
uji("ada satu fungsi penentu mode", /function pasangModeAkun\(/.test(JS));
uji("mode atur menyembunyikan dropdown",
    /wrapPilih\.classList\.toggle\("hidden", sunting\)/.test(JS));
uji("mode atur menampilkan teks",
    /wrapTetap\.classList\.toggle\("hidden", !sunting\)/.test(JS));
uji("tombol Atur baris akun memakai mode atur",
    /if \(userId\) \{[\s\S]{0,400}pasangModeAkun\("atur"/.test(JS));
uji("tombol Add Access memakai mode tambah",
    /pasangModeAkun\("tambah"\)/.test(JS));
uji("baris grup memakai mode atur",
    /pasangModeAkun\("atur", `Grup: \$\{nama\}`\)/.test(JS));
// Tanpa ini Add Access yang dibuka sesudah Atur tampil sebagai teks mati.
uji("modal dikembalikan ke mode tambah saat ditutup",
    /tutupAksesKamera[\s\S]{0,500}pasangModeAkun\("tambah"\)/.test(JS),
    "modal berikutnya tidak boleh mewarisi mode sebelumnya");
uji("tinggi teks akun disetarakan dropdown",
    /#akses-modal-akun-nama \{[^}]*padding-top/.test(CSS));
uji("tidak memakai kelas yang tak ada di css",
    !/app-input-icon-left/.test(MOD),
    "kelas karangan membuat padding hilang diam-diam");

// ── Arah Per Kamera: siapa saja yang berhak atas satu kamera ─────────
// Kolom Actions arah ini dulu selalu "—". Backend /sharing sudah ada sejak
// lama namun tak pernah dipanggil frontend.
console.log("\n=== per kamera: pop up hak akses ===");
uji("modal berbagi ada", /id="berbagi-modal"/.test(MOD));
uji("daftar akun ada", /id="berbagi-daftar"/.test(MOD));
uji("bagian grup ada", /id="berbagi-grup-bagian"/.test(MOD));
uji("tombol atur muncul di arah per kamera",
    /window\.bukaBerbagiKamera\(\$\{b\.stream_id\}/.test(JS));
uji("memanggil endpoint sharing yang sudah ada",
    /streams\/\$\{streamId\}\/sharing/.test(JS));
uji("menyimpan lewat POST sharing",
    /streams\/\$\{berbagiKini\.stream_id\}\/sharing/.test(JS));

// Dua centang terpisah: live tanpa rekaman itu keadaan sah dan dipakai.
uji("centang lihat dan rekaman terpisah",
    /data-jenis="view"/.test(JS) && /data-jenis="playback"/.test(JS));
uji("rekaman menyalakan lihat", /if \(nyala\) p\.can_view = true;/.test(JS));
uji("mematikan lihat mematikan rekaman",
    /if \(!nyala\) p\.can_playback = false;/.test(JS));

// Backend menolak baris tanpa izin apa pun; yang dimatikan harus keluar
// dari daftar, bukan dikirim dengan centang kosong.
uji("baris tanpa izin tidak dikirim",
    /filter\(p => !p\.terkunci && \(p\.can_view \|\| p\.can_playback\)\)/.test(JS),
    "mengirimnya membuat backend menolak seluruh permintaan");
uji("baris terkunci tidak ikut dikirim", /!p\.terkunci &&/.test(JS));
uji("baris terkunci tetap tampil", /p\.terkunci \? " disabled" : ""/.test(JS),
    "menyembunyikannya membuat akses yang tak terjelaskan");
uji("grup baca-saja, tanpa centang",
    !/berbagi-grup-daftar[\s\S]{0,600}type="checkbox"/.test(JS),
    "grup memperoleh kamera lewat kepemilikan Admin, bukan pencentangan");
uji("sesi mati ditangani", /r\.status === 401[\s\S]{0,80}handleLogout/.test(JS));
uji("tidak memakai pembantu yang tak ada", !/authHeaders/.test(JS));
uji("sasaran sentuh centang dilebarkan",
    /#berbagi-daftar span:has\(> input\[type="checkbox"\]\)/.test(CSS),
    "kotak bawaan hanya 13px, di bawah batas sentuh");

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

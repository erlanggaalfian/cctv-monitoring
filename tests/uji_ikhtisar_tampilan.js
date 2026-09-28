#!/usr/bin/env node
/**
 * Penjaga ikhtisar akses: satu akun satu tempat, dan dropdown anggota
 * yang benar-benar terbaca sebagai dropdown.
 *
 * Ditulis setelah `user1` muncul dua kali: sebagai anggota grup-admin1
 * dan sebagai baris tersendiri di bawahnya, masing-masing dengan tombol
 * Atur. Dua pintu ke satu hal membuat orang ragu mana yang berlaku.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const MAIN = fs.readFileSync(path.join(AKAR, "backend/main.py"), "utf8");
const JS = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");
const CSS = fs.readFileSync(path.join(AKAR, "frontend/assets/css/global.css"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

console.log("=== hanya Admin yang pindah ke baris grup ===");
// Potong badan endpoint ikhtisar supaya penyaringan yang diperiksa benar
// yang menyusun baris_akun, bukan kemiripan di tempat lain.
const awal = MAIN.indexOf("def admin_ikhtisar_akses");
const potong = MAIN.slice(awal, MAIN.indexOf("def _kamera_terjangkau", awal));
uji("endpoint ikhtisar ditemukan", awal > 0);
uji("penghuni grup disaring dari baris_akun",
    /_peran\(u\) == "admin" or \(u\.admin_group or ""\)\.strip\(\)/.test(potong),
    "tanpa ini penghuni grup muncul sebagai anggota grup DAN baris sendiri");
uji("baris grup menghimpun semua penghuni",
    /if u\.admin_group and not kuasa_penuh\(u\):/.test(potong),
    "Admin maupun User menghuni grupnya, agar grup terbaca sebagai satu kesatuan");
uji("Super Admin tetap berbaris",
    /and not kuasa_penuh\(u\)/.test(potong),
    "Super Admin tak punya grup untuk menampungnya, jadi ia harus tetap tampil");
uji("kamera grup hanya disumbang Admin",
    /penyumbang = \[o for o in orang if _peran\(o\) == "admin"\]/.test(potong),
    "kamera User adalah pemberian pribadi; menyumbangkannya membuatnya tampak milik grup");
uji("User anggota tidak mewarisi kamera grup",
    /if _peran\(orang\) == "admin":/.test(potong)
        && /return _kamera_akun\(orang\)/.test(potong),
    "menyamakan keduanya menjanjikan kamera yang tak sungguh dapat dibuka User");
uji("penyaringan terjadi sebelum daftar kamera disusun",
    potong.indexOf('u.admin_group or ""') < potong.indexOf("baris_akun.append"));

console.log("\n=== dropdown anggota memakai kelasnya sendiri ===");
uji("pemicu punya kelas", /class="ang-pemicu/.test(JS));
uji("anggota berdiri sebagai baris", /<tr class="ang-baris-anggota">/.test(JS));
uji("baris anggota punya kelas", /class="ang-baris-anggota"/.test(JS));
uji("tidak lagi memakai segitiga entitas HTML",
    !/&#9650;|&#9660;/.test(JS),
    "panah kini SVG yang berputar, bukan karakter yang tak dapat dianimasikan");
uji("jumlah anggota jadi lencana", /class="ang-pemicu-jml"/.test(JS));
uji("inisial nama tidak lagi dicetak",
    !/class="ang-awal"/.test(JS),
    "avatar huruf mendorong nama menjauh tanpa menambah keterangan");
uji("keadaan terbuka ditandai di pemicu",
    /ang-pemicu--buka/.test(JS),
    "tanpa ini yang terbuka dan tertutup terlihat sama");
uji("aria-expanded tetap dipasang", /aria-expanded="\$\{buka\}"/.test(JS));

console.log("\n=== tindakan tiap anggota jelas ===");
uji("Admin bertanda otomatis", /ang-tanda--auto/.test(JS));
uji("User membawa tombol Atur", /class="ang-tombol"/.test(JS));
uji("tombol tidak lagi membawa angka",
    !/ang-tombol-jml/.test(JS),
    "jumlah kamera kini punya kolomnya sendiri, tidak menempel di tombol");
uji("tombol Atur menuju modal akses",
    /ang-tombol"[^`]*?onclick|onclick="window\.bukaAksesKamera\(\$\{a\.user_id\}\)"[^`]*?ang-tombol/.test(JS)
    || /window\.bukaAksesKamera\(\$\{a\.user_id\}\)/.test(JS));

console.log("\n=== CSS pendukung ada ===");
for (const k of ["ang-pemicu", "ang-pemicu--buka", "ang-pemicu-jml",
                 "ang-baris-anggota", "ang-anak", "ang-nama", "ang-peran",
                 "ang-tanda--auto", "ang-tombol", "ang-kosong"]) {
    uji(`.${k} punya aturan`, new RegExp(`\\.${k.replace(/--/g, "--")}[\\s,{:]`).test(CSS));
}
uji("baris anggota menyala saat disentuh",
    /\.ang-baris-anggota:hover > td/.test(CSS));
uji("nama panjang dipotong, tidak mendorong tata letak",
    /\.ang-nama \{[^}]*text-overflow: ellipsis/.test(CSS),
    "nama akun bisa sepanjang apa pun; tanpa ini kolom melar");

console.log("\n=== pemicu seluas kolomnya ===");
uji("pemicu memenuhi lebar",
    /\.ang-pemicu \{[^}]*width: 100%/.test(CSS),
    "sasaran klik selebar tulisan menyisakan bidang mati di kanan");
uji("pemicu memakai flex, bukan inline-flex",
    /\.ang-pemicu \{[^}]*display: flex;/.test(CSS),
    "inline-flex menyusut mengikuti isinya");
uji("teks mengisi sisa ruang",
    /\.ang-pemicu-teks \{[^}]*flex: 1 1 auto/.test(CSS));
uji("kolom anggota diberi lebar tetap", /\.akses-kol-anggota/.test(CSS));

console.log("\n=== isi hanya ada saat terbuka ===");
uji("anggota tidak dibangun saat tertutup",
    /if \(buka\) \{/.test(JS) && /barisRinci = buka/.test(JS),
    "baris tersembunyi tetap terjaring pencarian dalam halaman");
uji("daftar anggota disusun di dalam cabang buka",
    /if \(buka\) \{[\s\S]{0,400}?anggota = \(b\.anggota \|\| \[\]\)\.map/.test(JS));
uji("kepala baris hanya menyebut jumlah",
    !/jmlAdmin \? ` &middot;/.test(JS),
    "rincian admin turun ke dalam panel");

console.log("\n=== anggota sejajar kolom induknya ===");
uji("anggota jadi baris tabel, bukan isi satu sel",
    /<tr class="ang-baris-anggota">/.test(JS),
    "hanya baris tabel yang kolomnya jatuh lurus di bawah judul kolom");
uji("baris anggota punya lima kolom",
    (JS.match(/<tr class="ang-baris-anggota\$\{iA[\s\S]*?<\/tr>/) || [""])[0]
        .split("<td").length - 1 === 5,
    "jumlah kolom harus sama dengan induknya");
uji("kolom Jml diisi jumlah kamera anggota",
    /ang-jml[^`]*\$\{a\.jumlah_kamera\}/.test(JS),
    "angka jadi keterangan pudar lewat .ang-jml, bukan font-bold gelap");
uji("nama kamera tidak dicetak di baris anggota",
    !/rinciKam/.test(JS),
    "puluhan kamera membuat satu baris setinggi layar");
uji("klik pada baris anggota tidak menutup grupnya",
    /<tr class="ang-baris-anggota\$\{[^`]*?onclick="event\.stopPropagation\(\);"/.test(JS),
    "baris anggota berada di dalam jangkauan klik baris grup");
uji("tindakan berada di kolom terakhir",
    /<td class="py-2 px-4 aksi-sel">\$\{tanda\}<\/td>/.test(JS),
    "otomatis dan Atur harus lurus di bawah judul Aksi");
uji("anggota ditandai bergantung pada grupnya", /class="ang-anak"/.test(JS));
uji("CSS baris anggota ada", /\.ang-baris-anggota > td/.test(CSS));
uji("garis siku menandai anak", /\.ang-anak::before/.test(CSS));

console.log("\n=== seluruh baris grup dapat diklik ===");
uji("baris grup membawa penanganan klik",
    /onclick="window\.bentangGrup\('\$\{encodeURIComponent\(b\.grup\)\}'\)" class="ang-baris-grup/.test(JS),
    "menuntut orang mengenai tombol kecil membuat baris terasa mati");
uji("baris grup ditandai dapat diklik",
    /\.ang-baris-grup \{[^}]*cursor: pointer/.test(CSS));
uji("pemicu tidak membentangkan dua kali",
    /kol2 = `<button type="button" onclick="event\.stopPropagation\(\);/.test(JS),
    "tanpa ini klik pada pemicu membuka lalu menutup lagi");
uji("tombol Atur grup tidak ikut membentangkan",
    /aksi = `<span class="aksi-isi"><button onclick="event\.stopPropagation\(\); window\.bukaAksesGrup/.test(JS));
uji("baris bukan grup tidak dapat diklik",
    /: ` class="hover:bg-slate-50/.test(JS),
    "hanya baris grup yang punya isi untuk dibentangkan");

console.log("\n=== panel tidak melarkan sel tetangga ===");
// Panel yang tumbuh di dalam satu sel memaksa sel lain setinggi itu juga,
// meninggalkan bidang kosong di kolom Kamera dan Aksi.
uji("panel turun ke baris tersendiri",
    /barisRinci = buka/.test(JS),
    "panel di dalam sel membuat sel tetangga melar dan kosong");
uji("baris anggota berdiri sendiri, bukan satu sel melebar",
    /barisRinci = buka\s*\n\s*\? \(anggota \|\|/.test(JS));
const potKol2 = JS.slice(JS.indexOf("kol2 = `<button"), JS.indexOf("barisRinci = buka"));
uji("kol2 hanya memuat pemicu",
    potKol2.length > 0 && !potKol2.includes("ang-panel")
        && !potKol2.includes("ang-baris-anggota"),
    "anggota harus keluar dari sel agar sel tetangga tidak ikut melar");
uji("baris rincian ikut dicetak", /<\/tr>\$\{barisRinci\}`/.test(JS));
uji("barisRinci selalu punya nilai awal",
    /let barisRinci = "";/.test(JS),
    "baris non-grup tidak boleh mencetak undefined");
uji("baris utama kembali rata tengah",
    /class="hover:bg-slate-50[^"]*align-middle"/.test(JS),
    "align-top hanya perlu ketika satu sel jauh lebih tinggi");
uji("baris anggota tanpa garis pemisah sendiri",
    /\.ang-baris-anggota > td \{[^}]*border-top: 0/.test(CSS));
uji("anggota dibedakan lewat latar, bukan garis",
    /\.ang-baris-anggota > td \{[^}]*background: var\(--c-surface2\)/.test(CSS));

console.log("\n=== kolom Actions lurus satu sumbu ===");
// Teks telanjang, lencana berbingkai, dan tanda "—" punya lebar sendiri.
// Tanpa wadah berlebar sama, tiap baris mulai di tempat berbeda dan
// kolomnya terbaca zig-zag dari atas ke bawah.
{
    const varian = [
        [/aksi = `<span class="aksi-isi">[\s\S]*?—/, 'tanda "—" berwadah'],
        [/aksi = `<span class="aksi-isi"><button[^`]*bukaAksesGrup/, "Atur grup berwadah"],
        [/aksi = `<span class="aksi-isi"><button[^`]*bukaAksesKamera\(\$\{b\.user_id\}/, "Atur akun berwadah"],
        [/\? `<span class="aksi-isi"><span class="ang-tanda ang-tanda--auto"/, "lencana otomatis berwadah"],
        [/: `<span class="aksi-isi"><button[^`]*bukaAksesKamera\(\$\{a\.user_id\}/, "Atur anggota berwadah"],
    ];
    for (const [pola, nama] of varian) uji(nama, pola.test(JS));

    // Induk dan anak memakai kelas sel yang sama; text-right telanjang
    // membuat sumbunya bergeser mengikuti bingkai tombol.
    uji("sel aksi induk memakai aksi-sel", /<td class="py-3\.5 px-4 aksi-sel">/.test(JS));
    uji("sel aksi anak memakai aksi-sel", /<td class="py-2 px-4 aksi-sel">/.test(JS));
    uji("tak ada sel aksi yang tersisa text-right",
        !/<td[^>]*text-right">\$\{(aksi|tanda)\}/.test(JS));

    // Atur di baris induk dahulu teks telanjang, di baris anak berkotak.
    // Bentuk yang sama menjaga tepinya jatuh di satu garis.
    uji("Atur induk dan anak sama bentuknya",
        (JS.match(/class="ang-tombol"/g) || []).length === 6,
        "induk grup, induk akun, anggota, per-kamera, Edit pengguna, dan Edit grup sama-sama ang-tombol");
    // Delete memakai bentuk yang sama dengan warna peringatan sendiri.
    uji("Delete pengguna sebentuk dengan tombol lain",
        /class="ang-tombol ang-tombol--bahaya"/.test(JS),
        "Delete ikut ang-tombol, dibedakan hanya oleh warnanya");

    const CSS = fs.readFileSync(
        path.join(AKAR, "frontend/assets/css/global.css"), "utf8");
    const PHP = fs.readFileSync(
        path.join(AKAR, "frontend/views/admin-console.php"), "utf8");
    uji("wadah aksi berlebar tetap",
        /\.aksi-isi \{[^}]*min-width:\s*4\.5rem/.test(CSS),
        "tanpa lebar tetap, wadah menyusut mengikuti isinya");
    uji("wadah aksi memusatkan isinya",
        /\.aksi-isi \{[^}]*justify-content:\s*center/.test(CSS));
    uji("kotak di dalam wadah dipatok selebar wadahnya",
        /\.aksi-isi > \.ang-tombol \{[^}]*min-width:\s*4\.5rem/.test(CSS),
        "bingkai OTOMATIS dan ATUR harus bertumpuk, bukan berselang-seling");
    uji("tinggi kotak aksi seragam",
        /\.aksi-isi \{[^}]*min-height:\s*1\.375rem/.test(CSS));
    uji("header Actions memakai wadah yang sama",
        /aksi-sel[^>]*>\s*<span class="aksi-isi">Actions/.test(PHP),
        "header rata kanan flush tidak sesumbu dengan tombol berbingkai");
    uji("lencana ikut tinggi sentuh di ponsel",
        /\.ang-baris-anggota \.ang-tanda \{[^}]*min-height: 36px/.test(CSS),
        "tombol tinggi tapi lencana pendek membuat baris anak tidak rata");
}

console.log("\n=== teks peran dan nama seragam induk-anak ===");
// Peran induk pernah 12px/700 hitam sementara peran anak 8px/400 abu-abu.
// Beda sebesar itu terbaca sebagai dua jenis data, padahal isinya sama.
// Pembeda induk-anak cukup lewat indentasi dan garis .ang-anak::before.
{
    uji("peran induk memakai kelas yang sama dengan anak",
        /kol2 = `<span class="ang-peran">/.test(JS),
        "text-\\[10px\\] arbitrary tidak ikut ter-build dan diam-diam jadi 12px");
    uji("tidak ada peran berkelas Tailwind sendiri",
        !/uppercase text-\[10px\] font-bold/.test(JS));
    uji("nama akun induk memakai ang-nama",
        /<span class="ang-nama">\$\{perAkun \? b\.username : b\.stream_name\}<\/span>/.test(JS));
    uji("nama grup induk memakai ang-nama",
        /<span class="ang-nama">\$\{b\.grup\}<\/span>/.test(JS));
    uji("kolom Group per-kamera memakai ang-nama",
        /kol2 = `<span class="ang-nama">\$\{b\.group_name/.test(JS));
    uji("sel nama induk tidak lagi memaksa bobotnya sendiri",
        !/<td class="py-3\.5 px-4 font-semibold text-slate-900/.test(JS),
        "font-semibold di sel menimpa gaya bersama");

    uji("ang-nama berukuran 0.75rem", /\.ang-nama \{[^}]*font-size: 0\.75rem/.test(CSS));
    uji("ang-nama berbobot 600", /\.ang-nama \{[^}]*font-weight: 600/.test(CSS));
    uji("ang-nama memakai warna teks utama",
        /\.ang-nama \{[^}]*color: var\(--c-text\)/.test(CSS));
    uji("ang-peran berbobot 700", /\.ang-peran \{[^}]*font-weight: 700/.test(CSS));
    uji("ang-peran dipudarkan sebagai keterangan pendukung",
        /\.ang-peran \{[^}]*color: var\(--c-text-muted\)/.test(CSS),
        "peran adalah label, bukan teks sederajat nama; kontras terukur 6.29");
    uji("indentasi tetap jadi pembeda induk-anak",
        /\.ang-anak \{[^}]*padding-left: 1\.125rem/.test(CSS) &&
        /\.ang-anak::before \{/.test(CSS),
        "pembeda hierarki lewat indentasi, bukan ukuran font");
}

console.log("\n=== isi kotak aksi benar-benar terpusat ===");
// justify-content tidak berlaku pada display:block. .ang-tanda dahulu block,
// jadi center-nya diam-diam mati dan teks "otomatis" menempel kanan mengikuti
// text-align:right milik selnya -- meleset 8,67px dari sumbu kolom.
{
    const blokKotak = (CSS.match(/\.aksi-isi > \.ang-tanda,\s*\.aksi-isi > \.ang-tombol \{[^}]*\}/) || [""])[0];
    uji("kotak aksi memakai display flex",
        /display:\s*inline-flex/.test(blokKotak),
        "justify-content: center tidak berlaku pada display:block");
    uji("kotak aksi memusatkan isinya mendatar",
        /justify-content:\s*center/.test(blokKotak));
    uji("kotak aksi memusatkan isinya menegak",
        /align-items:\s*center/.test(blokKotak));
    uji("kotak aksi tidak mewarisi rata kanan selnya",
        /text-align:\s*center/.test(blokKotak),
        ".aksi-sel rata kanan; tanpa ini teks di dalam kotak ikut menepi");
}


console.log("\n=== garis hierarki terbaca ===");
uji("garis anak memakai warna yang terlihat",
    /\.ang-anak::before \{[^}]*background: var\(--c-text-muted\)/.test(CSS),
    "warna 7% putih membuat garisnya praktis tak tampak");
uji("garis tegak menyambung anak ke induk",
    /\.ang-anak::after \{[^}]*width: 1px/.test(CSS),
    "tanpa garis tegak tiap anak berdiri sendiri");
uji("lencana dan tombol seradius",
    /\.ang-tanda \{[^}]*border-radius: var\(--r-sm\)/.test(CSS) &&
    /\.ang-tombol \{[^}]*border-radius: var\(--r-sm\)/.test(CSS),
    "kapsul di sebelah kotak membulat terbaca sebagai dua jenis tombol");

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

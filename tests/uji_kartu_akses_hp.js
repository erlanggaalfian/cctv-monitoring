#!/usr/bin/env node
/**
 * Penjaga tata letak Camera Access di ponsel.
 *
 * Aturan umum ponsel menjadikan tiap baris tabel satu kartu. Untuk tabel
 * ini itu memecah grup dan anggotanya menjadi kartu-kartu sederajat,
 * padahal anggota adalah isi grup. Kartu grup yang sedang terbuka karena
 * itu dibiarkan menyambung ke bawah tanpa jarak dan tanpa sudut.
 */
const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(AKAR, "frontend/assets/css/global.css"), "utf8");
const JS = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// Aturan ponsel hanya berlaku di dalam kurungan lebar layar kecil.
const aw = CSS.indexOf("@media (max-width: 639px)");
const hp = CSS.slice(aw, CSS.indexOf("@media", aw + 10) > 0
    ? CSS.indexOf("Camera Access: anggota menyatu", aw) + 6000 : CSS.length);

console.log("=== anggota menyatu dengan kartu grupnya ===");
uji("aturan ponsel ditemukan", aw > 0);
uji("tabel akses punya aturan kartunya sendiri",
    /#akses-table-body tr \{/.test(hp),
    "aturan umum memecah grup dan anggotanya jadi kartu sederajat");
uji("kartu grup terbuka kehilangan jarak bawahnya",
    /\.ang-baris-grup--buka \{[\s\S]*?margin-bottom: 0/.test(hp),
    "jarak sekecil apa pun memutus grup dari anggotanya");
uji("kartu grup terbuka kehilangan sudut bawahnya",
    /\.ang-baris-grup--buka \{[\s\S]*?border-bottom-left-radius: 0/.test(hp));
uji("kartu grup terbuka kehilangan garis bawahnya",
    /\.ang-baris-grup--buka \{[\s\S]*?border-bottom: 0/.test(hp));
uji("anggota tidak berjarak dari yang di atasnya",
    /\.ang-baris-anggota \{[\s\S]*?margin-bottom: 0/.test(hp));
uji("anggota terakhir menutup kartu",
    /\.ang-baris-anggota--akhir \{[\s\S]*?border-bottom-left-radius: var\(--radius-md\)/.test(hp));
uji("penanda terbuka dipasang di kelas baris",
    /ang-baris-grup\$\{buka \? " ang-baris-grup--buka" : ""\}/.test(JS));
uji("penanda anggota terakhir dipasang",
    /iA === jmlAnggota - 1 \? " ang-baris-anggota--akhir" : ""/.test(JS));
uji("keadaan terbuka terjangkau saat menyusun baris",
    /let buka = false;/.test(JS),
    "dideklarasikan di dalam blok if, ia tidak terlihat saat menyusun <tr>");

console.log("\n=== kartu bersih dari garis berlebih ===");
uji("garis antar sel dibuang",
    /#akses-table-body td \{[\s\S]*?border-bottom: 0/.test(hp),
    "di dalam satu kartu garis itu menumpuk dan memenggal isi");
uji("label kolom tidak dicetak ulang",
    /#akses-table-body td::before \{ display: none/.test(hp));
uji("jumlah kamera diberi kata",
    /#akses-table-body td:nth-child\(4\)::after \{[\s\S]*?content: " kamera"/.test(hp),
    "tanpa judul kolom, angka sendirian tidak menyebut apa yang dihitung");

console.log("\n=== susunan kartu grup ===");
uji("kartu memakai kisi bernama",
    /#akses-table-body tr \{[\s\S]*?grid-template-areas/.test(hp));
uji("nama dan aksi sebaris di baris atas",
    /"nama  jml aksi"/.test(hp),
    "judul dan tombol sejajar; ruang tengah tidak terbuang");
uji("pemicu anggota di dasar kartu",
    /"anggota anggota anggota"/.test(hp));
uji("pemicu jadi pembatas halus di atas daftar anggota",
    /#akses-table-body \.ang-pemicu \{[^}]*background: transparent/.test(hp) &&
    /#akses-table-body \.ang-pemicu \{[^}]*border-top: 1px solid/.test(hp),
    "latar biru penuh memakan ruang; pembatas cukup menandai batas");
uji("pembatas membentang selebar kartu",
    /#akses-table-body \.ang-pemicu \{[^}]*width: calc\(100% \+ var\(--space-3\) \* 2\)/.test(hp),
    "pembatas harus melewati padding kartu agar terbaca sebagai garis batas");
uji("seluruh kartu grup dapat diklik",
    /onclick="window\.bentangGrup/.test(JS) && /\.ang-baris-grup \{[^}]*cursor: pointer/.test(CSS));

console.log("\n=== susunan baris anggota ===");
uji("anggota diberi latar berbeda",
    /\.ang-baris-anggota \{[\s\S]*?background: var\(--c-surface2\)/.test(hp),
    "latar itulah yang menandai ia isi grup, bukan sesamanya");
uji("nama dan peran punya petak masing-masing",
    /"nama  jml aksi"/.test(hp) && /"peran jml aksi"/.test(hp),
    "satu petak untuk keduanya membuat teksnya saling menimpa");
uji("jumlah kamera punya lajur sendiri",
    (hp.match(/grid-template-columns: 1fr 4\.5rem 4\.5rem/g) || []).length === 3 &&
    /"nama  jml aksi"[\s\S]{0,40}"peran jml aksi"/.test(hp),
    "ketiga blok (akun, grup, anggota) harus memakai lajur yang sama persis");
uji("tidak ada lajur melar tertinggal",
    !/grid-template-columns: auto 1fr auto;/.test(hp),
    "deklarasi lama yang tertinggal di bawah menang dan lajur melar lagi");
uji("tombol anggota setinggi sasaran sentuh",
    /\.ang-baris-anggota \.ang-tombol \{[^}]*min-height: 36px/.test(hp));
uji("garis siku tidak dipakai di ponsel",
    /\.ang-baris-anggota \.ang-anak::before \{ display: none/.test(hp),
    "di kartu, latar sudah menandai hubungan itu");
uji("klik pada anggota tidak menutup grupnya",
    /<tr class="ang-baris-anggota\$\{[^`]*?onclick="event\.stopPropagation\(\);"/.test(JS));

console.log("\n=== kartu akun biasa ===");
uji("peran jadi keterangan di bawah nama",
    /#akses-table-body td:nth-child\(3\) \{[\s\S]{0,80}?grid-area: peran/.test(hp) &&
    /"peran jml aksi"/.test(hp),
    "peran turun ke baris keterangan, bukan sejajar judul");
uji("hanya kartu grup yang menaruhnya di dasar",
    /\.ang-baris-grup > td:nth-child\(3\) \{ grid-area: anggota/.test(hp),
    "peran biasa bukan pemicu; ia tidak pantas jadi baris penuh");

console.log("\n=== nomor tidak diulang di kartu ===");
uji("nomor disembunyikan di ponsel",
    /#akses-table-body td:nth-child\(1\) \{ display: none; \}/.test(hp),
    "kartu tersusun berurut sendiri, nomor mengulang yang sudah terlihat");
uji("petak nomor dilepas dari peta kartu",
    !/"no nama/.test(hp) && /"nama  jml aksi"/.test(hp));
uji("nama grup mengisi baris atas", /"nama jml aksi"/.test(hp));
uji("anggota dilekukkan agar tetap terbaca lebih dalam",
    /\.ang-baris-anggota \{[\s\S]*?padding: var\(--space-2\) var\(--space-3\) var\(--space-2\) 1\.5rem !important/.test(hp),
    "lekukan dulu datang dari sel nomor; padding singkatan menimpa padding-left");

console.log("\n=== lebar kolom dibagi menurut isinya ===");
uji("tabel memakai lebar yang ditetapkan",
    /#admin-subtab-access table \{ table-layout: fixed; \}/.test(CSS),
    "tanpa ini sisa ruang jatuh semua ke kolom berteks terpanjang");
uji("lebar memakai bagian relatif, bukan rem",
    /#admin-subtab-access thead th:nth-child\(2\) \{ width: 42%; \}/.test(CSS),
    "table-layout fixed mengabaikan min-width, kolom nama tergencet jadi 15px");
uji("kelima kolom diberi bagian",
    [6, 42, 20, 16, 16].every((n, k) =>
        new RegExp(`nth-child\\(${k + 1}\\) \\{ width: ${n}%`).test(CSS)));
uji("bagiannya genap seratus",
    [6, 42, 20, 16, 16].reduce((a, b) => a + b, 0) === 100);
uji("aturan lebar berlaku di segala layar",
    CSS.indexOf("#admin-subtab-access table { table-layout: fixed; }")
        < CSS.indexOf("@media (max-width: 639px)", CSS.indexOf("#akses-table-body tr {") - 4000),
    "di dalam kurungan layar kecil ia tidak berlaku di desktop");

console.log("\n=== anggota tampil sebagai label, bukan tombol ===");
uji("kotak dan latar dilepas",
    /\.ang-pemicu \{[^}]*border: 0;[^}]*background: none;/.test(CSS),
    "seluruh baris sudah membuka dropdown; kotak menjanjikan sasaran klik yang lebih sempit");
uji("sudut bulat dilepas", !/\.ang-pemicu \{[^}]*border-radius: 999px/.test(CSS));
uji("panah dibuang dari markup", !/ang-panah/.test(JS));
uji("gaya panah ikut dibuang", !/\.ang-panah/.test(CSS),
    "aturan yang tak lagi punya sasaran hanya menumpuk");
uji("keadaan terbuka masih ditandai warna",
    /\.ang-pemicu--buka \{ color: var\(--c-blue\); \}/.test(CSS),
    "tanpa panah, warna dan lencana yang menyebut ia sedang terbuka");
uji("tetap elemen tombol",
    /kol2 = `<button type="button"[\s\S]*?class="ang-pemicu/.test(JS),
    "barisnya sendiri tak terfokus, jadi ini satu-satunya jalan papan ketik");
uji("aria-expanded tetap dipasang", /aria-expanded="\$\{buka\}"/.test(JS));
uji("jejak fokus papan ketik disediakan",
    /\.ang-pemicu:focus-visible \{ outline: 2px solid var\(--c-blue\)/.test(CSS),
    "outline bawaan ikut hilang saat border dilepas");
uji("sasaran sentuh ponsel dipertahankan",
    /#akses-table-body \.aksi-isi > \.ang-tombol \{ min-height: 36px/.test(hp),
    "yang perlu cukup besar adalah tombol aksi, bukan pembatas");


console.log("\n=== keterangan padat di kartu ===");
uji("jumlah tidak lagi disambung titik ke peran",
    !/content: "\\2022"/.test(hp),
    "ia berdiri di lajur sendiri, jadi tak ada teks di kirinya");
uji("lajur kartu grup sama dengan baris lain",
    /\.ang-baris-grup \{[\s\S]{0,90}?grid-template-columns: 1fr 4\.5rem 4\.5rem/.test(hp),
    "lajur yang beda membuat angkanya tak sebaris dengan baris akun");
uji("pembatas anggota memakai teks pudar",
    /#akses-table-body \.ang-pemicu \{[^}]*color: var\(--c-text-muted\)/.test(hp));


console.log("\n=== Console Users memakai kartu yang sama ===");
uji("baris pengguna jadi kartu di ponsel",
    /#admin-users-table-body tr \{[\s\S]{0,120}?display: grid/.test(hp),
    "tanpa ini tiap sel menumpuk sendiri dan kartunya setinggi 182px");
uji("kartu pengguna disusun seperti Camera Access (+ kolom iklan)",
    /grid-template-areas:\s*"nama\s+iklan aksi"\s*"peran\s+iklan aksi";/.test(hp.replace(/\s*\n\s*/g, " ")),
    "peran di bawah nama, iklan+tombol rata kanan sejajar nama");
uji("lajur peran tidak lagi dipatok sempit",
    !/grid-template-columns: 1fr 4\.5rem 96px;/.test(hp),
    "4.5rem = 58.5px sedangkan lencana SUPER_ADMIN butuh ~100px, jadi menabrak tombol EDIT");
uji("lencana peran tidak boleh patah",
    /#admin-users-table-body \.pgn-peran \{[^}]*white-space: nowrap/.test(hp),
    "lencana yang membungkus membuat tinggi kartu melompat");
uji("tombol tetap rata kanan dan tidak menyusut",
    /grid-area: aksi;[\s\S]{0,220}?justify-content: flex-end;[\s\S]{0,160}?flex-shrink: 0;/.test(hp),
    "tanpa flex-shrink tombol mengecil saat nama panjang")
uji("nomor urut tidak dicetak ulang di kartu",
    /#admin-users-table-body td:nth-child\(1\) \{ display: none/.test(hp),
    "urutan sudah terbaca dari susunan kartunya sendiri");
uji("tombol pengguna setinggi sasaran sentuh",
    /#admin-users-table-body td:nth-child\(5\) button \{[\s\S]{0,120}?min-height: 36px/.test(hp));
uji("Edit dan Delete tidak menumpuk",
    /#admin-users-table-body td:nth-child\(5\) \{[\s\S]{0,140}?flex-wrap: nowrap/.test(hp),
    "lajur sempit membuat dua tombol membungkus dan kartu naik jadi 99px");

console.log("\n=== Console Users: data sama di kedua ukuran ===");
{
  const JS = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");
  const VIEW = fs.readFileSync(path.join(AKAR, "frontend/views/admin-console.php"), "utf8");

  // Keterangan grup dulu punya kolom sendiri yang disembunyikan di layar
  // kecil, sementara isinya diulang sebagai subjudul. Dua salinan itu
  // membuat desktop dan ponsel menampilkan hal berbeda.
  uji("kolom kembar yang disembunyikan sudah tidak ada",
      !/hidden md:table-cell/.test(JS) && !/hidden lg:table-cell/.test(JS),
      "kolom Group/Created By dibuang, datanya jadi subjudul");
  const kepalaPengguna = (() => {
    const i = VIEW.indexOf("admin-users-table-body");
    const t = VIEW.lastIndexOf("<thead", i);
    return VIEW.slice(t, i);
  })();
  uji("header tabel pengguna turun jadi lima kolom",
      (kepalaPengguna.match(/<th /g) || []).length === 5,
      "No, Username, Role, (kosong sejajar kolom badge iklan), Actions");
  uji("keterangan grup punya posisi berbeda per ukuran layar (by design)",
      /class="pgn-ket pgn-ket--desktop"/.test(JS) && /class="pgn-ket pgn-ket--mobile"/.test(JS) &&
      /\.pgn-ket--mobile \{ display: none; \}/.test(CSS),
      "desktop di bawah nama, mobile di bawah role - beda posisi, jadi perlu 2 salinan bertoggle");
  uji("subjudul tidak dikurung media ponsel", (() => {
        const i = CSS.indexOf(".pgn-ket {");
        if (i < 0) return false;
        let dalam = 0;
        for (const ch of CSS.slice(0, i)) {
          if (ch === "{") dalam++;
          else if (ch === "}") dalam--;
        }
        return dalam === 0;
      })(),
      "kalau terkurung media, desktop kehilangan keterangannya lagi");
  uji("Delete punya warna peringatan sendiri",
      /\.ang-tombol--bahaya \{/.test(CSS));
}

console.log("\n=== Console Users: pengelompokan bersarang ===");
{
  const JS = fs.readFileSync(path.join(AKAR, "frontend/assets/js/modules/admin.js"), "utf8");

  uji("akun dikelompokkan menurut grupnya",
      /const perGrup = new Map\(\)/.test(JS) && /u\.admin_group/.test(JS),
      "daftar datar diubah jadi peta grup -> anggota");
  uji("akun tanpa grup tetap jadi baris root",
      /const lepas = \[\]/.test(JS) && /lepas\.push\(u\)/.test(JS));
  // Camera Access memakai kelas yang sama, jadi pemeriksaan dibatasi pada
  // fungsi render pengguna; tanpa batas ini penjaga tetap hijau walau
  // gaya hierarkinya hilang dari halaman pengguna.
  const render = (() => {
    const i = JS.indexOf("function renderAdminUsersTable()");
    if (i < 0) return "";
    // Penutup fungsi, bukan awal fungsi berikutnya: state pelipatan
    // duduk di antara keduanya dan tidak boleh ikut terbawa.
    const j = JS.indexOf("\n    }\n", i);
    return j > i ? JS.slice(i, j) : "";
  })();
  uji("potongan render pengguna ditemukan", render.length > 500);
  uji("baris induk memakai gaya hierarki Camera Access",
      /class="ang-baris-grup/.test(render) && /class="ang-baris-anggota/.test(render) &&
      /class="ang-anak"/.test(render),
      "garis siku, latar anak, dan lekukan dipakai ulang, bukan ditulis baru");
  uji("baris induk jadi pemicu lipat",
      /window\.bentangGrupPengguna/.test(render) && /aria-expanded=/.test(render));

  // State pelipatan harus hidup di luar fungsi render: tabel disusun ulang
  // tiap kali akun disimpan, dan state di dalamnya akan menutup semua grup
  // setiap habis menyunting anggotanya.
  uji("state lipat tidak ikut disetel ulang saat render",
      JS.includes("const grupPenggunaTerbentang = new Set()") &&
      !/grupPenggunaTerbentang = new Set\(\)/.test(render),
      "kalau dideklarasikan di dalam render, grup menutup sendiri sehabis menyimpan anggota");

  // Tombol di dalam baris induk harus menang atas klik barisnya sendiri,
  // supaya menyunting anggota tidak sekaligus melipat grupnya.
  uji("tombol anggota tidak ikut melipat grup",
      /event\.stopPropagation\(\); openEditUserModal/.test(JS) &&
      /event\.stopPropagation\(\); deleteUser/.test(JS));

  uji("anggota tidak disusun saat grup tertutup",
      /buka\s*\?\s*anggota\.map/.test(JS),
      "baris tersembunyi tetap terbaca pencarian dalam halaman");
}

console.log("\n=== ganti nama grup dikerjakan sekaligus ===");
const PY = fs.readFileSync(path.join(AKAR, "backend/main.py"), "utf8");
const rename = (PY.match(/def admin_ganti_nama_grup[\s\S]*?\n@app\./) || [""])[0];

uji("endpoint ganti nama grup ada",
    /@app\.put\("\/api\/admin\/groups\/\{nama_grup\}"\)/.test(PY),
    "tanpa endpoint, frontend harus mengulang per anggota dan grup bisa terbelah");
uji("semua anggota pindah dalam satu commit",
    /for a in anggota:\n {12}a\.admin_group = baru\n {8}db\.commit\(\)/.test(rename),
    "commit di dalam perulangan membuat sebagian anggota tertinggal saat gagal");
uji("kegagalan mengembalikan keadaan",
    /except Exception:\n {8}db\.rollback\(\)/.test(rename));
uji("hanya kuasa penuh boleh ganti nama grup",
    /if not kuasa_penuh\(pengelola\):/.test(rename),
    "nama grup menentukan wewenang, jadi admin biasa tidak boleh mengubahnya");
uji("nama yang sudah dipakai ditolak",
    /status_code=409/.test(rename),
    "menimpa grup lain menggabungkan dua grup tanpa diminta");
uji("grup tak dikenal ditolak",
    /status_code=404/.test(rename));

const RENDER = (JS.match(/function renderAdminUsersTable\(\)[\s\S]*?\n    \}\n/) || [""])[0];
uji("baris grup punya tombol Edit, bukan strip",
    /bukaGantiNamaGrup/.test(RENDER) && !/&mdash;<\/span><\/span>\s*<\/td>/.test(RENDER),
    "strip di kolom Actions tidak memberi jalan mengubah nama grup");
uji("tombol Edit grup tidak ikut melipat",
    /event\.stopPropagation\(\); window\.bukaGantiNamaGrup/.test(RENDER));
uji("grup terbuka tetap terbuka setelah namanya berubah",
    /grupPenggunaTerbentang\.delete\(lama\)[\s\S]{0,80}?grupPenggunaTerbentang\.add\(baru\)/.test(JS),
    "kunci lipatan memakai nama grup, jadi panel menutup sendiri kalau tidak ikut diganti");

uji("keterangan kosong tidak dicetak jadi strip",
    (JS.match(/\$\{user\.dibuat_oleh \? `<span class="pgn-ket pgn-ket--(desktop|mobile)">/g) || []).length === 4,
    "strip di bawah nama tidak berarti apa-apa bagi pemakai");
uji("akun tanpa grup tidak diberi teks tanpa grup",
    !/"tanpa grup"/.test(RENDER),
    "sub-teks dikosongkan supaya tabel tidak sumpek");
uji("pembuat akun ditulis deskriptif",
    /Dibuat oleh: /.test(JS));

console.log("\n=== lebar kolom Console Users dipatok ===");
const VIEW = fs.readFileSync(path.join(AKAR, "frontend/views/admin-console.php"), "utf8");
const HEADER_PHP = fs.readFileSync(path.join(AKAR, "frontend/includes/header.php"), "utf8");
const KEPALA = (VIEW.match(/<th[^>]*pgn-kol-no[\s\S]*?pgn-kol-aksi[^<]*<\/th>/) || [""])[0];

uji("keempat kolom pengguna punya kelas lebar",
    ["pgn-kol-no", "pgn-kol-nama", "pgn-kol-peran", "pgn-kol-aksi"]
        .every(k => KEPALA.includes(k)),
    "tanpa lebar, Username menelan sisa ruang dan mendorong Role ke tepi");
uji("lebar dipasang lewat CSS, bukan utilitas responsif Tailwind",
    /\.pgn-kol-peran \{ width: \d+%/.test(CSS) && /\.pgn-kol-aksi \{ width: \d+%/.test(CSS),
    "varian md:/lg: tidak termuat di halaman ini, kolomnya hilang diam-diam");
uji("Role dan Actions memakai persen, bukan piksel mati",
    !/\.pgn-kol-peran \{ width: \d+(px|rem)/.test(CSS),
    "persen membuat pembagiannya ikut lebar layar");
uji("kolom Actions punya lebar minimum",
    /\.pgn-kol-aksi \{[^}]*min-width:/.test(CSS),
    "dua tombol membungkus dan barisnya meninggi kalau kolomnya menyempit");
uji("Actions tetap rata kanan",
    /text-right pgn-kol-aksi/.test(KEPALA));
uji("kolom nama tidak dipatok mati",
    /\.pgn-kol-nama \{ width: auto/.test(CSS),
    "nama panjang harus boleh memakai sisa ruang");

console.log("\n=== lencana peran dan tombol aksi seukuran ===");
uji("bentuk lencana peran dipatok di CSS",
    /\n\.pgn-peran \{[\s\S]{0,300}?border-radius:[\s\S]{0,200}?\n\}/.test(CSS),
    "kelas utilitas di markup tidak termuat di halaman ini; terukur 12px padahal ditulis 10px");
uji("markup lencana tidak lagi mengandalkan utilitas ukuran",
    !/class="px-2 py-0\.5 text-\[10px\] font-bold rounded-sm/.test(JS),
    "ukurannya tidak jadi seperti yang tertulis");
uji("lencana peran seukuran lencana Camera Access",
    /\.pgn-peran \{[\s\S]{0,300}?padding: 0\.125rem 0\.375rem;[\s\S]{0,200}?font-size: 11px;[\s\S]{0,200}?font-weight: 700;/.test(CSS),
    "Camera Access memakai padding 0.125rem 0.375rem, teks 11px, bobot 700");
uji("tombol aksi tidak menimpa kotak .ang-tombol di desktop",
    !/\n\.pgn-aksi \.ang-tombol \{/.test(CSS),
    "Camera Access memakai .ang-tombol apa adanya; timpaan aturan dasar membuat ukurannya melenceng");
uji("timpaan tombol hanya soal ukuran teks di ponsel",
    !/#admin-users-table-body \.pgn-aksi \.ang-tombol \{[^}]*(min-height|padding)/.test(hp),
    "tinggi dan padding tetap harus datang dari aturan bersama");
uji("hover Edit dan Delete datang dari aturan dasar",
    /\.ang-tombol:hover \{ background: rgba\(var\(--rgb-blue\)/.test(CSS) &&
    /\.ang-tombol--bahaya:hover \{ background: rgba\(239, 68, 68/.test(CSS),
    "keduanya sudah ada di .ang-tombol, tidak perlu disalin ulang");
uji("tombol ponsel tidak menimpa padding",
    /#admin-users-table-body td:nth-child\(5\) button \{[\s\S]{0,160}?min-height: 36px;\n {2}\}/.test(hp),
    "Camera Access hanya memantek tinggi 36px; padding tetap dari aturan dasar");
uji("teks lencana dan tombol dipatok px di ponsel",
    /#admin-users-table-body \.pgn-peran \{[^}]*font-size: 10px/.test(hp) &&
    /#admin-users-table-body \.pgn-aksi \.ang-tombol \{[^}]*font-size: 11px/.test(hp),
    "rem menyusut mengikuti font-akar 13px di ponsel, jatuh ke 9.75px dan 6.5px");
uji("ukuran ponsel tidak lagi memakai rem",
    !/#admin-users-table-body \.(pgn-peran|pgn-aksi \.ang-tombol) \{ font-size: 0\.\d+rem/.test(hp),
    "px dipilih justru karena rem ikut menyusut");

uji("peran ponsel jadi teks kecil, bukan badge",
    /#admin-users-table-body \.pgn-peran \{[^}]*background: transparent !important/.test(hp),
    "Camera Access memakai teks abu-abu polos untuk peran anggota, bukan kotak berwarna");
uji("garis hierarki L dibuang di anggota Console Users",
    /#admin-users-table-body \.ang-baris-anggota \.ang-anak::before,\s*\n\s*#admin-users-table-body \.ang-baris-anggota \.ang-anak::after \{ display: none; \}/.test(hp),
    "user minta garis L dihilangkan total, beda dari Camera Access yang menyisakan garis tegak");

uji("jumlah anggota jadi sub-teks kecil (bukan garis pembatas)",
    /#admin-users-table-body \.ang-pemicu \{[^}]*border: 0/.test(hp),
    "sesuai hierarki teks User biasa: nama besar, sub-info kecil di bawahnya, tanpa garis pemisah");
uji("baris grup pengguna tersambung tanpa jarak saat terbuka",
    /#admin-users-table-body \.ang-baris-grup--buka \{[^}]*margin-bottom: 0 !important/.test(hp),
    "kartu grup yang terbuka harus menempel ke anggotanya, bukan berjarak seperti kartu terpisah");
uji("hanya anggota terakhir membulatkan sudut bawah kartu",
    /#admin-users-table-body \.ang-baris-anggota--akhir \{[^}]*border-bottom-left-radius: var\(--radius-md\) !important/.test(hp),
    "anggota tengah tidak boleh membulat sendiri-sendiri, hanya yang terakhir menutup kartu");
uji("grid grup pengguna: dua seksi (atas nama+iklan+aksi, bawah anggota full-width)",
    /#admin-users-table-body \.ang-baris-grup \{[\s\S]{0,200}?"anggota\s+anggota\s+anggota"/.test(hp),
    "seksi bawah (anggota) wajib membentang penuh 3 kolom, sama seperti Camera Access, bukan sejajar iklan+aksi di kanan");

uji("latar baris anggota di <tr>, bukan cuma di <td>",
    /#admin-users-table-body \.ang-baris-anggota \{[^}]*background: var\(--c-surface2\) !important/.test(hp),
    "tanpa ini <tr> tetap warna dasar sedangkan <td> lebih terang, membuat teks terlihat distabilo");
console.log("=== Camera Streams: kartu ponsel klik-untuk-buka ===");
uji("streams: toggleStreamCard terdaftar", JS.includes("window.toggleStreamCard"));
uji("streams: state pakai Set (pola sama Camera Access)", JS.includes("streamTerbentang = new Set()"));
uji("streams: guard checkbox/tombol tak ikut toggle", JS.includes('evt.target.closest("button,a,input,label")'));
uji("streams: data-label Group/Coordinates/RTSP/Record/Status ada",
    ["Group", "Coordinates", "RTSP", "Record", "Status"].every(l => JS.includes(`data-label="${l}"`)));
uji("streams css: kolom tersembunyi default (display:none)", CSS.includes("#admin-streams-table-body td:nth-child(1)"));
uji("streams css: kartu terbuka pakai class stream-row--buka", CSS.includes("stream-row--buka"));
uji("streams css: chevron via ::after, bukan gambar", CSS.includes("#admin-streams-table-body tr:not(.stream-status-row)::after"));

console.log("=== Camera Streams: label key-value di area expand ===");
uji("streams: No dapat data-label eksplisit", JS.includes('data-label="No"'));
uji("streams css: label key-value flex-between untuk baris pendek",
    CSS.includes('tr.stream-row--buka td[data-label]:not([data-label=""]):not([data-label="RTSP"]):not([data-label="Coordinates"]):not([data-label="Status"]):not([data-label="Actions"]) {'));
uji("streams css: RTSP disusun stacked (column)", CSS.includes('td[data-label="RTSP"],') && CSS.includes("flex-direction: column"));
uji("streams css: RTSP membungkus (break-all), bukan truncate", CSS.includes("word-break: break-all"));
uji("streams css: label RTSP tampil 'ENDPOINT'", CSS.includes('content: attr(data-label) " ENDPOINT"'));

console.log("=== Camera Streams: header ringkas (nama+grup+status) ===");
uji("streams: data-grup dipakai di td nama", JS.includes("data-grup=\"${groupName"));
uji("streams css: grup dirender via ::after di td nama", CSS.includes("content: attr(data-grup)"));
uji("streams css: Group aslinya disembunyikan (tak dobel)", CSS.includes('td[data-label="Group"] { display: none !important; }'));
uji("streams css: Coordinates/RTSP/Record/Actions hanya expand-only",
    CSS.includes('td[data-label="Coordinates"],') && CSS.includes('td[data-label="Actions"] {'));
uji("streams css: key-value diperketat ke tr.stream-row--buka (hindari kalah spesifisitas)",
    CSS.includes('tr.stream-row--buka td[data-label]:not([data-label=""]):not([data-label="RTSP"]):not([data-label="Coordinates"]):not([data-label="Status"]):not([data-label="Actions"])'));
uji("streams css: label 'Actions' disembunyikan (tanpa teks ACTIONS)", CSS.includes('td[data-label="Actions"]::before { content: none; }'));
uji("streams css: tombol Actions rata kanan (justify-end)",
    /td\[data-label="Actions"\] \{[\s\S]{0,40}justify-content: flex-end/.test(CSS));
uji("streams: checkbox selalu tampil di header (grid-area cek)", CSS.includes("grid-area: cek") && CSS.includes("grid-template-columns: 20px 1fr auto 10px"));

console.log("=== Camera Streams: header konsisten, label bersih ===");
uji("streams: td nama diberi data-label kosong (hindari suntik table-labels.js)", JS.includes('data-label="" data-grup='));
uji("streams css: label 'CAMERA NAME' dimatikan eksplisit", CSS.includes("td:nth-child(3)::before { content: none; }"));
uji("streams css: label 'STATUS' dimatikan eksplisit", CSS.includes('td[data-label="Status"]::before { content: none; }'));
uji("streams: badge status koneksi tunggal, tak dobel dengan is_active", !/data-label="Status">[\s\S]{0,50}is_active/.test(JS));
uji("streams css: track kolom dipatok px (bukan auto) agar tak melebar saat expand",
    !CSS.includes("grid-template-columns: auto 1fr auto auto"));


console.log("=== Camera Streams: nama besar+kiri, coordinates stacked, tanpa duplikasi status ===");
uji("streams css: font nama diperbesar, Poppins Semi-Bold (identitas visual)",
    /td:nth-child\(3\) \{[\s\S]*?font-size: 1rem; font-weight: 600; font-family: var\(--font-heading\)/.test(CSS));
uji("streams css: nama rata kiri (bukan center/kanan dari key-value)",
    /td:nth-child\(3\) \{[\s\S]*?text-align: left;/.test(CSS));
uji("streams css: Coordinates dikecualikan dari key-value generik (row)",
    CSS.includes(':not([data-label="Coordinates"])'));
uji("streams css: Coordinates dipaksa stacked (column) sejajar RTSP",
    /td\[data-label="RTSP"\],\s*\n\s*#admin-streams-table-body tr\.stream-row--buka td\[data-label="Coordinates"\] \{[\s\S]*?flex-direction: column/.test(CSS));


console.log("=== Camera Streams: dua badge status dikembalikan, checkbox diperkecil ===");
uji("streams: badge ACTIVE/DISABLED dikembalikan di header",
    JS.includes('data-label="Status"') && JS.includes("stream.is_active ? 'ACTIVE' : 'DISABLED'"));
uji("streams: badge koneksi tetap ada bersebelahan dengan Active",
    JS.includes("connectionStatus === 'online' ? 'CONNECTED' : 'DISCONNECTED'"));
uji("streams css: kolom status flex-row, dua badge muat sejajar",
    /td\[data-label="Status"\] \{[\s\S]*?flex-direction: row/.test(CSS));
uji("streams: checkbox diperkecil ke w-5 h-5",
    JS.includes("admin-stream-checkbox w-5 h-5"));
uji("streams css: gap header diperbesar (checkbox lega dari teks)",
    /#admin-streams-table-body tr:not\(\.stream-status-row\) \{[\s\S]*?gap: 0\.875rem/.test(CSS));


console.log("=== Camera Streams: edge case (loading/empty/error) diisolasi dari grid accordion ===");
uji("streams css: stream-status-row dikecualikan dari grid, full-width (block)",
    CSS.includes("#admin-streams-table-body tr.stream-status-row { display: block; width: 100%; }"));
uji("streams css: stream-status-row tanpa chevron",
    CSS.includes("#admin-streams-table-body tr.stream-status-row::after { content: none; }"));
uji("streams: empty-state pakai class stream-status-row + layout full-width-center",
    JS.includes('tr class="stream-status-row"') &&
    JS.includes("w-full flex flex-col items-center justify-center text-center py-12"));
uji("streams: loading-row (PHP awal) pakai class stream-status-row",
    require("fs").readFileSync(require("path").join(__dirname, "..", "frontend/views/admin-console.php"), "utf8")
        .includes('tr class="stream-status-row"'));
uji("streams: error-state ditambahkan saat fetch gagal (sebelumnya tak ada)",
    JS.includes("Failed to load camera directory"));

console.log("\n=== Camera Streams: Desktop grid lg+ (col-span, actions anti-tumpuk) ===");
uji("streams css desktop: grid diterapkan pada breakpoint lg (1024px)",
    CSS.includes("@media (min-width: 1024px)") &&
    CSS.includes("#admin-streams-table thead tr"));
uji("streams css desktop: track pakai minmax(0, Nfr) agar tak melebar dari isi",
    CSS.includes("minmax(0, 2fr) minmax(0, 1fr)"));
uji("streams css desktop: Actions rata kanan, nowrap, tak wrapping",
    CSS.includes('td[data-label="Actions"]') &&
    CSS.includes("white-space: nowrap"));
uji("streams css desktop: badge Status disusun kolom (atas-bawah), bukan sebelahan",
    CSS.includes('td[data-label="Status"]') &&
    CSS.includes("flex-direction: column"));
uji("streams css desktop: th/td width Tailwind lama ditimpa auto (ikut grid track)",
    CSS.includes("width: auto !important"));
uji("streams css desktop: RTSP & badge Status dibatasi max-width:100% + ellipsis",
    CSS.includes('td[data-label="RTSP"] { max-width: 100% !important') &&
    CSS.includes("text-overflow: ellipsis"));
uji("streams: id admin-streams-table ada di markup (target selector desktop)",
    VIEW.includes('id="admin-streams-table"'));


console.log("\n=== Tipografi: hanya Poppins (heading) + Montserrat (body/mono) ===");
uji("tipografi: --font-sans diarahkan ke Montserrat",
    CSS.includes("--font-sans: 'Montserrat'"));
uji("tipografi: --font-mono diarahkan ke Montserrat (bukan JetBrains Mono lagi)",
    CSS.includes("--font-mono: 'Montserrat'") && !CSS.includes("JetBrains Mono"));
uji("tipografi: --font-heading (Poppins) didefinisikan",
    CSS.includes("--font-heading: 'Poppins'"));
uji("tipografi: h1/h2/h3/.hdr-title pakai --font-heading",
    /h1, h2, h3, \.hdr-title, \.sidebar-section-lbl \{\s*font-family: var\(--font-heading\)/.test(CSS));
uji("tipografi: Google Fonts link diganti ke Poppins+Montserrat",
    HEADER_PHP.includes("family=Poppins") && HEADER_PHP.includes("family=Montserrat") &&
    !HEADER_PHP.includes("Plus+Jakarta+Sans") && !HEADER_PHP.includes("JetBrains+Mono"));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

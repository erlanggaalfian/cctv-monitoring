#!/usr/bin/env node
/**
 * Penjaga: modal User harus setara dengan pemilih lain di layar, dan
 * pilihannya harus mencerminkan wewenang yang benar-benar diberikan server.
 *
 * Tiga hal yang pernah salah dan dijaga di sini:
 *   1. `modal-user-role` dan `modal-user-grup` memakai kelas
 *      `app-select-icon-left` tetapi lupa <span> ikon kirinya. Kelas itu
 *      hanya menjanjikan ikon, tidak membuatnya, sehingga CSS jatuh ke
 *      aturan cadangan `:not(:has(.app-field-icon-left))` dan kedua kolom
 *      tampil beda tinggi serta tanpa kotak aksen biru.
 *   2. Pilihan ADMIN disembunyikan dari Admin padahal backend
 *      (`admin_create_user`) mengizinkannya — layar berbohong.
 *   3. Kolom Grup Pengguna disembunyikan seluruhnya dari Admin, jadi modal
 *      Admin dan Super Admin tampak berlainan tanpa sebab yang terlihat.
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

console.log("=== setiap select berikon-kiri punya <span> ikonnya ===");
// Pembungkus .app-field-wrap dipotong satu per satu, lalu tiap potongan
// yang memuat `app-select-icon-left` wajib memuat span ikon kirinya.
const semuaPhp = fs.readdirSync(path.join(AKAR, "frontend/views"))
    .filter(f => f.endsWith(".php"))
    .map(f => [f, fs.readFileSync(path.join(AKAR, "frontend/views", f), "utf8")]);

for (const [nama, isi] of semuaPhp) {
    const blok = isi.split(/<div class="[^"]*app-field-wrap/);
    blok.slice(1).forEach((b, i) => {
        const potong = b.split("</div>")[0];
        if (!potong.includes("app-select-icon-left")) return;
        const id = (potong.match(/id="([^"]+)"/) || [, `blok-${i}`])[1];
        uji(`${nama}: ${id} punya ikon kiri`,
            potong.includes("app-field-icon-left"),
            "kelas app-select-icon-left tanpa <span> hanya memicu CSS cadangan");
    });
}

console.log("\n=== kedua select modal User dijaga khusus ===");
for (const id of ["modal-user-role", "modal-user-grup"]) {
    const idx = modals.indexOf(`id="${id}"`);
    uji(`${id} ada`, idx > 0);
    const awal = modals.lastIndexOf("app-field-wrap", idx);
    const potong = modals.slice(awal, idx);
    uji(`${id} didahului ikon kiri`, potong.includes("app-field-icon-left"));
}

console.log("\n=== CSS yang membuat ikon kiri berarti masih ada ===");
uji("aturan ikon kiri untuk select ada",
    css.includes(".app-field-wrap:has(select) .app-field-icon-left"));
uji("ikon dibatasi ukurannya", /\.app-field-icon svg\s*\{[^}]*width/.test(css));

console.log("\n=== pilihan peran mengikuti wewenang server ===");
uji("hanya super_admin yang disembunyikan dari Admin",
    /terlarang = !penuh && opt\.value === "super_admin"/.test(adminjs),
    "backend mengizinkan Admin membuat Admin; layar tidak boleh menyangkalnya");
uji("keempat peran tetap ada di markup",
    ["user", "guest", "admin", "super_admin"]
        .every(p => modals.includes(`<option value="${p}">`)));
uji("guest tetap terkunci ke akun bawaan",
    adminjs.includes('if (opt.value === "guest") terlarang = !sedangGuestBawaan;'));

console.log("\n=== kolom grup tampil bagi semua, terkunci bagi Admin ===");
const blokGrup = adminjs.slice(adminjs.indexOf("function siapkanPilihanGrup"),
                               adminjs.indexOf("const GRUP_BARU"));
uji("wrap tidak lagi disembunyikan dari Admin",
    !blokGrup.includes('wrap.classList.add("hidden")'));
uji("Admin melihat kolomnya", blokGrup.includes('wrap.classList.remove("hidden")'));
uji("Admin tidak dapat mengubahnya", blokGrup.includes("isian.disabled = true"));
uji("Super Admin tetap dapat mengubahnya", blokGrup.includes("isian.disabled = false"));
uji("grup Admin sendiri yang ditampilkan", blokGrup.includes("u.username === username"));

console.log("\n=== grup tetap tidak dikirim oleh Admin ===");
// Server memaksa grup pembuat; mengirimnya dari Admin hanya menambah
// jalan masuk yang harus dijaga dua kali.
const blokKirim = adminjs.slice(adminjs.indexOf("window.handleUserSubmit"),
                                adminjs.indexOf("window.deleteUser"));
uji("payload.admin_group hanya diisi Super Admin",
    /if \(window\.kuasaPenuh\(userRole\)\) \{[\s\S]{0,400}?payload\.admin_group/.test(blokKirim));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

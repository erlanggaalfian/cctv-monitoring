#!/usr/bin/env node
/**
 * Uji perilaku modal akses: saring, pilih grup, hitung terpilih.
 *
 * Fungsi-fungsi ini menyentuh DOM, jadi disiapkan tiruan DOM secukupnya lalu
 * fungsi aslinya diambil langsung dari admin.js. Bukan salinan logika —
 * kalau berkas aslinya berubah, uji ini ikut berubah.
 */
const fs = require("fs");
const path = require("path");

const BERKAS = path.join(__dirname, "..", "frontend/assets/js/modules/admin.js");
const sumber = fs.readFileSync(BERKAS, "utf8");

let lolos = 0, gagal = 0;
function uji(nama, kondisi, info = "") {
    if (kondisi) { lolos++; console.log(`  ok   ${nama}`); }
    else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
}

// ── Tiruan DOM sekadar cukup untuk ketiga fungsi ────────────────────────────
class El {
    constructor(tag, kelas = "", data = {}) {
        this.tag = tag;
        this.dataset = data;
        this.children = [];
        this.checked = false;
        this.disabled = false;
        this.value = "";
        this.textContent = "";
        this._kelas = new Set(kelas.split(" ").filter(Boolean));
        this.classList = {
            toggle: (k, on) => { on ? this._kelas.add(k) : this._kelas.delete(k); },
            add: (k) => this._kelas.add(k),
            remove: (k) => this._kelas.delete(k),
            contains: (k) => this._kelas.has(k),
        };
    }
    get className() { return [...this._kelas].join(" "); }
    set className(v) { this._kelas = new Set(v.split(" ").filter(Boolean)); }
    tambah(anak) { anak.induk = this; this.children.push(anak); return anak; }
    semua() { return this.children.flatMap(c => [c, ...c.semua()]); }
    cocok(pilih) {
        if (pilih === "input[type=checkbox]") return this.tag === "input";
        if (pilih === ".akses-baris") return this._kelas.has("akses-baris");
        if (pilih === ".akses-grup") return this._kelas.has("akses-grup");
        if (pilih === ".akses-grup-jumlah") return this._kelas.has("akses-grup-jumlah");
        if (pilih === ".akses-baris:not(.hidden) input[type=checkbox]")
            return this.tag === "input" && this.induk
                && this.induk._kelas.has("akses-baris")
                && !this.induk._kelas.has("hidden");
        // Kotak centang kini dipilih lewat kelasnya, sebab hanya live dan
        // rekaman yang menentukan sebuah kamera terpilih.
        if (pilih.startsWith(".akses-cb-"))
            return this._kelas.has(pilih.slice(1));
        return false;
    }
    querySelectorAll(p) { return this.semua().filter(e => e.cocok(p)); }
    // Kepala grup kini memuat penghitung terpilih, jadi kode yang diuji
    // memanggil querySelector tunggal untuk menemukannya.
    querySelector(p) { return this.querySelectorAll(p)[0] || null; }
    closest(p) {
        let n = this;
        while (n) { if (p === ".akses-grup" && n._kelas.has("akses-grup")) return n; n = n.induk; }
        return null;
    }
}

function pasangDunia({ grup }) {
    const akar = new El("div");
    const daftar = akar.tambah(new El("div"));
    daftar.id = "akses-modal-kamera";
    const cari = new El("input"); cari.id = "akses-modal-cari";
    const hitung = new El("span"); hitung.id = "akses-modal-hitung";
    const kepala = new El("div", "hidden"); kepala.id = "akses-modal-kepala";

    const simpul = { "akses-modal-cari": cari, "akses-modal-hitung": hitung,
                     "akses-modal-kepala": kepala, "akses-modal-kamera": daftar };

    for (const [namaGrup, kamera] of Object.entries(grup)) {
        const g = daftar.tambah(new El("div", "akses-grup", { grup: namaGrup.toLowerCase() }));
        for (const k of kamera) {
            const b = g.tambah(new El("div", "akses-baris", { nama: k.nama.toLowerCase() }));
            // Kelasnya dibedakan persis seperti markup sesungguhnya:
            // hanya live dan rekaman yang menentukan kamera terpilih.
            const kelas = ["akses-cb-view", "akses-cb-play", "akses-cb-share"];
            [k.a, k.b, k.c].forEach((cek, i) => {
                const cb = b.tambah(new El("input", kelas[i]));
                cb.dataset.sid = String(k.sid);
                cb.checked = !!cek;
                cb.disabled = !!k.mati;
            });
        }
    }

    global.document = {
        getElementById: (id) => simpul[id] || null,
        querySelectorAll: (p) => {
            // Pemilih gabungan (dipisah koma) dipakai hitungAksesTerpilih.
            const bagian = p.split(",").map(s => s.trim())
                .filter(s => s.startsWith("#akses-modal-kamera"));
            if (!bagian.length) return [];
            const hasil = [];
            for (const satu of bagian) {
                const sisa = satu.replace("#akses-modal-kamera ", "");
                for (const el of daftar.querySelectorAll(sisa)) {
                    if (!hasil.includes(el)) hasil.push(el);
                }
            }
            return hasil;
        },
    };
    global.window = global.window || {};
    return { akar, daftar, cari, hitung, kepala };
}

function ambilFungsi(nama) {
    const tanda = `window.${nama} = function`;
    const mulai = sumber.indexOf(tanda);
    if (mulai < 0) throw new Error(`fungsi ${nama} tidak ditemukan di admin.js`);
    let i = sumber.indexOf("{", mulai), dalam = 0, akhir = -1;
    for (let j = i; j < sumber.length; j++) {
        if (sumber[j] === "{") dalam++;
        else if (sumber[j] === "}") { dalam--; if (dalam === 0) { akhir = j; break; } }
    }
    return sumber.slice(mulai, akhir + 1);
}

const kode = ["saringKameraAkses", "pilihGrupAkses", "hitungAksesTerpilih"]
    .map(ambilFungsi).join("\n");

console.log("=== fungsi terambil dari admin.js ===");
uji("ketiga fungsi ada di berkas asli", kode.length > 200);

const contoh = {
    "Gedung A": [
        { sid: 1, nama: "Lobi Depan", a: false, b: false },
        { sid: 2, nama: "Parkir Timur", a: false, b: false },
    ],
    "Gedung B": [
        { sid: 3, nama: "Lorong Utama", a: false, b: false },
        { sid: 4, nama: "Gudang", a: false, b: false, mati: true },
    ],
};

function segar() {
    const d = pasangDunia({ grup: contoh });
    eval(kode);
    return d;
}

console.log("\n=== hitungan kamera terpilih ===");
let d = segar();
window.hitungAksesTerpilih();
uji("kosong berbunyi belum ada", d.hitung.textContent === "belum ada yang dipilih",
    d.hitung.textContent);

let cb = document.querySelectorAll("#akses-modal-kamera input[type=checkbox]");
cb[0].checked = true;
window.hitungAksesTerpilih();
uji("satu centang = 1 kamera", d.hitung.textContent === "1 kamera dipilih",
    d.hitung.textContent);

// Dua centang pada kamera yang SAMA tetap satu kamera — inilah sebabnya
// hitungan memakai himpunan sid, bukan jumlah centang.
cb[1].checked = true;
window.hitungAksesTerpilih();
uji("dua kolom pada satu kamera tetap dihitung satu",
    d.hitung.textContent === "1 kamera dipilih", d.hitung.textContent);

// Tiga kotak per kamera sekarang (live, rekaman, bagikan), jadi kamera
// kedua mulai di indeks 3 — bukan 2.
cb[3].checked = true;
window.hitungAksesTerpilih();
uji("kamera kedua menambah hitungan",
    d.hitung.textContent === "2 kamera dipilih", d.hitung.textContent);

d = segar();
cb = document.querySelectorAll("#akses-modal-kamera input[type=checkbox]");
cb.filter(c => c.disabled).forEach(c => { c.checked = true; });
window.hitungAksesTerpilih();
uji("baris terkunci tidak ikut dihitung",
    d.hitung.textContent === "belum ada yang dipilih", d.hitung.textContent);

console.log("\n=== penyaringan ===");
d = segar();
d.cari.value = "lobi";
window.saringKameraAkses();
let baris = document.querySelectorAll("#akses-modal-kamera .akses-baris");
uji("kamera cocok tetap tampak", !baris[0].classList.contains("hidden"));
uji("kamera tak cocok disembunyikan", baris[1].classList.contains("hidden"));
let grupB = document.querySelectorAll("#akses-modal-kamera .akses-grup")[1];
uji("grup tanpa hasil ikut disembunyikan", grupB.classList.contains("hidden"));

d.cari.value = "gedung b";
window.saringKameraAkses();
baris = document.querySelectorAll("#akses-modal-kamera .akses-baris");
uji("mencari nama grup menampilkan seluruh isinya",
    !baris[2].classList.contains("hidden") && !baris[3].classList.contains("hidden"));
uji("grup lain tersembunyi",
    document.querySelectorAll("#akses-modal-kamera .akses-grup")[0].classList.contains("hidden"));

d.cari.value = "";
window.saringKameraAkses();
baris = document.querySelectorAll("#akses-modal-kamera .akses-baris");
uji("mengosongkan pencarian memulihkan semuanya",
    baris.every(b => !b.classList.contains("hidden")));

console.log("\n=== pilih seluruh grup ===");
d = segar();
let g1 = document.querySelectorAll("#akses-modal-kamera .akses-grup")[0];
let tombol = { closest: () => g1 };
window.pilihGrupAkses(tombol);
let kotakG1 = g1.querySelectorAll("input[type=checkbox]");
uji("sekali klik mencentang seluruh grup", kotakG1.every(c => c.checked));
uji("hitungan ikut naik", d.hitung.textContent === "2 kamera dipilih",
    d.hitung.textContent);

window.pilihGrupAkses(tombol);
uji("klik kedua mengosongkan kembali", kotakG1.every(c => !c.checked));

d = segar();
let g2 = document.querySelectorAll("#akses-modal-kamera .akses-grup")[1];
window.pilihGrupAkses({ closest: () => g2 });
let mati = g2.querySelectorAll("input[type=checkbox]").filter(c => c.disabled);
uji("baris terkunci tidak ikut tercentang", mati.every(c => !c.checked));

// Yang tersaring keluar tidak boleh diam-diam berubah: pengguna tidak
// melihatnya, jadi tidak dapat menyadari perubahannya.
d = segar();
d.cari.value = "lobi";
window.saringKameraAkses();
g1 = document.querySelectorAll("#akses-modal-kamera .akses-grup")[0];
window.pilihGrupAkses({ closest: () => g1 });
const tersembunyi = g1.querySelectorAll(".akses-baris")
    .filter(b => b.classList.contains("hidden"))
    .flatMap(b => b.querySelectorAll("input[type=checkbox]"));
uji("kamera yang tersaring keluar tidak ikut berubah",
    tersembunyi.every(c => !c.checked));
uji("yang tampak tetap tercentang",
    g1.querySelectorAll(".akses-baris")[0].querySelectorAll("input[type=checkbox]")
        .every(c => c.checked));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

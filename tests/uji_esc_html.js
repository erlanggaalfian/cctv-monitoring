// Self-check helper esc/jsid + ekspresi namaAman di admin.js.
// Jalankan: node tests/uji_esc_html.js
const fs = require("fs");
const path = require("path");

const JS = fs.readFileSync(
    path.join(__dirname, "../frontend/assets/js/modules/admin.js"), "utf8");

const esc = new Function("return " + JS.match(/const esc = (\(v\) => .*);/)[1])();
const jsid = new Function("return " + JS.match(/const jsid = (\(v\) => .*);/)[1])();

let gagal = 0;
function uji(nama, ok) {
    console.log((ok ? "  ok   " : "GAGAL ") + nama);
    if (!ok) gagal++;
}

const berbahaya = `<img src=x onerror="a('b')">`;
uji("esc mengamankan kutip, tag, dan ampersand",
    esc(berbahaya) === "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;");
uji("esc null jadi kosong", esc(null) === "");
uji("jsid mengamankan kutip tunggal", !jsid("a'b\"c").includes("'"));
uji("jsid tetap aman untuk atribut", jsid(`x" y`).includes("%22"));

// Ekspresi namaAman dipakai di dalam onclick="..." — harus lolos dari
// string JS sekaligus atribut HTML.
const fn = new Function("b", `return String(b.stream_name || "")\n${JS.match(/const namaAman[\s\S]*?\n\s*(.+);/)[1]};`);
const hasil = fn({ stream_name: `a'b"c\\d` });
uji("namaAman meng-escape backslash, kutip tunggal, kutip ganda",
    hasil === `a\\'b\\"c\\\\d`);

console.log(gagal ? `HASIL: GAGAL (${gagal})` : "HASIL: semua lolos");
process.exit(gagal ? 1 : 0);

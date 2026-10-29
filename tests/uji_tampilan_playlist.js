// Penjaga tampilan daftar Custom Playlist: baris datar, label terbaca.
// Jalankan: node tests/uji_tampilan_playlist.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'assets', 'js', 'modules', 'admin.js'), 'utf8');

const wajib = [
  [/itemDiv\.className = "[^"]*hover:bg-slate-50[^"]*"/, 'baris item harus datar (hover bg, bukan kartu)'],
  [/custom-chk-\$\{stream\.id\}" title=/, 'label kamera wajib punya tooltip nama penuh'],
  [/itemsContainer\.className = "[^"]*space-y-0\.5[^"]*"/, 'kontainer item tanpa tree-border'],
  [/\$\{esc\(screen\.name\)\}/, 'nama saved screen wajib esc() (input localStorage)'],
];
let gagal = 0;
for (const [re, pesan] of wajib) {
  if (!re.test(src)) { console.error('GAGAL: ' + pesan); gagal++; }
}
if (/itemDiv\.className = "[^"]*shadow-sm/.test(src)) {
  console.error('GAGAL: baris item masih kartu berbayang (shadow-sm)'); gagal++;
}
if (/text-\[11px\][^"]*uppercase[^"]*">[\s\S]{0,80}\$\{esc\(stream\.name\)\}/.test(src)) {
  console.error('GAGAL: label kamera masih kapital mono 11px'); gagal++;
}
if (gagal) process.exit(1);
console.log('OK: tampilan daftar playlist sesuai');

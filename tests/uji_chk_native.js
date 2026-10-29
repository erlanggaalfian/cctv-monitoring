// Penjaga: kotak centang custom harus ikut warna tombol per mode,
// bukan accent-color natif yang jelek. Jalankan: node tests/uji_chk_native.js
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'assets', 'css', 'global.css'), 'utf8');

const wajib = [
  [/\.chk-native\s*\{[^}]*appearance:\s*none/, 'chk-native wajib appearance:none (bukan checkbox natif)'],
  [/\.chk-native:checked,\s*\.chk-native:indeterminate\s*\{[^}]*background:\s*var\(--c-blue-h\)/, 'centang harus --c-blue-h (warna tombol per mode)'],
  [/\.chk-native::before[^{]*\{[^}]*clip-path/, 'tanda centang harus ::before clip-path'],
];
let gagal = 0;
for (const [re, pesan] of wajib) {
  if (!re.test(css)) { console.error('GAGAL: ' + pesan); gagal++; }
}
if (/\.chk-native\s*\{[^}]*accent-color/.test(css)) {
  console.error('GAGAL: accent-color natif masih ada di .chk-native'); gagal++;
}
if (gagal) process.exit(1);
console.log('OK: gaya chk-native sesuai');

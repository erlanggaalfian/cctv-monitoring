// Mamura Stream CCTV Portal Client Entry Point
// Impor dinamis + versi (window.__JSV dari footer): URL modul ikut berubah
// saat isi modul berubah. Tanpa ini, browser memakai salinan cache modul
// selamanya (URL impor statis) dan kode baru tidak pernah sampai.
const __v = window.__JSV ? '?v=' + window.__JSV : '';
await import('./modules/core.js' + __v);
await import('./modules/ui.js' + __v);
await import('./modules/router.js' + __v);
await import('./modules/webrtc.js' + __v);
await import('./modules/maps.js' + __v);
await import('./modules/admin.js' + __v);

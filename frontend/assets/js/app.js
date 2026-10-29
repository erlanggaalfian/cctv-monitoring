// Mamura Stream CCTV Portal Client Entry Point
// Impor STATIS (jangan diganti impor dinamis/TLA): modul harus selesai
// dievaluasi SEBELUM DOMContentLoaded, kalau tidak boot router.js berjalan
// lebih dulu dan melewatkan loadStreamsData/loadAdminData diam-diam
// (typeof guard) — grid kosong tanpa error. Kebaruan dijamin header
// Cache-Control: no-cache; ?v= hanya penendang cache lama sekali pakai.
import './modules/core.js?v=20261029';
import './modules/ui.js?v=20261029';
import './modules/router.js?v=20261029';
import './modules/webrtc.js?v=20261029';
import './modules/maps.js?v=20261029';
import './modules/admin.js?v=20261029';

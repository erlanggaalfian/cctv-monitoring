// Semua popup dapat ditutup dengan Esc dan klik di luar panelnya.
//
// Tiap modal punya fungsi tutup sendiri (closeStreamModal, tutupAksesKamera,
// dst) yang juga membereskan isinya: mengosongkan borang, melepas peta,
// menghentikan stream. Menyembunyikan panel begitu saja lewat classList
// akan melewatkan pembersihan itu, jadi jalur tutup yang sudah ada tetap
// dipakai; berkas ini hanya menambah dua pemicu baru ke jalur tersebut.
(function () {
    "use strict";

    // Modal yang terlihat = .ms-modal tanpa .hidden. Dipilih yang terakhir
    // karena modal dapat bertumpuk; yang teratas milik pengguna saat ini.
    function modalTeratas() {
        const tampak = document.querySelectorAll(".ms-modal:not(.hidden)");
        return tampak.length ? tampak[tampak.length - 1] : null;
    }

    // Tombol silang di kepala modal sudah memanggil fungsi tutup yang benar.
    // Memakainya ulang membuat berkas ini tidak perlu tahu nama fungsi mana
    // pun, sehingga modal baru ikut tertutup tanpa menyunting daftar apa pun.
    function tutup(modal) {
        if (!modal) return false;
        const tombol = modal.querySelector("[onclick*='close'], [onclick*='tutup']");
        if (tombol) { tombol.click(); return true; }
        // Modal tanpa tombol tutup: sembunyikan langsung agar tidak terkunci.
        modal.classList.add("hidden");
        return true;
    }

    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        const modal = modalTeratas();
        if (!modal) return;
        // Esc di dalam isian teks lebih dulu membatalkan isian itu sendiri
        // (autocomplete, komposisi IME); modal ditutup pada Esc berikutnya.
        if (e.isComposing) return;
        e.preventDefault();
        tutup(modal);
    });

    // Klik luar: hanya bila tekan dan lepas sama-sama di latar. Tanpa syarat
    // ini, menyeret teks dari dalam panel lalu melepas di luar akan menutup
    // modal dan membuang isian yang sedang diketik.
    let turunDiLatar = null;
    document.addEventListener("mousedown", function (e) {
        turunDiLatar = e.target.classList &&
            e.target.classList.contains("ms-modal") ? e.target : null;
    });
    document.addEventListener("click", function (e) {
        const latar = turunDiLatar;
        turunDiLatar = null;
        if (!latar || e.target !== latar) return;
        if (latar.classList.contains("hidden")) return;
        tutup(latar);
    });
})();

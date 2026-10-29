<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>


    <!-- HLS.js for Playback -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>

    <!-- Client Application Logic script -->
    <?php
    // Waktu ubah terbaru di antara app.js dan seluruh modul yang diimpornya.
    // Memakai waktu app.js saja membuat perbaikan modul tidak pernah sampai
    // ke peramban, karena app.js sendiri jarang berubah.
    $js_dir = __DIR__ . '/../assets/js';
    $js_versi = (int) @filemtime($js_dir . '/app.js');
    foreach (glob($js_dir . '/modules/*.js') ?: [] as $modul) {
        $js_versi = max($js_versi, (int) @filemtime($modul));
    }
    ?>
    <script type="module" src="assets/js/app.js?v=<?= $js_versi ?>"></script>
    <!-- Label kolom tabel untuk tampilan kartu di mobile -->
    <script src="assets/js/modules/table-labels.js?v=<?= $js_versi ?>"></script>
    <!-- Daftar kamera peta bisa ditarik (mobile) -->
    <script src="assets/js/modules/maps-sheet.js?v=<?= $js_versi ?>"></script>
    <script src="assets/js/modules/modal-tutup.js?v=<?= $js_versi ?>"></script>
</body>
</html>

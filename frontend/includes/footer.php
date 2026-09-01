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
    <script type="module" src="assets/js/app.js?v=<?= filemtime(__DIR__ . '/../assets/js/app.js') ?>"></script>
    <!-- Label kolom tabel untuk tampilan kartu di mobile -->
    <script src="assets/js/modules/table-labels.js?v=<?= filemtime(__DIR__ . '/../assets/js/modules/table-labels.js') ?>"></script>
    <!-- Daftar kamera peta bisa ditarik (mobile) -->
    <script src="assets/js/modules/maps-sheet.js?v=<?= filemtime(__DIR__ . '/../assets/js/modules/maps-sheet.js') ?>"></script>
</body>
</html>

<?php
// Mamura Stream - Logout Handler
// Membersihkan sesi klien dan redirect ke halaman login.

// Anti-CSRF: logout hanya boleh dipicu navigasi dari aplikasi ini sendiri
// (klik tombol Logout / ketik URL). Permintaan lintas situs (mis. halaman
// penyerang yang memuat logout.php di iframe) ditolak agar pengguna tidak
// bisa dipaksa keluar. Header Sec-Fetch-Site dikirim semua peramban modern;
// bila absen (peramban lama/curl), permintaan diteruskan.
$fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? null;
if ($fetchSite !== null && !in_array($fetchSite, ['same-origin', 'same-site', 'none'], true)) {
    http_response_code(403);
    exit('Forbidden.');
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logout - Mamura Stream</title>
    <script>
        // Hapus semua data sesi dari localStorage
        localStorage.removeItem("cctv_auth_token");
        localStorage.removeItem("cctv_auth_role");
        localStorage.removeItem("cctv_auth_username");
        // Redirect ke halaman login
        window.location.href = "login.php";
    </script>
</head>
<body>
    <p>Logout... Jika tidak redirect otomatis, <a href="login.php">klik di sini</a>.</p>
</body>
</html>

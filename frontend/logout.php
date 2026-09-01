<?php
// Mamura Stream - Logout Handler
// Membersihkan sesi client dan redirect ke halaman login
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Logging out...</title>
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
    <p>Logging out... Jika tidak redirect otomatis, <a href="login.php">klik di sini</a>.</p>
</body>
</html>

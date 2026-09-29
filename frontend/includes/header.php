<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>
<!DOCTYPE html>
<html lang="en" class="dark font-sans">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Mamura Stream - CCTV Streaming Portal</title>
    <!-- Inline SVG Favicon to match brand logo -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233081d1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'/%3E%3C/svg%3E">
    <!-- Tailwind CSS (Locally hosted, production warning disabled) -->
    <script src="/assets/js/tailwind-config.js?v=<?= @filemtime(__DIR__ . '/../assets/js/tailwind-config.js') ?: time() ?>"></script>
    <script src="/assets/js/tailwind.js?v=<?= @filemtime(__DIR__ . '/../assets/js/tailwind.js') ?: time() ?>"></script>

    <!-- Leaflet Map CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />

    <!-- Google Fonts (Plus Jakarta Sans & JetBrains Mono) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">

    <!-- Global CSS -->
    <link rel="stylesheet" href="/assets/css/global.css?v=<?= @filemtime(__DIR__ . '/../assets/css/global.css') ?: time() ?>">

    <!-- Basemap CARTO: API key dipusatkan di sini (satu-satunya tempat) -->
    <script>
        (function () {
            var k = "?key=cb1_2rm1_1_3a242dd67f58932f9ad943b4";
            window.CARTO_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" + k;
            window.CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" + k;
        })();
    </script>

    <!-- Instant dark theme initialization -->
    <script>
        (function() {
            const savedTheme = localStorage.getItem("theme");
            if (savedTheme === "light") {
                document.documentElement.classList.remove("dark");
            } else {
                document.documentElement.classList.add("dark");
            }
        })();
    </script>
</head>
<body class="min-h-screen flex flex-col transition-colors duration-200 font-sans antialiased">

    <!-- Top Navigation Bar -->
    <header class="glass-header animated-header">
        <!-- Brand -->
        <div class="hdr-brand">
            <div class="hdr-logo-box">
                <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
            </div>
            <div class="hdr-brand-text min-w-0">
                <div class="hdr-title header-logo truncate">Mamura Stream</div>
                <div class="hdr-sub hidden sm:block">Portal Monitoring CCTV</div>
            </div>
        </div>

        <!-- Actions -->
        <div class="hdr-actions">
            <span id="digital-clock" class="hdr-clock hidden sm:inline-flex items-center">00:00:00 UTC</span>
            <!-- Theme Toggle -->
            <button onclick="toggleTheme()" class="hdr-icon-btn cursor-pointer" title="Toggle Theme">
                <svg id="theme-sun" class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m2.828 0l-.707-.707m12.728-12.728l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
                </svg>
                <svg id="theme-moon" class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                </svg>
            </button>
            <!-- Logout -->
            <button onclick="handleLogout()" class="hdr-logout-btn logout-btn cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                <span>Logout</span>
            </button>
        </div>
    </header>

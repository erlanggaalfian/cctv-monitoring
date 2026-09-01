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
    <script src="/assets/js/tailwind.js?v=<?= @filemtime(__DIR__ . '/../assets/js/tailwind.js') ?: time() ?>"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
                    },
                    colors: {
                        brand: {
                            blue:     '#3081d1',
                            orange:   '#F26935',
                            navy:     '#2F578E',
                            'blue-h': '#1e68be',
                            'navy-h': '#1e3d6b',
                        },
                        cyber: {
                            bg:        '#080c12',
                            container: '#0f1520',
                            hover:     '#141c2b',
                            highest:   '#1a2438',
                            text:      '#dde5f4',
                            dim:       '#7a8faa',
                            outline:   'rgba(48,129,209,0.14)',
                            primary:   '#3081d1',
                            secondary: '#F26935',
                            accent:    '#F26935',
                            error:     '#ef4444',
                        },
                        sky: {
                            50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                            300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                            600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                            900: '#193a5f', 950: '#11253d',
                        },
                        emerald: {
                            50:  '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
                            300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
                            600: '#059669', 700: '#047857', 800: '#065f46',
                            900: '#064e3b', 950: '#022c22',
                        },
                        green: {
                            50:  '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
                            300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
                            600: '#059669', 700: '#047857', 800: '#065f46',
                            900: '#064e3b', 950: '#022c22',
                        },
                        rose: {
                            50:  '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                            300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
                            600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
                            900: '#7f1d1d', 950: '#450a0a',
                        },
                        red: {
                            50:  '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                            300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
                            600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
                            900: '#7f1d1d', 950: '#450a0a',
                        },
                        amber: {
                            50:  '#fef5f0', 100: '#fde8dd', 200: '#fbcfba',
                            300: '#f8ad8c', 400: '#f58a5e', 500: '#F26935',
                            600: '#d9521f', 700: '#b43f18', 800: '#8f3416',
                            900: '#742d15', 950: '#3f1408',
                        },
                        indigo: {
                            50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                            300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                            600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                            900: '#193a5f', 950: '#11253d',
                        },
                        blue: {
                            50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                            300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                            600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                            900: '#193a5f', 950: '#11253d',
                        },
                        slate: {
                            50:  '#f0f5ff',
                            100: '#e6edf8',
                            200: '#ccd8ee',
                            300: '#a8bcdb',
                            400: '#7a8faa',
                            500: '#4a5f80',
                            600: '#3a4f6e',
                            700: '#2a3b58',
                            800: '#1a2438',
                            900: '#0f1520',
                            950: '#080c12',
                        }
                    },
                    borderRadius: { 'sm':'8px','md':'12px','lg':'16px','xl':'20px','2xl':'24px' }
                }
            }
        }
    </script>

    <!-- Leaflet Map CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />

    <!-- Google Fonts (Plus Jakarta Sans & JetBrains Mono) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">

    <!-- Global CSS -->
    <link rel="stylesheet" href="/assets/css/global.css?v=<?= @filemtime(__DIR__ . '/../assets/css/global.css') ?: time() ?>">

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

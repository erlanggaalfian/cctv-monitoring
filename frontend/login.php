<!DOCTYPE html>
<html lang="id" class="dark font-sans">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Mamura Stream - Login</title>
    <!-- Inline SVG Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233081d1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'/%3E%3C/svg%3E">
    <!-- Tailwind: tailwind.js dulu (membuat objek `tailwind`), lalu konfigurasinya -->
    <script src="/assets/js/tailwind.js?v=<?= @filemtime(__DIR__ . '/assets/js/tailwind.js') ?: time() ?>"></script>
    <script src="/assets/js/tailwind-config.js?v=<?= @filemtime(__DIR__ . '/assets/js/tailwind-config.js') ?: time() ?>"></script>
    <!-- Google Fonts (Poppins & Montserrat) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/global.css?v=<?= @filemtime(__DIR__ . '/assets/css/global.css') ?: time() ?>">

    <!-- vk-* tahap 2 (pola frontend/includes/header.php; login.php ada di
         frontend/ sehingga __DIR__ . '/assets/...' tanpa '/../') -->
    <link rel="stylesheet" href="/assets/css/vk-chrome.css?v=<?= @filemtime(__DIR__ . '/assets/css/vk-chrome.css') ?: time() ?>">
    <link rel="stylesheet" href="/assets/css/vk-components.css?v=<?= @filemtime(__DIR__ . '/assets/css/vk-components.css') ?: time() ?>">
    <link rel="stylesheet" href="/assets/css/vk-mobile.css?v=<?= @filemtime(__DIR__ . '/assets/css/vk-mobile.css') ?: time() ?>">
    <script src="/assets/js/modules/vk-patterns.js?v=<?= @filemtime(__DIR__ . '/assets/js/modules/vk-patterns.js') ?: time() ?>"></script>
    <script>
        // Langsung ke halaman utama bila sudah login
        if (localStorage.getItem("cctv_auth_token")) {
            window.location.href = "index.php";
        }

        // Theme initialization
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
<body class="login-body min-h-screen flex items-center justify-center p-4">

    <!-- Theme toggle (pojok kanan atas) -->
    <button onclick="toggleTheme()" class="hdr-icon-btn absolute top-4 right-4" title="Ganti tema" aria-label="Ganti tema">
        <svg id="theme-sun" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m2.828 0l-.707-.707m12.728-12.728l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
        </svg>
        <svg id="theme-moon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
    </button>

    <!-- Kartu login -->
    <div class="w-full max-w-sm login-card p-8">
        <div class="flex flex-col items-center mb-6">
            <svg class="w-8 h-8 mb-3" style="color: var(--c-blue)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <h2 class="vk-login-title text-xl font-bold tracking-tight text-slate-900 dark:text-white">Mamura Stream</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Portal Monitoring CCTV</p>
        </div>

        <form id="login-form" class="space-y-4">
            <div>
                <label for="username" class="vk-label">Nama pengguna</label>
                <input type="text" id="username" required autocomplete="username" enterkeyhint="next"
                    class="vk-input" placeholder="admin">
            </div>
            <div>
                <label for="password" class="vk-label">Kata sandi</label>
                <input type="password" id="password" required autocomplete="current-password" enterkeyhint="go"
                    class="vk-input" placeholder="••••••••">
            </div>

            <div id="login-error" class="vk-card-status hidden" role="alert">
                Login gagal. Periksa kembali kredensial.
            </div>

            <button type="submit" class="vk-btn vk-btn--block">Masuk</button>
        </form>

        <div class="flex items-center gap-3 my-5" aria-hidden="true">
            <div class="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
            <span class="text-xs text-slate-500 dark:text-slate-400">atau</span>
            <div class="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
        </div>

        <button type="button" onclick="loginAsGuest()" class="vk-btn vk-btn--secondary vk-btn--block">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span>Masuk sebagai tamu</span>
        </button>
    </div>

    <script>
        const API_URL = window.location.origin + "/api";

        function toggleTheme() {
            if (document.documentElement.classList.contains("dark")) {
                document.documentElement.classList.remove("dark");
                localStorage.setItem("theme", "light");
            } else {
                document.documentElement.classList.add("dark");
                localStorage.setItem("theme", "dark");
            }
        }

        function simpanSesi(data) {
            localStorage.setItem("cctv_auth_token", data.access_token);
            localStorage.setItem("cctv_auth_role", data.role);
            localStorage.setItem("cctv_auth_username", data.username);
            window.location.href = "index.php";
        }

        document.getElementById("login-form").addEventListener("submit", async function(e) {
            e.preventDefault();
            const usernameInput = document.getElementById("username").value;
            const passwordInput = document.getElementById("password").value;
            const errorDiv = document.getElementById("login-error");

            errorDiv.classList.add("hidden");

            try {
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: usernameInput, password: passwordInput })
                });

                if (!response.ok) {
                    throw new Error("Invalid login");
                }

                simpanSesi(await response.json());
            } catch (err) {
                console.error(err);
                errorDiv.textContent = "Login gagal. Periksa kembali kredensial.";
                errorDiv.classList.remove("hidden");
            }
        });

        async function loginAsGuest() {
            const errorDiv = document.getElementById("login-error");
            errorDiv.classList.add("hidden");

            try {
                const response = await fetch(`${API_URL}/auth/guest`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                });

                if (!response.ok) {
                    throw new Error("Guest login failed");
                }

                simpanSesi(await response.json());
            } catch (err) {
                console.error(err);
                errorDiv.textContent = "Sesi tamu gagal dibuat. Hubungi administrator.";
                errorDiv.classList.remove("hidden");
            }
        }
    </script>
</body>
</html>

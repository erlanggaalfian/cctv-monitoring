<!DOCTYPE html>
<html lang="en" class="dark font-sans">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mamura Stream - Login</title>
    <!-- Inline SVG Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233081d1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'/%3E%3C/svg%3E">
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
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
                        cyber: {
                            bg: '#080d1a',
                            container: '#11192e',
                            hover: '#1d273f',
                            outline: 'rgba(255, 255, 255, 0.08)',
                            primary: '#3081d1',
                            secondary: '#F26935',
                            dim: '#7a8faa',
                            error: '#f43f5e',
                            text: '#dde5f4'
                        }
                    },
                    borderRadius: {
                        'sm': '6px',
                        'md': '10px',
                        'lg': '14px',
                        'xl': '20px',
                    }
                }
            }
        }
    </script>
    <!-- Google Fonts (Plus Jakarta Sans & JetBrains Mono) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/global.css?v=<?= @filemtime(__DIR__ . '/assets/css/global.css') ?: time() ?>">
    <script>
        // Redirect immediately if already logged in
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
    <style>
        /* Flat Borderless Design - Refined styles for input focus shadow */
        .app-input {
            transition: all 0.2s ease;
        }
        .app-input:focus {
            box-shadow: 0 0 0 3px rgba(48, 129, 209, 0.15) !important;
            border-color: #3081d1 !important;
        }
    </style>
</head>
<body class="login-body text-slate-800 dark:text-slate-100 min-h-screen flex items-center justify-center p-4 transition-colors duration-300">

    <!-- Floating Theme Toggle (top right) -->
    <button onclick="toggleTheme()" class="absolute top-6 right-6 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-105 active:scale-95 transition-all duration-200 shadow-sm flex items-center justify-center cursor-pointer" title="Toggle Light/Dark Theme">
        <svg id="theme-sun" class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m2.828 0l-.707-.707m12.728-12.728l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
        </svg>
        <svg id="theme-moon" class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
    </button>

    <!-- Centered Login Card -->
    <div class="w-full max-w-sm login-card bg-white dark:bg-[#11192e] p-8 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xl transition-all duration-300">
        <!-- Logo and header -->
        <div class="flex flex-col items-center mb-8">
            <div class="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 mb-4">
                <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
            </div>
            <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white uppercase font-sans">Mamura Stream</h2>
            <p class="text-[10px] text-slate-400 mt-1 font-mono tracking-widest uppercase">Secure Monitoring Console</p>
        </div>

        <!-- Login Form -->
        <form id="login-form" class="space-y-5">
            <div>
                <label for="username" class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 font-sans">Console Username</label>
                <input type="text" id="username" required 
                    class="app-input w-full"
                    placeholder="e.g., admin">
            </div>
            <div>
                <label for="password" class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 font-sans">Access Key</label>
                <input type="password" id="password" required 
                    class="app-input w-full"
                    placeholder="••••••••">
            </div>

            <div id="login-error" class="hidden text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 p-3 rounded-xl border border-rose-200 dark:border-rose-500/20 font-mono">
                Authentication failed. Please verify credentials.
            </div>

            <!-- Primary Submit Login Button with distinct theme styling -->
            <button type="submit" 
                class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider font-mono transition-all duration-200 active:scale-[0.98] shadow-md shadow-blue-500/20 dark:shadow-sky-500/20 cursor-pointer">
                Establish Secure Session
            </button>
        </form>

        <!-- Guest Entry -->
        <div class="relative my-6">
            <div class="absolute inset-0 flex items-center" aria-hidden="true">
                <div class="w-full border-t border-slate-200 dark:border-slate-700/60"></div>
            </div>
            <div class="relative flex justify-center text-[9px] uppercase font-mono">
                <span class="bg-white dark:bg-[#11192e] px-2.5 text-slate-400 dark:text-slate-400 rounded-md">Or</span>
            </div>
        </div>

        <!-- Secondary Guest Login Button -->
        <button type="button" onclick="loginAsGuest()"
            class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider font-mono transition-all duration-200 flex items-center justify-center space-x-2 active:scale-[0.98] cursor-pointer">
            <svg class="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span>Login As Guest</span>
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

                const data = await response.json();
                
                // Store session
                localStorage.setItem("cctv_auth_token", data.access_token);
                localStorage.setItem("cctv_auth_role", data.role);
                localStorage.setItem("cctv_auth_username", data.username);

                // Redirect to router
                window.location.href = "index.php";
            } catch (err) {
                console.error(err);
                errorDiv.textContent = "Authentication failed. Please verify credentials.";
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

                const data = await response.json();
                
                // Store session
                localStorage.setItem("cctv_auth_token", data.access_token);
                localStorage.setItem("cctv_auth_role", data.role);
                localStorage.setItem("cctv_auth_username", data.username);

                // Redirect to router
                window.location.href = "index.php";
            } catch (err) {
                console.error(err);
                errorDiv.textContent = "Guest session establishment failed. Please contact administrator.";
                errorDiv.classList.remove("hidden");
            }
        }
    </script>
</body>
</html>

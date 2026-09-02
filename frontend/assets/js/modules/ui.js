    // --- 1. Clock Sync ---
    setInterval(() => {
        const clockEl = document.getElementById("digital-clock");
        if (clockEl) {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Jakarta',
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            clockEl.textContent = formatter.format(now).replace(/,/g, '') + ' WIB';
        }
    }, 1000);

    // --- 3. Shared Functions ---
    function syncThemeIcons() {
        const isDark = document.documentElement.classList.contains("dark");
        const sunIcon = document.getElementById("theme-sun");
        const moonIcon = document.getElementById("theme-moon");
        if (isDark) {
            if (sunIcon) {
                sunIcon.classList.remove("hidden");
                sunIcon.classList.add("block");
            }
            if (moonIcon) {
                moonIcon.classList.remove("block");
                moonIcon.classList.add("hidden");
            }
        } else {
            if (sunIcon) {
                sunIcon.classList.remove("block");
                sunIcon.classList.add("hidden");
            }
            if (moonIcon) {
                moonIcon.classList.remove("hidden");
                moonIcon.classList.add("block");
            }
        }
    }
    window.syncThemeIcons = syncThemeIcons;

    window.toggleTheme = function() {
        if (document.documentElement.classList.contains("dark")) {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", "light");
        } else {
            document.documentElement.classList.add("dark");
            localStorage.setItem("theme", "dark");
        }
        syncThemeIcons();
        
        // Dynamically update Leaflet map tiles if active
        const newIsDark = document.documentElement.classList.contains("dark");
        const nextUrl = newIsDark 
            ? window.CARTO_DARK
            : window.CARTO_LIGHT;

        if (window.leafletTileLayer && typeof window.leafletTileLayer.setUrl === "function") {
            window.leafletTileLayer.setUrl(nextUrl);
        }
        if (window.leafletTileLayerModal && typeof window.leafletTileLayerModal.setUrl === "function") {
            window.leafletTileLayerModal.setUrl(nextUrl);
        }
    };

    window.handleLogout = function() {
        localStorage.removeItem("cctv_auth_token");
        localStorage.removeItem("cctv_auth_role");
        localStorage.removeItem("cctv_auth_username");
        try {
            sessionStorage.removeItem(VIEWER_GRID_CACHE_KEY);
        } catch (e) {}
        window.location.href = "login.php";
    };


    function showApiErrorBanner(message) {
        window.showToast(message, "error");
    }
    window.showApiErrorBanner = showApiErrorBanner;

    function showApiSuccessBanner(message) {
        window.showToast(message, "success");
    }
    window.showApiSuccessBanner = showApiSuccessBanner;


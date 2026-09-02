// Shared Global State bindings for ES6 Module refactoring
let state = {
    API_URL: window.location.origin + "/api",
    userToken: localStorage.getItem("cctv_auth_token") || null,
    userRole: localStorage.getItem("cctv_auth_role") || null,
    username: localStorage.getItem("cctv_auth_username") || null,
    currentPage: new URLSearchParams(window.location.search).get('page') || 'monitor',
    activeGridLayout: (window.innerWidth < 768) ? 2 : 3,
    streamsData: [],
    simulationActive: false,
    adminUsers: [],
    adminStreams: [],
    adminApiKeys: [],
    adminStreamsPageOffset: 0,
    ADMIN_STREAMS_PAGE_SIZE: 15,
    _apiLogOffset: 0,
    _API_LOG_LIMIT: 100,
    _apiLogAutoRefreshTimer: null,
    popupSwapTimeout: null,
    lastPopupFrameDataUrl: null,
    // Pagination & stream state shared across webrtc/router modules
    livePageOffset: 0,
    customPageOffset: 0,
    viewerTotalPages: 1,
    viewerTotalItems: 0,
    viewerAllStreamsList: []
};

// Define getter/setters on window for seamless variable access across separate files
for (const key of Object.keys(state)) {
    if (!(key in window)) {
        Object.defineProperty(window, key, {
            get: () => state[key],
            set: (val) => { state[key] = val; },
            configurable: true
        });
    }
}




    function getStorageKey(key) {
        return `${key}_${username || 'default'}`;
    }
    window.getStorageKey = getStorageKey;

    function hexToRgba(hex, alpha) {
        if (!hex) return '';
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    window.hexToRgba = hexToRgba;



    function captureLastPopupFrame() {
        const video = document.getElementById("video-feed-popup");
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                lastPopupFrameDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            } catch (e) {
                console.warn("Failed to capture video frame:", e);
            }
        }
    }

    // NOTE: livePageOffset, customPageOffset, viewerTotalPages, viewerTotalItems,
    // viewerAllStreamsList are now in the shared `state` object above (accessible via window.*)

    const PAGINATION_BTN_ACTIVE = "pagination-btn-page px-2.5 sm:px-3 py-1.5 bg-sky-500 dark:bg-cyber-primary text-white dark:text-cyber-bg border border-sky-400 dark:border-cyber-primary font-bold rounded-md text-xs transition-all duration-150 shadow-sm shadow-sky-500/20 min-w-[2rem]";
    const PAGINATION_BTN_PAGE = "pagination-btn-page px-2.5 sm:px-3 py-1.5 bg-slate-50 dark:bg-cyber-bg hover:bg-slate-100 dark:hover:bg-cyber-hover/30 text-slate-600 dark:text-cyber-dim border border-slate-200 dark:border-cyber-outline/60 rounded-md text-xs transition-all duration-150 active:scale-95 min-w-[2rem]";

    function getPaginationPageSlots(currentIndex, totalPages) {
        const maxButtons = 5;
        let start = Math.max(1, (currentIndex + 1) - Math.floor(maxButtons / 2));
        let end = start + maxButtons - 1;

        if (end > totalPages) {
            end = totalPages;
            start = Math.max(1, end - maxButtons + 1);
        }

        const pages = [];
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }


    function renderPaginationPageButtons(container, currentIndex, totalPages, jumpCallback) {
        if (!container) return;
        container.innerHTML = "";
        getPaginationPageSlots(currentIndex, totalPages).forEach(p => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = String(p);
            btn.onclick = () => jumpCallback(p - 1);
            btn.className = (p - 1 === currentIndex) ? PAGINATION_BTN_ACTIVE : PAGINATION_BTN_PAGE;
            btn.setAttribute("aria-label", `Halaman ${p}`);
            btn.setAttribute("aria-current", p - 1 === currentIndex ? "page" : "false");
            container.appendChild(btn);
        });
    }

    function updatePaginationNavButtons(firstBtn, prevBtn, nextBtn, lastBtn, currentIndex, totalPages) {
        const atStart = currentIndex <= 0;
        const atEnd = currentIndex >= totalPages - 1;
        if (firstBtn) firstBtn.disabled = atStart;
        if (prevBtn) prevBtn.disabled = atStart;
        if (nextBtn) nextBtn.disabled = atEnd;
        if (lastBtn) lastBtn.disabled = atEnd;
    }

    function updateAdminStreamsPaginationUI(totalItems, totalPages) {
        const paginationContainer = document.getElementById("admin-streams-pagination");
        const pagesContainer = document.getElementById("admin-pagination-pages-container");
        const pageIndicator = document.getElementById("admin-page-indicator");
        const firstBtn = document.getElementById("admin-first-page-btn");
        const prevBtn = document.getElementById("admin-prev-page-btn");
        const nextBtn = document.getElementById("admin-next-page-btn");
        const lastBtn = document.getElementById("admin-last-page-btn");

        if (!paginationContainer) return;

        if (totalPages <= 1) {
            paginationContainer.classList.add("hidden");
            return;
        }

        paginationContainer.classList.remove("hidden");
        if (pageIndicator) {
            pageIndicator.textContent = `Halaman ${adminStreamsPageOffset + 1} / ${totalPages} · ${totalItems} kamera`;
        }
        updatePaginationNavButtons(firstBtn, prevBtn, nextBtn, lastBtn, adminStreamsPageOffset, totalPages);
        renderPaginationPageButtons(pagesContainer, adminStreamsPageOffset, totalPages, (pageIndex) => {
            window.jumpToAdminStreamsPage(pageIndex);
        });
    }

    function getCustomPaginationMeta() {
        const viewMode = localStorage.getItem(getStorageKey("cctv_custom_view_mode")) || "custom";
        let totalItems = 0;
        if (viewMode === "group") {
            const selectedGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";
            totalItems = streamsData.filter(s => s.group_name === selectedGroup).length;
        } else {
            totalItems = customPlaylist.filter(item => item.enabled).length;
        }
        const pageCapacity = customGridSize * customGridSize;
        const totalPages = Math.ceil(totalItems / pageCapacity) || 1;
        return { totalItems, totalPages, pageCapacity };
    }

    // ── Expose all core utility functions to window (cross-module access) ──────
    window.captureLastPopupFrame      = captureLastPopupFrame;
    window.getPaginationPageSlots     = getPaginationPageSlots;
    window.renderPaginationPageButtons = renderPaginationPageButtons;
    window.updatePaginationNavButtons  = updatePaginationNavButtons;
    window.updateAdminStreamsPaginationUI = updateAdminStreamsPaginationUI;
    window.getCustomPaginationMeta    = getCustomPaginationMeta;
    // ──────────────────────────────────────────────────────────────────────────

    // --- Global Toast Notification ---
    window.showToast = function(message, type = "success") {
        const container = document.getElementById("toast-container") || (() => {
            const el = document.createElement("div");
            el.id = "toast-container";
            el.className = "fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none";
            document.body.appendChild(el);
            return el;
        })();

        const toast = document.createElement("div");
        const isError = type === "error";
        toast.className = [
            "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-xs font-mono font-bold",
            "-translate-y-5 opacity-0 transition-all duration-300 ease-out",
            isError
                ? "bg-red-950/90 border-red-500/40 text-red-300 backdrop-blur-sm"
                : "bg-emerald-950/90 border-emerald-500/40 text-emerald-300 backdrop-blur-sm"
        ].join(" ");

        toast.innerHTML = isError
            ? `<svg class="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>${message}</span>`
            : `<svg class="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>${message}</span>`;

        container.appendChild(toast);
        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.remove("-translate-y-5", "opacity-0");
            });
        });
        // Auto remove after 3.5s
        setTimeout(() => {
            toast.classList.add("-translate-y-5", "opacity-0");
            setTimeout(() => toast.remove(), 350);
        }, 3500);
    };

    window.copyFullApiInfo = function(keyId) {
        const text = window.apiKeysShareText?.[keyId] || "";
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById(`key-${keyId}-copy-btn`);
            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Tersalin!`;
                btn.classList.remove("bg-sky-500/10", "text-sky-500", "border-sky-500/30");
                btn.classList.add("bg-emerald-500/10", "text-emerald-500", "border-emerald-500/30");
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.classList.remove("bg-emerald-500/10", "text-emerald-500", "border-emerald-500/30");
                    btn.classList.add("bg-sky-500/10", "text-sky-500", "border-sky-500/30");
                }, 2000);
            }
        }).catch(() => {
            alert("Gagal menyalin. Silakan salin secara manual.");
        });
    };

    // Cache daftar kamera supaya modal tidak fetch berulang.
    window._apiCameraCache = null;

    window.populateApiCameraSelect = async function() {
        try {
            const res = await fetch(`${API_URL}/admin/streams`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!res.ok) throw new Error("Gagal memuat daftar kamera");
            const data = await res.json();
            window._apiCameraCache = data.items || data;
            window.renderApiCameraList("api");
            window.renderApiCameraList("edit-api");
        } catch (e) {
            console.error("populateApiCameraSelect error:", e);
        }
    };

    // Bangun daftar kamera bercentang. selectedIds = array id yang dicentang.
    window.renderApiCameraList = function(prefix, selectedIds) {
        const box = document.getElementById(`${prefix}-camera-list`);
        if (!box) return;
        const cams = window._apiCameraCache || [];
        const sel = new Set((selectedIds || []).map(Number));

        if (!cams.length) {
            box.innerHTML = '<p class="text-[10px] font-mono text-slate-400 dark:text-cyber-dim/60 p-2">Tidak ada kamera.</p>';
            window.updateApiCamCount(prefix);
            return;
        }

        box.innerHTML = cams.map(cam => {
            const rec = cam.record_enabled ? 1 : 0;
            const checked = sel.has(Number(cam.id)) ? " checked" : "";
            const badge = rec
                ? '<span class="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">REC</span>'
                : "";
            const nama = String(cam.name || `Kamera ${cam.id}`)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<label class="flex items-center gap-2 px-2 py-2.5 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-cyber-hover transition-colors api-cam-row" data-name="${nama.toLowerCase()}">
                <input type="checkbox" class="${prefix}-cam-check shrink-0" value="${cam.id}" data-rec="${rec}"${checked}
                    onchange="window.updateApiCamCount('${prefix}')">
                <span class="text-xs font-mono text-slate-700 dark:text-cyber-text truncate">${nama}</span>
                ${badge}
            </label>`;
        }).join("");

        window.updateApiCamCount(prefix);
    };

    // Perbarui hitungan + status toggle playback.
    // Urutan kamera per form. Index 0 = kamera utama (camera=1).
    window._apiCamOrder = { "api": [], "edit-api": [] };

    // Selaraskan urutan dengan centang: yang baru dicentang masuk ke belakang,
    // yang dilepas dibuang. Urutan lama dipertahankan.
    window.syncApiCamOrder = function(prefix) {
        const dicentang = Array.from(document.querySelectorAll(`.${prefix}-cam-check`))
            .filter(c => c.checked).map(c => parseInt(c.value, 10));
        const set = new Set(dicentang);
        let urut = (window._apiCamOrder[prefix] || []).filter(id => set.has(id));
        dicentang.forEach(id => { if (!urut.includes(id)) urut.push(id); });
        window._apiCamOrder[prefix] = urut;
        window.renderApiCamOrder(prefix);
    };

    window.renderApiCamOrder = function(prefix) {
        const wrap = document.getElementById(`${prefix}-order-wrap`);
        const list = document.getElementById(`${prefix}-order-list`);
        if (!wrap || !list) return;
        const urut = window._apiCamOrder[prefix] || [];

        if (urut.length < 2) { wrap.classList.add("hidden"); return; }
        wrap.classList.remove("hidden");

        const cams = window._apiCameraCache || [];
        const nama = (id) => {
            const c = cams.find(x => Number(x.id) === Number(id));
            return String(c ? c.name : `Kamera ${id}`)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };

        list.innerHTML = urut.map((id, i) => `
            <div class="flex items-center gap-2 px-2 py-2 rounded-md bg-white dark:bg-cyber-surface border border-slate-200/60 dark:border-cyber-outline/30">
                <span class="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold font-mono ${i === 0
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-200 dark:bg-cyber-bg text-slate-600 dark:text-cyber-dim'}">${i + 1}</span>
                <span class="text-xs font-mono text-slate-700 dark:text-cyber-text truncate flex-1">${nama(id)}</span>
                ${i === 0 ? '<span class="shrink-0 text-[9px] font-mono text-sky-600 dark:text-cyber-primary">UTAMA</span>' : ''}
                <div class="flex items-center gap-1 shrink-0">
                    ${i > 0 ? `<button type="button" title="Jadikan kamera utama" onclick="window.apiCamJadikanUtama('${prefix}', ${i})"
                        class="w-8 h-8 flex items-center justify-center rounded border border-slate-200 dark:border-cyber-outline text-[10px] text-sky-600 dark:text-cyber-primary hover:border-sky-400">&#9733;</button>` : ''}
                    <button type="button" title="Naik" ${i === 0 ? 'disabled' : ''} onclick="window.apiCamGeser('${prefix}', ${i}, -1)"
                        class="w-8 h-8 flex items-center justify-center rounded border border-slate-200 dark:border-cyber-outline text-slate-500 dark:text-cyber-dim hover:border-sky-400 ${i === 0 ? 'opacity-30 cursor-not-allowed' : ''}">&#9650;</button>
                    <button type="button" title="Turun" ${i === urut.length - 1 ? 'disabled' : ''} onclick="window.apiCamGeser('${prefix}', ${i}, 1)"
                        class="w-8 h-8 flex items-center justify-center rounded border border-slate-200 dark:border-cyber-outline text-slate-500 dark:text-cyber-dim hover:border-sky-400 ${i === urut.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}">&#9660;</button>
                </div>
            </div>`).join("");
    };

    window.apiCamGeser = function(prefix, idx, arah) {
        const urut = window._apiCamOrder[prefix] || [];
        const tujuan = idx + arah;
        if (tujuan < 0 || tujuan >= urut.length) return;
        [urut[idx], urut[tujuan]] = [urut[tujuan], urut[idx]];
        window.renderApiCamOrder(prefix);
    };

    window.apiCamJadikanUtama = function(prefix, idx) {
        const urut = window._apiCamOrder[prefix] || [];
        if (idx <= 0 || idx >= urut.length) return;
        urut.unshift(urut.splice(idx, 1)[0]);
        window.renderApiCamOrder(prefix);
    };

    window.updateApiCamCount = function(prefix) {
        window.syncApiCamOrder(prefix);
        const checks = Array.from(document.querySelectorAll(`.${prefix}-cam-check`));
        const dipilih = checks.filter(c => c.checked);
        const label = document.getElementById(`${prefix}-cam-count`);
        if (label) label.textContent = `${dipilih.length} dipilih`;

        // Toggle playback hanya masuk akal bila ada kamera terpilih yang merekam.
        const adaRekaman = dipilih.some(c => c.dataset.rec === "1");
        const toggle = document.getElementById(`${prefix}-include-playback`);
        const hint = document.getElementById(`${prefix}-playback-hint`);
        if (toggle) {
            toggle.disabled = !adaRekaman;
            if (!adaRekaman) toggle.checked = false;
            const wrap = toggle.closest("label");
            if (wrap) wrap.classList.toggle("opacity-40", !adaRekaman);
            if (wrap) wrap.classList.toggle("cursor-not-allowed", !adaRekaman);
        }
        if (hint) {
            hint.textContent = adaRekaman
                ? "Klien boleh melihat rekaman kamera di atas"
                : "Tidak ada kamera terpilih yang merekam";
        }
    };

    window.toggleAllApiCameras = function(prefix, nyala) {
        // Hormati filter pencarian: hanya baris yang terlihat yang diubah.
        document.querySelectorAll(`.${prefix}-cam-check`).forEach(c => {
            const row = c.closest(".api-cam-row");
            if (row && row.classList.contains("hidden")) return;
            c.checked = nyala;
        });
        window.updateApiCamCount(prefix);
    };

    window.filterApiCameraList = function(prefix) {
        const q = (document.getElementById(`${prefix}-cam-search`)?.value || "").toLowerCase().trim();
        const box = document.getElementById(`${prefix}-camera-list`);
        if (!box) return;
        box.querySelectorAll(".api-cam-row").forEach(row => {
            row.classList.toggle("hidden", q && !(row.dataset.name || "").includes(q));
        });
    };

    // Kumpulkan pilihan: [utama, ...sisanya]
    window.getApiSelectedCameras = function(prefix) {
        // Urutan panel yang menentukan; index 0 = kamera utama.
        window.syncApiCamOrder(prefix);
        return (window._apiCamOrder[prefix] || []).slice();
    };

    window.loadApiKeysList = async function() {
        const tbody = document.getElementById("api-keys-table-body");
        if (!tbody) return;

        // Show loading state
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
            <div class="flex items-center justify-center space-x-2">
                <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <span>Memuat daftar API key...</span>
            </div>
        </td></tr>`;

        try {
            const res = await fetch(`${API_URL}/admin/api-keys`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!res.ok) throw new Error("Gagal memuat kunci API");
            const keys = await res.json();
            adminApiKeys = keys;

            const badge = document.getElementById("admin-subtab-api-badge");
            if (badge) badge.textContent = keys.length;

            if (keys.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                            <div class="flex flex-col items-center space-y-2">
                                <svg class="w-8 h-8 text-slate-300 dark:text-cyber-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 7a2 2 0 012 2m-2 4a2 2 0 012 2m-2-4a2 2 0 11-4 0m4 0a2 2 0 10-4 0m-5 5h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                <span>Belum ada Kunci API. Gunakan form di atas untuk membuat.</span>
                            </div>
                        </td>
                    </tr>`;
                return;
            }

            tbody.innerHTML = "";
            keys.forEach(key => {
                const tr = document.createElement("tr");
                tr.className = "border-b border-slate-100 dark:border-cyber-outline/20 hover:bg-slate-50 dark:hover:bg-cyber-bg/20 transition-colors duration-100";

                const hasPassword = !!(key.secret_pass && String(key.secret_pass).trim() !== "");
                const secretPassVal = key.secret_pass || "";
                const secretPassEscaped = secretPassVal.replace(/'/g, "\\'");
                const keyValue = key.key_value;
                const keyId = `key-${key.id}`;

                const origin = window.location.origin;
                const embedUrl = `${origin}/frontend/embed.php?key=${keyValue}` + (hasPassword ? `&pass=${encodeURIComponent(secretPassVal)}` : '');
                const iframeCode = `<iframe src="${embedUrl}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
                const restApiUrl = `${origin}/api/external/stream?key=${keyValue}` + (hasPassword ? `&pass=${encodeURIComponent(secretPassVal)}` : '');

                const shareText = [
                    `=== Info Integrasi API CCTV ===`,
                    `Nama Klien    : ${key.client_name}`,
                    `Kamera        : ${key.camera_name}` + (key.custom_camera_name ? ` (Kustom: ${key.custom_camera_name})` : ``),
                    `API Key       : ${keyValue}`,
                    `Password      : ${hasPassword ? key.secret_pass : "(tidak ada)"}`,
                    `Domain        : ${key.allowed_domain || "Semua domain (public)"}`,
                    ``,
                    `--- Embed Iframe (copy ke HTML) ---`,
                    iframeCode,
                    ``,
                    `--- REST API Endpoint ---`,
                    restApiUrl,
                    ``,
                    `--- URL Pemutar Langsung ---`,
                    embedUrl,
                    `================================`
                ].join("\n");

                window.apiKeysShareText = window.apiKeysShareText || {};
                window.apiKeysShareText[key.id] = shareText;

                const camIdsKey = (key.camera_ids && key.camera_ids.length) ? key.camera_ids : [key.camera_id];
                const camNamesKey = (key.camera_names && key.camera_names.length) ? key.camera_names : [key.camera_name];
                const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const daftarKameraHtml = camNamesKey.map((n, idx) =>
                    `<span class="inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-mono ${idx === 0
                        ? 'bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 font-bold'
                        : 'bg-slate-100 dark:bg-cyber-bg text-slate-500 dark:text-cyber-dim'}"
                        title="${idx === 0 ? 'Kamera utama (dipakai bila URL tanpa parameter camera)' : `Akses via ?camera=${camIdsKey[idx]}`}">${esc(n)}</span>`
                ).join(" ");

                tr.innerHTML = `
                    <td class="py-4 px-4">
                        <div class="font-bold text-slate-800 dark:text-white text-xs">${key.client_name}</div>
                        <div class="text-[10px] text-slate-400 dark:text-cyber-dim font-mono mt-0.5">
                            ${key.custom_camera_name ? `<span class="text-sky-500 dark:text-cyber-primary font-semibold">[Kustom] ${key.custom_camera_name}</span><br>` : ''}
                            <div class="flex flex-wrap items-center gap-1 mt-1">${daftarKameraHtml}</div>
                        </div>
                    </td>
                    <td class="py-4 px-4 space-y-1.5">
                        <div>
                            <span class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${key.allowed_domain ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30'}">
                                ${key.allowed_domain ? `🔑 ${key.allowed_domain.toUpperCase()}` : '🌐 PUBLIC'}
                            </span>
                        </div>
                        <div>
                            <span class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${hasPassword ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/30' : 'bg-slate-100 dark:bg-cyber-bg text-slate-500 dark:text-cyber-dim border border-slate-300 dark:border-cyber-outline/40'}">
                                ${hasPassword ? '🔒 PASSWORD' : '🔓 NO PASSWORD'}
                            </span>
                        </div>
                        <div class="flex items-center gap-1 flex-wrap">
                            <span class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200/50 dark:border-sky-800/30">
                                &#128247; ${camIdsKey.length} KAMERA
                            </span>
                            ${key.include_playback
                                ? '<span class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400 border border-violet-200/50 dark:border-violet-800/30">&#9654; PLAYBACK</span>'
                                : '<span class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-slate-100 dark:bg-cyber-bg text-slate-500 dark:text-cyber-dim border border-slate-300 dark:border-cyber-outline/40">LIVE SAJA</span>'}
                        </div>
                    </td>
                    <td class="py-4 px-4 max-w-xs">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <code class="text-[10px] text-sky-600 dark:text-cyber-primary font-bold font-mono select-all bg-sky-500/5 dark:bg-cyber-primary/5 px-2 py-0.5 rounded border border-sky-500/10">${keyValue}</code>
                            <!-- Copy API Key Button -->
                            <button id="${keyId}-copy-key-btn" onclick="window.copyToClipboard('${keyValue}${hasPassword ? `&pass=${secretPassEscaped}` : ''}', '${keyId}-copy-key-btn')"
                                class="p-1 hover:bg-slate-200 dark:hover:bg-cyber-hover border border-slate-200 dark:border-cyber-outline rounded text-slate-500 dark:text-cyber-dim hover:text-sky-500 transition-all flex items-center justify-center" title="Salin API Key">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                            </button>
                            <!-- Setup Popup Button -->
                            <button onclick="window.openApiSetupModal('${key.id}')"
                                class="px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-cyber-hover border border-slate-200 dark:border-cyber-outline rounded text-slate-500 dark:text-cyber-dim hover:text-sky-500 transition-all flex items-center gap-1" title="Cara Pasang di Server Lain">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                <span class="text-[9px] font-bold font-mono">Cara Set</span>
                            </button>
                        </div>
                        <div class="text-[9px] text-slate-400 dark:text-cyber-dim mt-1.5 truncate font-mono max-w-xs" title="${embedUrl}">${embedUrl}</div>
                    </td>
                    <td class="py-4 px-4 text-right space-x-2.5">
                        <a href="${origin}/frontend/embed.php?key=${encodeURIComponent(keyValue)}${hasPassword ? `&pass=${encodeURIComponent(secretPassVal)}` : ''}" target="_blank" rel="noopener noreferrer"
                            class="text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-[11px] uppercase inline-block">
                            Test Player
                        </a>
                        <button onclick="window.openApiKeyEditModal('${key.id}')"
                            class="text-amber-600 dark:text-amber-400 hover:underline font-bold text-[11px] uppercase">
                            Edit
                        </button>
                        <button onclick="window.handleRevokeApiKey('${key.id}')"
                            class="api-revoke-btn text-red-500 dark:text-cyber-error hover:underline font-bold text-[11px] uppercase">
                            Revoke
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("loadApiKeysList error:", e);
        }
    };

    window.handleGenerateApiKey = async function(e) {
        e.preventDefault();
        const camIds = window.getApiSelectedCameras("api");
        const cameraId = camIds.length ? camIds[0] : "";
        const clientName = document.getElementById("api-client-name").value;
        const customCameraName = document.getElementById("api-custom-camera-name").value;
        const allowedDomain = document.getElementById("api-allowed-domain").value;
        const secretPass = document.getElementById("api-secret-pass").value;

        if (!camIds.length || !clientName) {
            window.showToast("Pilih minimal satu kamera dan isi nama klien!", "error");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/admin/api-keys`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    camera_id: parseInt(cameraId, 10),
                    camera_ids: camIds,
                    include_playback: document.getElementById("api-include-playback")?.checked || false,
                    client_name: clientName,
                    custom_camera_name: customCameraName || null,
                    allowed_domain: allowedDomain || null,
                    secret_pass: secretPass || null
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Gagal membuat kunci API");
            }

            document.getElementById("api-client-name").value = "";
            document.getElementById("api-custom-camera-name").value = "";
            document.getElementById("api-allowed-domain").value = "";
            document.getElementById("api-secret-pass").value = "";
            window._apiCamOrder["api"] = [];
            window.renderApiCameraList("api", []);
            const genSearch = document.getElementById("api-cam-search");
            if (genSearch) { genSearch.value = ""; window.filterApiCameraList("api"); }

            window.showToast("✅ Kunci API berhasil digenerate!", "success");
            window.closeApiKeyGenerateModal();
            await window.loadApiKeysList();

        } catch (err) {
            window.showToast(err.message, "error");
        }
    };

    window.handleRevokeApiKey = async function(keyId) {
        try {
            const res = await fetch(`${API_URL}/admin/api-keys/${keyId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${userToken}` }
            });

            if (!res.ok) throw new Error("Gagal menghapus kunci API");

            window.showToast("🗑 Kunci API berhasil dicabut.", "success");
            await window.loadApiKeysList();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    };

    window.copyToClipboard = function(text, btnId) {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
                btn.classList.remove("text-slate-500", "dark:text-cyber-dim", "hover:text-sky-500");
                btn.classList.add("text-emerald-500", "border-emerald-500/30");
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.classList.remove("text-emerald-500", "border-emerald-500/30");
                    btn.classList.add("text-slate-500", "dark:text-cyber-dim", "hover:text-sky-500");
                }, 2000);
            }
        }).catch(() => {
            alert("Gagal menyalin. Silakan salin secara manual.");
        });
    };

    // Menerima id kunci; data diambil dari adminApiKeys supaya
    // semua kamera + status playback ikut, bukan cuma 1 kamera.
    window.openApiSetupModal = function(keyId) {
        const modal = document.getElementById("api-setup-modal");
        if (!modal) return;

        const key = adminApiKeys.find(k => String(k.id) === String(keyId));
        if (!key) {
            window.showToast("Data kunci API tidak ditemukan", "error");
            return;
        }

        const camIds = (key.camera_ids && key.camera_ids.length) ? key.camera_ids : [key.camera_id];
        const camNames = (key.camera_names && key.camera_names.length) ? key.camera_names : [key.camera_name];
        const hasPassword = key.secret_pass && String(key.secret_pass).trim() !== "";

        window._apiSetupCtx = {
            keyValue: key.key_value,
            pass: hasPassword ? key.secret_pass : "",
            camIds: camIds,
            camNames: camNames,
            includePlayback: !!key.include_playback,
            aktif: 0,
            mode: "stream"
        };

        document.getElementById("api-setup-client-title").textContent =
            `Integrasi Klien: ${key.client_name} - ${camIds.length} kamera`;

        // ---- ringkasan ----
        document.getElementById("api-setup-stat-cam").textContent = camIds.length;
        const elPb = document.getElementById("api-setup-stat-playback");
        elPb.textContent = key.include_playback ? "AKTIF" : "MATI";
        elPb.className = "text-sm font-bold mt-0.5 " + (key.include_playback
            ? "text-violet-600 dark:text-violet-400"
            : "text-slate-400 dark:text-cyber-dim");
        const elDom = document.getElementById("api-setup-stat-domain");
        elDom.textContent = key.allowed_domain && key.allowed_domain.trim() !== "" ? key.allowed_domain : "Semua";
        elDom.title = elDom.textContent;
        document.getElementById("api-setup-stat-pass").textContent = hasPassword ? "Ada" : "Tidak";

        // ---- tab kamera ----
        const picker = document.getElementById("api-setup-camera-picker");
        const tabs = document.getElementById("api-setup-camera-tabs");
        if (camIds.length > 1) {
            tabs.innerHTML = camIds.map((cid, i) => {
                const nama = String(camNames[i] || `Kamera ${cid}`)
                    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `<button type="button" data-idx="${i}" onclick="window.setApiSetupCamera(${i})"
                    class="api-setup-tab px-2.5 py-1.5 rounded-md text-[10px] font-mono border transition-colors">
                    <span class="opacity-60">${i + 1}.</span> ${nama}${i === 0 ? ' <span class="opacity-60">(utama)</span>' : ''}</button>`;
            }).join("");
            picker.classList.remove("hidden");
        } else {
            picker.classList.add("hidden");
        }

        // ---- catatan keamanan ----
        const noticeEl = document.getElementById("api-setup-security-notice");
        const noticeTextEl = document.getElementById("api-setup-security-text");
        let securityTexts = [];
        if (key.allowed_domain && key.allowed_domain.trim() !== "") {
            securityTexts.push(`Dibatasi hanya untuk domain <u>${key.allowed_domain}</u> (Whitelisted)`);
        } else {
            securityTexts.push("Terbuka untuk semua domain (Public)");
        }
        if (hasPassword) securityTexts.push(`Dilindungi password: <code>${key.secret_pass}</code>`);
        if (key.include_playback) securityTexts.push("Klien dapat mengakses rekaman kamera di atas");
        noticeTextEl.innerHTML = securityTexts.join(" &middot; ");
        noticeEl.classList.remove("hidden");

        window.setApiSetupCamera(0);
        modal.classList.remove("hidden");
    };

    // Mode aktif: "stream" (live) atau "playback" (rekaman).
    window.setApiSetupMode = function(mode) {
        const ctx = window._apiSetupCtx;
        if (!ctx) return;
        if (mode === "playback" && !ctx.includePlayback) return;   // kunci tak berizin
        ctx.mode = mode;
        window.renderApiSetup();
    };

    window.setApiSetupCamera = function(idx) {
        const ctx = window._apiSetupCtx;
        if (!ctx) return;
        ctx.aktif = idx;
        window.renderApiSetup();
    };

    // Bangun ulang seluruh isi modal mengikuti mode + kamera terpilih.
    window.renderApiSetup = function() {
        const ctx = window._apiSetupCtx;
        if (!ctx) return;

        const idx = ctx.aktif || 0;
        const playback = ctx.mode === "playback";
        const origin = window.location.origin;
        const q = `key=${encodeURIComponent(ctx.keyValue)}` + (ctx.pass ? `&pass=${encodeURIComponent(ctx.pass)}` : "");
        // Nomor urut, bukan id: camera=1 kamera pertama, camera=2 kedua, dst.
        const camQ = `&camera=${idx + 1}`;

        const halaman = playback
            ? `${origin}/frontend/playback.php?${q}${camQ}`
            : `${origin}/frontend/embed.php?${q}${camQ}`;
        const restUrl = playback
            ? `${origin}/api/external/playback?${q}${camQ}`
            : `${origin}/api/external/stream?${q}${camQ}`;
        const tinggi = playback ? "480" : "360";

        const set = (id, nilai) => {
            const el = document.getElementById(id);
            if (el) el.value = nilai;
        };
        const teks = (id, nilai) => {
            const el = document.getElementById(id);
            if (el) el.textContent = nilai;
        };

        // ---- Metode 1: iframe ----
        set("api-setup-iframe-code",
            `<iframe src="${halaman}" width="640" height="${tinggi}" frameborder="0" allowfullscreen></iframe>`);
        teks("api-setup-m1-title", playback
            ? "Metode 1: Pemutar Rekaman Embed (Iframe HTML)"
            : "Metode 1: Pemutar Embed (Iframe HTML)");
        teks("api-setup-m1-desc", playback
            ? "Sematkan pemutar rekaman lengkap dengan pemilih tanggal dan timeline ke halaman web Anda."
            : "Gunakan kode HTML berikut untuk menyematkan pemutar video langsung di halaman web Anda.");

        // ---- Metode 2: REST ----
        set("api-setup-api-url", playback
            ? `# Daftar tanggal yang ada rekamannya\n${restUrl}\n\n# Segmen + timeline pada satu tanggal\n${restUrl}&date=YYYY-MM-DD`
            : restUrl);
        teks("api-setup-m2-title", "Metode 2: REST API Endpoint (JSON)");
        teks("api-setup-m2-desc", playback
            ? "Ambil data rekaman sebagai JSON untuk membuat pemutar sendiri. Tanpa parameter date menghasilkan daftar tanggal; dengan date menghasilkan segmen, rentang timeline, dan daftar kamera."
            : "Gunakan HTTP GET request untuk mengambil detail stream format JSON (termasuk WebRTC / WHEP URL untuk player kustom).");

        // ---- Metode 3: link langsung ----
        set("api-setup-direct-url", halaman);
        teks("api-setup-m3-title", "Metode 3: URL Pemutar Langsung");
        teks("api-setup-m3-desc", playback
            ? "Link direct untuk membuka halaman pemutar rekaman mandiri."
            : "Link direct untuk membuka halaman pemutar mandiri.");

        // ---- tombol mode ----
        const dasar = "api-setup-mode px-3 py-2.5 rounded-lg text-[10px] font-mono border transition-colors min-h-[44px] ";
        const aktifStream = "bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-cyber-primary font-bold";
        const aktifPlay = "bg-violet-500/10 border-violet-500/40 text-violet-600 dark:text-violet-400 font-bold";
        const diam = "bg-transparent border-slate-200 dark:border-cyber-outline text-slate-500 dark:text-cyber-dim hover:border-sky-400";
        const mati = "bg-transparent border-slate-200/60 dark:border-cyber-outline/40 text-slate-300 dark:text-cyber-dim/40 cursor-not-allowed";

        const bStream = document.getElementById("api-setup-mode-stream");
        const bPlay = document.getElementById("api-setup-mode-playback");
        if (bStream) bStream.className = dasar + (playback ? diam : aktifStream);
        if (bPlay) {
            bPlay.className = dasar + (!ctx.includePlayback ? mati : (playback ? aktifPlay : diam));
            bPlay.disabled = !ctx.includePlayback;
            bPlay.title = ctx.includePlayback ? "" : "Kunci ini tidak diizinkan mengakses rekaman";
        }

        const catatan = document.getElementById("api-setup-mode-note");
        if (catatan) {
            if (!ctx.includePlayback) {
                catatan.textContent = "Kunci ini hanya untuk stream langsung. Aktifkan playback lewat Edit bila perlu akses rekaman.";
                catatan.classList.remove("hidden");
            } else if (playback) {
                catatan.textContent = "Rekaman tersimpan terbatas sesuai kebijakan retensi.";
                catatan.classList.remove("hidden");
            } else {
                catatan.classList.add("hidden");
            }
        }

        // ---- sorot tab kamera ----
        document.querySelectorAll(".api-setup-tab").forEach(btn => {
            const on = String(btn.dataset.idx) === String(idx);
            btn.className = "api-setup-tab px-2.5 py-1.5 rounded-md text-[10px] font-mono border transition-colors " + (on
                ? (playback ? aktifPlay : aktifStream)
                : diam);
        });
    };

    window.closeApiSetupModal = function() {
        const modal = document.getElementById("api-setup-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.copySetupCode = function(textareaId, btnId) {
        const el = document.getElementById(textareaId);
        if (!el) return;
        
        navigator.clipboard.writeText(el.value).then(() => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const originalText = btn.textContent;
                btn.textContent = "Tersalin!";
                btn.classList.remove("text-sky-500");
                btn.classList.add("text-emerald-500", "font-bold");
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove("text-emerald-500", "font-bold");
                    btn.classList.add("text-sky-500");
                }, 2000);
            }
        }).catch(() => {
            alert("Gagal menyalin.");
        });
    };

    window.openApiKeyEditModal = function(keyId) {
        const modal = document.getElementById("api-key-edit-modal");
        if (!modal) return;
        
        const keyRecord = adminApiKeys.find(k => k.id == keyId);
        if (!keyRecord) {
            window.showToast("Data kunci API tidak ditemukan", "error");
            return;
        }
        
        document.getElementById("edit-api-key-id").value = keyId;
        const terpilih = (keyRecord.camera_ids && keyRecord.camera_ids.length)
            ? keyRecord.camera_ids
            : [keyRecord.camera_id];
        window._apiCamOrder["edit-api"] = terpilih.slice();
        window.renderApiCameraList("edit-api", terpilih);
        const editToggle = document.getElementById("edit-api-include-playback");
        if (editToggle) {
            editToggle.checked = !!keyRecord.include_playback;
            window.updateApiCamCount("edit-api");
        }
        document.getElementById("edit-api-client-name").value = keyRecord.client_name;
        document.getElementById("edit-api-custom-camera-name").value = keyRecord.custom_camera_name || "";
        document.getElementById("edit-api-allowed-domain").value = keyRecord.allowed_domain || "";
        document.getElementById("edit-api-secret-pass").value = keyRecord.secret_pass || "";
        
        modal.classList.remove("hidden");
    };

    window.closeApiKeyEditModal = function() {
        const modal = document.getElementById("api-key-edit-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.handleUpdateApiKey = async function(e) {
        e.preventDefault();
        const keyId = document.getElementById("edit-api-key-id").value;
        const camIdsEdit = window.getApiSelectedCameras("edit-api");
        const cameraId = camIdsEdit.length ? camIdsEdit[0] : "";
        const clientName = document.getElementById("edit-api-client-name").value;
        const customCameraName = document.getElementById("edit-api-custom-camera-name").value;
        const allowedDomain = document.getElementById("edit-api-allowed-domain").value;
        const secretPass = document.getElementById("edit-api-secret-pass").value;

        if (!keyId || !camIdsEdit.length || !clientName) {
            window.showToast("Pilih minimal satu kamera dan isi nama klien!", "error");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/admin/api-keys/${keyId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    camera_id: parseInt(cameraId, 10),
                    camera_ids: camIdsEdit,
                    include_playback: document.getElementById("edit-api-include-playback")?.checked || false,
                    client_name: clientName,
                    custom_camera_name: customCameraName || null,
                    allowed_domain: allowedDomain || null,
                    secret_pass: secretPass || null
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Gagal memperbarui kunci API");
            }

            window.showToast("✅ Kunci API berhasil diperbarui!", "success");
            window.closeApiKeyEditModal();
            await window.loadApiKeysList();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    };

    window.openApiKeyGenerateModal = function() {
        const modal = document.getElementById("api-key-generate-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.closeApiKeyGenerateModal = function() {
        const modal = document.getElementById("api-key-generate-modal");
        if (modal) modal.classList.add("hidden");
    };

    // ============================================================
    // API ACCESS LOG HANDLERS
    // ============================================================



    function _relativeTime(isoStr) {
        if (!isoStr) return '—';
        const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (isNaN(diff)) return isoStr;
        if (diff < 60)   return `${diff}d lalu`;
        if (diff < 3600) return `${Math.floor(diff/60)}m lalu`;
        if (diff < 86400)return `${Math.floor(diff/3600)}j lalu`;
        return `${Math.floor(diff/86400)}hr lalu`;
    }

    function _extractDomain(referer) {
        if (!referer) return '—';
        try {
            if (referer.startsWith('http')) {
                const u = new URL(referer);
                return u.hostname;
            }
        } catch(e) {}
        return referer.split('/')[0] || referer.substring(0, 40);
    }

    function _renderApiLogRow(log) {
        const isHit    = log.status === 'hit';
        const statusBadge = isHit
            ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40">✓ HIT</span>`
            : `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-800/40">✕ DENIED</span>`;

        const cameraText = log.camera_name
            ? `<span class="text-[9px] text-slate-400 dark:text-cyber-dim/80">${log.camera_name}</span>`
            : `<span class="text-[9px] text-slate-300 dark:text-cyber-dim/40">—</span>`;

        const domain   = _extractDomain(log.referer);
        const domainEl = domain !== '—'
            ? `<span class="text-sky-600 dark:text-cyber-primary">${domain}</span>`
            : `<span class="text-slate-300 dark:text-cyber-dim/40">—</span>`;

        return `<tr class="border-b border-slate-100 dark:border-cyber-outline/20 hover:bg-slate-50 dark:hover:bg-cyber-bg/20 transition-colors duration-100">
            <td class="py-3 px-4 text-[10px] text-slate-500 dark:text-cyber-dim whitespace-nowrap" title="${log.accessed_at}">${_relativeTime(log.accessed_at)}</td>
            <td class="py-3 px-4">
                <div class="font-bold text-[11px] text-slate-800 dark:text-white">${log.client_name || '—'}</div>
                ${cameraText}
            </td>
            <td class="py-3 px-4 font-mono text-[10px] text-slate-600 dark:text-cyber-text">${log.ip_address || '—'}</td>
            <td class="py-3 px-4 font-mono text-[10px]">${domainEl}</td>
            <td class="py-3 px-4 text-center">${statusBadge}</td>
            <td class="py-3 px-4 text-[10px] text-slate-500 dark:text-cyber-dim">${log.deny_reason || ''}</td>
        </tr>`;
    }

    window.loadApiAccessLogs = async function(append = false) {
        const tbody = document.getElementById('api-log-table-body');
        if (!tbody) return;

        if (!append) {
            _apiLogOffset = 0;
            tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                <div class="flex items-center justify-center space-x-2">
                    <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    <span>Memuat log akses...</span>
                </div>
            </td></tr>`;
        }

        // Load summary stats
        try {
            const sRes = await fetch(`${API_URL}/admin/api-access-logs/summary`, {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            if (sRes.ok) {
                const s = await sRes.json();
                const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
                el('log-stat-total',  s.total);
                el('log-stat-hits',   s.hits);
                el('log-stat-denied', s.denied);
                el('log-stat-ips',    s.unique_ips);
            }
        } catch(e) { /* silent */ }

        const keyId   = document.getElementById('api-log-filter-key')?.value || '';
        const status  = document.getElementById('api-log-filter-status')?.value || '';

        let url = `${API_URL}/admin/api-access-logs?limit=${_API_LOG_LIMIT}&offset=${_apiLogOffset}`;
        if (keyId)  url += `&key_id=${keyId}`;
        if (status) url += `&status=${status}`;

        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${userToken}` } });
            if (!res.ok) throw new Error('Gagal memuat log');
            const logs = await res.json();

            const countLabel = document.getElementById('api-log-count-label');
            const loadMore   = document.getElementById('api-log-load-more');

            if (!append) tbody.innerHTML = '';

            if (logs.length === 0 && !append) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                    Belum ada log akses yang tercatat.
                </td></tr>`;
                if (countLabel) countLabel.textContent = '';
                if (loadMore)  loadMore.classList.add('hidden');
                return;
            }

            logs.forEach(log => {
                tbody.insertAdjacentHTML('beforeend', _renderApiLogRow(log));
            });

            _apiLogOffset += logs.length;

            if (countLabel) countLabel.textContent = `Menampilkan ${_apiLogOffset} entri terbaru`;
            if (loadMore) {
                loadMore.classList.toggle('hidden', logs.length < _API_LOG_LIMIT);
            }
        } catch(e) {
            if (!append) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-red-400 font-mono">Gagal memuat log: ${e.message}</td></tr>`;
            }
        }
    };

    window.loadMoreApiAccessLogs = async function() {
        await window.loadApiAccessLogs(true);
    };

    window.clearApiAccessLogs = async function() {
        if (!confirm('Hapus semua log akses API? Tindakan ini tidak dapat dibatalkan.')) return;
        try {
            const res = await fetch(`${API_URL}/admin/api-access-logs`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            if (!res.ok) throw new Error('Gagal menghapus log');
            const data = await res.json();
            window.showToast(`🗑 ${data.detail}`, 'success');
            await window.loadApiAccessLogs();
        } catch(e) {
            window.showToast(e.message, 'error');
        }
    };

    // Populate key filter dropdown from loaded keys list
    window._populateApiLogKeyFilter = function(keys) {
        const sel = document.getElementById('api-log-filter-key');
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">Semua Kunci</option>';
        keys.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = `${k.client_name} — ${k.camera_name}`;
            sel.appendChild(opt);
        });
        sel.value = currentVal;
    };

    // Auto-refresh when API tab is active
    function _startApiLogAutoRefresh() {
        _stopApiLogAutoRefresh();
        _apiLogAutoRefreshTimer = setInterval(() => {
            const apiTab = document.getElementById('admin-subtab-api');
            if (apiTab && !apiTab.classList.contains('hidden')) {
                window.loadApiAccessLogs();
            }
        }, 30000);
    }

    function _stopApiLogAutoRefresh() {
        if (_apiLogAutoRefreshTimer) {
            clearInterval(_apiLogAutoRefreshTimer);
            _apiLogAutoRefreshTimer = null;
        }
    }

    // Patch switchAdminTab to also load logs & start auto-refresh when API tab selected
    const _origSwitchAdminTab = window.switchAdminTab;
    window.switchAdminTab = function(tabName) {
        _origSwitchAdminTab(tabName);
        if (tabName === 'api') {
            window.loadApiAccessLogs();
            _startApiLogAutoRefresh();
        } else {
            _stopApiLogAutoRefresh();
        }
    };



    // Patch loadApiKeysList to also populate key filter
    const _origLoadApiKeysList = window.loadApiKeysList;
    window.loadApiKeysList = async function() {
        await _origLoadApiKeysList();
        // After loading, populate the key filter dropdown
        try {
            const res = await fetch(`${API_URL}/admin/api-keys`, {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            if (res.ok) {
                const keys = await res.json();
                window._populateApiLogKeyFilter(keys);
            }
        } catch(e) { /* silent */ }
    };


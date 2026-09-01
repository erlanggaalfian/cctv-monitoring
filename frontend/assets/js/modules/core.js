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

    const PAGINATION_BTN_ACTIVE = "px-2.5 sm:px-3 py-1.5 bg-sky-500 dark:bg-cyber-primary text-white dark:text-cyber-bg border border-sky-400 dark:border-cyber-primary font-bold rounded-md text-xs transition-all duration-150 shadow-sm shadow-sky-500/20 min-w-[2rem]";
    const PAGINATION_BTN_PAGE = "px-2.5 sm:px-3 py-1.5 bg-slate-50 dark:bg-cyber-bg hover:bg-slate-100 dark:hover:bg-cyber-hover/30 text-slate-600 dark:text-cyber-dim border border-slate-200 dark:border-cyber-outline/60 rounded-md text-xs transition-all duration-150 active:scale-95 min-w-[2rem]";

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

    window.populateApiCameraSelect = async function() {
        try {
            const res = await fetch(`${API_URL}/admin/streams`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!res.ok) throw new Error("Gagal memuat daftar kamera");
            const data = await res.json();
            const selectEl = document.getElementById("api-camera-select");
            const editSelectEl = document.getElementById("edit-api-camera-select");
            const streams = data.items || data;

            if (selectEl) {
                selectEl.innerHTML = '<option value="">-- Pilih Kamera --</option>';
                streams.forEach(cam => {
                    const opt = document.createElement("option");
                    opt.value = cam.id;
                    opt.textContent = cam.name;
                    selectEl.appendChild(opt);
                });
            }

            if (editSelectEl) {
                editSelectEl.innerHTML = '<option value="">-- Pilih Kamera --</option>';
                streams.forEach(cam => {
                    const opt = document.createElement("option");
                    opt.value = cam.id;
                    opt.textContent = cam.name;
                    editSelectEl.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("populateApiCameraSelect error:", e);
        }
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

                tr.innerHTML = `
                    <td class="py-4 px-4">
                        <div class="font-bold text-slate-800 dark:text-white text-xs">${key.client_name}</div>
                        <div class="text-[10px] text-slate-400 dark:text-cyber-dim font-mono mt-0.5">
                            ${key.custom_camera_name ? `<span class="text-sky-500 dark:text-cyber-primary font-semibold">[Kustom] ${key.custom_camera_name}</span> <span class="text-slate-400/60 dark:text-cyber-dim/40">(${key.camera_name})</span>` : key.camera_name}
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
                            <button onclick="window.openApiSetupModal('${keyValue}', '${key.client_name.replace(/'/g, "\\'")}', '${key.camera_name.replace(/'/g, "\\'")}', '${(key.allowed_domain || "").replace(/'/g, "\\'")}', '${(key.secret_pass || "").replace(/'/g, "\\'")}')"
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
        const cameraId = document.getElementById("api-camera-select").value;
        const clientName = document.getElementById("api-client-name").value;
        const customCameraName = document.getElementById("api-custom-camera-name").value;
        const allowedDomain = document.getElementById("api-allowed-domain").value;
        const secretPass = document.getElementById("api-secret-pass").value;

        if (!cameraId || !clientName) {
            window.showToast("Kamera dan nama klien wajib diisi!", "error");
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
            document.getElementById("api-camera-select").value = "";

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

    window.openApiSetupModal = function(keyValue, clientName, cameraName, allowedDomain, secretPass) {
        const modal = document.getElementById("api-setup-modal");
        if (!modal) return;

        // Set labels
        document.getElementById("api-setup-client-title").textContent = `Integrasi Klien: ${clientName} (${cameraName})`;

        // Build URLs
        const origin = window.location.origin;
        const hasPassword = secretPass && secretPass.trim() !== "";
        const embedUrl = `${origin}/frontend/embed.php?key=${keyValue}` + (hasPassword ? `&pass=${secretPass}` : '');
        const restApiUrl = `${origin}/api/external/stream?key=${keyValue}` + (hasPassword ? `&pass=${secretPass}` : '');
        const iframeCode = `<iframe src="${embedUrl}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;

        // Set inputs
        document.getElementById("api-setup-iframe-code").value = iframeCode;
        document.getElementById("api-setup-api-url").value = restApiUrl;
        document.getElementById("api-setup-direct-url").value = embedUrl;

        // Show/Hide Security Notice
        const noticeEl = document.getElementById("api-setup-security-notice");
        const noticeTextEl = document.getElementById("api-setup-security-text");
        
        let securityTexts = [];
        if (allowedDomain && allowedDomain.trim() !== "") {
            securityTexts.push(`Dibatasi hanya untuk domain <u>${allowedDomain}</u> (Whitelisted)`);
        } else {
            securityTexts.push("Terbuka untuk semua domain (Public)");
        }

        if (hasPassword) {
            securityTexts.push(`Dilindungi password: <code>${secretPass}</code>`);
        }

        if (securityTexts.length > 0) {
            noticeTextEl.innerHTML = securityTexts.join(" · ");
            noticeEl.classList.remove("hidden");
        } else {
            noticeEl.classList.add("hidden");
        }

        // Show Modal
        modal.classList.remove("hidden");
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
        document.getElementById("edit-api-camera-select").value = keyRecord.camera_id;
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
        const cameraId = document.getElementById("edit-api-camera-select").value;
        const clientName = document.getElementById("edit-api-client-name").value;
        const customCameraName = document.getElementById("edit-api-custom-camera-name").value;
        const allowedDomain = document.getElementById("edit-api-allowed-domain").value;
        const secretPass = document.getElementById("edit-api-secret-pass").value;

        if (!keyId || !cameraId || !clientName) {
            window.showToast("Kamera dan nama klien wajib diisi!", "error");
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


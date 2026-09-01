    // --- Status Auto-Updater for Sidebar & Admin Table ---
    function startStatusAutoUpdater() {
        const pollStatus = async () => {
            if (!userToken) return;
            try {
                let streams = [];
                if ((userRole || "").toLowerCase() === "admin") {
                    const res = await fetch(`${API_URL}/admin/streams`, {
                        headers: { "Authorization": `Bearer ${userToken}` }
                    });
                    if (!res.ok) return;
                    streams = await res.json();
                } else {
                    const res = await fetch(`${API_URL}/streams?limit=1000&no_check=true`, {
                        headers: { "Authorization": `Bearer ${userToken}` }
                    });
                    if (!res.ok) return;
                    const data = await res.json();
                    streams = data.items || [];
                }

                viewerAllStreamsList = streams;
                updateSidebarCountBadge(streams);

                streams.forEach(stream => {
                    // Update Sidebar Stream Trees status
                    const dot = document.getElementById(`sidebar-status-dot-${stream.id}`);
                    const text = document.getElementById(`sidebar-status-text-${stream.id}`);
                    if (dot) {
                        const statusDotColor = stream.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500";
                        dot.className = `sidebar-status-dot w-1.5 h-1.5 rounded-full ${statusDotColor}`;
                    }
                    if (text) {
                        const statusText = stream.status === "online" ? "Live" : "Offline";
                        const statusTextColor = stream.status === "online" ? "text-sky-600 dark:text-cyber-primary" : "text-rose-500 dark:text-cyber-error";
                        text.textContent = statusText;
                        text.className = `sidebar-status-text text-[9px] ${statusTextColor} uppercase font-mono`;
                    }

                    // Update Admin Table status badge if exists
                    const adminStatus = document.getElementById(`admin-stream-status-${stream.id}`);
                    if (adminStatus) {
                        const isOnline = stream.status === "online";
                        adminStatus.textContent = isOnline ? "CONNECTED" : "DISCONNECTED";
                        adminStatus.className = `inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${isOnline ? 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-cyber-primary border border-sky-200/50 dark:border-cyber-primary/20' : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-cyber-error border border-rose-200/50 dark:border-cyber-error/20'}`;
                    }
                });
            } catch (err) {
                console.warn("Status auto-updater failed:", err);
            }
        };

        pollStatus();
        setInterval(pollStatus, 15000);
    }
    window.startStatusAutoUpdater = startStatusAutoUpdater;

    // --- 4. Viewer Panel Operations
    let sidebarLoadPromise = null;
    let streamsLoadGeneration = 0;
    const VIEWER_GRID_CACHE_KEY = "cctv_viewer_grid_cache_v2_" + (username || "default");


    function readViewerGridCache() {
        try {
            const raw = sessionStorage.getItem(VIEWER_GRID_CACHE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!Array.isArray(data?.items) || data.items.length === 0) return null;
            if (data.ts && Date.now() - data.ts > 60 * 60 * 1000) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    function writeViewerGridCache(payload) {
        try {
            sessionStorage.setItem(VIEWER_GRID_CACHE_KEY, JSON.stringify({
                items: payload.items,
                total_pages: payload.total_pages,
                total_items: payload.total_items,
                layout: activeGridLayout,
                page: livePageOffset,
                ts: Date.now()
            }));
        } catch (e) {}
    }

    function hydrateViewerFromSessionCache() {
        const cached = readViewerGridCache();
        if (!cached) {
            streamsData = []; // Reset cache to prevent cross-contamination
            return false;
        }
        streamsData = cached.items;
        viewerTotalPages = cached.total_pages || 1;
        viewerTotalItems = cached.total_items || cached.items.length;
        if (cached.layout) {
            activeGridLayout = cached.layout;
        }
        if (window.innerWidth < 768 && activeGridLayout > 2) {
            activeGridLayout = 2;
        }
        if (typeof cached.page === "number") livePageOffset = cached.page;
        warmPosterMemoryFromLocal(streamsData.map(s => s.id));
        prefetchServerPosters(streamsData.map(s => s.id));
        return true;
    }
    window.hydrateViewerFromSessionCache = hydrateViewerFromSessionCache;


    function getGridStreamIdsFromDom(gridId) {
        const grid = document.getElementById(gridId);
        if (!grid) return [];
        const prefix = gridId === "custom-cctv-grid" ? "custom-cam-tile-" : "cam-tile-";
        return [...grid.querySelectorAll(`[id^="${prefix}"]`)]
            .map(el => parseInt(el.id.slice(prefix.length), 10))
            .filter(id => !Number.isNaN(id));
    }

    function getCustomGridPageItems() {
        const viewMode = localStorage.getItem(getStorageKey("cctv_custom_view_mode")) || "custom";
        let activeStreams = [];
        if (viewMode === "group") {
            const selectedGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";
            activeStreams = streamsData.filter(s => s.group_name === selectedGroup);
        } else {
            customPlaylist.filter(item => item.enabled).forEach(item => {
                const stream = streamsData.find(s => s.id === item.id);
                if (stream) activeStreams.push(stream);
            });
        }
        const pageCapacity = customGridSize * customGridSize;
        const totalPages = Math.ceil(activeStreams.length / pageCapacity) || 1;
        let pageOffset = customPageOffset;
        if (pageOffset >= totalPages) pageOffset = totalPages - 1;
        if (pageOffset < 0) pageOffset = 0;
        const pageStart = pageOffset * pageCapacity;
        return activeStreams.slice(pageStart, pageStart + pageCapacity);
    }


    function customGridMatchesStreams() {
        const pageItems = getCustomGridPageItems();
        if (!pageItems.length) return false;
        const domIds = getGridStreamIdsFromDom("custom-cctv-grid");
        if (domIds.length !== pageItems.length) return false;
        return domIds.every((id, index) => id === pageItems[index].id);
    }
    window.customGridMatchesStreams = customGridMatchesStreams;

    function monitorGridMatchesStreams(items) {
        if (!Array.isArray(items) || items.length === 0) return false;
        const domIds = getGridStreamIdsFromDom("cctv-grid");
        if (domIds.length !== items.length) return false;
        return domIds.every((id, index) => id === items[index].id);
    }
    window.monitorGridMatchesStreams = monitorGridMatchesStreams;

    function showMonitorGridShell() {
        const emptyState = document.getElementById("viewer-empty-state");
        const cctvGrid = document.getElementById("cctv-grid");
        if (emptyState) emptyState.classList.add("hidden");
        if (cctvGrid) cctvGrid.classList.remove("hidden");
    }

    function ensureMonitorGridVisible(items, forceRender = false) {
        if (currentPage !== "monitor" || !items?.length) return;
        showMonitorGridShell();
        const grid = document.getElementById("cctv-grid");
        if (forceRender || !grid?.children.length || !monitorGridMatchesStreams(items)) {
            changeGridLayout(activeGridLayout);
        } else {
            scheduleGridStreamConnect();
        }
    }

    function updateSidebarCountBadge(streams) {
        const countBadge = document.getElementById("sidebar-camera-count");
        if (!countBadge || !Array.isArray(streams)) return;
        const total = streams.length;
        const online = streams.filter(s => s.status === "online").length;
        countBadge.textContent = `${online}/${total}`;
    }

    async function loadSidebarData() {
        if (sidebarLoadPromise) return sidebarLoadPromise;

        sidebarLoadPromise = (async () => {
            const sidebarList = document.getElementById("sidebar-stream-list");
            const countBadge = document.getElementById("sidebar-camera-count");
            if (!sidebarList) return;

            if (countBadge) countBadge.textContent = "...";

            try {
                const res = await fetch(`${API_URL}/streams?limit=1000&no_check=true`, {
                    headers: { "Authorization": `Bearer ${userToken}` }
                });
                if (res.status === 401) { window.handleLogout(); return; }
                if (!res.ok) throw new Error("Gagal mengambil sidebar streams");

                const data = await res.json();
                viewerAllStreamsList = data.items || [];

                sidebarList.innerHTML = "";
                updateSidebarCountBadge(viewerAllStreamsList);

                viewerAllStreamsList.forEach(stream => {
                    const li = document.createElement("li");
                    li.className = "flex items-center justify-between p-2 rounded-sm bg-slate-50 dark:bg-cyber-bg hover:bg-sky-50 dark:hover:bg-cyber-hover/40 cursor-pointer border border-transparent hover:border-sky-300 dark:hover:border-cyber-outline/80 transition-all duration-150";
                    li.onclick = () => window.focusCameraTile(stream.id);

                    const isOnline = stream.status === "online";
                    const dotClass = isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400";
                    const statusText = isOnline ? "Live" : "Offline";
                    const statusClass = isOnline ? "text-sky-600 dark:text-cyber-primary" : "text-slate-400";

                    li.innerHTML = `
                        <div class="flex items-center space-x-2 truncate">
                            <span id="sidebar-status-dot-${stream.id}" class="sidebar-status-dot w-1.5 h-1.5 rounded-full ${dotClass}"></span>
                            <span class="truncate text-slate-700 dark:text-cyber-text">${stream.name}</span>
                        </div>
                        <span id="sidebar-status-text-${stream.id}" class="sidebar-status-text text-[9px] ${statusClass} uppercase font-mono">${statusText}</span>
                    `;
                    sidebarList.appendChild(li);
                });

                const viewerGroupFilter = document.getElementById("viewer-group-filter");
                if (viewerGroupFilter && viewerGroupFilter.children.length <= 1) {
                    const currentVal = viewerGroupFilter.value;
                    const groups = [...new Set(viewerAllStreamsList.map(s => s.group_name).filter(Boolean))].sort();
                    viewerGroupFilter.innerHTML = '<option value="">All Groups</option>';
                    groups.forEach(g => {
                        const opt = document.createElement("option");
                        opt.value = g;
                        opt.textContent = g;
                        if (g === currentVal) opt.selected = true;
                        viewerGroupFilter.appendChild(opt);
                    });
                }
            } catch (err) {
                console.error("Sidebar loading error:", err);
                if (countBadge && viewerAllStreamsList.length === 0) countBadge.textContent = "0/0";
            }
        })();

        try {
            await sidebarLoadPromise;
        } finally {
            sidebarLoadPromise = null;
        }
    }
    window.loadSidebarData = loadSidebarData;

    async function loadStreamsData() {
        if (currentPage !== "monitor") return;

        const loadGen = ++streamsLoadGeneration;

        // Tampilkan grid dari cache segera tanpa rebuild DOM (cegah black screen)
        if (streamsData.length > 0) {
            ensureMonitorGridVisible(streamsData, false);
        }

        try {
            loadSidebarData();

            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 30000);

            const pageNum = livePageOffset + 1;
            const limitNum = activeGridLayout * activeGridLayout;
            const groupVal = document.getElementById("viewer-group-filter")?.value || "";

            const queryParams = new URLSearchParams({
                page: pageNum,
                limit: limitNum,
                no_check: "true"
            });
            if (groupVal) {
                queryParams.append("group", groupVal);
            }

            let response;
            try {
                response = await fetch(`${API_URL}/streams?${queryParams.toString()}`, {
                    headers: { "Authorization": `Bearer ${userToken}` },
                    signal: controller.signal
                });
            } finally {
                clearTimeout(fetchTimeout);
            }

            if (loadGen !== streamsLoadGeneration) return;

            if (response.status === 401) {
                window.handleLogout();
                return;
            }
            if (!response.ok) {
                throw new Error(`Server error: HTTP ${response.status} ${response.statusText}`);
            }

            const pageData = await response.json();
            if (currentPage !== "monitor" || loadGen !== streamsLoadGeneration) return;

            streamsData = pageData.items;
            viewerTotalPages = pageData.total_pages;
            viewerTotalItems = pageData.total_items;

            if (livePageOffset >= viewerTotalPages && viewerTotalPages > 0) {
                livePageOffset = viewerTotalPages - 1;
                loadStreamsData();
                return;
            }

            writeViewerGridCache(pageData);
            prefetchServerPosters(streamsData.map(s => s.id));


            const emptyState = document.getElementById("viewer-empty-state");
            const cctvGrid = document.getElementById("cctv-grid");

            if (streamsData.length === 0) {
                if (emptyState) {
                    const msgEl = emptyState.querySelector("p:last-of-type");
                    if (msgEl) {
                        if ((userRole || "").toLowerCase() === "admin") {
                            msgEl.textContent = "Belum ada kamera yang terdaftar. Tambahkan kamera melalui menu Admin Console.";
                        } else {
                            msgEl.textContent = "Belum ada kamera yang di-assign ke akun Anda. Hubungi administrator untuk mendapatkan akses.";
                        }
                    }
                    emptyState.classList.remove("hidden");
                }
                if (cctvGrid) cctvGrid.classList.add("hidden");
                
                // Hide pagination container when empty
                const paginationContainer = document.getElementById("cctv-pagination");
                if (paginationContainer) {
                    paginationContainer.classList.add("hidden");
                }
            } else {
                if (emptyState) emptyState.classList.add("hidden");
                if (cctvGrid) cctvGrid.classList.remove("hidden");

                streamsData.forEach(stream => {
                    const dot = document.getElementById(`sidebar-status-dot-${stream.id}`);
                    const text = document.getElementById(`sidebar-status-text-${stream.id}`);

                    const statusDotColor = stream.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500";
                    const statusText = stream.status === "online" ? "Live" : "Offline";
                    const statusTextColor = stream.status === "online" ? "text-sky-600 dark:text-cyber-primary" : "text-rose-500 dark:text-cyber-error";

                    if (dot) {
                        dot.className = `sidebar-status-dot w-1.5 h-1.5 rounded-full ${statusDotColor}`;
                    }
                    if (text) {
                        text.textContent = statusText;
                        text.className = `sidebar-status-text text-[9px] ${statusTextColor} uppercase font-mono`;
                    }
                });

                if (viewerAllStreamsList.length > 0) {
                    updateSidebarCountBadge(viewerAllStreamsList);
                }

                ensureMonitorGridVisible(streamsData, false);
            }
        } catch (err) {
            if (loadGen !== streamsLoadGeneration) return;
            if (err.name === "AbortError") return;

            if (typeof window.showApiErrorBanner === "function") {
                window.showApiErrorBanner(`Gagal memuat data kamera: ${err.message}`);
            }

            // Jika grid cache masih ada, tetap tampilkan — jangan kosongkan layar
            if (streamsData.length > 0 && monitorGridMatchesStreams(streamsData)) {
                ensureMonitorGridVisible(streamsData, false);
                return;
            }

            const emptyState = document.getElementById("viewer-empty-state");
            const cctvGrid = document.getElementById("cctv-grid");
            if (emptyState) {
                const msgEl = emptyState.querySelector("p:last-of-type");
                if (msgEl) msgEl.textContent = `Error: ${err.message}`;
                emptyState.classList.remove("hidden");
            }
            if (cctvGrid) cctvGrid.classList.add("hidden");
            
            // Hide pagination container on error empty state
            const paginationContainer = document.getElementById("cctv-pagination");
            if (paginationContainer) {
                paginationContainer.classList.add("hidden");
            }
        }
    }
    window.loadStreamsData = loadStreamsData;

    window.filterViewerStreams = function() {
        livePageOffset = 0; // Reset pagination offset
        loadStreamsData();
    };

    window.changeGridLayout = function(layout, triggerFetch = false) {
        if (layout !== activeGridLayout || triggerFetch) {
            livePageOffset = 0; // Hanya reset halaman jika layout berubah ukuran atau dipicu user
        }
        activeGridLayout = layout;
        
        [1, 2, 3, 4].forEach(num => {
            const btn = document.getElementById(`grid-btn-${num}`);
            if (btn) {
                if (num === layout) {
                    btn.className = "btn-elegant btn-elegant-primary";
                } else {
                    btn.className = "btn-elegant";
                }
            }
        });

        const gridContainer = document.getElementById("cctv-grid");
        if (gridContainer) {
            if (layout === 1) {
                gridContainer.className = "monitor-camera-grid grid grid-cols-1 gap-4 transition-all duration-300";
            } else if (layout === 2) {
                gridContainer.className = "monitor-camera-grid grid grid-cols-1 sm:grid-cols-2 gap-4 transition-all duration-300";
            } else if (layout === 3) {
                gridContainer.className = "monitor-camera-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-300";
            } else if (layout === 4) {
                gridContainer.className = "monitor-camera-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 transition-all duration-300";
            }
        }

        if (triggerFetch) {
            loadStreamsData();
        } else {
            renderVideoGrid();
        }
    };

    window.focusCameraTile = function(streamId) {
        const element = document.getElementById(`cam-tile-${streamId}`) || document.getElementById(`custom-cam-tile-${streamId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('video-card-selected');
            setTimeout(() => {
                element.classList.remove('video-card-selected');
            }, 2000);
        }
    };

    window.toggleStreamSimulation = function() {
        simulationActive = !simulationActive;
        const simBtn = document.getElementById("simulate-btn");
        if (simBtn) {
            if (simulationActive) {
                simBtn.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Simulate CCTV Noise</span>`;
            } else {
                simBtn.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span class="text-slate-500">Render Real Iframes</span>`;
            }
        }
        renderVideoGrid();
    };

    window.forceLoadStream = async function(streamId) {
        const idInt = parseInt(streamId, 10);
        const stream = streamsData.find(s => s.id === idInt);
        
        // Visual feedback on both Live and Custom tiles
        const tileIds = [`cam-tile-${idInt}`, `custom-cam-tile-${idInt}`];
        const posterUrl = getPosterUrl(idInt);
        tileIds.forEach(tileId => {
            const el = document.getElementById(tileId);
            if (el) {
                if (posterUrl) {
                    el.style.backgroundImage = `url(${posterUrl})`;
                    el.style.backgroundSize = "cover";
                    el.style.backgroundPosition = "center";
                }
                el.innerHTML = `
                    <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] font-mono text-center px-4 border border-sky-500/20 rounded-md">
                        <div class="p-3 bg-sky-500/10 rounded-full border border-sky-500/20 mb-3 animate-spin">
                            <svg class="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4"></path>
                            </svg>
                        </div>
                        <span class="text-xs font-bold text-sky-400 uppercase tracking-widest animate-pulse">Menghubungkan Paksa...</span>
                        <span class="text-[9px] text-slate-300 mt-1 bg-slate-950/80 px-2 py-0.5 rounded font-bold font-mono">Mengatur ulang konfigurasi MediaMTX</span>
                    </div>
                `;
            }
        });

        try {
            const response = await fetch(`${API_URL}/streams/${idInt}/reconnect`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${userToken}`
                }
            });

            if (!response.ok) throw new Error("Gagal menghubungi server untuk reconnect");
            const data = await response.json();
            
            if (stream) {
                stream.status = data.connection_status;
            }
            
            if (data.connection_status === "online") {
                showApiSuccessBanner("Kamera berhasil terhubung kembali!");
            } else {
                showApiErrorBanner("Kamera offline. Cek sambungan fisik IP Cam Anda.");
            }
        } catch (err) {
            console.error("Force reconnect failed:", err);
            showApiErrorBanner(`Gagal menghubungkan paksa: ${err.message}`);
        } finally {
            if (document.getElementById("cctv-grid")) {
                renderVideoGrid();
            }
            if (document.getElementById("custom-cctv-grid")) {
                if (typeof window.renderCustomVideoGrid === "function") window.renderCustomVideoGrid();
            }
        }
    };

    function captureVideoFrame(streamId, videoElement) {
        if (!videoElement || videoElement.videoWidth === 0) return;
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        try {
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            localStorage.setItem(`cctv_poster_${streamId}`, dataUrl);
            rememberPosterUrl(streamId, dataUrl);
        } catch (e) {
            console.warn("Failed to capture frame:", e);
        }
    }

    const posterRetryTimers = {};
    const posterMemoryCache = {};
    window.posterMemoryCache = posterMemoryCache;
    let posterPrefetchQueue = [];
    let posterPrefetchActive = 0;
    const POSTER_PREFETCH_MAX = 6;

    function primeTilePosterBackground(card, streamId) {
        if (!card) return;
        applyPosterBackground(card, getPrimaryServerPosterUrl(streamId));
    }
    window.primeTilePosterBackground = primeTilePosterBackground;

    function rememberPosterUrl(streamId, url) {
        if (!streamId || !url) return;
        posterMemoryCache[streamId] = url;
    }
    window.rememberPosterUrl = rememberPosterUrl;

    function getLocalPosterUrl(streamId) {
        return localStorage.getItem(`cctv_poster_${streamId}`);
    }

    function getInstantPosterUrl(streamId) {
        if (posterMemoryCache[streamId]) return posterMemoryCache[streamId];
        return getLocalPosterUrl(streamId);
    }
    window.getInstantPosterUrl = getInstantPosterUrl;

    function warmPosterMemoryFromLocal(streamIds) {
        if (!Array.isArray(streamIds)) return;
        streamIds.forEach(streamId => {
            const local = getLocalPosterUrl(streamId);
            if (local) rememberPosterUrl(streamId, local);
        });
    }
    window.warmPosterMemoryFromLocal = warmPosterMemoryFromLocal;

    function snapshotActiveGridPostersToCache() {
        ["cctv-grid", "custom-cctv-grid"].forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (!grid) return;

            queryGridTiles(grid).forEach(tile => {
                const streamId = parseStreamIdFromTileId(tile.id);
                if (Number.isNaN(streamId)) return;

                const video = tile.querySelector("video");
                if (video && video.videoWidth > 0) {
                    captureVideoFrame(streamId, video);
                    const local = getLocalPosterUrl(streamId);
                    if (local) rememberPosterUrl(streamId, local);
                }

                const posterImg = tile.querySelector('[id^="poster-for-"]');
                if (posterImg?.src) rememberPosterUrl(streamId, posterImg.src);

                const bgMatch = tile.style.backgroundImage.match(/url\(["']?([^"')]+)/);
                if (bgMatch?.[1]) rememberPosterUrl(streamId, bgMatch[1]);
            });
        });

        if (Array.isArray(streamsData)) {
            warmPosterMemoryFromLocal(streamsData.map(s => s.id));
        }
    }
    window.snapshotActiveGridPostersToCache = snapshotActiveGridPostersToCache;

    function bumpPosterCacheBust() {
        window._posterCacheBust = Date.now();
    }
    window.bumpPosterCacheBust = bumpPosterCacheBust;

    function getServerPosterUrl(streamId, fresh = false) {
        if (!fresh && posterMemoryCache[`server_${streamId}`]) {
            return posterMemoryCache[`server_${streamId}`];
        }
        return getApiPosterUrl(streamId, fresh);
    }

    function getPosterCandidates(streamId) {
        const candidates = [];
        const add = (url) => {
            if (url && !candidates.includes(url)) candidates.push(url);
        };
        add(posterMemoryCache[`server_${streamId}`]);
        add(getApiPosterUrl(streamId));
        add(getStaticPosterUrl(streamId));
        const instant = getInstantPosterUrl(streamId);
        if (instant) add(instant);
        return candidates;
    }
    window.getPosterCandidates = getPosterCandidates;

    function getPosterUrl(streamId) {
        return getPrimaryServerPosterUrl(streamId);
    }

    function applyPosterBackground(card, url) {
        if (!card || !url) return;
        card.style.backgroundImage = `url("${url}")`;
        card.style.backgroundSize = "cover";
        card.style.backgroundPosition = "center";
    }
    window.applyPosterBackground = applyPosterBackground;

    function applyPosterToCard(card, streamId) {
        applyPosterBackground(card, getPosterUrl(streamId));
    }

    function updateTilePosterImage(streamId, url) {
        if (!url) return;
        ["cctv-grid", "custom-cctv-grid"].forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (!grid) return;
            const prefix = gridId === "custom-cctv-grid" ? "custom-cam-tile-" : "cam-tile-";
            const tile = grid.querySelector(`#${prefix}${streamId}`);
            if (!tile) return;
            applyPosterBackground(tile, url);
            const posterImg = tile.querySelector('[id^="poster-for-"]');
            if (posterImg?.tagName === "IMG") {
                posterImg.style.display = "";
                posterImg.classList.remove("opacity-0");
                if (posterImg.src !== url) posterImg.src = url;
            }
        });
    }

    function drainPosterPrefetchQueue() {
        while (posterPrefetchActive < POSTER_PREFETCH_MAX && posterPrefetchQueue.length > 0) {
            const job = posterPrefetchQueue.shift();
            posterPrefetchActive++;
            loadServerPosterIntoTile(job.streamId, job.attempt, () => {
                posterPrefetchActive--;
                drainPosterPrefetchQueue();
            });
        }
    }

    function queueServerPosterLoad(streamId, attempt = 0) {
        if (getInstantPosterUrl(streamId)) return;
        const alreadyQueued = posterPrefetchQueue.some(j => j.streamId === streamId);
        if (alreadyQueued) return;
        posterPrefetchQueue.push({ streamId, attempt });
        drainPosterPrefetchQueue();
    }

    function loadServerPosterIntoTile(streamId, attempt = 0, onDone = null) {
        const urls = getServerPosterUrls(streamId, attempt > 0);
        const url = urls[Math.min(attempt, urls.length - 1)] || urls[0];
        const img = new Image();
        img.decoding = "async";

        img.onload = () => {
            rememberPosterUrl(streamId, url);
            posterMemoryCache[`server_${streamId}`] = url;
            updateTilePosterImage(streamId, url);
            if (posterRetryTimers[streamId]) {
                clearTimeout(posterRetryTimers[streamId]);
                delete posterRetryTimers[streamId];
            }
            if (onDone) onDone();
        };

        img.onerror = () => {
            if (onDone) onDone();
            if (attempt >= 4) return;
            if (posterRetryTimers[streamId]) clearTimeout(posterRetryTimers[streamId]);
            posterRetryTimers[streamId] = setTimeout(() => {
                queueServerPosterLoad(streamId, attempt + 1);
            }, 2000 + attempt * 1500);
        };

        img.src = url;
    }

    function prefetchServerPosters(streamIds) {
        if (!Array.isArray(streamIds)) return;
        warmPosterMemoryFromLocal(streamIds);
        streamIds.forEach(streamId => queueServerPosterLoad(streamId));
    }
    window.prefetchServerPosters = prefetchServerPosters;

    function buildPosterImgMarkup(streamId, imgId = null) {
        const candidates = getPosterCandidates(streamId);
        const id = imgId || `poster-for-video-feed-${streamId}`;
        const instant = getInstantPosterUrl(streamId);
        const skeleton = `<div class="absolute inset-0 w-full h-full cam-poster-skeleton z-[4]"></div>`;
        if (candidates.length === 0) {
            return skeleton;
        }
        const fallbacks = candidates.slice(1);
        const fallbackAttr = fallbacks.length
            ? ` data-fallbacks='${JSON.stringify(fallbacks).replace(/'/g, "&#39;")}'`
            : "";
        const syncDecode = instant ? "sync" : "async";
        // Use object-contain for popup poster (id contains 'popup'), object-cover for grid tiles
        const objFit = (id && id.includes("popup")) ? "object-contain" : "object-cover";
        return `${skeleton}<img id="${id}" src="${candidates[0]}"${fallbackAttr} loading="eager" decoding="${syncDecode}" class="absolute inset-0 w-full h-full ${objFit} z-[5] opacity-100 transition-opacity duration-200" onload="this.classList.add('opacity-100')" onerror="window.handlePosterError(this)" />`;
    }

    function buildStreamErrorOverlayMarkup(streamId, visible = false) {
        const hiddenClass = visible ? "" : "hidden";
        return `
            <div id="stream-error-${streamId}" class="cam-stream-error-overlay absolute inset-0 z-20 flex flex-col items-center justify-center font-mono text-center px-4 pointer-events-auto ${hiddenClass}">
                <div class="p-3 bg-red-500/10 rounded-full border border-red-500/20 mb-3 animate-pulse">
                    <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                </div>
                <span class="text-xs font-bold text-red-500 uppercase tracking-widest bg-slate-950/75 px-2 py-1 rounded">Gagal Konek ke RTSP</span>
                <span class="stream-error-detail text-[9px] text-slate-200 mt-1 bg-slate-950/75 px-2 py-0.5 rounded font-bold font-mono">RTSP / WebRTC gagal</span>
                <button onclick="window.forceLoadStream(${streamId})" class="mt-3 px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-[10px] uppercase font-bold transition-all duration-150 active:scale-95">Coba Hubungkan Paksa</button>
            </div>
        `;
    }

    function showStreamErrorOverlay(tile, streamId, detailText = "RTSP / WebRTC gagal") {
        if (!tile) return;
        restoreTilePosterState(tile, streamId);
        let overlay = tile.querySelector(`#stream-error-${streamId}`);
        if (!overlay) {
            const mediaWrap = tile.querySelector(".cam-tile-media") || tile.querySelector(".absolute.inset-0") || tile;
            const wrap = document.createElement("div");
            wrap.innerHTML = buildStreamErrorOverlayMarkup(streamId, true);
            overlay = wrap.firstElementChild;
            if (overlay) mediaWrap.appendChild(overlay);
        }
        if (overlay) {
            overlay.classList.remove("hidden");
            const detail = overlay.querySelector(".stream-error-detail");
            if (detail && detailText) detail.textContent = detailText;
        }
    }

    function hideStreamErrorOverlay(tile, streamId) {
        if (!tile) return;
        const overlay = tile.querySelector(`#stream-error-${streamId}`);
        if (overlay) overlay.classList.add("hidden");
    }
    window.hideStreamErrorOverlay = hideStreamErrorOverlay;

    function buildOnlineTileMediaMarkup(stream, isCustom = false) {
        const videoId = isCustom ? `custom-video-feed-${stream.id}` : `video-feed-${stream.id}`;
        const posterMarkup = isCustom
            ? buildPosterImgMarkup(stream.id, `poster-for-custom-video-feed-${stream.id}`)
            : buildPosterImgMarkup(stream.id);
        return `
            <div class="absolute inset-0 cam-tile-media">
                ${posterMarkup}
                <video id="${videoId}" class="w-full h-full object-cover opacity-0 z-0 transition-opacity duration-200 absolute inset-0 pointer-events-none" autoplay playsinline muted disablePictureInPicture></video>
                ${buildStreamErrorOverlayMarkup(stream.id, false)}
            </div>
        `;
    }
    window.buildOnlineTileMediaMarkup = buildOnlineTileMediaMarkup;

    function buildOfflineTileMediaMarkup(stream, isCustom = false) {
        const posterMarkup = isCustom
            ? buildPosterImgMarkup(stream.id, `poster-for-custom-video-feed-${stream.id}`)
            : buildPosterImgMarkup(stream.id);
        return `
            <div class="absolute inset-0 cam-tile-media">
                ${posterMarkup}
                ${buildStreamErrorOverlayMarkup(stream.id, true)}
            </div>
        `;
    }
    window.buildOfflineTileMediaMarkup = buildOfflineTileMediaMarkup;

    window.handlePosterError = function(img) {
        if (!img) return;
        let fallbacks = [];
        try {
            fallbacks = img.dataset.fallbacks ? JSON.parse(img.dataset.fallbacks) : [];
        } catch (e) {
            fallbacks = [];
        }
        if (fallbacks.length > 0) {
            img.src = fallbacks.shift();
            img.dataset.fallbacks = JSON.stringify(fallbacks);
            const tile = img.closest('[id^="cam-tile-"], [id^="custom-cam-tile-"]');
            if (tile) applyPosterBackground(tile, img.src);
            return;
        }
        img.style.display = "none";
    };

    function schedulePosterCapture(streamId, videoElement) {
        if (!videoElement || videoElement._posterCaptureScheduled) return;
        videoElement._posterCaptureScheduled = true;

        const capture = () => captureVideoFrame(streamId, videoElement);

        setTimeout(capture, 800);
        if (videoElement._posterCaptureInterval) {
            clearInterval(videoElement._posterCaptureInterval);
        }
        videoElement._posterCaptureInterval = setInterval(() => {
            if (videoElement.videoWidth > 0) capture();
        }, 30000);
    }

    function restorePosterForVideo(streamId, videoEl) {
        const tile = videoEl?.closest('[id^="cam-tile-"], [id^="custom-cam-tile-"]') || (typeof window.getGridTileElement === "function" ? window.getGridTileElement(streamId) : null);
        if (tile) {
            if (typeof window.restoreTilePosterState === "function") {
                window.restoreTilePosterState(tile, streamId);
            }
            return;
        }
        const posterUrl = getPosterUrl(streamId);
        const posterContainer = videoEl?.parentElement;
        if (!posterContainer || !posterUrl) return;
        const isCustom = false;
        const posterId = `poster-for-video-feed-${streamId}`;
        const wrapper = document.createElement("div");
        wrapper.innerHTML = buildPosterImgMarkup(streamId, posterId);
        while (wrapper.firstChild) {
            posterContainer.insertBefore(wrapper.firstChild, videoEl);
        }
    }
    window.restorePosterForVideo = restorePosterForVideo;

    // Capture frames before unload to serve as posters on reload
    window.addEventListener("beforeunload", () => {
        if (Array.isArray(streamsData)) {
            streamsData.forEach(stream => {
                const mainVideo = document.getElementById(`video-feed-${stream.id}`);
                if (mainVideo) {
                    captureVideoFrame(stream.id, mainVideo);
                }
            });
        }
    });

    async function startNativeWebRTC(streamId, whepUrlOrCandidates, elementId = null, videoOnly = false) {
        const whepCandidates = Array.isArray(whepUrlOrCandidates)
            ? whepUrlOrCandidates
            : buildWhepCandidates(whepUrlOrCandidates, streamId);
        const targetId = elementId || `video-feed-${streamId}`;
        const videoElement = typeof window.getGridVideoElement === "function" ? window.getGridVideoElement(streamId, elementId) : null;
        if (!videoElement) return;

        if (!elementId) {
            const activeGrid = typeof window.getActiveGridContainer === "function" ? window.getActiveGridContainer() : null;
            if (!activeGrid || !activeGrid.contains(videoElement)) return;
        }

        // Smooth fade-in when the video actually starts playing and has decoded resolution
        const handleVideoPlay = () => {
            if (videoElement.videoWidth > 0) {
                setGridVideoLive(videoElement);
                schedulePosterCapture(streamId, videoElement);

                const tile = videoElement.closest('[id^="cam-tile-"], [id^="custom-cam-tile-"]');
                if (tile) hideStreamErrorOverlay(tile, streamId);
                
                // Fade out and remove loading spinner
                const spinner = document.getElementById(`loading-spinner-${streamId}`);
                if (spinner) {
                    spinner.classList.add("opacity-0");
                    setTimeout(() => {
                        try { spinner.remove(); } catch(e) {}
                    }, 300);
                }
                
                // Sembunyikan poster img (background tile tetap ada)
                const posterImg = videoElement.parentElement?.querySelector('img[id^="poster-for-"]');
                if (posterImg) posterImg.classList.add("opacity-0");
                const skeleton = videoElement.parentElement?.querySelector(".cam-poster-skeleton");
                if (skeleton) skeleton.classList.add("opacity-0");

                // Clean up event listeners once successfully transitioned to live
                videoElement.removeEventListener("playing", handleVideoPlay);
                videoElement.removeEventListener("resize", handleVideoPlay);
            }
        };

        videoElement.addEventListener("playing", handleVideoPlay);
        videoElement.addEventListener("resize", handleVideoPlay);
        if (videoElement.videoWidth > 0) {
            handleVideoPlay();
        }

        let pc = null;
        const pcKey = typeof window.getPeerConnectionKey === "function" ? window.getPeerConnectionKey(streamId, elementId) : null;
        try {
            pc = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" },
                    { urls: "stun:stun2.l.google.com:19302" }
                ]
            });

            window.peerConnections = window.peerConnections || {};
            if (window.peerConnections[pcKey]) {
                window.peerConnections[pcKey].close();
            }
            window.peerConnections[pcKey] = pc;

            pc.ontrack = (event) => {
                if (videoElement.srcObject !== event.streams[0]) {
                    videoElement.srcObject = event.streams[0];
                }
                videoElement.play().catch(() => {});
            };

            pc.addTransceiver("video", { direction: "recvonly" });
            if (!videoOnly) {
                pc.addTransceiver("audio", { direction: "recvonly" });
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            let answerSdp = null;
            let success = false;
            const maxAttempts = 4;
            const retryDelayMs = 400;

            attemptLoop:
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                for (const tryUrl of whepCandidates) {
                    try {
                        const response = await fetch(tryUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/sdp",
                                "Accept": "application/sdp"
                            },
                            body: offer.sdp
                        });

                        if (response.ok) {
                            answerSdp = await response.text();
                            success = true;
                            break attemptLoop;
                        }

                        if (response.status === 404) {
                            console.warn(`[WebRTC] WHEP 404 for stream_${streamId}: ${tryUrl}`);
                            continue;
                        }

                        const fallbackUrl = tryUrl.replace(/\/whep\/?$/, "");
                        if (fallbackUrl !== tryUrl) {
                            const fallbackResponse = await fetch(fallbackUrl, {
                                method: "POST",
                                headers: { "Content-Type": "application/sdp" },
                                body: offer.sdp
                            });
                            if (fallbackResponse.ok) {
                                answerSdp = await fallbackResponse.text();
                                success = true;
                                break attemptLoop;
                            }
                        }
                    } catch (e) {
                        console.warn(`WHEP connection failed for stream_${streamId} (${tryUrl}):`, e);
                    }
                }

                if (attempt < maxAttempts) {
                    console.log(`[WebRTC] Retrying stream_${streamId} in ${retryDelayMs}ms (${attempt + 1}/${maxAttempts})...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                }
            }

            if (!success) {
                throw new Error("WHEP signaling failed after multiple attempts (stream not ready on server yet)");
            }

            if (!document.contains(videoElement)) return;
            if (!elementId) {
                const activeGrid = getActiveGridContainer();
                if (!activeGrid || !activeGrid.contains(videoElement)) return;
            }
            if (!window.peerConnections || window.peerConnections[pcKey] !== pc) return;

            await pc.setRemoteDescription(new RTCSessionDescription({
                type: "answer",
                sdp: answerSdp
            }));

        } catch (err) {
            if (!window.peerConnections || window.peerConnections[pcKey] !== pc) {
                console.log(`[WebRTC] Connection for stream_${streamId} was cancelled or replaced. Ignoring error.`);
                if (!elementId && !hasActiveGridPeerConnection(streamId)) {
                    const tile = getGridTileElement(streamId);
                    if (tile) restoreTilePosterState(tile, streamId);
                }
                return;
            }

            console.error(`WebRTC playback failed for stream_${streamId}:`, err);

            // Auto-trigger "Coba Hubungkan Paksa" silently once if WebRTC connection fails
            window.autoReconnects = window.autoReconnects || {};
            if (!window.autoReconnects[streamId]) {
                window.autoReconnects[streamId] = true;
                console.log(`[WebRTC] Connection failed. Auto-triggering silent force reconnect for stream_${streamId}...`);

                try {
                    const recRes = await fetch(`${API_URL}/streams/${streamId}/reconnect`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${userToken}` }
                    });
                    if (recRes.ok) {
                        const data = await recRes.json();
                        if (data.connection_status === "online") {
                            const stream = streamsData.find(s => s.id === streamId);
                            if (stream) stream.status = "online";
                            const retryUrls = buildWhepCandidates(stream?.webrtc_url || whepCandidates[0], streamId);
                            await startNativeWebRTC(streamId, retryUrls, elementId, videoOnly);
                            return;
                        }
                    }
                } catch (recErr) {
                    console.error("Auto reconnect attempt failed:", recErr);
                }
            }

            if (!elementId) {
                const tile = typeof window.getGridTileElement === "function" ? window.getGridTileElement(streamId) : null;
                showStreamErrorOverlay(tile, streamId, "RTSP / WebRTC gagal");
            } else if (videoElement && document.contains(videoElement)) {
                restorePosterForVideo(streamId, videoElement);
            }
        }
    }
    window.startNativeWebRTC = startNativeWebRTC;

    // Helper: attach single-click (show overlay), dblclick & expand-btn (open popup) to a cam tile card
    function attachCamTileEvents(card, stream) {
        let hideTimer = null;

        function showOverlay() {
            // Hide all other tiles' overlays first
            document.querySelectorAll('[id^="cam-tile-"], [id^="custom-cam-tile-"]').forEach(t => {
                if (t !== card) t.classList.remove("tile-controls-visible");
            });
            card.classList.add("tile-controls-visible");
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => card.classList.remove("tile-controls-visible"), 3000);
        }

        function hideOverlay() {
            clearTimeout(hideTimer);
            card.classList.remove("tile-controls-visible");
        }

        // Double-click always opens popup
        card.ondblclick = (e) => {
            e.stopPropagation();
            window.openCameraPopup(stream);
        };

        // Single click: show overlay (unless clicking the expand button)
        card.addEventListener("click", (e) => {
            if (e.target.closest(".cam-tile-expand-btn")) {
                // Expand button clicked → open popup
                e.stopPropagation();
                window.openCameraPopup(stream);
                return;
            }
            // Toggle: if already visible, hide; else show
            if (card.classList.contains("tile-controls-visible")) {
                hideOverlay();
            } else {
                showOverlay();
            }
        });

        // Touch: single tap shows overlay (not popup), expand btn opens popup
        let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
        card.addEventListener("touchstart", (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });
        card.addEventListener("touchend", (e) => {
            if (e.target.closest(".cam-tile-expand-btn")) return; // handled by click
            const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
            const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
            const elapsed = Date.now() - touchStartTime;
            // Only treat as a tap if short & didn't move (not a scroll)
            if (elapsed < 300 && dx < 10 && dy < 10) {
                e.preventDefault(); // prevent ghost click
                if (card.classList.contains("tile-controls-visible")) {
                    hideOverlay();
                } else {
                    showOverlay();
                }
            }
        });
    }
    window.attachCamTileEvents = attachCamTileEvents;

    // Hide all tile overlays when clicking on empty background
    document.addEventListener("click", (e) => {
        if (!e.target.closest('[id^="cam-tile-"], [id^="custom-cam-tile-"]')) {
            document.querySelectorAll('[id^="cam-tile-"], [id^="custom-cam-tile-"]')
                .forEach(t => t.classList.remove("tile-controls-visible"));
        }
    });

    function buildTileOverlayBottom(streamId) {
        const ad = window.adConfigData;
        if ((userRole || "").toLowerCase() === "guest" && ad && ad.is_active) {
            const bgOpacity = ad.bg_opacity !== undefined ? ad.bg_opacity : 1.0;
            const bgRgba = hexToRgba(ad.bg_color || "#1e293b", bgOpacity);
            const textColor = ad.text_color || "#ffffff";
            const text = (ad.marquee_text || "").trim();
            const itemContent = `${text} &nbsp;&nbsp;|&nbsp;&nbsp; `;
            const trackText = itemContent.repeat(4);
            const fontSize = ad.font_size !== undefined ? Math.min(10, ad.font_size) : 9;
            const speed = ad.scroll_speed !== undefined ? ad.scroll_speed : 5;
            const duration = Math.max(10, (11 - speed) * 18);
            const fontFamily = ad.font_family || "monospace";

            const imgOpacity = ad.image_opacity !== undefined ? ad.image_opacity : 1.0;
            const imgHeight = ad.image_height !== undefined ? ad.image_height : 20;
            const imgHtml = ad.image_url ? `<img src="${ad.image_url}" class="w-auto rounded object-contain shrink-0 mr-2" style="opacity: ${imgOpacity}; height: ${imgHeight}px;">` : "";
            const textOpacity = ad.text_opacity !== undefined ? ad.text_opacity : 1.0;

            const boxWidth = ad.box_width !== undefined ? ad.box_width : 100;
            const textAlign = ad.text_align || "left";
            let positioningStyle = "";
            let justifyStyle = "justify-content: flex-start;";

            if (boxWidth >= 100) {
                positioningStyle = "left: 10px; right: 10px; width: calc(100% - 20px);";
            } else {
                if (textAlign === "left") {
                    positioningStyle = `left: 10px; width: ${boxWidth}%;`;
                } else if (textAlign === "right") {
                    positioningStyle = `right: 10px; width: ${boxWidth}%;`;
                } else { // center
                    positioningStyle = `left: 50%; transform: translateX(-50%); width: ${boxWidth}%;`;
                }
            }

            if (textAlign === "center") {
                justifyStyle = "justify-content: center;";
            } else if (textAlign === "right") {
                justifyStyle = "justify-content: flex-end;";
            }

            return `
                <div class="absolute bottom-2.5 z-10 flex items-center px-2 py-1 rounded-md border border-white/5 opacity-0 group-hover:opacity-100 transition-all duration-300 overflow-hidden" style="background-color: ${bgRgba}; min-height: 24px; ${positioningStyle} ${justifyStyle}">
                    ${imgHtml}
                    <div class="flex-grow overflow-hidden relative flex items-center">
                        <div class="marquee-track flex whitespace-nowrap" style="animation: marquee-scroll ${duration}s linear infinite; font-size: ${fontSize}px; font-family: ${fontFamily}; color: ${textColor}; opacity: ${textOpacity};">
                            <span class="marquee-item">${trackText}</span>
                            <span class="marquee-item">${trackText}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex justify-between items-center bg-[#0b1329]/90 backdrop-blur-md px-3 py-1.5 text-[8px] font-sans text-slate-300 rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg">
                <div class="flex space-x-2 items-center text-slate-400">
                    <span>FPS: <strong id="cam-telemetry-fps-${streamId}" class="text-sky-400 font-mono">30.0</strong></span>
                    <span class="text-white/10">•</span>
                    <span>RES: <strong id="cam-telemetry-res-${streamId}" class="text-sky-400 font-mono">1080p</strong></span>
                    <span class="text-white/10">•</span>
                    <span>CODEC: <strong id="cam-telemetry-codec-${streamId}" class="text-sky-400 font-mono">H264</strong></span>
                </div>
                <button class="cam-tile-expand-btn flex items-center space-x-1 text-sky-400 hover:text-white bg-sky-500/15 hover:bg-sky-500/35 border border-sky-500/35 rounded px-2 py-0.5 transition-all duration-150 active:scale-95 cursor-pointer" title="Buka Kamera">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l-5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>
                    </svg>
                    <span class="font-bold uppercase tracking-wider text-[8px]">Buka</span>
                </button>
            </div>
        `;
    }
    window.buildTileOverlayBottom = buildTileOverlayBottom;

    function renderVideoGrid() {
        if (currentPage !== "monitor") return;

        const gridContainer = document.getElementById("cctv-grid");
        if (!gridContainer) return;
        
        if (typeof window.closeAllGridWebRTCConnections === "function") {
            window.closeAllGridWebRTCConnections();
        }
        
        gridContainer.classList.remove("opacity-25");
        gridContainer.classList.add("opacity-100");

        const pageCapacity = activeGridLayout * activeGridLayout;
        const totalItems = viewerTotalItems;
        const totalPages = viewerTotalPages;
        
        // Boundaries safety check
        if (livePageOffset >= totalPages) {
            livePageOffset = totalPages - 1;
        }
        if (livePageOffset < 0) {
            livePageOffset = 0;
        }

        const pageItems = streamsData; // Data is already sliced by the backend
        warmPosterMemoryFromLocal(pageItems.map(s => s.id));
        prefetchServerPosters(pageItems.map(s => s.id));

        // Update pagination UI
        const paginationContainer = document.getElementById("cctv-pagination");
        const pagesContainer = document.getElementById("pagination-pages-container");
        const pageIndicator = document.getElementById("page-indicator");
        const firstBtn = document.getElementById("first-page-btn");
        const prevBtn = document.getElementById("prev-page-btn");
        const nextBtn = document.getElementById("next-page-btn");
        const lastBtn = document.getElementById("last-page-btn");

        if (paginationContainer) {
            if (totalPages <= 1) {
                paginationContainer.classList.add("hidden");
            } else {
                paginationContainer.classList.remove("hidden");
                if (pageIndicator) {
                    pageIndicator.textContent = `Halaman ${livePageOffset + 1} / ${totalPages} · ${totalItems} kamera`;
                }

                updatePaginationNavButtons(firstBtn, prevBtn, nextBtn, lastBtn, livePageOffset, totalPages);
                renderPaginationPageButtons(pagesContainer, livePageOffset, totalPages, (pageIndex) => {
                    window.jumpToPage(pageIndex);
                });
            }
        }

        const tileFragment = document.createDocumentFragment();
        pageItems.forEach(stream => {
            const card = document.createElement("div");
            card.id = `cam-tile-${stream.id}`;
            const statusCardClass = stream.status === "online" ? "cctv-card-online" : "cctv-card-offline";
            card.className = `relative cam-placeholder-bg overflow-hidden group aspect-video cursor-pointer ${statusCardClass}`;
            attachCamTileEvents(card, stream);
            
            const statusDotColor = stream.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500";
            const statusLabelText = stream.status === "online" ? "RTSP ONLINE" : "RTSP OFFLINE";
            const statusLabelColor = stream.status === "online" ? "text-emerald-400" : "text-rose-500";
            
            const showTopLeft = (userRole || "").toLowerCase() !== "guest";
            const overlayTopLeftHtml = showTopLeft ? `
                <div class="absolute top-2.5 left-2.5 z-10 flex items-center space-x-1.5">
                    <!-- Camera Code Badge -->
                    <span class="bg-[#0f172a]/90 border border-white/10 px-2 py-0.5 rounded text-[8px] font-bold text-slate-100 font-sans tracking-wide">
                        CAM_${String(stream.id).padStart(3, '0')}
                    </span>
                    <!-- Status Pill -->
                    <span class="px-2 py-0.5 rounded text-[8px] font-bold font-sans tracking-wide flex items-center space-x-1.5 ${stream.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                        <span class="w-1 h-1 rounded-full ${stream.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}"></span>
                        <span>${stream.status === 'online' ? 'ONLINE' : 'OFFLINE'}</span>
                    </span>
                    <!-- Camera Name -->
                    <span class="text-white font-sans font-semibold text-[9px] drop-shadow-md truncate max-w-[100px] pl-0.5">
                        ${stream.name.toUpperCase()}
                    </span>
                </div>
            ` : "";

            const overlayTop = `
                ${overlayTopLeftHtml}
                <div class="absolute top-2.5 right-2.5 z-10 flex items-center space-x-1">
                    <span class="px-2 py-0.5 rounded text-[8px] font-bold font-sans tracking-wider flex items-center space-x-1.5 ${stream.status === 'online' ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-slate-800/80 text-slate-400 border border-white/5'}">
                        <span class="w-1 h-1 rounded-full ${stream.status === 'online' ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}"></span>
                        <span>${stream.status === 'online' ? 'REC' : 'LOSS'}</span>
                    </span>
                </div>
            `;

            const overlayBottom = buildTileOverlayBottom(stream.id);

            if (stream.status === "offline") {
                primeTilePosterBackground(card, stream.id);
                card.innerHTML = `
                    ${overlayTop}
                    ${buildOfflineTileMediaMarkup(stream, false)}
                    ${overlayBottom}
                `;
                tileFragment.appendChild(card);
            } else {
                if (simulationActive) {
                    card.innerHTML = `
                        ${overlayTop}
                        <canvas id="canvas-feed-${stream.id}" class="w-full h-full object-cover pointer-events-none"></canvas>
                        <div class="absolute inset-0 bg-emerald-500/5 pointer-events-none mix-blend-overlay"></div>
                        <div class="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,_rgba(0,0,0,0.25)_50%),_linear-gradient(90deg,_rgba(255,0,0,0.06),_rgba(0,255,0,0.02),_rgba(0,0,255,0.06))] bg-[size:100%_4px,_6px_100%] pointer-events-none opacity-40"></div>
                        <div class="absolute w-full h-1.5 bg-sky-500/10 pointer-events-none scanline top-0"></div>
                        ${overlayBottom}
                    `;
                    tileFragment.appendChild(card);
                    startMockVideoFeed(stream.id, stream.name);
                } else {
                    primeTilePosterBackground(card, stream.id);
                    card.innerHTML = `
                        ${overlayTop}
                        ${buildOnlineTileMediaMarkup(stream, false)}
                        ${overlayBottom}
                    `;
                    tileFragment.appendChild(card);
                    // Defer WebRTC connection to IntersectionObserver
                }
            }
        });
        gridContainer.replaceChildren(tileFragment);
        if (typeof window.preloadServerPostersForGrid === "function") {
            window.preloadServerPostersForGrid(gridContainer);
        }
        setupGridIntersectionObserver();
        if (typeof window.scheduleGridStreamConnect === "function") {
            window.scheduleGridStreamConnect();
        }
    }

    function startMockVideoFeed(streamId, name, elementId = null) {
        const targetId = elementId || `canvas-feed-${streamId}`;
        const canvas = document.getElementById(targetId);
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        let animationFrameId;

        canvas.width = 480;
        canvas.height = 270;

        let tick = 0;
        const noiseIntensity = 0.12;

        function draw() {
            const checkCanvas = document.getElementById(targetId);
            if (!simulationActive || !checkCanvas) {
                cancelAnimationFrame(animationFrameId);
                return;
            }

            tick++;

            // Background
            ctx.fillStyle = "#050914";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Technical coordinate lines
            ctx.strokeStyle = "rgba(14, 165, 233, 0.08)";
            ctx.lineWidth = 1;
            for (let x = 40; x < canvas.width; x += 40) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 30; y < canvas.height; y += 30) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }

            // Radar Circle
            ctx.strokeStyle = "rgba(14, 165, 233, 0.15)";
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2, 40, 0, Math.PI * 2);
            ctx.stroke();

            // Corner Brackets
            const len = 15;
            ctx.strokeStyle = "rgba(14, 165, 233, 0.3)";
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(20, 20 + len); ctx.lineTo(20, 20); ctx.lineTo(20 + len, 20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(canvas.width - 20, 20 + len); ctx.lineTo(canvas.width - 20, 20); ctx.lineTo(canvas.width - 20 - len, 20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(20, canvas.height - 20 - len); ctx.lineTo(20, canvas.height - 20); ctx.lineTo(20 + len, canvas.height - 20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(canvas.width - 20, canvas.height - 20 - len); ctx.lineTo(canvas.width - 20, canvas.height - 20); ctx.lineTo(canvas.width - 20 - len, canvas.height - 20); ctx.stroke();

            // Telemetry Font Drawing
            ctx.fillStyle = "rgba(14, 165, 233, 0.8)";
            ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif";
            
            const now = new Date();
            ctx.fillText(now.toISOString().replace("T", " ").substring(0, 19) + " UTC", 25, canvas.height - 25);

            const lat = (3.59 + Math.sin(tick * 0.001) * 0.0001).toFixed(6);
            const lon = (98.67 + Math.cos(tick * 0.001) * 0.0001).toFixed(6);
            ctx.fillText(`LAT: ${lat} N | LON: ${lon} E`, canvas.height * 0.8, 35);
            
            const bps = (3800 + Math.sin(tick * 0.05) * 150).toFixed(0);
            ctx.fillText(`BPS: ${bps} KBPS`, canvas.width - 130, canvas.height - 25);

            // Add grain noise filter overlay
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * noiseIntensity * 255;
                data[i] = Math.min(255, Math.max(0, data[i] + noise));
                data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
                data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
            }
            ctx.putImageData(imgData, 0, 0);

            // Scan swipe line
            const scanY = (tick * 1.5) % canvas.height;
            ctx.fillStyle = "rgba(14, 165, 233, 0.03)";
            ctx.fillRect(0, scanY - 5, canvas.width, 10);

            animationFrameId = requestAnimationFrame(draw);
        }

        draw();
    }
    window.startMockVideoFeed = startMockVideoFeed;

    function renderNonAdminAccessNotice() {
        const roleName = (userRole || 'guest').toUpperCase();
        const noticeHtml = `
            <tr>
                <td colspan="10" class="py-12 px-4 text-center font-mono">
                    <div class="inline-flex flex-col items-center justify-center p-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-2xl max-w-md mx-auto shadow-sm">
                        <svg class="w-10 h-10 text-amber-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <h4 class="text-sm font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider mb-1">Akses Terbatas (${roleName})</h4>
                        <p class="text-xs text-amber-700 dark:text-amber-400 font-sans leading-relaxed">
                            Menu <strong>Admin Console</strong> memerlukan hak akses <strong>ADMINISTRATOR</strong>. Akun Anda saat ini masuk sebagai <strong>${roleName}</strong>.
                        </p>
                    </div>
                </td>
            </tr>
        `;
        ["admin-streams-table-body", "admin-users-table-body", "api-keys-table-body"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = noticeHtml;
        });
    }
    window.renderNonAdminAccessNotice = renderNonAdminAccessNotice;

    // --- 8. Double-Click Fullscreen Camera Popup ---
    function createPopupModalElement() {
        if (document.getElementById("camera-popup-modal")) return;

        const modalDiv = document.createElement("div");
        modalDiv.id = "camera-popup-modal";
        modalDiv.className = "hidden ms-modal";
        modalDiv.innerHTML = `
            <div id="camera-popup-modal-panel" class="ms-modal__panel relative flex flex-col font-mono transition-all duration-300 text-slate-800 dark:text-slate-100">
                <!-- Hidden Audio Only element for isolated audio track play -->
                <audio id="popup-audio-only-element" class="hidden" autoplay muted></audio>

                <!-- Video Player Area -->
                <div id="popup-player-wrapper" class="relative flex-1 aspect-video flex items-center justify-center group overflow-hidden bg-black">
                    <div id="popup-stream-container" class="w-full h-full"></div>

                    <!-- Loading bar for transition -->
                    <div id="popup-loading-bar" class="absolute top-0 left-0 right-0 h-0.5 bg-sky-500 animate-pulse z-40 hidden"></div>

                    <!-- Close Button (top-right, hover only) -->
                    <button onclick="window.closeCameraPopup()" class="absolute top-3 right-3 z-40 p-1.5 bg-black/60 hover:bg-black/85 text-white/70 hover:text-white rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 active:scale-90 border border-white/10" title="Close (Esc)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>

                    <!-- Navigation Buttons (Prev & Next) -->
                    <button id="popup-prev-btn" class="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 active:scale-90 shadow-lg hidden" title="Kamera Sebelumnya (←)">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <button id="popup-next-btn" class="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 active:scale-90 shadow-lg hidden" title="Kamera Berikutnya (→)">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                    </button>

                    <!-- Player Control Bar (bottom overlay, shown on hover) -->
                    <div class="popup-controls-bar absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-8 pb-3 px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-between gap-3 text-white select-none">
                        <!-- Left: play + volume + live badge -->
                        <div class="flex items-center gap-3">
                            <button id="popup-play-btn" class="hover:text-sky-400 transition-colors active:scale-90" title="Play/Pause (Spasi)">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                            </button>
                            <button id="popup-volume-btn" class="hover:text-sky-400 transition-colors active:scale-90" title="Mute/Unmute (M)">
                                <svg class="w-5 h-5 text-rose-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM19 12c0 2.76-.84 5.38-2.3 7.54l1.44 1.44C20.48 18.02 22 15.19 22 12s-1.52-6.02-3.86-9.02l-1.44 1.44C18.16 6.62 19 9.24 19 12zM3 9v6h4l5 5V4L7 9H3z"/></svg>
                            </button>
                            <span class="hidden sm:inline-block text-[9px] font-bold tracking-widest text-slate-400 uppercase border border-slate-600 rounded px-1.5 py-0.5">● LIVE</span>
                        </div>
                        <!-- Right: quality + orientation + theater + fullscreen -->
                        <div class="flex items-center gap-2.5">
                            <button id="popup-quality-btn" class="px-2 py-0.5 bg-slate-800/90 hover:bg-slate-700 text-sky-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wide transition-all duration-150 active:scale-90 border border-white/10 min-w-[2.4rem] text-center" title="Ganti Kualitas (LQ/HQ)">LQ</button>
                            <div class="w-px h-4 bg-white/15 hidden sm:block"></div>
                            <button id="popup-orientation-btn" class="hover:text-sky-400 transition-colors active:scale-90" title="Putar Orientasi Layar (R)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
                            </button>
                            <button id="popup-theater-btn" class="hidden md:block hover:text-sky-400 transition-colors active:scale-90" title="Mode Teater (T)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 15h20"/></svg>
                            </button>
                            <button id="popup-fullscreen-btn" class="hover:text-sky-400 transition-colors active:scale-90" title="Layar Penuh (F)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Camera Metadata Bar -->
                <div class="px-4 py-2 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono select-none shrink-0">
                    <div class="flex items-center gap-2 min-w-0">
                        <span id="popup-rec-dot" class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                        <span id="popup-rec-label" class="font-bold text-rose-500 tracking-wider shrink-0">REC</span>
                        <span class="text-slate-700 shrink-0">|</span>
                        <span id="popup-status-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                        <span id="popup-cam-id" class="font-bold text-sky-400 shrink-0">CAM_000</span>
                        <span class="text-slate-700 shrink-0">|</span>
                        <span id="popup-cam-name" class="font-bold text-slate-100 uppercase truncate font-sans">LOADING...</span>
                    </div>
                    <div id="popup-cam-status-container" class="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 flex items-center shrink-0">
                        <span id="popup-cam-status" class="font-bold text-[9px] font-sans tracking-wide">RTSP ONLINE</span>
                    </div>
                </div>

                <!-- Footer: Ad + Actions -->
                <div class="px-4 py-2.5 bg-slate-950/40 border-t border-slate-800/60 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 text-xs text-slate-400">
                    <!-- Ad / placeholder -->
                    <div class="flex-1 flex items-center gap-2 min-w-0">
                        <img id="popup-ad-img" src="" alt="Ad" class="w-auto rounded object-contain shrink-0 hidden" style="height:20px!important;">
                        <div id="popup-ad-text-container" class="flex-grow overflow-hidden rounded border border-white/5 py-1.5 px-3 hidden" style="background-color:#1e293b;min-height:36px;display:flex;align-items:center;">
                            <div class="marquee-wrapper">
                                <div id="popup-ad-marquee-track" class="marquee-track"></div>
                            </div>
                        </div>
                    </div>
                    <!-- Action buttons -->
                    <div class="flex items-center gap-2 shrink-0">
                        <button id="popup-map-btn" class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-md text-[10px] font-bold uppercase tracking-wide transition-all shadow-sm">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            <span>Peta</span>
                        </button>
                        <button onclick="window.closeCameraPopup()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all border border-slate-700">
                            Tutup
                        </button>
                    </div>
                    <!-- Hidden compatibility span -->
                    <span id="popup-bps-val" class="hidden"></span>
                </div>
            </div>
        `;
        
        // Close modal when clicking on backdrop
        modalDiv.addEventListener("click", (e) => {
            if (e.target === modalDiv) {
                window.closeCameraPopup();
            }
        });

        // Setup control events
        const playBtn = modalDiv.querySelector("#popup-play-btn");
        const volumeBtn = modalDiv.querySelector("#popup-volume-btn");
        const theaterBtn = modalDiv.querySelector("#popup-theater-btn");
        const fullscreenBtn = modalDiv.querySelector("#popup-fullscreen-btn");
        const orientationBtn = modalDiv.querySelector("#popup-orientation-btn");
        const panel = modalDiv.querySelector("#camera-popup-modal-panel");

        playBtn.onclick = () => {
            const video = document.getElementById("video-feed-popup");
            if (video) {
                if (video.paused) {
                    video.play();
                    playBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`;
                } else {
                    video.pause();
                    playBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
                }
            }
        };

        volumeBtn.onclick = () => {
            const audioEl = document.getElementById("popup-audio-only-element");
            if (!audioEl) return;
            
            audioEl.muted = !audioEl.muted;
            
            if (audioEl.muted) {
                // Muted: Stop stream audio to save bandwidth
                volumeBtn.innerHTML = `<svg class="w-5 h-5 text-rose-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM19 12c0 2.76-.84 5.38-2.3 7.54l1.44 1.44C20.48 18.02 22 15.19 22 12s-1.52-6.02-3.86-9.02l-1.44 1.44C18.16 6.62 19 9.24 19 12zM3 9v6h4l5 5V4L7 9H3z"/></svg>`;
                
                // Close background audio WebRTC connection
                if (window.peerConnections && window.peerConnections["popup-audio-only-element"]) {
                    window.peerConnections["popup-audio-only-element"].close();
                    delete window.peerConnections["popup-audio-only-element"];
                }
                audioEl.srcObject = null;
            } else {
                // Unmuted: Load audio dynamically in background
                volumeBtn.innerHTML = `<svg class="w-5 h-5 animate-pulse text-sky-400" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"/></svg>`;
                
                // Get active stream object by parsing ID
                const camIdStr = document.getElementById("popup-cam-id").textContent;
                const streamId = parseInt(camIdStr.replace("CAM_", ""), 10);
                const stream = streamsData.find(s => s.id === streamId);
                
                if (stream && stream.status === "online") {
                    console.log("[WebRTC] Loading audio stream in background...");
                    startNativeWebRTC(stream.id, stream.webrtc_url, "popup-audio-only-element", false);
                }
            }
        };

        theaterBtn.onclick = () => {
            if (panel) {
                if (panel.classList.contains("max-w-5xl")) {
                    panel.classList.remove("max-w-5xl");
                    panel.classList.add("max-w-none", "w-[95vw]", "max-h-[90vh]");
                    theaterBtn.innerHTML = `<svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M2 15h20"/></svg>`;
                } else {
                    panel.classList.remove("max-w-none", "w-[95vw]", "max-h-[90vh]");
                    panel.classList.add("max-w-5xl");
                    theaterBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 15h20"/></svg>`;
                }
            }
        };

        orientationBtn.onclick = async () => {
            const wrapper = document.getElementById("popup-player-wrapper");
            if (!wrapper) return;
            
            if (screen.orientation && screen.orientation.lock) {
                try {
                    // Lock API requires fullscreen first
                    if (!document.fullscreenElement) {
                        if (wrapper.requestFullscreen) {
                            await wrapper.requestFullscreen();
                        } else if (wrapper.webkitRequestFullscreen) {
                            await wrapper.webkitRequestFullscreen();
                        }
                    }
                    
                    const currentType = screen.orientation.type;
                    if (currentType.startsWith("portrait")) {
                        console.log("[WebRTC] Locking screen orientation to landscape...");
                        await screen.orientation.lock("landscape");
                    } else {
                        console.log("[WebRTC] Unlocking orientation back to portrait...");
                        await screen.orientation.lock("portrait");
                    }
                } catch (err) {
                    console.warn("[WebRTC] Failed to lock screen orientation:", err);
                    window.showToast("Gagal mengunci orientasi. Silakan aktifkan auto-rotate di HP Anda.", "info");
                }
            } else {
                window.showToast("Browser Anda tidak mendukung penguncian rotasi layar.", "info");
            }
        };

        fullscreenBtn.onclick = () => {
            const video = document.getElementById("video-feed-popup");
            const wrapper = document.getElementById("popup-player-wrapper");
            if (video && wrapper) {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isIOS) {
                    if (video.webkitEnterFullscreen) {
                        video.webkitEnterFullscreen();
                    }
                } else {
                    if (!document.fullscreenElement) {
                        if (wrapper.requestFullscreen) {
                            wrapper.requestFullscreen();
                        } else if (wrapper.webkitRequestFullscreen) {
                            wrapper.webkitRequestFullscreen();
                        }
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        }
                    }
                }
            }
        };

        // Fullscreen Icon Switcher & Auto-Unlock Orientation
        let touchControlsTimer = null;
        document.addEventListener("fullscreenchange", () => {
            const wrapper = document.getElementById("popup-player-wrapper");
            if (document.fullscreenElement && document.fullscreenElement === wrapper) {
                fullscreenBtn.innerHTML = `<svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"/></svg>`;

                // On touch devices: tap on wrapper to toggle controls visibility
                const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                if (isTouchDevice) {
                    wrapper._fsToggleControls = (e) => {
                        // Ignore taps on the actual buttons
                        if (e.target.closest('button')) return;
                        wrapper.classList.toggle("touch-controls-visible");
                        clearTimeout(touchControlsTimer);
                        if (wrapper.classList.contains("touch-controls-visible")) {
                            // Auto-hide after 3 seconds
                            touchControlsTimer = setTimeout(() => {
                                wrapper.classList.remove("touch-controls-visible");
                            }, 3000);
                        }
                    };
                    wrapper.addEventListener("touchend", wrapper._fsToggleControls);
                }
            } else {
                fullscreenBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
                
                // Cleanup: remove touch handler & controls visibility
                if (wrapper) {
                    if (wrapper._fsToggleControls) {
                        wrapper.removeEventListener("touchend", wrapper._fsToggleControls);
                        wrapper._fsToggleControls = null;
                    }
                    wrapper.classList.remove("touch-controls-visible");
                    clearTimeout(touchControlsTimer);
                }

                // When exiting fullscreen, auto-unlock screen orientation lock
                if (screen.orientation && screen.orientation.unlock) {
                    try { screen.orientation.unlock(); } catch(e) {}
                }
            }
        });

        // Keyboard Shortcuts
        document.addEventListener("keydown", (e) => {
            const modal = document.getElementById("camera-popup-modal");
            if (modal && !modal.classList.contains("hidden")) {
                // Arrow navigation shortcuts
                if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    const prevBtn = document.getElementById("popup-prev-btn");
                    if (prevBtn && !prevBtn.classList.contains("hidden")) {
                        prevBtn.click();
                    }
                } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    const nextBtn = document.getElementById("popup-next-btn");
                    if (nextBtn && !nextBtn.classList.contains("hidden")) {
                        nextBtn.click();
                    }
                }

                const video = document.getElementById("video-feed-popup");
                if (!video) return;

                if (e.key.toLowerCase() === "f") {
                    e.preventDefault();
                    fullscreenBtn.click();
                } else if (e.key.toLowerCase() === "t") {
                    e.preventDefault();
                    theaterBtn.click();
                } else if (e.key.toLowerCase() === "m") {
                    e.preventDefault();
                    volumeBtn.click();
                } else if (e.key === " ") {
                    e.preventDefault();
                    playBtn.click();
                }
            }
        });

        document.body.appendChild(modalDiv);
    }

    function updatePopupLabels(stream, animate = false) {
        const camIdEl = document.getElementById("popup-cam-id");
        const camNameEl = document.getElementById("popup-cam-name");
        const camStatusEl = document.getElementById("popup-cam-status");
        const statusDot = document.getElementById("popup-status-dot");
        const recDot = document.getElementById("popup-rec-dot");
        const recLabel = document.getElementById("popup-rec-label");
        const bpsVal = document.getElementById("popup-bps-val");
        const isOnline = stream.status === "online";

        const applyLabels = () => {
            if (camIdEl) camIdEl.textContent = `CAM_${String(stream.id).padStart(3, '0')}`;
            if (camNameEl) camNameEl.textContent = stream.name.toUpperCase();
            const statusPill = document.getElementById("popup-cam-status-pill");
            if (statusPill) {
                if (isOnline) {
                    statusPill.className = "flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider font-sans bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 shadow-sm";
                } else {
                    statusPill.className = "flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider font-sans bg-rose-500/20 text-rose-200 border border-rose-400/30 shadow-sm";
                }
            }
            if (camStatusEl) {
                camStatusEl.textContent = isOnline ? "RTSP ONLINE" : "RTSP OFFLINE";
                camStatusEl.className = "font-bold text-[9px] font-sans";
            }
            const statusContainer = document.getElementById("popup-cam-status-container");
            if (statusContainer) {
                if (isOnline) {
                    statusContainer.className = "px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 shadow-sm flex items-center justify-center shrink-0 transition-colors duration-300";
                } else {
                    statusContainer.className = "px-2 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-500/20 shadow-sm flex items-center justify-center shrink-0 transition-colors duration-300";
                }
            }
            if (statusDot) statusDot.className = isOnline ? "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" : "w-1.5 h-1.5 rounded-full bg-rose-400";
            if (recDot) recDot.className = isOnline ? "w-2 h-2 rounded-full bg-red-500 animate-pulse" : "w-2 h-2 rounded-full bg-slate-500";
            if (recLabel) {
                recLabel.textContent = isOnline ? "REC" : "LOSS";
                recLabel.className = isOnline ? "font-bold text-rose-500 tracking-wider font-mono text-[9px]" : "font-bold text-slate-400 tracking-wider font-mono text-[9px]";
            }
            if (bpsVal) {
                const randomBps = (3800 + Math.floor(Math.random() * 400));
                bpsVal.textContent = isOnline ? `${randomBps} KBPS` : "0 KBPS";
            }
        };

        if (animate && camNameEl && camStatusEl) {
            // Cross-fade: fade out → update → fade in
            camNameEl.classList.add("fading");
            if (camStatusEl) camStatusEl.classList.add("fading");
            setTimeout(() => {
                applyLabels();
                camNameEl.classList.remove("fading");
                if (camStatusEl) camStatusEl.classList.remove("fading");
            }, 200);
        } else {
            applyLabels();
        }

        // Setup Map Button
        const mapBtn = document.getElementById("popup-map-btn");
        if (mapBtn) {
            const hasCoords = !!(stream.coordinates && stream.coordinates.trim() && stream.coordinates !== "-");
            if (hasCoords) {
                mapBtn.classList.remove("hidden");
                mapBtn.onclick = () => {
                    window.closeCameraPopup();
                    window.openMapModal(stream.id);
                };
            } else {
                mapBtn.classList.add("hidden");
            }
        }
    }

    window.openCameraPopup = function(streams, popupSequence = null) {
        // Capture frame of current playing video before doing anything else
        captureLastPopupFrame();

        const modal = document.getElementById("camera-popup-modal");
        const isAlreadyOpen = modal && !modal.classList.contains("hidden");

        if (!isAlreadyOpen) {
            stopPopupStreams();
            createPopupModalElement();
        } else {
            // Cancel any pending audio background swap timeouts
            if (popupSwapTimeout) {
                clearTimeout(popupSwapTimeout);
                popupSwapTimeout = null;
            }
        }
        
        const targetModal = document.getElementById("camera-popup-modal");
        if (!targetModal) return;
        
        // If not in fullscreen, ensure modal is attached to body
        // NOTE: Do NOT move modal into fullscreenElement — popup-player-wrapper is a child of the modal,
        // so appending the modal into it would cause HierarchyRequestError.
        if (!document.fullscreenElement && targetModal.parentElement !== document.body) {
            document.body.appendChild(targetModal);
        }
        
        // Handle input arguments dynamically to support cluster sequence cycling
        let targetStreams = Array.isArray(streams) ? streams : [streams];
        let sequence = popupSequence;

        if (Array.isArray(streams) && streams.length > 1 && !popupSequence) {
            targetStreams = [streams[0]];
            sequence = streams;
        }

        // Set active sequence
        window.activePopupSequence = sequence || streamsData;
        
        // Assign to streams variable so the rest of the function remains compatible
        streams = targetStreams;
        
        // Update labels
        const camIdEl = document.getElementById("popup-cam-id");
        const camNameEl = document.getElementById("popup-cam-name");
        const camStatusEl = document.getElementById("popup-cam-status");
        const statusDot = document.getElementById("popup-status-dot");
        const recDot = document.getElementById("popup-rec-dot");
        const recLabel = document.getElementById("popup-rec-label");
        const bpsVal = document.getElementById("popup-bps-val");
        
        if (streams.length === 1) {
            const stream = streams[0];
            let updateQualityButtonLabel = null;
            let popupVideo = null;
            let streamContainer = null;
            
            // Setup Prev & Next Buttons
            const prevBtn = document.getElementById("popup-prev-btn");
            const nextBtn = document.getElementById("popup-next-btn");
            if (prevBtn && nextBtn) {
                const seq = window.activePopupSequence || streamsData;
                if (seq.length > 1) {
                    prevBtn.classList.remove("hidden");
                    nextBtn.classList.remove("hidden");
                    
                    const currentIndex = seq.findIndex(s => s.id === stream.id);
                    if (currentIndex >= 0) {
                        prevBtn.onclick = (e) => {
                            e.stopPropagation();
                            const prevStream = seq[(currentIndex - 1 + seq.length) % seq.length];
                            window.openCameraPopup(prevStream, seq);
                        };
                        nextBtn.onclick = (e) => {
                            e.stopPropagation();
                            const nextStream = seq[(currentIndex + 1) % seq.length];
                            window.openCameraPopup(nextStream, seq);
                        };
                    }
                } else {
                    prevBtn.classList.add("hidden");
                    nextBtn.classList.add("hidden");
                }
            }

            const isOnline = stream.status === "online";

            if (isAlreadyOpen) {
                const loadingBar = document.getElementById("popup-loading-bar");
                if (loadingBar) loadingBar.classList.remove("hidden");

                // Update labels immediately for instant response
                updatePopupLabels(stream, true);

                // Cancel any pending audio background swap timeouts
                if (popupSwapTimeout) {
                    clearTimeout(popupSwapTimeout);
                    popupSwapTimeout = null;
                }

                // Close old popup connections
                if (window.peerConnections) {
                    Object.keys(window.peerConnections).forEach(key => {
                        if (key.startsWith("video-feed-popup")) {
                            window.peerConnections[key].close();
                            delete window.peerConnections[key];
                        }
                    });
                }

                streamContainer = document.getElementById("popup-stream-container");
                if (streamContainer) {
                    if (!isOnline) {
                        // Set background to the camera's own last captured image (poster)
                        const posterUrl = getPosterUrl(stream.id);
                        if (posterUrl) {
                            streamContainer.style.setProperty("background-image", `url("${posterUrl}")`, "important");
                            streamContainer.style.setProperty("background-size", "cover", "important");
                            streamContainer.style.setProperty("background-position", "center", "important");
                        } else {
                            streamContainer.style.setProperty("background-image", "", "important");
                        }

                        streamContainer.innerHTML = `
                            <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 font-mono text-center px-4 border border-red-500/20 rounded-md z-30">
                                <div class="p-3 bg-red-500/20 rounded-full border border-red-500/30 mb-2 animate-pulse">
                                    <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                    </svg>
                                </div>
                                <span class="text-xs font-bold text-red-400 uppercase tracking-widest bg-slate-950/80 px-2 py-1 rounded">Gagal Konek ke RTSP: ${stream.name}</span>
                                <span class="text-[10px] text-slate-300 mt-1 select-all truncate max-w-full mb-4 bg-slate-950/80 px-2 py-0.5 rounded font-bold font-mono">WHEP WebRTC connection failed</span>
                                <button onclick="window.forceLoadStream('${stream.id}'); window.closeCameraPopup();" class="px-4 py-2 bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-500/30 rounded-md text-[10px] uppercase font-bold transition-all duration-150 active:scale-95 shadow-lg backdrop-blur-sm">Coba Hubungkan Paksa</button>
                            </div>
                        `;
                        if (loadingBar) loadingBar.classList.add("hidden");
                    } else if (simulationActive) {
                        const errorOverlay = document.getElementById("popup-error-overlay");
                        if (errorOverlay) {
                            try { errorOverlay.remove(); } catch(e) {}
                        }
                        streamContainer.style.backgroundImage = ""; // Clear background
                        streamContainer.innerHTML = `
                            <canvas id="canvas-feed-popup" class="w-full h-full object-cover bg-black"></canvas>
                            <div class="absolute inset-0 bg-emerald-500/5 pointer-events-none mix-blend-overlay"></div>
                            <div class="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,_rgba(0,0,0,0.25)_50%),_linear-gradient(90deg,_rgba(255,0,0,0.06),_rgba(0,255,0,0.02),_rgba(0,0,255,0.06))] bg-[size:100%_4px,_6px_100%] pointer-events-none opacity-40"></div>
                            <div class="absolute w-full h-2 bg-sky-500/10 pointer-events-none scanline top-0"></div>
                        `;
                        startMockVideoFeed(stream.id, stream.name, "canvas-feed-popup");
                        if (loadingBar) loadingBar.classList.add("hidden");
                    } else {
                        // Remove error overlay if present when loading a successful stream
                        const errorOverlay = document.getElementById("popup-error-overlay");
                        if (errorOverlay) {
                            try { errorOverlay.remove(); } catch(e) {}
                        }
                        
                        // Keep previous frame as background if we have it to prevent gap/black screen
                        if (lastPopupFrameDataUrl) {
                            streamContainer.style.backgroundImage = `url(${lastPopupFrameDataUrl})`;
                            streamContainer.style.backgroundSize = "contain";
                            streamContainer.style.backgroundRepeat = "no-repeat";
                            streamContainer.style.backgroundPosition = "center";
                        } else {
                            const posterUrl = getPosterUrl(stream.id);
                            if (posterUrl) {
                                streamContainer.style.setProperty("background-image", `url("${posterUrl}")`, "important");
                                streamContainer.style.setProperty("background-size", "contain", "important");
                                streamContainer.style.setProperty("background-repeat", "no-repeat", "important");
                                streamContainer.style.setProperty("background-position", "center", "important");
                            } else {
                                streamContainer.style.backgroundImage = "";
                            }
                        }

                        streamContainer.innerHTML = `
                            <div class="absolute inset-0 bg-transparent flex items-center justify-center">
                                ${buildPosterImgMarkup(stream.id, "poster-for-video-feed-popup")}
                                <video id="video-feed-popup" class="w-full h-full object-contain bg-transparent opacity-0 transition-opacity duration-300 relative z-10" autoplay playsinline muted></video>
                            </div>
                        `;

                        popupVideo = document.getElementById("video-feed-popup");
                        const gridVideo = document.getElementById(`video-feed-${stream.id}`);

                        if (false) { // Never clone from grid when switching within an open popup to prevent stuck/paused streams
                            // Instant clone from active grid
                            console.log("[WebRTC] Instantly cloning stream from grid tile.");
                            popupVideo.srcObject = gridVideo.srcObject;
                            popupVideo.classList.remove("opacity-0");
                            popupVideo.classList.add("opacity-100");
                            
                            const poster = document.getElementById("poster-for-video-feed-popup");
                            if (poster) {
                                poster.classList.add("opacity-0");
                                setTimeout(() => { try { poster.remove(); } catch(e) {} }, 500);
                            }
                            if (loadingBar) loadingBar.classList.add("hidden");

                            // Background HD upgrade after 1s
                            popupSwapTimeout = setTimeout(() => {
                                console.log("[WebRTC] Initiating background HD upgrade...");
                                const tempVideo = document.createElement("video");
                                tempVideo.id = "video-feed-popup-temp-bg";
                                tempVideo.muted = true;
                                tempVideo.autoplay = true;
                                tempVideo.playsinline = true;
                                tempVideo.className = "absolute w-px h-px opacity-0 pointer-events-none";
                                streamContainer.appendChild(tempVideo);

                                tempVideo.addEventListener("playing", () => {
                                    if (popupVideo) {
                                        popupVideo.srcObject = tempVideo.srcObject;
                                        popupVideo.muted = true;
                                    }
                                    if (window.peerConnections && window.peerConnections["video-feed-popup"]) {
                                        window.peerConnections["video-feed-popup"].close();
                                        delete window.peerConnections["video-feed-popup"];
                                    }
                                    if (window.peerConnections && window.peerConnections["video-feed-popup-temp-bg"]) {
                                        window.peerConnections["video-feed-popup"] = window.peerConnections["video-feed-popup-temp-bg"];
                                        delete window.peerConnections["video-feed-popup-temp-bg"];
                                    }
                                    try { tempVideo.remove(); } catch(e) {}
                                });

                                startNativeWebRTC(stream.id, stream.webrtc_url, "video-feed-popup-temp-bg", true);
                            }, 1000);
                        } else {
                            // Load sub-stream for instant display (<100ms)
                            popupVideo.addEventListener("playing", () => {
                                popupVideo.classList.remove("opacity-0");
                                popupVideo.classList.add("opacity-100");
                                const poster = document.getElementById("poster-for-video-feed-popup");
                                if (poster) {
                                    poster.classList.add("opacity-0");
                                    setTimeout(() => { try { poster.remove(); } catch(e) {} }, 500);
                                }
                                streamContainer.style.backgroundImage = ""; // Clear background frame
                                if (loadingBar) loadingBar.classList.add("hidden");
                            });

                            startNativeWebRTC(stream.id, stream.webrtc_url_sub || stream.webrtc_url, "video-feed-popup", true);
                            
                            // Background HD upgrade after 1s
                            if (window.innerWidth >= 768) {
                                popupSwapTimeout = setTimeout(() => {
                                    console.log("[WebRTC] Initiating background HD upgrade...");
                                    const tempVideo = document.createElement("video");
                                    tempVideo.id = "video-feed-popup-temp-bg";
                                    tempVideo.muted = true;
                                    tempVideo.autoplay = true;
                                    tempVideo.playsinline = true;
                                    tempVideo.className = "absolute w-px h-px opacity-0 pointer-events-none";
                                    streamContainer.appendChild(tempVideo);

                                    tempVideo.addEventListener("playing", () => {
                                        if (popupVideo) {
                                            popupVideo.srcObject = tempVideo.srcObject;
                                            popupVideo.muted = true;
                                        }
                                        if (window.peerConnections && window.peerConnections["video-feed-popup"]) {
                                            window.peerConnections["video-feed-popup"].close();
                                            delete window.peerConnections["video-feed-popup"];
                                        }
                                        if (window.peerConnections && window.peerConnections["video-feed-popup-temp-bg"]) {
                                            window.peerConnections["video-feed-popup"] = window.peerConnections["video-feed-popup-temp-bg"];
                                            delete window.peerConnections["video-feed-popup-temp-bg"];
                                        }
                                        try { tempVideo.remove(); } catch(e) {}
                                        if (loadingBar) loadingBar.classList.add("hidden");
                                    });

                                    startNativeWebRTC(stream.id, stream.webrtc_url, "video-feed-popup-temp-bg", true);
                                }, 1000);
                            }
                        }
                    }
                }
            } else {
                // First-time opening the popup (standard flow)
                updatePopupLabels(stream);
                streamContainer = document.getElementById("popup-stream-container");
                if (streamContainer) {
                    streamContainer.innerHTML = "";
                    
                    if (!isOnline) {
                        // Set background to the camera's own last captured image (poster)
                        const posterUrl = getPosterUrl(stream.id);
                        if (posterUrl) {
                            streamContainer.style.setProperty("background-image", `url("${posterUrl}")`, "important");
                            streamContainer.style.setProperty("background-size", "cover", "important");
                            streamContainer.style.setProperty("background-position", "center", "important");
                        } else {
                            streamContainer.style.setProperty("background-image", "", "important");
                        }
                        
                        // Offline layout (transparent overlay, no solid dark background)
                        streamContainer.innerHTML = `
                            <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 font-mono text-center px-4 border border-red-500/20 rounded-md z-30">
                                <div class="p-3 bg-red-500/20 rounded-full border border-red-500/30 mb-2 animate-pulse">
                                    <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                    </svg>
                                </div>
                                <span class="text-xs font-bold text-red-400 uppercase tracking-widest bg-slate-950/80 px-2 py-1 rounded">Gagal Konek ke RTSP: ${stream.name}</span>
                                <span class="text-[10px] text-slate-300 mt-1 select-all truncate max-w-full mb-4 bg-slate-950/80 px-2 py-0.5 rounded font-bold font-mono">WHEP WebRTC connection failed</span>
                                <button onclick="window.forceLoadStream('${stream.id}'); window.closeCameraPopup();" class="px-4 py-2 bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-500/30 rounded-md text-[10px] uppercase font-bold transition-all duration-150 active:scale-95 shadow-lg backdrop-blur-sm">Coba Hubungkan Paksa</button>
                            </div>
                        `;
                    } else if (simulationActive) {
                        streamContainer.style.backgroundImage = ""; // Clear background
                        // Canvas layout for noise simulation
                        streamContainer.innerHTML = `
                            <canvas id="canvas-feed-popup" class="w-full h-full object-cover bg-black"></canvas>
                            <div class="absolute inset-0 bg-emerald-500/5 pointer-events-none mix-blend-overlay"></div>
                            <div class="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,_rgba(0,0,0,0.25)_50%),_linear-gradient(90deg,_rgba(255,0,0,0.06),_rgba(0,255,0,0.02),_rgba(0,0,255,0.06))] bg-[size:100%_4px,_6px_100%] pointer-events-none opacity-40"></div>
                            <div class="absolute w-full h-2 bg-sky-500/10 pointer-events-none scanline top-0"></div>
                        `;
                        startMockVideoFeed(stream.id, stream.name, "canvas-feed-popup");
                    } else {
                        // Keep previous frame as background if we have it to prevent gap/black screen
                        if (lastPopupFrameDataUrl) {
                            streamContainer.style.backgroundImage = `url(${lastPopupFrameDataUrl})`;
                            streamContainer.style.backgroundSize = "contain";
                            streamContainer.style.backgroundRepeat = "no-repeat";
                            streamContainer.style.backgroundPosition = "center";
                        } else {
                            const posterUrl = getPosterUrl(stream.id);
                            if (posterUrl) {
                                streamContainer.style.setProperty("background-image", `url("${posterUrl}")`, "important");
                                streamContainer.style.setProperty("background-size", "contain", "important");
                                streamContainer.style.setProperty("background-repeat", "no-repeat", "important");
                                streamContainer.style.setProperty("background-position", "center", "important");
                            } else {
                                streamContainer.style.backgroundImage = "";
                            }
                        }

                        streamContainer.innerHTML = `
                            <div class="absolute inset-0 bg-transparent flex items-center justify-center">
                                ${buildPosterImgMarkup(stream.id, "poster-for-video-feed-popup")}
                                <video id="video-feed-popup" class="w-full h-full object-contain bg-transparent opacity-0 transition-opacity duration-300 relative z-10" autoplay playsinline muted></video>
                            </div>
                        `;

                        popupVideo = document.getElementById("video-feed-popup");
                        const gridVideo = document.getElementById(`video-feed-${stream.id}`);

                        if (gridVideo && gridVideo.srcObject && (currentPage === "monitor" || currentPage === "custom")) {
                            // Instant stream clone from active grid!
                            console.log("[WebRTC] Instantly cloning stream from grid tile.");
                            popupVideo.srcObject = gridVideo.srcObject;
                            
                            const showVideo = () => {
                                popupVideo.classList.remove("opacity-0");
                                popupVideo.classList.add("opacity-100");
                                const poster = document.getElementById("poster-for-video-feed-popup");
                                if (poster) {
                                    poster.classList.add("opacity-0");
                                    setTimeout(() => { try { poster.remove(); } catch(e) {} }, 500);
                                }
                                streamContainer.style.backgroundImage = "";
                            };
                            if (popupVideo.readyState >= 3) {
                                showVideo();
                            } else {
                                popupVideo.addEventListener("playing", showVideo);
                            }

                            // Background HD upgrade (video-only) after 1.5 seconds
                            if (window.innerWidth >= 768) {
                                popupSwapTimeout = setTimeout(() => {
                                    console.log("[WebRTC] Initiating background HD upgrade (video-only)...");
                                    const tempVideo = document.createElement("video");
                                    tempVideo.id = "video-feed-popup-temp-bg";
                                    tempVideo.muted = true;
                                    tempVideo.autoplay = true;
                                    tempVideo.playsinline = true;
                                    tempVideo.className = "absolute w-px h-px opacity-0 pointer-events-none";
                                    streamContainer.appendChild(tempVideo);

                                    tempVideo.addEventListener("playing", () => {
                                        console.log("[WebRTC] Seamlessly upgraded popup to HD (video-only).");
                                        if (popupVideo) {
                                            popupVideo.srcObject = tempVideo.srcObject;
                                            popupVideo.muted = true;
                                        }
                                        if (window.peerConnections && window.peerConnections["video-feed-popup"]) {
                                            window.peerConnections["video-feed-popup"].close();
                                            delete window.peerConnections["video-feed-popup"];
                                        }
                                        if (window.peerConnections && window.peerConnections["video-feed-popup-temp-bg"]) {
                                            window.peerConnections["video-feed-popup"] = window.peerConnections["video-feed-popup-temp-bg"];
                                            delete window.peerConnections["video-feed-popup-temp-bg"];
                                        }
                                        if (typeof updateQualityButtonLabel === "function") {
                                            updateQualityButtonLabel("HQ");
                                        }
                                        try { tempVideo.remove(); } catch(e) {}
                                    });

                                    startNativeWebRTC(stream.id, stream.webrtc_url, "video-feed-popup-temp-bg", true);
                                }, 1500);
                            }
                        } else {
                            // Normal fallback WHEP signaling: load sub-stream first for instant load (<100ms)
                            console.log("[WebRTC] Fallback: Loading sub-stream first for instant rendering.");
                            
                            popupVideo.addEventListener("playing", () => {
                                streamContainer.style.backgroundImage = "";
                            });
                            
                            startNativeWebRTC(stream.id, stream.webrtc_url_sub || stream.webrtc_url, "video-feed-popup", true);
                            
                            // Background HD upgrade (video-only) after 1.5 seconds
                            if (window.innerWidth >= 768) {
                                popupSwapTimeout = setTimeout(() => {
                                    console.log("[WebRTC] Initiating background HD upgrade (video-only)...");
                                    const tempVideo = document.createElement("video");
                                    tempVideo.id = "video-feed-popup-temp-bg";
                                    tempVideo.muted = true;
                                    tempVideo.autoplay = true;
                                    tempVideo.playsinline = true;
                                    tempVideo.className = "absolute w-px h-px opacity-0 pointer-events-none";
                                    streamContainer.appendChild(tempVideo);

                                    tempVideo.addEventListener("playing", () => {
                                        console.log("[WebRTC] Seamlessly upgraded popup fallback to HD.");
                                        if (popupVideo) {
                                            popupVideo.srcObject = tempVideo.srcObject;
                                            popupVideo.muted = true;
                                        }
                                        if (window.peerConnections && window.peerConnections["video-feed-popup"]) {
                                            window.peerConnections["video-feed-popup"].close();
                                            delete window.peerConnections["video-feed-popup"];
                                        }
                                        if (window.peerConnections && window.peerConnections["video-feed-popup-temp-bg"]) {
                                            window.peerConnections["video-feed-popup"] = window.peerConnections["video-feed-popup-temp-bg"];
                                            delete window.peerConnections["video-feed-popup-temp-bg"];
                                        }
                                        if (typeof updateQualityButtonLabel === "function") {
                                            updateQualityButtonLabel("HQ");
                                        }
                                        try { tempVideo.remove(); } catch(e) {}
                                    });

                                    startNativeWebRTC(stream.id, stream.webrtc_url, "video-feed-popup-temp-bg", true);
                                }, 1500);
                            }
                        }                   }
                    }
                }

            // Setup Quality Selector Button (LQ / HQ)
            const qualityBtn = document.getElementById("popup-quality-btn");
            let currentQuality = (window.innerWidth >= 768) ? "HQ" : "LQ";
            
            updateQualityButtonLabel = (quality) => {
                if (!qualityBtn) return;
                currentQuality = quality;
                qualityBtn.textContent = quality;
                if (quality === "HQ") {
                    qualityBtn.classList.remove("text-sky-400", "bg-slate-800");
                    qualityBtn.classList.add("text-emerald-400", "bg-emerald-950/40");
                    qualityBtn.title = "Kualitas HD Aktif - Klik untuk ganti ke LQ";
                } else {
                    qualityBtn.classList.remove("text-emerald-400", "bg-emerald-950/40");
                    qualityBtn.classList.add("text-sky-400", "bg-slate-800");
                    qualityBtn.title = "Kualitas LQ Aktif - Klik untuk ganti ke HD";
                }
            };

            if (qualityBtn) {
                qualityBtn.classList.remove("hidden");
                updateQualityButtonLabel(currentQuality);
                
                qualityBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (qualityBtn.textContent === "...") return;
                    
                    const nextQ = (currentQuality === "LQ") ? "HQ" : "LQ";
                    qualityBtn.textContent = "...";
                    
                    if (popupSwapTimeout) {
                        clearTimeout(popupSwapTimeout);
                        popupSwapTimeout = null;
                    }
                    
                    const targetUrl = (nextQ === "HQ") ? stream.webrtc_url : (stream.webrtc_url_sub || stream.webrtc_url);
                    console.log(`[WebRTC] Seamlessly changing quality to ${nextQ}: ${targetUrl}`);
                    
                    const tempVideo = document.createElement("video");
                    tempVideo.id = "video-feed-popup-temp-bg";
                    tempVideo.muted = true;
                    tempVideo.autoplay = true;
                    tempVideo.playsinline = true;
                    tempVideo.className = "absolute w-px h-px opacity-0 pointer-events-none";
                    streamContainer.appendChild(tempVideo);
                    
                    const timeoutId = setTimeout(() => {
                        if (qualityBtn.textContent === "...") {
                            console.warn("[WebRTC] Seamless quality change timed out.");
                            updateQualityButtonLabel(currentQuality);
                            try { tempVideo.remove(); } catch(e) {}
                            if (window.peerConnections && window.peerConnections["video-feed-popup-temp-bg"]) {
                                window.peerConnections["video-feed-popup-temp-bg"].close();
                                delete window.peerConnections["video-feed-popup-temp-bg"];
                            }
                            window.showToast("Koneksi kualitas baru lambat atau gagal terhubung.", "error");
                        }
                    }, 10000);

                    tempVideo.addEventListener("playing", () => {
                        clearTimeout(timeoutId);
                        console.log(`[WebRTC] Successfully changed quality to ${nextQ} seamlessly`);
                        if (popupVideo) {
                            popupVideo.srcObject = tempVideo.srcObject;
                            popupVideo.muted = true;
                        }
                        if (window.peerConnections && window.peerConnections["video-feed-popup"]) {
                            window.peerConnections["video-feed-popup"].close();
                            delete window.peerConnections["video-feed-popup"];
                        }
                        if (window.peerConnections && window.peerConnections["video-feed-popup-temp-bg"]) {
                            window.peerConnections["video-feed-popup"] = window.peerConnections["video-feed-popup-temp-bg"];
                            delete window.peerConnections["video-feed-popup-temp-bg"];
                        }
                        try { tempVideo.remove(); } catch(e) {}
                        updateQualityButtonLabel(nextQ);
                    });
                    
                    startNativeWebRTC(stream.id, targetUrl, "video-feed-popup-temp-bg", true);
                };
            }
        } else {
            // Hide Prev & Next buttons for clusters
            const prevBtn = document.getElementById("popup-prev-btn");
            const nextBtn = document.getElementById("popup-next-btn");
            if (prevBtn) prevBtn.classList.add("hidden");
            if (nextBtn) nextBtn.classList.add("hidden");

            // Multiple cameras
            if (camIdEl) camIdEl.textContent = `CLUSTER`;
            if (camNameEl) camNameEl.textContent = `${streams.length} KAMERA DI LOKASI INI`;
            
            const anyOnline = streams.some(s => s.status === "online");
            if (camStatusEl) {
                camStatusEl.textContent = anyOnline ? "SOME ONLINE" : "ALL OFFLINE";
                camStatusEl.className = anyOnline ? "font-bold text-xs text-emerald-400 font-mono" : "font-bold text-xs text-rose-500 font-mono";
            }
            if (statusDot) {
                statusDot.className = anyOnline ? "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" : "w-2.5 h-2.5 rounded-full bg-rose-500";
            }
            if (recDot) {
                recDot.className = anyOnline ? "w-2 h-2 rounded-full bg-red-500 animate-pulse" : "w-2 h-2 rounded-full bg-slate-500";
            }
            if (recLabel) {
                recLabel.textContent = anyOnline ? "REC" : "LOSS";
                recLabel.className = anyOnline ? "font-bold text-red-400 tracking-wider font-mono text-[9px]" : "font-bold text-slate-400 tracking-wider font-mono text-[9px]";
            }
            if (bpsVal) {
                let totalBps = 0;
                streams.forEach(s => {
                    if (s.status === "online") {
                        totalBps += (3800 + Math.floor(Math.random() * 400));
                    }
                });
                bpsVal.textContent = `${totalBps} KBPS TOTAL`;
            }
            
            // Map button points to first camera's coordinates
            const mapBtn = document.getElementById("popup-map-btn");
            if (mapBtn) {
                const firstWithCoords = streams.find(s => s.coordinates && s.coordinates.trim() && s.coordinates !== "-");
                if (firstWithCoords) {
                    mapBtn.classList.remove("hidden");
                    mapBtn.onclick = () => {
                        window.closeCameraPopup();
                        window.openMapModal(firstWithCoords.id);
                    };
                } else {
                    mapBtn.classList.add("hidden");
                }
            }

            const streamContainer = document.getElementById("popup-stream-container");
            if (streamContainer) {
                streamContainer.innerHTML = "";
                
                let gridColsClass = "grid-cols-1 md:grid-cols-2";
                if (streams.length > 2) {
                    gridColsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2";
                }
                
                const gridDiv = document.createElement("div");
                gridDiv.className = `grid ${gridColsClass} gap-3 p-3 bg-slate-950 w-full h-full overflow-y-auto`;
                streamContainer.appendChild(gridDiv);
                
                streams.forEach(stream => {
                    const isOnline = stream.status === "online";
                    
                    const tile = document.createElement("div");
                    tile.className = "relative cam-placeholder-bg border border-cyber-outline/65 rounded-md overflow-hidden aspect-video group";
                    
                    const overlayTop = `
                        <div class="absolute top-2 left-2 z-10 bg-[#090e1a]/85 backdrop-blur-md px-2 py-1 text-[8px] font-mono text-white rounded-md flex items-center space-x-1.5 border border-white/5 shadow-sm">
                            <span class="w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}"></span>
                            <span class="font-bold">CAM_${String(stream.id).padStart(3, '0')}</span>
                            <span class="text-slate-600">|</span>
                            <span class="text-slate-300 truncate max-w-24">${stream.name.toUpperCase()}</span>
                        </div>
                    `;
                    
                    if (!isOnline) {
                        tile.innerHTML = `
                            ${overlayTop}
                            <div class="absolute inset-0 flex flex-col items-center justify-center bg-[#090e1a]/95 backdrop-blur-sm font-mono text-center px-4 border border-red-500/20 rounded-md">
                                <span class="text-[9px] font-bold text-red-500 uppercase tracking-wider">OFFLINE</span>
                            </div>
                        `;
                    } else if (simulationActive) {
                        tile.innerHTML = `
                            ${overlayTop}
                            <canvas id="canvas-feed-popup-${stream.id}" class="w-full h-full object-cover bg-black"></canvas>
                            <div class="absolute inset-0 bg-emerald-500/5 pointer-events-none mix-blend-overlay"></div>
                            <div class="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,_rgba(0,0,0,0.25)_50%),_linear-gradient(90deg,_rgba(255,0,0,0.06),_rgba(0,255,0,0.02),_rgba(0,0,255,0.06))] bg-[size:100%_4px,_6px_100%] pointer-events-none opacity-40"></div>
                            <div class="absolute w-full h-1 bg-sky-500/10 pointer-events-none scanline top-0"></div>
                        `;
                    } else {
                        tile.innerHTML = `
                            ${overlayTop}
                            <video id="video-feed-popup-${stream.id}" class="w-full h-full object-cover bg-transparent opacity-0 transition-opacity duration-300" autoplay playsinline muted></video>
                        `;
                    }
                    
                    gridDiv.appendChild(tile);
                    
                    if (isOnline) {
                        if (simulationActive) {
                            startMockVideoFeed(stream.id, stream.name, `canvas-feed-popup-${stream.id}`);
                        } else {
                            startNativeWebRTC(stream.id, stream.webrtc_url_sub || stream.webrtc_url, `video-feed-popup-${stream.id}`, true);
                        }
                    }
                });
            }
        }
        
        const finalModal = document.getElementById("camera-popup-modal");
        if (finalModal) {
            finalModal.classList.remove("hidden");

            const headerMetadata = document.getElementById("popup-header-metadata");
            if (headerMetadata) {
                if ((userRole || "").toLowerCase() === "guest") {
                    headerMetadata.classList.add("hidden");
                } else {
                    headerMetadata.classList.remove("hidden");
                }
            }

            // Load Ad Config for Guest Users
            const adImg = document.getElementById("popup-ad-img");
            const adTextContainer = document.getElementById("popup-ad-text-container");
            const adMarqueeTrack = document.getElementById("popup-ad-marquee-track");

            if ((userRole || "").toLowerCase() === "guest") {
                fetch(`${API_URL}/ad-config`, {
                    headers: { "Authorization": `Bearer ${userToken}` }
                })
                .then(res => {
                    if (!res.ok) throw new Error("Gagal mengambil konfigurasi iklan");
                    return res.json();
                })
                .then(data => {
                    if (data && data.is_active) {
                        if (data.image_url && data.image_url.trim()) {
                            adImg.src = data.image_url;
                            const imgOpacity = data.image_opacity !== undefined ? data.image_opacity : 1.0;
                            adImg.style.opacity = imgOpacity;
                            const imgHeight = data.image_height !== undefined ? data.image_height : 20;
                            adImg.style.setProperty('height', `${imgHeight}px`, 'important');
                            adImg.classList.remove("hidden");
                        } else if (adImg) {
                            adImg.classList.add("hidden");
                        }

                        if (adTextContainer && adMarqueeTrack) {
                            const bgOpacity = data.bg_opacity !== undefined ? data.bg_opacity : 1.0;
                            adTextContainer.style.backgroundColor = hexToRgba(data.bg_color || "#1e293b", bgOpacity);
                            
                            // Set dynamic text color and opacity
                            adMarqueeTrack.style.color = data.text_color || "#ffffff";
                            const textOpacity = data.text_opacity !== undefined ? data.text_opacity : 1.0;
                            adMarqueeTrack.style.opacity = textOpacity;
                            
                            // Set dynamic font size
                            const fontSize = data.font_size !== undefined ? data.font_size : 10;
                            adMarqueeTrack.style.fontSize = `${fontSize}px`;
                            
                            // Set dynamic font family
                            adMarqueeTrack.style.fontFamily = data.font_family || "monospace";
                            
                            // Set dynamic scroll speed (duration in seconds - much slower formula)
                            const speed = data.scroll_speed !== undefined ? data.scroll_speed : 5;
                            const duration = Math.max(10, (11 - speed) * 18);
                            adMarqueeTrack.style.animationDuration = `${duration}s`;
                            
                            const text = (data.marquee_text || "").trim();
                            const itemContent = `${text} &nbsp;&nbsp;|&nbsp;&nbsp; `;
                            const trackText = itemContent.repeat(6);
                            
                            adMarqueeTrack.innerHTML = `
                                <span class="marquee-item">${trackText}</span>
                                <span class="marquee-item">${trackText}</span>
                            `;
                            
                            // Apply custom box width and text alignment for modal text container
                            const boxWidth = data.box_width !== undefined ? data.box_width : 100;
                            const textAlign = data.text_align || "left";

                            adTextContainer.style.width = `${boxWidth}%`;
                            adTextContainer.style.flexGrow = boxWidth >= 100 ? "1" : "0";

                            // Align inside the flex container parent using margins
                            if (textAlign === "left") {
                                adTextContainer.style.marginLeft = "0";
                                adTextContainer.style.marginRight = "auto";
                                adTextContainer.style.justifyContent = "flex-start";
                            } else if (textAlign === "right") {
                                adTextContainer.style.marginLeft = "auto";
                                adTextContainer.style.marginRight = "0";
                                adTextContainer.style.justifyContent = "flex-end";
                            } else { // center
                                adTextContainer.style.marginLeft = "auto";
                                adTextContainer.style.marginRight = "auto";
                                adTextContainer.style.justifyContent = "center";
                            }

                            adTextContainer.style.display = "flex";
                            adTextContainer.classList.remove("hidden");
                        }
                    } else {
                        if (adImg) adImg.classList.add("hidden");
                        if (adTextContainer) {
                            adTextContainer.classList.add("hidden");
                            adTextContainer.style.display = "none";
                        }
                    }
                })
                .catch(err => {
                    console.error("Gagal memuat iklan:", err);
                    if (adImg) adImg.classList.add("hidden");
                    if (adTextContainer) {
                        adTextContainer.classList.add("hidden");
                        adTextContainer.style.display = "none";
                    }
                });
            } else {
                // Ensure ad components are hidden for non-guest roles
                if (adImg) adImg.classList.add("hidden");
                if (adTextContainer) {
                    adTextContainer.classList.add("hidden");
                    adTextContainer.style.display = "none";
                }
            }
        }
    };

    function stopPopupStreams() {
        if (popupSwapTimeout) {
            clearTimeout(popupSwapTimeout);
            popupSwapTimeout = null;
        }
        if (window.peerConnections) {
            Object.keys(window.peerConnections).forEach(key => {
                if (key.startsWith("video-feed-popup") || key === "popup-audio-only-element") {
                    window.peerConnections[key].close();
                    delete window.peerConnections[key];
                }
            });
        }
        const audioEl = document.getElementById("popup-audio-only-element");
        if (audioEl) {
            audioEl.srcObject = null;
            audioEl.muted = true;
        }
        const container = document.getElementById("popup-stream-container");
        if (container) {
            container.innerHTML = "";
        }
    }

    window.closeCameraPopup = function() {
        stopPopupStreams();
        
        // Exit fullscreen if active
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        // Reset panel sizing back to default max-w-5xl
        const panel = document.getElementById("camera-popup-modal-panel");
        if (panel) {
            panel.className = "relative w-full max-w-5xl bg-cyber-container/95 border border-cyber-outline/60 rounded-lg shadow-2xl overflow-hidden flex flex-col font-mono transition-all duration-300";
        }
        
        // Reset Play button icon
        const playBtn = document.getElementById("popup-play-btn");
        if (playBtn) {
            playBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`;
        }
        // Reset volume button icon
        const volumeBtn = document.getElementById("popup-volume-btn");
        if (volumeBtn) {
            volumeBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"/></svg>`;
        }
        // Reset theater mode icon
        const theaterBtn = document.getElementById("popup-theater-btn");
        if (theaterBtn) {
            theaterBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 15h20"/></svg>`;
        }

        const modal = document.getElementById("camera-popup-modal");
        if (!modal || modal.classList.contains("hidden")) return;

        // Play fade-out animation, then actually hide
        modal.classList.add("closing");
        setTimeout(() => {
            modal.classList.remove("closing");
            modal.classList.add("hidden");
            // Move back to body if needed
            if (modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
        }, 180);
    };

    // Close on Escape key press
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            window.closeCameraPopup();
        }
    });

    // Admin Sub-Tab Switcher
    window.switchAdminSubTab = function(tabName) {
        const dirTab = document.getElementById("admin-subtab-directory");
        const scanTab = document.getElementById("admin-subtab-scanner");
        const dirBtn = document.getElementById("admin-tab-directory-btn");
        const scanBtn = document.getElementById("admin-tab-scanner-btn");
        
        if (tabName === "directory") {
            if (dirTab) dirTab.classList.remove("hidden");
            if (scanTab) scanTab.classList.add("hidden");
            
            if (dirBtn) {
                dirBtn.className = "px-4 py-2.5 border-b-2 border-sky-500 dark:border-cyber-primary text-sky-600 dark:text-cyber-primary font-bold uppercase tracking-wider transition-all duration-150";
            }
            if (scanBtn) {
                scanBtn.className = "px-4 py-2.5 border-b-2 border-transparent text-slate-400 dark:text-cyber-dim hover:text-slate-600 dark:hover:text-white font-bold uppercase tracking-wider transition-all duration-150";
            }
        } else {
            if (dirTab) dirTab.classList.add("hidden");
            if (scanTab) scanTab.classList.remove("hidden");
            
            if (dirBtn) {
                dirBtn.className = "px-4 py-2.5 border-b-2 border-transparent text-slate-400 dark:text-cyber-dim hover:text-slate-600 dark:hover:text-white font-bold uppercase tracking-wider transition-all duration-150";
            }
            if (scanBtn) {
                scanBtn.className = "px-4 py-2.5 border-b-2 border-sky-500 dark:border-cyber-primary text-sky-600 dark:text-cyber-primary font-bold uppercase tracking-wider transition-all duration-150";
            }
        }
    };

    // Camera Scan Logic
    window.handleStartScan = async function(e) {
        e.preventDefault();
        
        const ipRange = document.getElementById("scan-ip-range").value;
        const port = parseInt(document.getElementById("scan-port").value, 10);
        const username = document.getElementById("scan-username").value;
        const password = document.getElementById("scan-password").value;
        const codec = document.getElementById("scan-codec").value;
        
        const scanBtn = document.getElementById("start-scan-btn");
        const radarSweep = document.getElementById("radar-sweep");
        const pingContainer = document.getElementById("radar-ping-container");
        const statusBadge = document.getElementById("scan-status-badge");
        const progressLabel = document.getElementById("scan-progress-label");
        const progressPercent = document.getElementById("scan-progress-percent");
        const progressBar = document.getElementById("scan-progress-bar");
        const portInfo = document.getElementById("radar-port-info");
        const camsFoundEl = document.getElementById("radar-cams-found");
        
        // Reset state
        if (pingContainer) pingContainer.innerHTML = "";
        if (camsFoundEl) camsFoundEl.textContent = "0";
        if (portInfo) portInfo.textContent = `LISTENING (${port})`;
        
        const selectAllCB = document.getElementById("scan-select-all");
        if (selectAllCB) selectAllCB.checked = false;
        const bulkBtn = document.getElementById("add-selected-cams-btn");
        if (bulkBtn) bulkBtn.classList.add("hidden");
        
        // Start animation
        if (radarSweep) {
            radarSweep.classList.add("animate-radar");
            radarSweep.style.opacity = "1";
        }
        if (statusBadge) {
            statusBadge.textContent = "SCANNING";
            statusBadge.className = "px-2 py-0.5 bg-amber-500/10 border border-amber-500 text-amber-500 text-[9px] font-bold uppercase font-mono rounded animate-pulse";
        }
        
        if (scanBtn) scanBtn.disabled = true;
        
        // Setup progress bar simulation matching target subnet range
        let progress = 0;
        const baseIp = ipRange.split("/")[0];
        const ipParts = baseIp.split(".");
        const subnetPrefix = ipParts.slice(0, 3).join(".");
        
        const progressInterval = setInterval(() => {
            if (progress < 95) {
                progress += Math.floor(Math.random() * 4) + 1;
                if (progress > 95) progress = 95;
                
                const curHostIp = `${subnetPrefix}.${Math.floor((progress / 100) * 254) + 1}`;
                if (progressLabel) progressLabel.textContent = `Scanning: ${curHostIp}`;
                if (progressPercent) progressPercent.textContent = `${progress}%`;
                if (progressBar) progressBar.style.width = `${progress}%`;
                
                // Randomly add a fake ping just to look cool during the scanning process
                if (Math.random() < 0.08 && pingContainer && pingContainer.children.length < 5) {
                    const tempIp = `${subnetPrefix}.${Math.floor(Math.random() * 254) + 1}`;
                    const ping = document.createElement("div");
                    ping.className = "absolute w-2 h-2 rounded-full bg-sky-500/50 shadow-[0_0_4px_#0ea5e9] animate-ping z-20";
                    ping.style.left = `${10 + Math.random() * 80}%`;
                    ping.style.top = `${10 + Math.random() * 80}%`;
                    pingContainer.appendChild(ping);
                    setTimeout(() => { try { ping.remove(); } catch(e) {} }, 1000);
                }
            }
        }, 150);

        try {
            const response = await fetch(`${API_URL}/admin/scan`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    ip_range: ipRange,
                    port: port,
                    username: username,
                    password: password,
                    codec: codec
                })
            });
            
            clearInterval(progressInterval);
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Scanning failed");
            }
            
            const cameras = await response.json();
            
            // Success progress bar completion
            if (progressLabel) progressLabel.textContent = "Scan Completed";
            if (progressPercent) progressPercent.textContent = "100%";
            if (progressBar) progressBar.style.width = "100%";
            
            // Set results
            if (camsFoundEl) camsFoundEl.textContent = cameras.length;
            if (pingContainer) pingContainer.innerHTML = ""; // Clear temp pings
            
            // Render pings on radar screen
            if (pingContainer) {
                cameras.forEach(cam => {
                    const x = 15 + Math.random() * 70;
                    const y = 15 + Math.random() * 70;
                    const ping = document.createElement("div");
                    ping.className = "absolute w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse z-20 cursor-pointer";
                    ping.style.left = `${x}%`;
                    ping.style.top = `${y}%`;
                    ping.title = `${cam.name} (${cam.ip})`;
                    
                    // Click ping to auto add
                    ping.onclick = () => {
                        window.addScannedCamera(cam.name, cam.rtsp_url);
                    };
                    
                    pingContainer.appendChild(ping);
                });
            }
            
            // Render Table
            const resultsCard = document.getElementById("scan-results-card");
            if (resultsCard) resultsCard.classList.remove("hidden");
            
            const tableBody = document.getElementById("scan-results-table-body");
            if (tableBody) {
                tableBody.innerHTML = "";
                
                if (cameras.length === 0) {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="6" class="py-8 text-center text-slate-400 dark:text-cyber-dim">
                                Tidak ada kamera ditemukan di subnet ini.
                            </td>
                        </tr>
                    `;
                } else {
                    cameras.forEach(cam => {
                        const tr = document.createElement("tr");
                        tr.className = "border-b border-slate-100 dark:border-cyber-outline/40 hover:bg-slate-50 dark:hover:bg-cyber-primary/5 transition-colors";
                        
                        // Hide password in display for security
                        const maskUrl = cam.rtsp_url.replace(/:[^:@]+@/, ":******@");
                        
                        tr.innerHTML = `
                            <td class="py-3.5 px-4 text-center">
                                <input type="checkbox" class="scanned-cam-checkbox w-4 h-4 text-sky-500 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer" 
                                    data-name="${cam.name}" data-rtsp="${cam.rtsp_url}" onchange="window.updateSelectedScannedCamsCount()">
                            </td>
                            <td class="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-300">${cam.ip}</td>
                            <td class="py-3.5 px-4 text-slate-500 dark:text-cyber-dim font-mono">${cam.port}</td>
                            <td class="py-3.5 px-4 text-slate-500 dark:text-cyber-dim font-mono">${username} / ${password}</td>
                            <td class="py-3.5 px-4 text-slate-500 dark:text-cyber-dim select-all truncate max-w-[280px]" title="${cam.rtsp_url}">${maskUrl}</td>
                            <td class="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                                <button onclick="window.previewScannedCamera('${cam.name}', '${cam.rtsp_url}', this)"
                                    class="px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold uppercase tracking-wider rounded transition-all duration-150 active:scale-95">
                                    👁️ Preview
                                </button>
                                <button onclick="window.addScannedCamera('${cam.name}', '${cam.rtsp_url}')"
                                    class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wider rounded transition-all duration-150 active:scale-95">
                                    + Add
                                </button>
                            </td>
                        `;
                        tableBody.appendChild(tr);
                    });
                }
            }
            
        } catch (error) {
            clearInterval(progressInterval);
            console.error("Scan error:", error);
            alert(`Scanning Error: ${error.message}`);
            if (progressLabel) progressLabel.textContent = "Scan Failed";
            if (progressBar) progressBar.style.backgroundColor = "#ef4444";
        } finally {
            if (radarSweep) {
                radarSweep.classList.remove("animate-radar");
                radarSweep.style.opacity = "0";
            }
            if (statusBadge) {
                statusBadge.textContent = "STANDBY";
                statusBadge.className = "px-2 py-0.5 bg-slate-100 dark:bg-cyber-bg border border-slate-300 dark:border-cyber-outline text-slate-500 dark:text-cyber-dim text-[9px] font-bold uppercase font-mono rounded";
            }
            if (scanBtn) scanBtn.disabled = false;
        }
    };

    // Auto Add Camera (Now opens standard stream modal pre-filled)
    window.addScannedCamera = function(name, rtspUrl) {
        // Find existing camera to prevent duplicates
        const exists = adminStreams.some(s => s.rtsp_url === rtspUrl);
        if (exists) {
            alert("Kamera dengan link RTSP tersebut sudah terdaftar.");
            return;
        }

        const mTitle = document.getElementById("modal-title");
        if (mTitle) mTitle.textContent = "Add Scanned CCTV Stream";

        const mId = document.getElementById("modal-stream-id");
        const mName = document.getElementById("modal-stream-name");
        const mGroup = document.getElementById("modal-stream-group");
        const mCoords = document.getElementById("modal-stream-coordinates");
        const mRtsp = document.getElementById("modal-stream-rtsp");
        const mActive = document.getElementById("modal-stream-active");

        if (mId) mId.value = "";
        if (mName) mName.value = name;
        if (mGroup) mGroup.value = "Scanned";
        if (mCoords) {
            const scanCoords = document.getElementById("scan-coordinates")?.value || "";
            mCoords.value = scanCoords;
        }
        if (mRtsp) mRtsp.value = rtspUrl;
        if (mActive) mActive.checked = true;


        const modal = document.getElementById("stream-modal");
        if (modal) modal.classList.remove("hidden");
    };

    // Bulk scanned camera actions
    window.toggleSelectAllScanned = function(isChecked) {
        const checkboxes = document.querySelectorAll(".scanned-cam-checkbox");
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
        });
        window.updateSelectedScannedCamsCount();
    };

    window.updateSelectedScannedCamsCount = function() {
        const checkedBoxes = document.querySelectorAll(".scanned-cam-checkbox:checked");
        const count = checkedBoxes.length;
        
        const countEl = document.getElementById("selected-cams-count");
        const btnEl = document.getElementById("add-selected-cams-btn");
        const selectAllCB = document.getElementById("scan-select-all");
        const allCBs = document.querySelectorAll(".scanned-cam-checkbox");

        if (countEl) countEl.textContent = count;
        
        if (btnEl) {
            if (count > 0) {
                btnEl.classList.remove("hidden");
            } else {
                btnEl.classList.add("hidden");
            }
        }

        if (selectAllCB && allCBs.length > 0) {
            selectAllCB.checked = (count === allCBs.length);
        }
    };

    window.closeBulkAddModal = function() {
        const modal = document.getElementById("bulk-add-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.toggleBulkGroupInput = function(isChecked) {
        const container = document.getElementById("bulk-group-input-container");
        const input = document.getElementById("bulk-stream-group");
        if (container && input) {
            if (isChecked) {
                container.classList.remove("hidden");
                input.required = true;
            } else {
                container.classList.add("hidden");
                input.required = false;
            }
        }
    };

    window.toggleBulkNamingPrefix = function(value) {
        const container = document.getElementById("bulk-naming-prefix-container");
        const input = document.getElementById("bulk-naming-prefix");
        if (container && input) {
            if (value === "original") {
                container.classList.add("hidden");
                input.required = false;
            } else {
                container.classList.remove("hidden");
                input.required = true;
            }
        }
    };

    window.addSelectedScannedCameras = function() {
        const checkedBoxes = document.querySelectorAll(".scanned-cam-checkbox:checked");
        if (checkedBoxes.length === 0) return;

        // Reset inputs
        const groupInput = document.getElementById("bulk-stream-group");
        if (groupInput) groupInput.value = "Scanned";
        const groupCheck = document.getElementById("bulk-enable-grouping");
        if (groupCheck) {
            groupCheck.checked = true;
            window.toggleBulkGroupInput(true);
        }
        const namingSelect = document.getElementById("bulk-naming-mode");
        if (namingSelect) {
            namingSelect.value = "original";
            window.toggleBulkNamingPrefix("original");
        }
        const prefixInput = document.getElementById("bulk-naming-prefix");
        if (prefixInput) prefixInput.value = "";

        const scanCoords = document.getElementById("scan-coordinates")?.value || "";
        const bulkCoords = document.getElementById("bulk-stream-coordinates");
        if (bulkCoords) bulkCoords.value = scanCoords;

        const modal = document.getElementById("bulk-add-modal");
        if (modal) modal.classList.remove("hidden");

    };

    window.handleBulkAddSubmit = async function(e) {
        e.preventDefault();
        
        const checkedBoxes = document.querySelectorAll(".scanned-cam-checkbox:checked");
        if (checkedBoxes.length === 0) {
            window.closeBulkAddModal();
            return;
        }

        const isGroupingEnabled = document.getElementById("bulk-enable-grouping").checked;
        const groupName = isGroupingEnabled ? (document.getElementById("bulk-stream-group").value || "Scanned") : "Default";
        
        const namingMode = document.getElementById("bulk-naming-mode").value;
        const prefix = (document.getElementById("bulk-naming-prefix")?.value || "").trim();
        const coords = (document.getElementById("bulk-stream-coordinates")?.value || "").trim();

        window.closeBulkAddModal();

        const btnEl = document.getElementById("add-selected-cams-btn");
        if (btnEl) btnEl.disabled = true;

        let addedCount = 0;
        let failCount = 0;

        const promises = Array.from(checkedBoxes).map(async (cb, index) => {
            const originalName = cb.getAttribute("data-name");
            const rtspUrl = cb.getAttribute("data-rtsp");

            // Check if already exists in directory to prevent duplicates
            const exists = adminStreams.some(s => s.rtsp_url === rtspUrl);
            if (exists) {
                failCount++;
                return;
            }

            // Determine custom name
            let name = originalName;
            if (namingMode === "prefix-ip") {
                let ip = "IP";
                try {
                    const match = rtspUrl.match(/@([^:/]+)/);
                    if (match && match[1]) ip = match[1];
                } catch(e) {}
                name = prefix ? `${prefix} - ${ip}` : originalName;
            } else if (namingMode === "prefix-seq") {
                name = prefix ? `${prefix} ${index + 1}` : `${originalName} ${index + 1}`;
            }

            const payload = {
                name: name,
                rtsp_url: rtspUrl,
                group_name: groupName,
                coordinates: coords,
                is_active: true
            };


            try {
                const response = await fetch(`${API_URL}/admin/streams`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${userToken}`
                    },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    addedCount++;
                } else {
                    failCount++;
                }
            } catch (e) {
                failCount++;
            }
        });

        await Promise.all(promises);

        if (btnEl) btnEl.disabled = false;

        alert(`Berhasil menambahkan ${addedCount} kamera!${failCount > 0 ? ` (Gagal/Sudah ada: ${failCount})` : ""}`);

        // Reset UI state
        const selectAllCB = document.getElementById("scan-select-all");
        if (selectAllCB) selectAllCB.checked = false;
        
        if (typeof window.loadAdminData === "function") {
            window.loadAdminData();
        }
        if (typeof loadStreamsData === "function") {
            loadStreamsData();
        }
        
        // Hide button
        if (btnEl) btnEl.classList.add("hidden");
    };

    window.previewScannedCamera = async function(name, rtspUrl, btn) {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span>⏳ Loading</span>`;
        }

        try {
            const response = await fetch(`${API_URL}/admin/scan/preview`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({ rtsp_url: rtspUrl })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Gagal menginisialisasi preview");
            }

            const data = await response.json();

            // Open standard popup with a mocked stream item
            const mockStream = {
                id: "preview",
                name: `Preview: ${name}`,
                webrtc_url: data.webrtc_url,
                webrtc_url_sub: data.webrtc_url,
                status: "online",
                group_name: "Preview"
            };

            window.openCameraPopup(mockStream, [mockStream]);

        } catch (error) {
            console.error("Preview stream error:", error);
            alert(`Gagal menampilkan preview: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `👁️ Preview`;
            }
        }
    };

    // Global Intersection Observer for Grid Tiles (Lazy Loading)
    let gridIntersectionObserver = null;
    let gridObserverMobileMode = null;

    function setupGridIntersectionObserver() {
        if (typeof window.isMobileViewport === "function" && window.isMobileViewport()) {
            if (gridIntersectionObserver) {
                gridIntersectionObserver.disconnect();
                gridIntersectionObserver = null;
            }
            return;
        }

        if (gridIntersectionObserver) {
            gridIntersectionObserver.disconnect();
        }

        const gridContainer = typeof window.getActiveGridContainer === "function" ? window.getActiveGridContainer() : null;
        const mainEl = typeof window.getGridObserverRoot === "function" ? window.getGridObserverRoot() : null;
        if (!gridContainer || !mainEl) return;

        gridObserverMobileMode = typeof window.isMobileViewport === "function" ? window.isMobileViewport() : false;
        const observerOptions = typeof window.getGridObserverOptions === "function" ? window.getGridObserverOptions() : { rootMargin: "0px", threshold: 0.1 };

        gridIntersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const streamId = typeof window.parseStreamIdFromTileId === "function" ? window.parseStreamIdFromTileId(entry.target.id) : NaN;
                if (Number.isNaN(streamId)) return;

                const stream = streamsData.find(s => s.id === streamId);
                if (!stream || stream.status === "offline") return;

                if (entry.isIntersecting) {
                    if (typeof window.hasActiveGridPeerConnection === "function" && !window.hasActiveGridPeerConnection(stream.id)) {
                        if (typeof window.connectStreamToGridTile === "function") {
                            window.connectStreamToGridTile(stream);
                        }
                    }
                } else if (typeof window.hasActiveGridPeerConnection === "function" && window.hasActiveGridPeerConnection(stream.id)) {
                    if (typeof window.disconnectGridStreamTile === "function") {
                        window.disconnectGridStreamTile(stream.id);
                    }
                }
            });
        }, {
            root: gridObserverMobileMode ? null : mainEl,
            rootMargin: observerOptions.rootMargin,
            threshold: observerOptions.threshold
        });

        if (typeof window.queryGridTiles === "function") {
            window.queryGridTiles(gridContainer).forEach(tile => {
                gridIntersectionObserver.observe(tile);
            });
        }
    }
    window.setupGridIntersectionObserver = setupGridIntersectionObserver;

    function refreshGridIntersectionObserver() {
        const mobile = typeof window.isMobileViewport === "function" ? window.isMobileViewport() : false;
        if (!gridIntersectionObserver || gridObserverMobileMode !== mobile) {
            setupGridIntersectionObserver();
            return;
        }

        const gridContainer = typeof window.getActiveGridContainer === "function" ? window.getActiveGridContainer() : null;
        if (!gridContainer) return;

        if (typeof window.queryGridTiles === "function") {
            window.queryGridTiles(gridContainer).forEach(tile => {
                gridIntersectionObserver.unobserve(tile);
                gridIntersectionObserver.observe(tile);
            });
        }
    }
    window.refreshGridIntersectionObserver = refreshGridIntersectionObserver;

    // Pagination offset changers
    window.changePageOffset = function(direction) {
        const targetPage = livePageOffset + direction;
        if (targetPage >= 0 && targetPage < viewerTotalPages) {
            livePageOffset = targetPage;
            loadStreamsData();
        }
    };

    window.jumpToPage = function(pageIndex) {
        if (pageIndex >= 0 && pageIndex < viewerTotalPages) {
            livePageOffset = pageIndex;
            loadStreamsData();
        }
    };

    window.jumpToLastPage = function() {
        if (viewerTotalPages > 0) {
            window.jumpToPage(viewerTotalPages - 1);
        }
    };

    window.changeCustomPageOffset = function(direction) {
        const { totalPages } = getCustomPaginationMeta();
        const targetPage = customPageOffset + direction;

        if (targetPage >= 0 && targetPage < totalPages) {
            customPageOffset = targetPage;
            if (typeof window.renderCustomVideoGrid === "function") window.renderCustomVideoGrid();
        }
    };

    window.jumpToCustomPage = function(pageIndex) {
        const { totalPages } = getCustomPaginationMeta();
        if (pageIndex >= 0 && pageIndex < totalPages) {
            customPageOffset = pageIndex;
            if (typeof window.renderCustomVideoGrid === "function") window.renderCustomVideoGrid();
        }
    };

    window.jumpToLastCustomPage = function() {
        const { totalPages } = getCustomPaginationMeta();
        if (totalPages > 0) {
            window.jumpToCustomPage(totalPages - 1);
        }
    };

    // Bulk delete active CCTV directory streams
    window.toggleSelectAllAdminStreams = function(isChecked) {
        const checkboxes = document.querySelectorAll(".admin-stream-checkbox");
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
        });
        window.updateSelectedAdminStreamsCount();
    };

    window.updateSelectedAdminStreamsCount = function() {
        const checkedBoxes = document.querySelectorAll(".admin-stream-checkbox:checked");
        const count = checkedBoxes.length;

        const countEl = document.getElementById("selected-streams-count");
        const btnEl = document.getElementById("delete-selected-streams-btn");
        
        const coordsCountEl = document.getElementById("selected-streams-coords-count");
        const coordsBtnEl = document.getElementById("set-selected-streams-coords-btn");

        const selectAllCB = document.getElementById("admin-streams-select-all");
        const allCBs = document.querySelectorAll(".admin-stream-checkbox");

        if (countEl) countEl.textContent = count;
        if (coordsCountEl) coordsCountEl.textContent = count;

        if (btnEl) {
            if (count > 0) {
                btnEl.classList.remove("hidden");
            } else {
                btnEl.classList.add("hidden");
            }
        }

        if (coordsBtnEl) {
            if (count > 0) {
                coordsBtnEl.classList.remove("hidden");
            } else {
                coordsBtnEl.classList.add("hidden");
            }
        }

        if (selectAllCB && allCBs.length > 0) {
            selectAllCB.checked = (count === allCBs.length);
        }
    };

    window.closeBulkCoordsModal = function() {
        const modal = document.getElementById("bulk-coords-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.setSelectedAdminStreamsCoords = function() {
        const checkedBoxes = document.querySelectorAll(".admin-stream-checkbox:checked");
        const count = checkedBoxes.length;
        if (count === 0) return;

        // Reset inputs
        const coordsInput = document.getElementById("bulk-cctv-coordinates");
        if (coordsInput) coordsInput.value = "";

        const countEl = document.getElementById("bulk-coords-target-count");
        if (countEl) countEl.textContent = count;

        const modal = document.getElementById("bulk-coords-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.handleBulkCoordsSubmit = async function(e) {
        e.preventDefault();

        const checkedBoxes = document.querySelectorAll(".admin-stream-checkbox:checked");
        if (checkedBoxes.length === 0) {
            window.closeBulkCoordsModal();
            return;
        }

        const newCoords = (document.getElementById("bulk-cctv-coordinates")?.value || "").trim();
        window.closeBulkCoordsModal();

        const btnEl = document.getElementById("set-selected-streams-coords-btn");
        if (btnEl) btnEl.disabled = true;

        let successCount = 0;
        let failCount = 0;
        let lastError = "";

        const promises = Array.from(checkedBoxes).map(async (cb) => {
            const streamId = parseInt(cb.value, 10);
            const stream = adminStreams.find(s => s.id == streamId);
            if (!stream) {
                console.error(`CCTV stream with ID ${streamId} not found in local adminStreams array.`);
                lastError = `CCTV stream dengan ID ${streamId} tidak ditemukan di memori lokal.`;
                failCount++;
                return;
            }

            const payload = {
                name: stream.name,
                rtsp_url: stream.rtsp_url || "",
                group_name: stream.group_name || "Default",
                coordinates: newCoords,
                is_active: stream.is_active !== undefined ? stream.is_active : true
            };

            try {
                const response = await fetch(`${API_URL}/admin/streams/${streamId}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${userToken}`
                    },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    successCount++;
                } else {
                    const errDetail = await response.json().catch(() => ({}));
                    const errMsg = errDetail.detail || `HTTP error ${response.status}`;
                    console.error(`Failed to update stream ${streamId}:`, errMsg);
                    lastError = typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg;
                    failCount++;
                }
            } catch (err) {
                console.error(`Network error updating stream ${streamId}:`, err);
                lastError = err.message || "Kesalahan jaringan";
                failCount++;
            }
        });

        await Promise.all(promises);

        if (btnEl) btnEl.disabled = false;

        if (failCount > 0) {
            alert(`Berhasil memperbarui koordinat untuk ${successCount} kamera. Gagal: ${failCount}.\nDetail Error Terakhir: ${lastError}`);
        } else {
            alert(`Berhasil memperbarui koordinat untuk ${successCount} kamera!`);
        }

        // Reset UI select all checkbox
        const selectAllCB = document.getElementById("admin-streams-select-all");
        if (selectAllCB) selectAllCB.checked = false;

        // Reload data
        if (typeof window.loadAdminData === "function") {
            window.loadAdminData({ keepPage: true });
        }
    };



    window.deleteSelectedAdminStreams = async function() {
        const checkedBoxes = document.querySelectorAll(".admin-stream-checkbox:checked");
        if (checkedBoxes.length === 0) return;

        if (!confirm(`Apakah Anda yakin ingin menghapus secara permanen ${checkedBoxes.length} kamera terpilih dari direktori?`)) return;

        const btnEl = document.getElementById("delete-selected-streams-btn");
        if (btnEl) btnEl.disabled = true;

        let successCount = 0;
        let failCount = 0;

        const promises = Array.from(checkedBoxes).map(async (cb) => {
            const streamId = parseInt(cb.value, 10);
            try {
                const response = await fetch(`${API_URL}/admin/streams/${streamId}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${userToken}` }
                });
                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (e) {
                failCount++;
            }
        });

        await Promise.all(promises);

        if (btnEl) btnEl.disabled = false;

        alert(`Berhasil menghapus ${successCount} kamera!${failCount > 0 ? ` (Gagal: ${failCount})` : ""}`);

        // Reset UI select all checkbox
        const selectAllCB2 = document.getElementById("admin-streams-select-all");
        if (selectAllCB2) selectAllCB2.checked = false;

        // Reload data
        if (typeof window.loadAdminData === "function") {
            window.loadAdminData({ keepPage: true });
        }
    };


    // Also update users badge when users table renders
    const _origRenderUsersTable = window.renderAdminUsersTable;

    // --- 8. WebRTC Live Telemetry Stats Loop ---
    async function updateWebRTCStatsLoop() {
        if (!window.peerConnections) return;
        for (const key of Object.keys(window.peerConnections)) {
            const pc = window.peerConnections[key];
            if (!pc || pc.connectionState !== "connected") continue;
            
            const parts = key.split("-");
            const streamId = parts[0];
            if (!streamId) continue;
            
            try {
                const stats = await pc.getStats();
                let fps = 0;
                let width = 0;
                let height = 0;
                let codec = "H264";
                
                stats.forEach(report => {
                    if (report.type === "inbound-rtp" && report.kind === "video") {
                        if (report.framesPerSecond !== undefined) {
                            fps = Math.round(report.framesPerSecond);
                        } else if (report.framesDecoded !== undefined) {
                            const prev = pc._prevFramesDecoded || 0;
                            const prevTime = pc._prevFramesTime || report.timestamp;
                            const deltaFrames = report.framesDecoded - prev;
                            const deltaTime = (report.timestamp - prevTime) / 1000;
                            if (deltaTime > 0) {
                                fps = Math.round(deltaFrames / deltaTime);
                            }
                            pc._prevFramesDecoded = report.framesDecoded;
                            pc._prevFramesTime = report.timestamp;
                        }
                        
                        if (report.frameWidth !== undefined) {
                            width = report.frameWidth;
                            height = report.frameHeight;
                        }
                    }
                    if (report.type === "codec") {
                        if (report.mimeType) {
                            codec = report.mimeType.split("/")[1] || codec;
                        }
                    }
                });
                
                if (width === 0) {
                    stats.forEach(report => {
                        if (report.type === "track" && report.kind === "video") {
                            if (report.frameWidth !== undefined) {
                                width = report.frameWidth;
                                height = report.frameHeight;
                            }
                        }
                    });
                }
                
                const fpsEl = document.getElementById(`cam-telemetry-fps-${streamId}`);
                const resEl = document.getElementById(`cam-telemetry-res-${streamId}`);
                const codecEl = document.getElementById(`cam-telemetry-codec-${streamId}`);
                
                if (fpsEl && fps > 0) {
                    fpsEl.textContent = fps.toFixed(1);
                }
                if (resEl && width > 0) {
                    resEl.textContent = `${width}x${height}`;
                }
                if (codecEl && codec) {
                    codecEl.textContent = codec.toUpperCase();
                }
            } catch (e) {
                // silent
            }
        }
    }
    
    // Start WebRTC stats polling loop
    setInterval(updateWebRTCStatsLoop, 2000);

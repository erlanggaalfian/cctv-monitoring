    // --- 2. Initializer ---
    function closeAllGridWebRTCConnections() {
        if (!window.peerConnections) return;
        Object.keys(window.peerConnections).forEach(key => {
            const isGridKey = key.startsWith("video-feed-") && !key.includes("popup");
            const isLegacyNumericKey = /^\d+$/.test(key);
            if (isGridKey || isLegacyNumericKey) {
                try {
                    window.peerConnections[key].close();
                    delete window.peerConnections[key];
                } catch (e) {
                    console.warn("Failed to close peer connection:", key, e);
                }
            }
        });
    }
    window.closeAllGridWebRTCConnections = closeAllGridWebRTCConnections;

    function getActiveGridContainer() {
        if (currentPage === "monitor") return document.getElementById("cctv-grid");
        if (currentPage === "custom") return document.getElementById("custom-cctv-grid");
        return null;
    }
    window.getActiveGridContainer = getActiveGridContainer;

    function getGridVideoElement(streamId, elementId = null) {
        if (elementId) return document.getElementById(elementId);
        const activeGrid = getActiveGridContainer();
        if (activeGrid) {
            if (currentPage === "custom") {
                return activeGrid.querySelector(`#custom-video-feed-${streamId}`);
            }
            return activeGrid.querySelector(`#video-feed-${streamId}`);
        }
        return document.getElementById(`video-feed-${streamId}`)
            || document.getElementById(`custom-video-feed-${streamId}`);
    }
    window.getGridVideoElement = getGridVideoElement;

    function getGridTileElement(streamId) {
        const activeGrid = getActiveGridContainer();
        if (activeGrid) {
            if (currentPage === "custom") {
                return activeGrid.querySelector(`#custom-cam-tile-${streamId}`);
            }
            return activeGrid.querySelector(`#cam-tile-${streamId}`);
        }
        return document.getElementById(`cam-tile-${streamId}`)
            || document.getElementById(`custom-cam-tile-${streamId}`);
    }
    window.getGridTileElement = getGridTileElement;

    function parseStreamIdFromTileId(tileId) {
        if (!tileId) return NaN;
        if (tileId.startsWith("custom-cam-tile-")) {
            return parseInt(tileId.slice("custom-cam-tile-".length), 10);
        }
        if (tileId.startsWith("cam-tile-")) {
            return parseInt(tileId.slice("cam-tile-".length), 10);
        }
        return NaN;
    }
    window.parseStreamIdFromTileId = parseStreamIdFromTileId;

    function queryGridTiles(gridContainer) {
        if (!gridContainer) return [];
        return [...gridContainer.querySelectorAll('[id^="cam-tile-"], [id^="custom-cam-tile-"]')];
    }
    window.queryGridTiles = queryGridTiles;

    function getStaticPosterUrl(streamId, fresh = false) {
        const bust = fresh ? Date.now() : (window._posterCacheBust || "");
        const qs = bust ? `?t=${bust}` : "";
        return `${window.location.origin}/static/posters/stream_${streamId}.jpg${qs}`;
    }

    function getApiPosterUrl(streamId, fresh = false) {
        const bust = fresh ? Date.now() : (window._posterCacheBust || Date.now());
        return `${API_URL}/posters/stream_${streamId}.jpg?t=${bust}`;
    }

    function getServerPosterUrls(streamId, fresh = false) {
        // /api/posters/ selalu lewat ProxyPass Apache; /static/ butuh patch terpisah
        return [getApiPosterUrl(streamId, fresh), getStaticPosterUrl(streamId, fresh)];
    }

    function getPrimaryServerPosterUrl(streamId) {
        if (posterMemoryCache[`server_${streamId}`]) {
            return posterMemoryCache[`server_${streamId}`];
        }
        return getApiPosterUrl(streamId);
    }
    window.getStaticPosterUrl = getStaticPosterUrl;
    window.getApiPosterUrl = getApiPosterUrl;
    window.getServerPosterUrls = getServerPosterUrls;
    window.getPrimaryServerPosterUrl = getPrimaryServerPosterUrl;

    function applyPosterImgWithFallback(img, tile, streamId) {
        if (!img) return;
        const candidates = getPosterCandidates(streamId);
        if (candidates.length === 0) return;
        let idx = 0;
        const tryLoad = () => {
            if (idx >= candidates.length) return;
            const url = candidates[idx++];
            img.onload = () => {
                rememberPosterUrl(streamId, url);
                posterMemoryCache[`server_${streamId}`] = url;
                if (tile) applyPosterBackground(tile, url);
                img.classList.remove("opacity-0");
                img.classList.add("opacity-100");
            };
            img.onerror = () => tryLoad();
            img.src = url;
        };
        tryLoad();
    }

    function setGridVideoWaiting(video) {
        if (!video) return;
        try { video.srcObject = null; } catch (e) {}
        video.classList.remove("opacity-100", "z-10");
        video.classList.add("opacity-0", "z-0", "pointer-events-none");
    }

    function setGridVideoLive(video) {
        if (!video) return;
        video.classList.remove("opacity-0", "z-0", "pointer-events-none");
        video.classList.add("opacity-100", "z-10");
    }
    window.setGridVideoWaiting = setGridVideoWaiting;
    window.setGridVideoLive = setGridVideoLive;

    function restoreTilePosterState(tile, streamId) {
        if (!tile || Number.isNaN(streamId)) return;
        const posterUrl = getPrimaryServerPosterUrl(streamId);
        applyPosterBackground(tile, posterUrl);

        const media = tile.querySelector(".cam-tile-media");
        if (media) {
            media.querySelectorAll(".cam-poster-skeleton").forEach(el => {
                el.classList.remove("opacity-0", "hidden");
                el.style.display = "";
            });
            const posterImg = media.querySelector('img[id^="poster-for-"]');
            if (posterImg) {
                posterImg.classList.remove("opacity-0", "hidden");
                posterImg.style.display = "";
                posterImg.classList.add("opacity-100");
                applyPosterImgWithFallback(posterImg, tile, streamId);
            }
        }

        const video = tile.querySelector("video");
        if (video) setGridVideoWaiting(video);

        const errOverlay = tile.querySelector(`#stream-error-${streamId}`);
        if (errOverlay) errOverlay.classList.add("hidden");
    }
    window.restoreTilePosterState = restoreTilePosterState;

    function resetAllGridVideosForPosterSwap() {
        ["cctv-grid", "custom-cctv-grid"].forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (!grid) return;
            grid.querySelectorAll("video").forEach(video => setGridVideoWaiting(video));
        });
    }

    function restorePostersInGrid(gridContainer) {
        if (!gridContainer) return;
        queryGridTiles(gridContainer).forEach(tile => {
            const streamId = parseStreamIdFromTileId(tile.id);
            if (Number.isNaN(streamId)) return;
            restoreTilePosterState(tile, streamId);
        });
    }
    window.restorePostersInGrid = restorePostersInGrid;

    function preloadServerPostersForGrid(gridContainer) {
        if (!gridContainer) return;
        restorePostersInGrid(gridContainer);
        queryGridTiles(gridContainer).forEach(tile => {
            const streamId = parseStreamIdFromTileId(tile.id);
            if (Number.isNaN(streamId)) return;

            const applyLoadedUrl = (url) => {
                if (typeof window.rememberPosterUrl === "function") {
                    window.rememberPosterUrl(streamId, url);
                }
                if (window.posterMemoryCache) {
                    window.posterMemoryCache[`server_${streamId}`] = url;
                }
                applyPosterBackground(tile, url);
                const tileImg = tile.querySelector('img[id^="poster-for-"]');
                if (tileImg) {
                    tileImg.src = url;
                    tileImg.classList.remove("opacity-0");
                    tileImg.classList.add("opacity-100");
                }
            };

            const urls = getServerPosterUrls(streamId);
            let urlIndex = 0;
            const tryPreload = () => {
                if (urlIndex >= urls.length) return;
                const url = urls[urlIndex++];
                const preloader = new Image();
                preloader.onload = () => applyLoadedUrl(url);
                preloader.onerror = () => tryPreload();
                preloader.src = url;
            };
            tryPreload();
        });
    }
    window.preloadServerPostersForGrid = preloadServerPostersForGrid;

    function clearInactiveGridDom(activePage) {
        // Keep grid tiles in DOM when hidden so posters reappear instantly on tab return.
        // Active grid is replaced atomically in renderVideoGrid / renderCustomVideoGrid.
    }

    let gridConnectScheduled = false;
    let gridScrollSweepTimer = null;

    function isMobileViewport() {
        return window.matchMedia("(max-width: 767px)").matches;
    }
    window.isMobileViewport = isMobileViewport;

    function getGridObserverRoot() {
        return document.getElementById("app-main") || document.querySelector("main");
    }
    window.getGridObserverRoot = getGridObserverRoot;

    function getGridObserverOptions() {
        if (isMobileViewport()) {
            return { rootMargin: "150px", threshold: 0.01 };
        }
        return { rootMargin: "120px", threshold: 0.05 };
    }
    window.getGridObserverOptions = getGridObserverOptions;

    function disconnectGridStreamTile(streamId) {
        const pcKey = getGridPeerConnectionKey(streamId);
        if (window.peerConnections?.[pcKey]) {
            try { window.peerConnections[pcKey].close(); } catch (e) {}
            delete window.peerConnections[pcKey];
        }
        const videoEl = getGridVideoElement(streamId);
        if (videoEl) {
            videoEl.srcObject = null;
            setGridVideoWaiting(videoEl);
            if (typeof window.restorePosterForVideo === "function") {
                window.restorePosterForVideo(streamId, videoEl);
            }
        }
    }
    window.disconnectGridStreamTile = disconnectGridStreamTile;

    function sweepOffscreenGridStreams() {
        if (isMobileViewport()) return; // Disable scroll sweeping/disconnects on mobile
        const gridContainer = getActiveGridContainer();
        if (!gridContainer) return;

        queryGridTiles(gridContainer).forEach(tile => {
            const streamId = parseStreamIdFromTileId(tile.id);
            if (Number.isNaN(streamId)) return;

            const rect = tile.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0
                && rect.bottom > 0
                && rect.top < window.innerHeight;

            if (!isVisible && hasActiveGridPeerConnection(streamId)) {
                disconnectGridStreamTile(streamId);
            }
        });
    }

    function bindGridScrollSweep() {
        if (window._gridScrollSweepBound) return;
        window._gridScrollSweepBound = true;
        window.addEventListener("scroll", () => {
            clearTimeout(gridScrollSweepTimer);
            gridScrollSweepTimer = setTimeout(() => {
                if (currentPage !== "monitor" && currentPage !== "custom") return;
                sweepOffscreenGridStreams();
                connectVisibleGridStreams();
            }, 60);
        }, { capture: true, passive: true });
    }

    function scheduleGridStreamConnect() {
        if (gridConnectScheduled) return;
        gridConnectScheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                gridConnectScheduled = false;
                if (currentPage !== "monitor" && currentPage !== "custom") return;
                if (typeof window.refreshGridIntersectionObserver === "function") window.refreshGridIntersectionObserver();
                connectVisibleGridStreams();
                sweepOffscreenGridStreams();
            });
        });
    }
    window.scheduleGridStreamConnect = scheduleGridStreamConnect;

    function getGridPeerConnectionKey(streamId) {
        return `video-feed-${streamId}`;
    }
    window.getGridPeerConnectionKey = getGridPeerConnectionKey;

    function getPeerConnectionKey(streamId, elementId = null) {
        return elementId || getGridPeerConnectionKey(streamId);
    }
    window.getPeerConnectionKey = getPeerConnectionKey;

    function hasActiveGridPeerConnection(streamId) {
        const pc = window.peerConnections?.[getGridPeerConnectionKey(streamId)];
        if (!pc) return false;
        const state = pc.connectionState;
        if (state === "closed" || state === "failed") return false;
        if (pc.signalingState === "closed") return false;
        return true;
    }

    function buildWhepCandidates(primaryUrl, streamId) {
        const stream = streamsData.find(s => s.id === streamId);
        const ordered = [];
        const add = (url) => {
            if (url && !ordered.includes(url)) ordered.push(url);
        };
        add(primaryUrl);
        if (stream) {
            add(stream.webrtc_url_sub);
            add(stream.webrtc_url);
        }
        return ordered;
    }
    window.buildWhepCandidates = buildWhepCandidates;

    function connectStreamToGridTile(stream) {
        if (!stream || stream.status === "offline") return;
        if (hasActiveGridPeerConnection(stream.id)) return;
        const tile = getGridTileElement(stream.id);
        if (tile) {
            if (typeof window.hideStreamErrorOverlay === "function") {
                window.hideStreamErrorOverlay(tile, stream.id);
            }
            restoreTilePosterState(tile, stream.id);
        }
        const primary = stream.webrtc_url_sub || stream.webrtc_url;
        if (typeof window.startNativeWebRTC === "function") {
            window.startNativeWebRTC(stream.id, buildWhepCandidates(primary, stream.id), null, true);
        }
    }
    window.connectStreamToGridTile = connectStreamToGridTile;

    function connectVisibleGridStreams() {
        const gridContainer = getActiveGridContainer();
        if (!gridContainer) return;

        const preloadMargin = 150;
        const isMobile = isMobileViewport();

        gridContainer.querySelectorAll('[id^="cam-tile-"], [id^="custom-cam-tile-"]').forEach(tile => {
            const streamId = parseStreamIdFromTileId(tile.id);
            if (Number.isNaN(streamId)) return;

            const stream = streamsData.find(s => s.id === streamId);
            if (!stream || stream.status === "offline") return;
            if (hasActiveGridPeerConnection(streamId)) return;

            const tileRect = tile.getBoundingClientRect();
            const isNearViewport = isMobile || (tileRect.width > 0 && tileRect.height > 0
                && tileRect.bottom >= -preloadMargin
                && tileRect.top <= window.innerHeight + preloadMargin);

            if (isNearViewport) {
                connectStreamToGridTile(stream);
            }
        });
    }

    window.navigateToPage = function(pageName, pushToHistory = true) {
        if (pageName === 'viewer') {
            pageName = 'monitor';
        }
        if (pageName !== "custom") {
        if (typeof window.exitWebFullscreen === "function") window.exitWebFullscreen();
        }
        if (pushToHistory) {
            history.pushState(null, "", "index.php?page=" + pageName);
        }
        currentPage = pageName;

        // 1. Hide all view sections, show the active one
        const views = ["monitor", "custom", "maps", "admin", "playback"];
        views.forEach(v => {
            const viewDiv = document.getElementById(`view-${v}`);
            if (viewDiv) {
                if (v === pageName) {
                    viewDiv.classList.remove("hidden");
                } else {
                    viewDiv.classList.add("hidden");
                }
            }
        });

        // 2. Update active style on sidebar links (Desktop)
        const links = {
            "monitor": document.getElementById("nav-viewer"),
            "custom": document.getElementById("nav-custom"),
            "maps": document.getElementById("nav-maps"),
            "admin": document.getElementById("nav-admin"),
            "playback": document.getElementById("nav-playback")
        };

        Object.keys(links).forEach(v => {
            const link = links[v];
            if (link) {
                link.classList.toggle("active", v === pageName);
            }
        });

        // 3. Update active style on mobile bottom nav links
        const mobileLinks = {
            "monitor": document.getElementById("mobile-nav-viewer"),
            "custom": document.getElementById("mobile-nav-custom"),
            "maps": document.getElementById("mobile-nav-maps"),
            "admin": document.getElementById("mobile-nav-admin"),
            "playback": document.getElementById("mobile-nav-playback")
        };

        Object.keys(mobileLinks).forEach(v => {
            const link = mobileLinks[v];
            if (link) {
                link.classList.toggle("active", v === pageName);
            }
        });

        // Poster dari /static/posters/ langsung saat tab aktif (sebelum putus WebRTC)
        const activeGridId = pageName === "monitor" ? "cctv-grid"
            : pageName === "custom" ? "custom-cctv-grid" : null;
        if (activeGridId) {
            const activeGrid = document.getElementById(activeGridId);
            if (activeGrid) preloadServerPostersForGrid(activeGrid);
        }

        if (typeof window.snapshotActiveGridPostersToCache === "function") {
            window.snapshotActiveGridPostersToCache();
        }
        closeAllGridWebRTCConnections();
        resetAllGridVideosForPosterSwap();
        ["cctv-grid", "custom-cctv-grid"].forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (grid) preloadServerPostersForGrid(grid);
        });
        clearInactiveGridDom(pageName);
        window.autoReconnects = {};

        if (pageName === "monitor") {
            const grid = document.getElementById("cctv-grid");
            // Re-hydrate cache to ensure we get All Cameras' paginated data
            if (typeof window.hydrateViewerFromSessionCache === "function") {
                window.hydrateViewerFromSessionCache();
            }
            if (streamsData.length > 0 && grid?.children.length && monitorGridMatchesStreams(streamsData)) {
                scheduleGridStreamConnect();
                if (typeof window.loadStreamsData === "function") window.loadStreamsData();
            } else {
                if (typeof window.loadStreamsData === "function") window.loadStreamsData();
            }
        } else if (pageName === "custom") {
            const grid = document.getElementById("custom-cctv-grid");
            // Reset streamsData to prevent cross-contamination from All Cameras
            streamsData = [];
            if (grid?.children.length && customGridMatchesStreams()) {
                scheduleGridStreamConnect();
            } else {
                if (typeof window.loadCustomMonitorData === "function") window.loadCustomMonitorData();
            }
        } else if (pageName === "admin") {
            if (typeof window.loadAdminData === "function") window.loadAdminData();
        } else if (pageName === "maps") {
            const bootMaps = () => {
                if (window.initMapPage) {
                    window.initMapPage();
                }
                if (window.refreshCctvMapLayout) {
                    window.refreshCctvMapLayout();
                } else if (window.leafletMap) {
                    window.leafletMap.invalidateSize({ animate: false });
                }
            };
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(bootMaps, 80);
                    setTimeout(bootMaps, 350);
                });
            });
        }
    };

    window.addEventListener("DOMContentLoaded", () => {
        window.autoReconnects = {};
        if (typeof window.bumpPosterCacheBust === "function") window.bumpPosterCacheBust();
        if (typeof window.syncThemeIcons === "function") window.syncThemeIcons();

        // Inject global marquee styles
        const adStyle = document.createElement("style");
        adStyle.innerHTML = `
            @keyframes marquee-scroll {
                0% { transform: translate3d(0, 0, 0); }
                100% { transform: translate3d(-50%, 0, 0); }
            }
            .marquee-wrapper {
                overflow: hidden;
                width: 100%;
                display: flex;
            }
            .marquee-track {
                display: flex;
                animation: marquee-scroll 25s linear infinite;
                white-space: nowrap;
                will-change: transform;
            }
            .marquee-item {
                padding-right: 2rem;
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(adStyle);

        // Fetch ad config globally for guest view tiles
        if ((userRole || "").toLowerCase() === "guest") {
            fetch(`${API_URL}/ad-config`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Failed to load ad config");
            })
            .then(data => {
                window.adConfigData = data;
                if (currentPage === "monitor") {
                    if (typeof renderVideoGrid === "function") renderVideoGrid();
                }
            })
            .catch(err => console.error("Error prefetching ad config:", err));
        }
        if (!userToken) {
            handleLogout();
            return;
        }

        // Setup profile details card in sidebar
        const profileName = document.getElementById("profile-name");
        const profileRole = document.getElementById("profile-role");
        const profileInitial = document.getElementById("profile-initial");

        if (profileName) profileName.textContent = username || "Operator";
        if (profileRole) profileRole.textContent = (userRole || "guest").toUpperCase();
        if (profileInitial) profileInitial.textContent = (username || "O").charAt(0).toUpperCase();

        // Render admin navigation link if role is administrator (both Desktop sidebar & Mobile bottom nav)
        const navAdmin = document.getElementById("nav-admin");
        if (navAdmin) {
            if ((userRole || "").toLowerCase() === "admin") {
                navAdmin.classList.remove("hidden");
            } else {
                navAdmin.classList.add("hidden");
            }
        }

        const mobileNavAdmin = document.getElementById("mobile-nav-admin");
        if (mobileNavAdmin) {
            if ((userRole || "").toLowerCase() === "admin") {
                mobileNavAdmin.classList.remove("hidden");
            } else {
                mobileNavAdmin.classList.add("hidden");
            }
        }

        // Always load sidebar stream directory for the "Stream Trees" component
        if (typeof window.loadSidebarData === "function") window.loadSidebarData();

        // Setup SPA Navigation click handlers for both Desktop and Mobile Navs
        const links = {
            "monitor": document.getElementById("nav-viewer"),
            "custom": document.getElementById("nav-custom"),
            "maps": document.getElementById("nav-maps"),
            "admin": document.getElementById("nav-admin"),
            "playback": document.getElementById("nav-playback")
        };

        const mobileLinks = {
            "monitor": document.getElementById("mobile-nav-viewer"),
            "custom": document.getElementById("mobile-nav-custom"),
            "maps": document.getElementById("mobile-nav-maps"),
            "admin": document.getElementById("mobile-nav-admin"),
            "playback": document.getElementById("mobile-nav-playback")
        };

        const bindLinkClick = (lnk, pageName) => {
            if (lnk) {
                lnk.addEventListener("click", (e) => {
                    e.preventDefault();
                    window.navigateToPage(pageName);
                });
            }
        };

        Object.keys(links).forEach(pageName => {
            bindLinkClick(links[pageName], pageName);
            bindLinkClick(mobileLinks[pageName], pageName);
        });

        // Listen for history popstate (Back/Forward buttons)
        window.addEventListener("popstate", () => {
            const params = new URLSearchParams(window.location.search);
            const targetPage = params.get("page") || "monitor";
            window.navigateToPage(targetPage, false);
        });

        // Initial page routing & loading (parallel — don't block grid on sidebar)
        if (currentPage === "monitor") {
            if (typeof window.hydrateViewerFromSessionCache === "function") {
                window.hydrateViewerFromSessionCache();
            }
        }
        if (typeof window.loadSidebarData === "function") window.loadSidebarData();
        window.navigateToPage(currentPage, false);

        // Start status auto-updater (polls status in background)
        if (typeof window.startStatusAutoUpdater === "function") window.startStatusAutoUpdater();

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState !== "visible") return;
            if (currentPage === "monitor" || currentPage === "custom") {
                scheduleGridStreamConnect();
            }
        });

        bindGridScrollSweep();
        window.addEventListener("resize", () => {
            clearTimeout(window._gridResizeTimer);
            window._gridResizeTimer = setTimeout(() => {
                if (currentPage !== "monitor" && currentPage !== "custom") return;
                setupGridIntersectionObserver();
                scheduleGridStreamConnect();
            }, 200);
        });
    });


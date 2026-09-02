<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>

<!-- Leaflet JS -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>


<!-- CCTV Maps Layout -->
<div id="tab-maps" class="page-layout page-layout--fill tab-view-bottom-space">

    <div class="layout-section layout-intro">
        <?php
        $tabIntroTitle = 'Peta Kamera';
        $tabIntroDesc = 'Visualisasi lokasi geografis kamera, posisi instalasi, dan status koneksi interaktif.';
        $tabIntroIcon = 'map';
        $tabIntroBadgeId = 'map-total-badge';
        $tabIntroBadge = '0';
        include __DIR__ . '/../includes/tab-intro-box.php';
        ?>
    </div>

    <div class="layout-body layout-body-maps">

    <div class="layout-section layout-sidebar maps-sidebar panel-card">
        <!-- Header & Search -->
        <div class="maps-sidebar-header">
            <div class="app-search-wrap">
                <span class="app-search-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                </span>
                <input type="text" id="map-search-input" oninput="filterMapCCTVList()"
                    placeholder="Cari kamera..."
                    class="app-input app-search-input app-input-sm">
            </div>
        </div>

        <!-- Camera List Panel (Scrollable) -->
        <div class="maps-camera-list" id="map-sidebar-cctv-list">
            <!-- Loading indicator -->
            <div class="flex items-center justify-center py-10 space-x-2 text-xs text-slate-400 dark:text-cyber-dim font-mono">
                <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>Loading...</span>
            </div>
        </div>
    </div>

    <div class="layout-section layout-main maps-canvas panel-card">
        <div id="main-cctv-map" class="maps-leaflet-host"></div>

        <!-- Legend overlay -->
        <div class="absolute bottom-4 left-4 z-[20] bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-cyber-outline/40 p-2.5 rounded shadow-lg text-[9px] font-mono text-slate-500 dark:text-cyber-dim select-none pointer-events-none">
            <div class="flex items-center space-x-1.5 mb-1"><span class="w-2 h-2 rounded-full bg-sky-500"></span><span>Kamera Aktif</span></div>
            <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-rose-500"></span><span>Kamera Offline</span></div>
        </div>
    </div>

    </div>

</div>

<!-- Inline JavaScript for Maps Page -->
<script>
document.addEventListener("DOMContentLoaded", () => {
    let map = null;
    let markers = {};
    let activeMarker = null;
    let mapStreams = [];
    window.lastFocusedCoords = null;


    // Dynamically ensures Leaflet is loaded before using it
    function ensureLeaflet(callback) {
        if (typeof L !== "undefined") {
            callback();
            return;
        }
        // Inject Leaflet CSS if not present
        if (!document.querySelector("link[href*='leaflet']")) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(link);
        }
        // Inject Leaflet JS
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = callback;
        script.onerror = () => console.error("Failed to load Leaflet.js dynamically.");
        document.head.appendChild(script);
    }

    // Helper to get coordinates safely
    function parseCoordinates(coordString) {
        if (!coordString || typeof coordString !== "string") return null;
        const trimmed = coordString.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(",");
        if (parts.length !== 2) return null;
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        return (!isNaN(lat) && !isNaN(lon)) ? [lat, lon] : null;
    }

    // Initialize Leaflet Map
    function ensureMapContainerReady() {
        const mapContainer = document.getElementById("main-cctv-map");
        const canvas = mapContainer?.closest(".maps-canvas");
        const viewMaps = document.getElementById("view-maps");
        if (!mapContainer || !canvas || viewMaps?.classList.contains("hidden")) {
            return false;
        }

        mapContainer.style.width = "100%";
        mapContainer.style.height = "100%";

        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.height > 40;
    }


    function invalidateMapSize(activeMap) {
        if (!activeMap) return;
        
        const doInvalidate = () => {
            activeMap.invalidateSize({ animate: false });
            
            // Re-fit bounds or center after size invalidation to prevent offset shifts
            if (window.lastFocusedCoords) {
                activeMap.setView(window.lastFocusedCoords, activeMap.getZoom(), { animate: false });
            } else if (mapStreams.length > 0) {
                const boundsList = [];
                mapStreams.forEach(s => {
                    const coords = parseCoordinates(s.coordinates);
                    if (coords) boundsList.push(L.latLng(coords[0], coords[1]));
                });
                if (boundsList.length > 1) {
                    const bounds = L.latLngBounds(boundsList);
                    activeMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false });
                } else if (boundsList.length === 1) {
                    activeMap.setView(boundsList[0], 14, { animate: false });
                }
            }
        };

        requestAnimationFrame(() => {
            doInvalidate();
            requestAnimationFrame(() => {
                doInvalidate();
            });
        });
        setTimeout(doInvalidate, 200);
        setTimeout(doInvalidate, 500);
    }


    function initMap(centerLat, centerLon, attempt = 0, fitBoundsList = null) {
        const mapContainer = document.getElementById("main-cctv-map");
        if (!mapContainer) return;

        if (!ensureMapContainerReady()) {
            if (attempt < 20) {
                setTimeout(() => initMap(centerLat, centerLon, attempt + 1, fitBoundsList), 100);
            }
            return;
        }

        if (map) {
            if (fitBoundsList && fitBoundsList.length > 1) {
                map.fitBounds(L.latLngBounds(fitBoundsList), { padding: [50, 50], maxZoom: 15, animate: false });
            } else {
                map.setView([centerLat, centerLon], 14, { animate: false });
            }
            invalidateMapSize(map);
            return;
        }

        map = L.map("main-cctv-map", {
            zoomControl: true,
            scrollWheelZoom: !window.matchMedia("(max-width: 767px)").matches,
            tap: true
        });
        window.leafletMap = map;

        map.on("zoomend", () => {
            plotMarkers(mapStreams);
        });

        const isDark = document.documentElement.classList.contains("dark");
        window.leafletTileLayer = L.tileLayer(
            isDark 
                ? window.CARTO_DARK
                : window.CARTO_LIGHT, 
            {
                attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors &copy; <a href='https://carto.com/attributions'>CARTO</a>",
                maxZoom: 19
            }
        ).addTo(map);

        if (fitBoundsList && fitBoundsList.length > 1) {
            map.fitBounds(L.latLngBounds(fitBoundsList), { padding: [50, 50], maxZoom: 15, animate: false });
        } else {
            map.setView([centerLat, centerLon], 14, { animate: false });
        }

        invalidateMapSize(map);

        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => invalidateMapSize(map));
            ro.observe(mapContainer.closest(".maps-canvas") || mapContainer);
        }
    }


    window.refreshCctvMapLayout = function() {
        ensureMapContainerReady();
        if (map) {
            invalidateMapSize(map);
        }
    };

    window.initMapPage = loadMapData;

    // Load CCTV streams with coordinates
    async function loadMapData() {
        const token = localStorage.getItem("cctv_auth_token");
        if (!token) return;

        try {
            // Fetch streams from API endpoint (same endpoint used by app.js)
            const apiUrl = window.location.origin + "/api";
            const response = await fetch(`${apiUrl}/streams?limit=1000&no_check=true`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const responseData = await response.json();
            const streams = responseData.items || [];

            // Filter streams that have valid coordinates
            mapStreams = streams.filter(s => {
                return parseCoordinates(s.coordinates) !== null;
            });

            // Update total badge
            const totalBadge = document.getElementById("map-total-badge");
            if (totalBadge) totalBadge.textContent = mapStreams.length;

            renderSidebarList(mapStreams);

            if (mapStreams.length > 0) {
                ensureLeaflet(() => {
                    const boundsList = [];
                    mapStreams.forEach(s => {
                        const coords = parseCoordinates(s.coordinates);
                        if (coords) {
                            boundsList.push(L.latLng(coords[0], coords[1]));
                        }
                    });

                    const firstCoords = boundsList.length > 0 
                        ? [boundsList[0].lat, boundsList[0].lng] 
                        : [-6.208763, 106.845599];

                    initMap(firstCoords[0], firstCoords[1], 0, boundsList);
                    plotMarkers(mapStreams);
                });
            } else {
                // Default coordinates if no cameras have coordinates
                ensureLeaflet(() => {
                    initMap(-6.208763, 106.845599); // Jakarta Central
                });
                document.getElementById("map-sidebar-cctv-list").innerHTML = `
                    <div class="py-12 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                        <p class="font-bold">TIDAK ADA KAMERA TERPETAKAN</p>
                        <p class="text-[10px] text-slate-500 mt-2">Gunakan menu System Admin untuk menambahkan koordinat GPS pada kamera Anda.</p>
                    </div>`;
            }

        } catch (error) {
            console.error("Maps data fetch error:", error);
            document.getElementById("map-sidebar-cctv-list").innerHTML = `
                <div class="py-12 text-center text-xs text-rose-500 font-mono">
                    <p class="font-bold">Gagal memuat data CCTV.</p>
                    <p class="text-[10px] mt-1 text-rose-400/80">${error.message || error}</p>
                </div>`;
        }
    }

    // Calculate precise distance between two coordinates in meters (Haversine formula)
    function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    // Get all cameras within 100 meters of target stream
    function getNearbyCameras(targetStream, allStreams) {
        const targetCoords = parseCoordinates(targetStream.coordinates);
        if (!targetCoords) return [targetStream];
        
        const [targetLat, targetLon] = targetCoords;
        
        return allStreams.filter(s => {
            const coords = parseCoordinates(s.coordinates);
            if (!coords) return false;
            const [lat, lon] = coords;
            return calculateDistanceInMeters(targetLat, targetLon, lat, lon) <= 100;
        });
    }

    // Group streams into clusters dynamically based on current zoom pixel distance
    function clusterStreamsByDistance(streams) {
        if (!map) {
            // Fallback if map is not ready yet
            const clusters = [];
            streams.forEach(stream => {
                const coords = parseCoordinates(stream.coordinates);
                if (!coords) return;
                clusters.push({
                    lat: coords[0],
                    lon: coords[1],
                    streams: [stream]
                });
            });
            return clusters;
        }

        const clusters = [];
        const pixelThreshold = 50; // pixels distance threshold for clustering
        
        streams.forEach(stream => {
            const coords = parseCoordinates(stream.coordinates);
            if (!coords) return;
            
            const latLng = L.latLng(coords[0], coords[1]);
            const point = map.latLngToLayerPoint(latLng);
            
            let assignedCluster = null;
            for (let cluster of clusters) {
                const clusterLatLng = L.latLng(cluster.lat, cluster.lon);
                const clusterPoint = map.latLngToLayerPoint(clusterLatLng);
                const dx = point.x - clusterPoint.x;
                const dy = point.y - clusterPoint.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= pixelThreshold) {
                    assignedCluster = cluster;
                    break;
                }
            }
            
            if (assignedCluster) {
                assignedCluster.streams.push(stream);
            } else {
                clusters.push({
                    lat: coords[0],
                    lon: coords[1],
                    streams: [stream]
                });
            }
        });
        
        return clusters;
    }


    // Plot Markers on Map
    function plotMarkers(streams) {
        // Clear existing markers
        for (let id in markers) {
            map.removeLayer(markers[id]);
        }
        markers = {};

        // Group into clusters of <= 100m
        const clusters = clusterStreamsByDistance(streams);

        clusters.forEach(cluster => {
            const count = cluster.streams.length;
            const firstStream = cluster.streams[0];
            
            const anyOnline = cluster.streams.some(s => s.status === "online");
            const color = anyOnline ? "#0ea5e9" : "#ef4444"; // sky-500 vs rose-500

            // If more than 1 camera in this location, show a red badge with the count
            const badgeHtml = count > 1 
                ? `<div style="position:absolute;top:-6px;right:-6px;background:#f43f5e;color:white;border-radius:50%;width:18px;height:18px;font-size:9px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:1.5px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);z-index:9999;">${count}</div>`
                : "";

            // DivIcon matching our CSS theme with optional cluster badge
            const markerIcon = L.divIcon({
                className: "",
                html: `<div id="marker-pin-${firstStream.id}" class="transition-transform duration-200 relative" style="background:${color};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
                    <svg width="16" height="16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    ${badgeHtml}
                </div>`,
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                popupAnchor: [0, -20]
            });

            const marker = L.marker([cluster.lat, cluster.lon], { icon: markerIcon }).addTo(map);

            // Create Leaflet popup content listing all cameras in this cluster
            let cameraListHtml = "";
            cluster.streams.forEach(s => {
                const statusColor = s.status === "online" ? "text-emerald-500" : "text-rose-500";
                const streamJson = JSON.stringify(s).replace(/"/g, '&quot;');
                const sequenceJson = JSON.stringify(cluster.streams).replace(/"/g, '&quot;');
                cameraListHtml += `
                    <div class="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-cyber-outline/20">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="font-bold text-[10px] truncate max-w-[120px] text-slate-800 dark:text-slate-200" title="${s.name}">${s.name}</span>
                            <span class="text-[8px] uppercase ${statusColor} font-mono">${s.status.toUpperCase()}</span>
                        </div>
                        <button onclick="window.openCameraPopup(${streamJson}, ${sequenceJson})" 
                            class="px-2 py-0.5 bg-sky-500 hover:bg-sky-600 text-white rounded text-[9px] font-bold uppercase transition-colors shrink-0 ml-2">
                            👁️ View
                        </button>
                    </div>
                `;
            });

            const popupContent = `
                <div class="font-mono text-xs text-slate-800 p-1" style="min-w: 220px;">
                    <div class="font-bold border-b pb-1 mb-1.5 text-[11px] text-sky-600 uppercase">
                        ${count > 1 ? `Cluster: ${count} Kamera` : `Lokasi Kamera`}
                    </div>
                    <div class="space-y-1 mb-2 max-h-48 overflow-y-auto">
                        ${cameraListHtml}
                    </div>
                    ${count > 1 ? `
                    <div class="text-center pt-1.5 border-t border-slate-100">
                        <button onclick="window.openCameraPopup(${JSON.stringify(cluster.streams[0]).replace(/"/g, '&quot;')}, ${JSON.stringify(cluster.streams).replace(/"/g, '&quot;')})" 
                            class="inline-block w-full text-center px-2.5 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded text-[9px] font-bold uppercase transition-colors">
                            Lihat Semua Live Feed
                        </button>
                    </div>` : ''}
                </div>
            `;

            marker.bindPopup(popupContent, { autoPan: false });


            // Clicking marker activates list item for the first camera, and also opens custom popup directly if single!
            marker.on("click", () => {
                highlightListItem(firstStream.id);
                window.lastFocusedCoords = [cluster.lat, cluster.lon];
                if (count === 1 && window.openCameraPopup) {
                    window.openCameraPopup(firstStream, cluster.streams);
                }
            });


            // Map all stream IDs in this cluster to this single marker
            cluster.streams.forEach(s => {
                markers[s.id] = marker;
            });
        });

        // Open popup for the focused camera if it exists after re-clustering
        if (window.focusedCameraId && markers[window.focusedCameraId]) {
            markers[window.focusedCameraId].openPopup();
            window.focusedCameraId = null; // Clear it to prevent reopening unexpectedly
        }
    }



    // Highlight selected list item and center list scrolling
    function highlightListItem(streamId) {
        // Remove active class from all items
        document.querySelectorAll(".map-cctv-item").forEach(item => {
            item.classList.remove("border-sky-500", "bg-sky-50/50", "dark:bg-cyber-primary/5", "dark:border-cyber-primary/50");
            item.classList.add("border-slate-200/60", "dark:border-cyber-outline/35");
        });

        // Add active classes to selected
        const activeItem = document.getElementById(`map-item-${streamId}`);
        if (activeItem) {
            activeItem.classList.remove("border-slate-200/60", "dark:border-cyber-outline/35");
            activeItem.classList.add("border-sky-500", "bg-sky-50/50", "dark:bg-cyber-primary/5", "dark:border-cyber-primary/50");
            activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    // Render CCTV list inside maps page sidebar
    function renderSidebarList(streams) {
        const container = document.getElementById("map-sidebar-cctv-list");
        if (!container) return;
        container.innerHTML = "";

        if (streams.length === 0) {
            container.innerHTML = `
                <div class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                    <span>Kamera tidak ditemukan</span>
                </div>`;
            return;
        }

        // Group streams by group_name
        const groups = {};
        streams.forEach(s => {
            const grp = s.group_name || "Default";
            if (!groups[grp]) groups[grp] = [];
            groups[grp].push(s);
        });

        // Sort group names
        const sortedGroups = Object.keys(groups).sort();

        sortedGroups.forEach(groupName => {
            // Group Header
            const groupHeader = document.createElement("div");
            groupHeader.className = "text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/60 pl-1 mt-4 mb-2 font-mono flex justify-between items-center";
            groupHeader.innerHTML = `
                <span>📁 ${groupName}</span>
                <span class="px-1.5 py-0.2 bg-slate-100 dark:bg-cyber-bg/50 rounded font-mono text-[9px] text-slate-500 dark:text-cyber-dim font-bold">${groups[groupName].length}</span>
            `;
            container.appendChild(groupHeader);

            // Group Cameras
            groups[groupName].forEach(stream => {
                const item = document.createElement("div");
                item.id = `map-item-${stream.id}`;
                item.className = "map-cctv-item flex items-start space-x-3 p-3 bg-white dark:bg-cyber-container/30 border border-slate-200/60 dark:border-cyber-outline/35 rounded-md hover:border-sky-400 dark:hover:border-cyber-primary/50 cursor-pointer transition-all duration-150";
                
                const dotColor = stream.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500";
                
                item.innerHTML = `
                    <span class="w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColor}"></span>
                    <div class="flex-1 min-w-0 font-mono text-xs">
                        <div class="font-bold text-slate-800 dark:text-white truncate">${stream.name}</div>
                        <div class="text-[9px] text-slate-400 dark:text-cyber-dim/60 mt-1 select-all truncate">${stream.coordinates}</div>
                    </div>
                `;

                // Handle click on list item
                item.addEventListener("click", () => {
                    focusCamera(stream);
                });

                container.appendChild(item);
            });
        });
    }

    // Center map on camera and open popup
    function focusCamera(stream) {
        const coords = parseCoordinates(stream.coordinates);
        if (!coords) return;

        highlightListItem(stream.id);

        if (map) {
            window.focusedCameraId = stream.id; // Track focused camera id
            map.setView(coords, 16, { animate: false });
            if (markers[stream.id]) {
                markers[stream.id].openPopup();
            }


            // Directly show live feed of nearby cameras (within 100m)
            const nearby = getNearbyCameras(stream, mapStreams);
            if (window.openCameraPopup) {
                window.openCameraPopup(stream, nearby);
            }
        }
    }


    // Filter list search function
    window.filterMapCCTVList = function() {
        const query = (document.getElementById("map-search-input")?.value || "").toLowerCase().trim();
        
        const filtered = mapStreams.filter(stream => {
            return (stream.name || "").toLowerCase().includes(query) ||
                   (stream.group_name || "").toLowerCase().includes(query) ||
                   (stream.coordinates || "").toLowerCase().includes(query);
        });

        renderSidebarList(filtered);
    };

    // Load only when maps tab is visible on first paint
    const initialPage = new URLSearchParams(window.location.search).get("page") || "monitor";
    if (initialPage === "maps" && !document.getElementById("view-maps")?.classList.contains("hidden")) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setTimeout(loadMapData, 80));
        });
    }
});
</script>


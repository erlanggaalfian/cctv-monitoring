    // --- 7. Camera Map Modal (Leaflet OpenStreetMap) ---
    let leafletMap = null;
    let leafletMarker = null;
    window.leafletTileLayerModal = null;

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

    function initLeafletMap(mapEl, lat, lon, stream) {
        try {
            if (!leafletMap) {
                leafletMap = L.map(mapEl, {
                    zoomControl: true,
                    scrollWheelZoom: true
                }).setView([lat, lon], 16);

                const isDark = document.documentElement.classList.contains("dark");
                window.leafletTileLayerModal = L.tileLayer(
                    isDark 
                        ? window.CARTO_DARK
                        : window.CARTO_LIGHT, 
                    {
                        attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors &copy; <a href='https://carto.com/attributions'>CARTO</a>",
                        maxZoom: 19
                    }
                ).addTo(leafletMap);
            } else {
                leafletMap.setView([lat, lon], 16);
                const isDark = document.documentElement.classList.contains("dark");
                if (window.leafletTileLayerModal) {
                    window.leafletTileLayerModal.setUrl(
                        isDark 
                            ? window.CARTO_DARK
                            : window.CARTO_LIGHT
                    );
                }
            }

            // Remove old marker
            if (leafletMarker) leafletMap.removeLayer(leafletMarker);

            // Custom camera icon
            const cameraIcon = L.divIcon({
                className: "",
                html: `<div style="background:#0ea5e9;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
                    <svg width="16" height="16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </div>`,
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                popupAnchor: [0, -20]
            });

            leafletMarker = L.marker([lat, lon], { icon: cameraIcon })
                .addTo(leafletMap)
                .bindPopup(`<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif;font-size:12px;"><strong>${stream.name}</strong><br><span style="color:#0ea5e9;font-size:10px;">${stream.group_name || ""}</span><br><span style="color:#94a3b8;font-size:10px;">${stream.coordinates}</span></div>`)
                .openPopup();

            leafletMap.invalidateSize();
        } catch (err) {
            console.error("Leaflet map init error:", err);
            // If map already initialized on this container, destroy and retry once
            if (leafletMap) {
                try { leafletMap.remove(); } catch(e) {}
                leafletMap = null;
                leafletMarker = null;
                try {
                    initLeafletMap(mapEl, lat, lon, stream);
                } catch(e2) {
                    console.error("Leaflet retry failed:", e2);
                }
            }
        }
    }

    window.openMapModal = function(streamId) {
        const stream = adminStreams.find(s => s.id === streamId);
        if (!stream) return;

        const modal = document.getElementById("map-modal");
        const titleEl = document.getElementById("map-modal-title");
        const groupEl = document.getElementById("map-modal-group");
        const coordsEl = document.getElementById("map-modal-coords");
        const gmapsLink = document.getElementById("map-gmaps-link");

        if (titleEl) titleEl.textContent = stream.name;
        if (groupEl) groupEl.textContent = stream.group_name ? `Group: ${stream.group_name}` : "—";
        if (coordsEl) coordsEl.textContent = stream.coordinates || "No coordinates configured";

        // Parse lat/lon — supports both "lat,lon" and "lat, lon"
        let lat = null, lon = null;
        const rawCoords = (stream.coordinates || "").trim();
        if (rawCoords) {
            const parts = rawCoords.split(",");
            if (parts.length === 2) {
                lat = parseFloat(parts[0].trim());
                lon = parseFloat(parts[1].trim());
                if (isNaN(lat) || isNaN(lon)) { lat = null; lon = null; }
            }
        }

        // Google Maps link
        if (gmapsLink) {
            if (lat !== null && lon !== null) {
                gmapsLink.href = `https://www.google.com/maps?q=${lat},${lon}`;
                gmapsLink.classList.remove("hidden");
                gmapsLink.classList.add("flex");
            } else {
                gmapsLink.classList.add("hidden");
                gmapsLink.classList.remove("flex");
            }
        }

        if (modal) modal.classList.remove("hidden");

        // Render map after modal is visible
        setTimeout(() => {
            const mapEl = document.getElementById("camera-leaflet-map");
            if (!mapEl) return;

            if (lat !== null && lon !== null) {
                // Use ensureLeaflet to guarantee L is available
                ensureLeaflet(() => {
                    initLeafletMap(mapEl, lat, lon, stream);
                });
            } else {
                // No valid coordinates — show placeholder
                if (leafletMap) {
                    try { leafletMap.remove(); } catch(e) {}
                    leafletMap = null;
                    leafletMarker = null;
                }
                mapEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#0f1729;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif;gap:10px;">
                    <svg width="40" height="40" fill="none" stroke="#334155" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span style="font-size:12px;">No coordinates configured for this camera</span>
                    <span style="font-size:10px;color:#334155;">Edit the camera and add GPS coordinates to enable map view</span>
                </div>`;
            }
        }, 150);
    };

    window.closeMapModal = function() {
        const modal = document.getElementById("map-modal");
        if (modal) modal.classList.add("hidden");
    };


    // --- 5. System Administration Operations ---
    async function loadAdminData(options = {}) {
        if (!window.bolehKelola(userRole)) {
            renderNonAdminAccessNotice();
            return;
        }

        // Bagian yang menyentuh seluruh mesin ditutup bagi Admin. Servernya
        // sudah menolak dengan 403; ini mencegah tombol yang hanya berujung
        // galat tanpa penjelasan.
        if (!window.kuasaPenuh(userRole)) {
            ["scanner", "ads"].forEach(tab => {
                const btn = document.getElementById(`admin-subtab-btn-${tab}`);
                if (btn) btn.classList.add("hidden");
                const isi = document.getElementById(`admin-subtab-${tab}`);
                if (isi) isi.classList.add("hidden");
            });
            // Log akses API mencakup seluruh sistem, bukan hanya kunci
            // miliknya sendiri.
            const bagianLog = document.getElementById("api-log-section");
            if (bagianLog) bagianLog.classList.add("hidden");
        }

        // Reset bulk delete UI state
        const selectAllCB = document.getElementById("admin-streams-select-all");
        if (selectAllCB) selectAllCB.checked = false;
        const delBtn = document.getElementById("delete-selected-streams-btn");
        if (delBtn) delBtn.classList.add("hidden");
        const coordsBtn = document.getElementById("set-selected-streams-coords-btn");
        if (coordsBtn) coordsBtn.classList.add("hidden");

        // 1. Load Streams
        try {
            const streamsRes = await fetch(`${API_URL}/admin/streams`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (streamsRes.status === 401) { window.handleLogout(); return; }
            if (streamsRes.ok) {
                adminStreams = await streamsRes.json();
                renderAdminStreamsTable(options);
            }
        } catch (err) {
            console.error("Gagal memuat stream directory:", err);
            const tableBody = document.getElementById("admin-streams-table-body");
            if (tableBody) {
                tableBody.innerHTML = `<tr class="stream-status-row"><td colspan="9">
                    <div class="w-full flex flex-col items-center justify-center text-center py-12 px-4 bg-gray-50 dark:bg-cyber-bg rounded-xl border border-gray-100 dark:border-cyber-outline/30">
                        <svg class="w-8 h-8 text-rose-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
                        <span class="text-sm font-medium text-gray-500 dark:text-cyber-dim">Failed to load camera directory</span>
                    </div>
                </td></tr>`;
            }
        }

        // 2. Load Console Users
        try {
            const usersRes = await fetch(`${API_URL}/admin/users`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (usersRes.status === 401) { window.handleLogout(); return; }
            if (usersRes.ok) {
                adminUsers = await usersRes.json();
                renderAdminUsersTable();
            }
        } catch (err) {
            console.error("Gagal memuat console users:", err);
        }

        // 3. Load Ad Config
        try {
            const adRes = await fetch(`${API_URL}/ad-config`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (adRes.ok) {
                const adData = await adRes.json();
                
                const adActive = document.getElementById("ad-active");
                const adImageUrl = document.getElementById("ad-image-url");
                const adBgColor = document.getElementById("ad-bg-color");
                const adBgColorText = document.getElementById("ad-bg-color-text");
                const adMarqueeText = document.getElementById("ad-marquee-text");
                const adImagePreview = document.getElementById("ad-image-preview");
                const adImagePlaceholder = document.getElementById("ad-image-placeholder");

                if (adActive) adActive.checked = adData.is_active;
                if (adImageUrl) adImageUrl.value = adData.image_url || "";
                if (adBgColor) adBgColor.value = adData.bg_color || "#1e293b";
                if (adBgColorText) adBgColorText.value = adData.bg_color || "#1E293B";

                const adTextColor = document.getElementById("ad-text-color");
                const adTextColorText = document.getElementById("ad-text-color-text");
                if (adTextColor) adTextColor.value = adData.text_color || "#ffffff";
                if (adTextColorText) adTextColorText.value = adData.text_color || "#FFFFFF";

                if (adMarqueeText) adMarqueeText.value = adData.marquee_text || "";
                
                const adScrollSpeed = document.getElementById("ad-scroll-speed");
                const adScrollSpeedVal = document.getElementById("ad-scroll-speed-val");
                if (adScrollSpeed) adScrollSpeed.value = adData.scroll_speed !== undefined ? adData.scroll_speed : 5;
                if (adScrollSpeedVal) adScrollSpeedVal.textContent = adData.scroll_speed !== undefined ? adData.scroll_speed : 5;
                
                const adFontSize = document.getElementById("ad-font-size");
                const adFontSizeVal = document.getElementById("ad-font-size-val");
                if (adFontSize) adFontSize.value = adData.font_size !== undefined ? adData.font_size : 10;
                if (adFontSizeVal) adFontSizeVal.textContent = (adData.font_size !== undefined ? adData.font_size : 10) + "px";

                const adFontFamily = document.getElementById("ad-font-family");
                if (adFontFamily) adFontFamily.value = adData.font_family || "monospace";

                const adImageOpacity = document.getElementById("ad-image-opacity");
                const adImageOpacityVal = document.getElementById("ad-image-opacity-val");
                const imgOpacityPercent = Math.round((adData.image_opacity !== undefined ? adData.image_opacity : 1.0) * 100);
                if (adImageOpacity) adImageOpacity.value = imgOpacityPercent;
                if (adImageOpacityVal) adImageOpacityVal.textContent = imgOpacityPercent + "%";

                const adBgOpacity = document.getElementById("ad-bg-opacity");
                const adBgOpacityVal = document.getElementById("ad-bg-opacity-val");
                const bgOpacityPercent = Math.round((adData.bg_opacity !== undefined ? adData.bg_opacity : 1.0) * 100);
                if (adBgOpacity) adBgOpacity.value = bgOpacityPercent;
                if (adBgOpacityVal) adBgOpacityVal.textContent = bgOpacityPercent + "%";

                const adTextOpacity = document.getElementById("ad-text-opacity");
                const adTextOpacityVal = document.getElementById("ad-text-opacity-val");
                const textOpacityPercent = Math.round((adData.text_opacity !== undefined ? adData.text_opacity : 1.0) * 100);
                if (adTextOpacity) adTextOpacity.value = textOpacityPercent;
                if (adTextOpacityVal) adTextOpacityVal.textContent = textOpacityPercent + "%";

                const adBoxWidth = document.getElementById("ad-box-width");
                const adBoxWidthVal = document.getElementById("ad-box-width-val");
                const boxWidthPercent = adData.box_width !== undefined ? adData.box_width : 100;
                if (adBoxWidth) adBoxWidth.value = boxWidthPercent;
                if (adBoxWidthVal) adBoxWidthVal.textContent = boxWidthPercent + "%";

                const adTextAlign = document.getElementById("ad-text-align");
                if (adTextAlign) adTextAlign.value = adData.text_align || "left";

                const adImageSize = document.getElementById("ad-image-size");
                const adImageSizeVal = document.getElementById("ad-image-size-val");
                const imageSizeVal = adData.image_height !== undefined ? adData.image_height : 20;
                if (adImageSize) adImageSize.value = imageSizeVal;
                if (adImageSizeVal) adImageSizeVal.textContent = imageSizeVal + "px";
                
                if (adImagePreview && adImagePlaceholder) {
                    if (adData.image_url) {
                        adImagePreview.src = adData.image_url;
                        adImagePreview.classList.remove("hidden");
                        adImagePlaceholder.classList.add("hidden");
                    } else {
                        adImagePreview.src = "";
                        adImagePreview.classList.add("hidden");
                        adImagePlaceholder.classList.remove("hidden");
                    }
                }
                const embedClickToPlay = document.getElementById("embed-click-to-play");
                const embedTimeoutSeconds = document.getElementById("embed-timeout-seconds");
                const embedTimeoutValDesc = document.getElementById("embed-timeout-val-desc");

                if (embedClickToPlay) embedClickToPlay.checked = adData.click_to_play !== undefined ? adData.click_to_play : true;
                if (embedTimeoutSeconds) {
                    const seconds = adData.embed_timeout_seconds !== undefined ? adData.embed_timeout_seconds : 300;
                    embedTimeoutSeconds.value = seconds;
                    if (embedTimeoutValDesc) {
                        if (seconds <= 0) { embedTimeoutValDesc.textContent = 'Nonaktif'; }
                        else if (seconds >= 3600) { embedTimeoutValDesc.textContent = (seconds/3600).toFixed(1) + ' Jam'; }
                        else if (seconds >= 60) { embedTimeoutValDesc.textContent = (seconds/60).toFixed(1) + ' Menit'; }
                        else { embedTimeoutValDesc.textContent = seconds + ' Detik'; }
                    }
                }

                if (typeof window.updateLiveAdPreview === "function") {
                    window.updateLiveAdPreview();
                }
            }
        } catch (adErr) {
            console.error("Gagal memuat konfigurasi iklan:", adErr);
        }

        // 4. Load API Keys Badge & Data
        try {
            const apiRes = await fetch(`${API_URL}/admin/api-keys`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (apiRes.ok) {
                const keys = await apiRes.json();
                adminApiKeys = keys;
                const apiBadge = document.getElementById("admin-subtab-api-badge");
                if (apiBadge) apiBadge.textContent = keys.length;
            }
        } catch (apiErr) {
            console.error("Gagal memuat badge kunci API:", apiErr);
        }
    }
    window.loadAdminData = loadAdminData;
    document.addEventListener("DOMContentLoaded", () => {
        if (window.terapkanBatasTabAdmin) window.terapkanBatasTabAdmin();
    });

    function renderAdminStreamsTable(options = {}) {
        // Update streams count badge
        const streamsBadge = document.getElementById("admin-subtab-streams-badge");
        if (streamsBadge) streamsBadge.textContent = adminStreams.length;

        // Populate group filter dropdown
        const groupFilter = document.getElementById("stream-group-filter");
        if (groupFilter) {
            const currentVal = groupFilter.value;
            const groups = [...new Set(adminStreams.map(s => s.group_name).filter(Boolean))].sort();
            groupFilter.innerHTML = '<option value="">All Groups</option>';
            groups.forEach(g => {
                const opt = document.createElement("option");
                opt.value = g;
                opt.textContent = g;
                if (g === currentVal) opt.selected = true;
                groupFilter.appendChild(opt);
            });
        }

        // Populate existing groups datalist for modal input autocomplete
        const existingGroupsDatalist = document.getElementById("existing-groups-list");
        if (existingGroupsDatalist) {
            const groups = [...new Set(adminStreams.map(s => s.group_name).filter(Boolean))].sort();
            existingGroupsDatalist.innerHTML = "";
            groups.forEach(g => {
                const opt = document.createElement("option");
                opt.value = g;
                existingGroupsDatalist.appendChild(opt);
            });
        }

        // Delegate to filter function (which handles actual row rendering)
        filterStreamsTable(options);

    }

    window.filterStreamsTable = function(options = {}) {
        const searchVal = (document.getElementById("stream-search-input")?.value || "").toLowerCase().trim();
        const groupVal = document.getElementById("stream-group-filter")?.value || "";
        const statusVal = document.getElementById("stream-status-filter")?.value || "";
        const isFiltered = !!(searchVal || groupVal || statusVal);

        // Show/hide clear button
        const clearBtn = document.getElementById("stream-filter-clear");
        if (clearBtn) {
            if (isFiltered) clearBtn.classList.remove("hidden");
            else clearBtn.classList.add("hidden");
        }

        const filtered = adminStreams.filter(stream => {
            const nameMatch = !searchVal ||
                (stream.name || "").toLowerCase().includes(searchVal) ||
                (stream.rtsp_url || "").toLowerCase().includes(searchVal) ||
                (stream.group_name || "").toLowerCase().includes(searchVal);
            const groupMatch = !groupVal || stream.group_name === groupVal;
            const statusMatch = !statusVal || (stream.status || "offline") === statusVal;
            return nameMatch && groupMatch && statusMatch;
        });

        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_STREAMS_PAGE_SIZE));

        if (!options.keepPage) {
            adminStreamsPageOffset = 0;
        }
        if (adminStreamsPageOffset >= totalPages) {
            adminStreamsPageOffset = totalPages - 1;
        }
        if (adminStreamsPageOffset < 0) {
            adminStreamsPageOffset = 0;
        }

        const pageStart = adminStreamsPageOffset * ADMIN_STREAMS_PAGE_SIZE;
        const pageItems = filtered.slice(pageStart, pageStart + ADMIN_STREAMS_PAGE_SIZE);

        const tableBody = document.getElementById("admin-streams-table-body");
        if (!tableBody) return;
        tableBody.innerHTML = "";

        // Status label
        const statusEl = document.getElementById("stream-filter-status");
        const statusTextEl = document.getElementById("stream-filter-status-text");
        if (statusEl && statusTextEl) {
            if (isFiltered) {
                statusTextEl.textContent = `${filtered.length} of ${adminStreams.length} cameras match your filter`;
                statusEl.classList.remove("hidden");
            } else {
                statusEl.classList.add("hidden");
            }
        }

        if (filtered.length === 0) {
            updateAdminStreamsPaginationUI(0, 1);
            tableBody.innerHTML = `<tr class="stream-status-row"><td colspan="9">
                <div class="w-full flex flex-col items-center justify-center text-center py-12 px-4 bg-gray-50 dark:bg-cyber-bg rounded-xl border border-gray-100 dark:border-cyber-outline/30">
                    <svg class="w-8 h-8 text-gray-400 dark:text-cyber-dim mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span class="text-sm font-medium text-gray-500 dark:text-cyber-dim">No cameras match your search criteria</span>
                    <button onclick="clearStreamFilter()" class="text-sky-500 hover:underline text-xs mt-4">Clear filter</button>
                </div>
            </td></tr>`;
            return;
        }

        pageItems.forEach((stream, index) => {
            const tr = document.createElement("tr");
            const streamBuka = streamTerbentang.has(stream.id);
            tr.className = "hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors text-slate-800 dark:text-cyber-text stream-row" + (streamBuka ? " stream-row--buka" : "");
            tr.setAttribute("onclick", `window.toggleStreamCard(${stream.id}, event)`);
            const groupName = stream.group_name || "-";
            const coordinates = stream.coordinates || "-";
            // Kamera milik orang lain dikembalikan server tanpa rtsp_url.
            // Dibedakan dari kamera yang URL-nya memang kosong.
            const rtspTersamar = !stream.rtsp_url && !window.kuasaPenuh(userRole);
            const rtspUrl = rtspTersamar
                ? "\u2022\u2022\u2022 tersembunyi"
                : (stream.rtsp_url || "-");
            // Server mengosongkan rtsp_url untuk kamera pasangan Super Admin.
            // Ditampilkan sebagai bintang, bukan tanda hubung: kamera ini
            // punya kredensial, hanya bukan untuk Admin ini.
            const milikSendiri = stream.dipasang_sendiri !== false;
            const rtspTampil = milikSendiri
                ? rtspUrl
                : `<span class="text-slate-400 dark:text-cyber-dim/50 select-none" title="Kamera ini dipasang Super Admin — kredensial tidak ditampilkan">********</span>`;
            const hasCoords = !!(stream.coordinates && stream.coordinates.trim() && stream.coordinates !== "-");
            const connectionStatus = stream.status || "offline";
            const rowNumber = pageStart + index + 1;

            tr.innerHTML = `
                <td class="py-4 px-4 text-center">
                    <input type="checkbox" class="admin-stream-checkbox w-5 h-5 text-blue-600 bg-gray-50 dark:bg-cyber-bg border-gray-300 dark:border-cyber-outline rounded focus:ring-blue-500 focus:ring-2 ${milikSendiri ? "cursor-pointer" : "opacity-30 cursor-not-allowed"}"
                        value="${stream.id}" ${milikSendiri ? "" : "disabled title=\"Dipasang Super Admin — tidak dapat dihapus dari sini\""} onchange="window.updateSelectedAdminStreamsCount()">
                </td>
                <td class="py-4 px-4 font-bold text-slate-500 dark:text-cyber-dim" data-label="No">${rowNumber}</td>
                <td class="py-4 px-4 text-base font-semibold text-slate-900 dark:text-white" data-label="" data-grup="${groupName === '-' ? '' : groupName}">${stream.name}</td>
                <td class="py-4 px-4" data-label="Group">
                    <span class="inline-block px-2 py-0.5 bg-sky-50 dark:bg-cyber-primary/10 text-sky-700 dark:text-cyber-primary border border-sky-200 dark:border-cyber-primary/20 rounded text-[10px] font-bold font-mono max-w-24 truncate" title="${groupName}">${groupName}</span>
                </td>
                <td class="py-4 px-4 max-w-36 truncate text-slate-500 dark:text-cyber-dim font-mono text-[10px]" data-label="Coordinates" title="${coordinates}">${coordinates}</td>
                <td class="py-4 px-4 max-w-xs truncate text-slate-500 dark:text-cyber-dim font-mono text-[10px] ${milikSendiri ? "select-all" : ""}" data-label="RTSP" title="${milikSendiri ? rtspUrl : "Dipasang Super Admin"}">${rtspTampil}</td>
                <td class="py-4 px-4 flex flex-row items-center gap-2" data-label="Status">
                    <span class="badge-tag ${stream.is_active ? 'badge-tag--green' : 'badge-tag--slate'}">
                        ${stream.is_active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                    <span id="admin-stream-status-${stream.id}" class="badge-tag ${connectionStatus === 'online' ? 'badge-tag--sky' : 'badge-tag--rose'}">
                        ${connectionStatus === 'online' ? 'CONNECTED' : 'DISCONNECTED'}
                    </span>
                </td>
                <td class="py-4 px-4 text-center" data-label="Record">
                    ${stream.record_enabled ? `<span class="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/30">
                        <svg class="w-2.5 h-2.5 mr-0.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
                        REC
                    </span>` : `<span class="text-[9px] text-slate-300 dark:text-slate-600">—</span>`}
                </td>
                <td class="py-4 px-4 flex items-center justify-end gap-2" data-label="Actions">
                    <button onclick="window.viewAdminStream(${stream.id})" class="text-amber-600 dark:text-amber-400 hover:underline font-bold text-[11px] uppercase">
                        View
                    </button>
                    <button onclick="openMapModal(${stream.id})" title="${hasCoords ? 'View on Map' : 'No coordinates set'}" class="${hasCoords ? 'text-emerald-600 dark:text-emerald-400 hover:underline' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'} font-bold text-[11px] uppercase">
                        &#9737; Map
                    </button>
                    ${milikSendiri ? `
                    <button onclick="openEditStreamModal(${stream.id})" class="text-sky-600 dark:text-cyber-primary hover:underline font-bold text-[11px] uppercase">Edit</button>
                    <button onclick="deleteStream(${stream.id})" class="text-red-500 dark:text-cyber-error hover:underline font-bold text-[11px] uppercase">Delete</button>
                    ` : ``}
                </td>
            `;
            tableBody.appendChild(tr);
        });

        updateAdminStreamsPaginationUI(totalItems, totalPages);
    };

    window.changeAdminStreamsPageOffset = function(direction) {
        adminStreamsPageOffset += direction;
        filterStreamsTable({ keepPage: true });
    };

    window.jumpToAdminStreamsPage = function(pageIndex) {
        adminStreamsPageOffset = pageIndex;
        filterStreamsTable({ keepPage: true });
    };

    window.jumpToLastAdminStreamsPage = function() {
        const searchVal = (document.getElementById("stream-search-input")?.value || "").toLowerCase().trim();
        const groupVal = document.getElementById("stream-group-filter")?.value || "";
        const statusVal = document.getElementById("stream-status-filter")?.value || "";
        const filtered = adminStreams.filter(stream => {
            const nameMatch = !searchVal ||
                (stream.name || "").toLowerCase().includes(searchVal) ||
                (stream.rtsp_url || "").toLowerCase().includes(searchVal) ||
                (stream.group_name || "").toLowerCase().includes(searchVal);
            const groupMatch = !groupVal || stream.group_name === groupVal;
            const statusMatch = !statusVal || (stream.status || "offline") === statusVal;
            return nameMatch && groupMatch && statusMatch;
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_STREAMS_PAGE_SIZE));
        if (totalPages > 0) {
            window.jumpToAdminStreamsPage(totalPages - 1);
        }
    };

    window.clearStreamFilter = function() {
        const searchInput = document.getElementById("stream-search-input");
        const groupFilter = document.getElementById("stream-group-filter");
        const statusFilter = document.getElementById("stream-status-filter");
        if (searchInput) searchInput.value = "";
        if (groupFilter) groupFilter.value = "";
        if (statusFilter) statusFilter.value = "";
        filterStreamsTable();
    };

    window.openPermissionsModal = function(userId) {
        const user = adminUsers.find(u => u.id === userId);
        if (!user) return;

        const mTitle = document.getElementById("permissions-modal-title");
        const mUserId = document.getElementById("permissions-modal-user-id");
        const container = document.getElementById("permissions-camera-list");

        if (mTitle) mTitle.textContent = `Access for ${user.username.toUpperCase()}`;
        if (mUserId) mUserId.value = user.id;

        if (container) {
            container.innerHTML = "";
            if (adminStreams.length === 0) {
                container.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">No active cameras in directory.</p>`;
            } else {
                // Group streams by group_name
                const grouped = {};
                adminStreams.forEach(stream => {
                    const groupName = stream.group_name || "Default";
                    if (!grouped[groupName]) {
                        grouped[groupName] = [];
                    }
                    grouped[groupName].push(stream);
                });

                // Render group by group
                Object.keys(grouped).sort().forEach(groupName => {
                    const groupStreams = grouped[groupName];
                    
                    // Group Card / Container
                    const groupDiv = document.createElement("div");
                    groupDiv.className = "mb-4 border border-slate-200 dark:border-cyber-outline/40 rounded-md overflow-hidden bg-slate-100/50 dark:bg-cyber-bg/40 p-2.5 space-y-2";
                    
                    // Group Header Checkbox
                    const headerDiv = document.createElement("div");
                    headerDiv.className = "flex items-center justify-between pb-1 border-b border-slate-200 dark:border-cyber-outline/25 mb-2";
                    
                    // Check if all in group are checked
                    const allChecked = groupStreams.every(s => user.stream_ids.includes(s.id));
                    const groupSlug = groupName.replace(/\s+/g, '-').toLowerCase();
                    
                    headerDiv.innerHTML = `
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" id="group-select-${groupSlug}" data-group="${groupName}" ${allChecked ? "checked" : ""}
                                class="group-select-checkbox chk-native chk-native--md">
                            <label for="group-select-${groupSlug}" class="text-[10px] font-bold text-slate-500 dark:text-cyber-dim uppercase font-mono mb-0 cursor-pointer select-none">
                                GROUP: ${groupName}
                            </label>
                        </div>
                        <span class="text-[9px] font-bold text-slate-400 dark:text-cyber-dim/60 font-mono">(${groupStreams.length} Cam)</span>
                    `;
                    groupDiv.appendChild(headerDiv);
                    
                    // Group Cameras Sub-Container
                    const camerasContainer = document.createElement("div");
                    camerasContainer.className = "space-y-1.5 pl-2";
                    
                    groupStreams.forEach(stream => {
                        const div = document.createElement("div");
                        div.className = "flex items-center space-x-2.5 p-1 hover:bg-slate-200/50 dark:hover:bg-cyber-hover/30 rounded transition-colors";
                        
                        const isChecked = user.stream_ids.includes(stream.id) ? "checked" : "";
                        div.innerHTML = `
                            <input type="checkbox" id="perm-stream-${stream.id}" value="${stream.id}" data-group="${groupName}" ${isChecked}
                                class="permissions-modal-checkbox chk-native chk-native--sm">
                            <label for="perm-stream-${stream.id}" class="text-[11px] font-bold text-slate-700 dark:text-cyber-text uppercase font-mono mb-0 cursor-pointer select-none w-full truncate" title="${stream.name}">
                                ${stream.name}
                            </label>
                        `;
                        camerasContainer.appendChild(div);
                    });
                    
                    groupDiv.appendChild(camerasContainer);
                    container.appendChild(groupDiv);
                });

                // Add Event Listener to Group Selection Checkboxes
                container.querySelectorAll(".group-select-checkbox").forEach(groupCB => {
                    groupCB.addEventListener("change", function() {
                        const group = this.getAttribute("data-group");
                        const isChecked = this.checked;
                        container.querySelectorAll(`.permissions-modal-checkbox[data-group="${group}"]`).forEach(camCB => {
                            camCB.checked = isChecked;
                        });
                    });
                });

                // Add Event Listener to Individual Camera Checkboxes to toggle Group checkbox
                container.querySelectorAll(".permissions-modal-checkbox").forEach(camCB => {
                    camCB.addEventListener("change", function() {
                        const group = this.getAttribute("data-group");
                        const groupCB = container.querySelector(`.group-select-checkbox[data-group="${group}"]`);
                        if (groupCB) {
                            const allCams = container.querySelectorAll(`.permissions-modal-checkbox[data-group="${group}"]`);
                            const checkedCams = container.querySelectorAll(`.permissions-modal-checkbox[data-group="${group}"]:checked`);
                            groupCB.checked = (allCams.length === checkedCams.length);
                        }
                    });
                });
            }
        }

        const modal = document.getElementById("permissions-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.closePermissionsModal = function() {
        const modal = document.getElementById("permissions-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.saveUserPermissions = async function() {
        const userIdVal = document.getElementById("permissions-modal-user-id").value;
        if (!userIdVal) return;

        const userId = parseInt(userIdVal);
        const checkedBoxes = document.querySelectorAll(".permissions-modal-checkbox:checked");
        const streamIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

        const saveBtn = document.getElementById("save-permissions-btn");
        if (saveBtn) saveBtn.disabled = true;

        try {
            const response = await fetch(`${API_URL}/admin/users/${userId}/access`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({ stream_ids: streamIds })
            });

            if (!response.ok) throw new Error("Mapping update failed");

            // Update local state
            const user = adminUsers.find(u => u.id === userId);
            if (user) user.stream_ids = streamIds;

            window.closePermissionsModal();
            loadAdminData();
        } catch (err) {
            console.error("Failed to save user permissions:", err);
            alert("Error: Gagal menyimpan hak akses kamera.");
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    };

    // CRUD Modal controls
    window.openCreateStreamModal = function() {
        const mTitle = document.getElementById("modal-title");
        if (mTitle) mTitle.textContent = "Add CCTV Stream URL";
        
        const mId = document.getElementById("modal-stream-id");
        const mName = document.getElementById("modal-stream-name");
        const mGroup = document.getElementById("modal-stream-group");
        const mCoords = document.getElementById("modal-stream-coordinates");
        const mRtsp = document.getElementById("modal-stream-rtsp");
        const mActive = document.getElementById("modal-stream-active");

        if (mId) mId.value = "";
        if (mName) mName.value = "";
        if (mGroup) mGroup.value = "";
        if (mCoords) mCoords.value = "";
        if (mRtsp) mRtsp.value = "";
        if (mActive) mActive.checked = true;

        // Reset recording fields
        const mRecord = document.getElementById("modal-stream-record");
        const mDisk = document.getElementById("modal-stream-disk");
        const mRecordPath = document.getElementById("modal-stream-record-path");
        const mRetention = document.getElementById("modal-stream-retention");
        const mRecOpts = document.getElementById("recording-options");
        if (mRecord) mRecord.checked = false;
        if (mDisk) mDisk.value = "/";
        // Path is auto-generated, no manual input needed
        if (mRetention) mRetention.value = "7";
        if (mRecOpts) mRecOpts.classList.add("hidden");

        // Load available disks
        loadAvailableDisks();
        // Update path preview on name/group change
        document.getElementById("modal-stream-name")?.addEventListener("input", updatePathPreview);
        document.getElementById("modal-stream-group")?.addEventListener("input", updatePathPreview);

        const modal = document.getElementById("stream-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.openEditStreamModal = function(streamId) {
        const stream = adminStreams.find(s => s.id === streamId);
        if (!stream) return;

        const mTitle = document.getElementById("modal-title");
        if (mTitle) mTitle.textContent = "Edit CCTV Stream Config";

        const mId = document.getElementById("modal-stream-id");
        const mName = document.getElementById("modal-stream-name");
        const mGroup = document.getElementById("modal-stream-group");
        const mCoords = document.getElementById("modal-stream-coordinates");
        const mRtsp = document.getElementById("modal-stream-rtsp");
        const mActive = document.getElementById("modal-stream-active");

        if (mId) mId.value = stream.id;
        if (mName) mName.value = stream.name;
        if (mGroup) mGroup.value = stream.group_name || "";
        if (mCoords) mCoords.value = stream.coordinates || "";
        if (mRtsp) {
            const tersamar = !stream.rtsp_url && !window.kuasaPenuh(userRole);
            mRtsp.value = stream.rtsp_url || "";
            // Dikunci supaya nilai kosong tidak tersimpan menimpa URL asli,
            // dan alasannya terbaca sebelum menekan simpan.
            mRtsp.readOnly = tersamar;
            mRtsp.placeholder = tersamar
                ? "Tersembunyi \u2014 Anda tidak berwenang atas kamera ini"
                : "rtsp://...";
        }
        if (mActive) mActive.checked = stream.is_active;

        // Set recording fields
        const mRecord = document.getElementById("modal-stream-record");
        const mDisk = document.getElementById("modal-stream-disk");
        const mRecordPath = document.getElementById("modal-stream-record-path");
        const mRetention = document.getElementById("modal-stream-retention");
        const mRecOpts = document.getElementById("recording-options");
        if (mRecord) mRecord.checked = stream.record_enabled || false;
        // Path is auto-generated
        if (mRetention) mRetention.value = stream.record_retention_days || 7;
        if (mRecOpts) mRecOpts.classList.toggle("hidden", !stream.record_enabled);

        // Load available disks then set value
        loadAvailableDisks().then(() => {
            if (mDisk && stream.record_disk) mDisk.value = stream.record_disk;
        });

        const modal = document.getElementById("stream-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.closeStreamModal = function() {
        const modal = document.getElementById("stream-modal");
        if (modal) modal.classList.add("hidden");
    };


    // Load available disks for recording
    async function loadAvailableDisks() {
        try {
            const res = await fetch(`${API_URL}/admin/disks`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!res.ok) return;
            const disks = await res.json();
            const sel = document.getElementById("modal-stream-disk");
            if (!sel) return;
            const currentVal = sel.value;
            sel.innerHTML = "";
            disks.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d.mount;
                opt.textContent = `${d.mount} (${d.avail_human} free / ${d.size_human})`;
                opt.dataset.avail = d.avail_human;
                opt.dataset.usage = d.usage_pct;
                sel.appendChild(opt);
            });
            if (currentVal) sel.value = currentVal;
            // Update disk info
            updateDiskInfo();
            sel.onchange = updateDiskInfo;
        } catch (e) { console.warn("Failed to load disks:", e); }
    }
    function updateDiskInfo() {
        const sel = document.getElementById("modal-stream-disk");
        const info = document.getElementById("disk-info");
        if (!sel || !info) return;
        const opt = sel.options[sel.selectedIndex];
        if (opt) {
            info.textContent = `Available: ${opt.dataset.avail || "?"} | Usage: ${opt.dataset.usage || "?"}%`;
        }
        updatePathPreview();
    }
    function updatePathPreview() {
        const disk = document.getElementById("modal-stream-disk")?.value || "/";
        const group = document.getElementById("modal-stream-group")?.value || "Default";
        const name = document.getElementById("modal-stream-name")?.value || "Camera";
        const preview = document.getElementById("record-path-preview");
        if (!preview) return;
        const safe = s => s.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_") || "unknown";
        const d = disk === "/" ? "" : disk;
        preview.textContent = `${d}/recordings/${safe(group)}/${safe(name)}/`;
    }

    window.handleStreamSubmit = async function(e) {
        e.preventDefault();
        const streamId = document.getElementById("modal-stream-id").value;
        const name = document.getElementById("modal-stream-name").value;
        const groupName = (document.getElementById("modal-stream-group") || {}).value || "Default";
        const coordinates = (document.getElementById("modal-stream-coordinates") || {}).value || "";
        const rtspUrl = document.getElementById("modal-stream-rtsp").value;
        const isActive = document.getElementById("modal-stream-active").checked;

        const recordEnabled = document.getElementById("modal-stream-record")?.checked || false;
        const recordDisk = document.getElementById("modal-stream-disk")?.value || "/";
        const recordRetention = parseInt(document.getElementById("modal-stream-retention")?.value || "7", 10);

        const payload = {
            name: name,
            rtsp_url: rtspUrl,
            group_name: groupName,
            coordinates: coordinates,
            is_active: isActive,
            record_enabled: recordEnabled,
            record_path: "",
            record_disk: recordDisk,
            record_retention_days: recordRetention
        };

        try {
            let response;
            if (streamId) {
                response = await fetch(`${API_URL}/admin/streams/${streamId}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${userToken}`
                    },
                    body: JSON.stringify(payload)
                });
            } else {
                response = await fetch(`${API_URL}/admin/streams`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${userToken}`
                    },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) throw new Error("Saving stream data failed");
            
            window.closeStreamModal();
            loadAdminData({ keepPage: true });
        } catch (err) {
            console.error("Stream saving failed:", err);
        }
    };

    window.deleteStream = async function(streamId) {
        if (!confirm("Are you sure you want to permanently delete this camera stream config?")) return;

        try {
            const response = await fetch(`${API_URL}/admin/streams/${streamId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${userToken}` }
            });

            if (!response.ok) throw new Error("Delete action failed");

            loadAdminData({ keepPage: true });
        } catch (err) {
            console.error("Failed to delete stream configuration:", err);
        }
    };

    window.viewAdminStream = function(streamId) {
        const stream = adminStreams.find(s => s.id === streamId);
        if (!stream) {
            showApiErrorBanner("Kamera tidak ditemukan di data lokal");
            return;
        }

        // Tentukan URL WebRTC secara dinamis karena API admin tidak menyediakannya
        const mediaServerBase = "/media/";
        stream.webrtc_url = `${mediaServerBase}stream_${stream.id}/whep`;
        
        // Helper sederhana untuk mencocokkan sub-stream url
        let subRtsp = stream.rtsp_url || "";
        const lowerRtsp = subRtsp.toLowerCase();
        if (lowerRtsp.includes("_main")) {
            const idx = lowerRtsp.indexOf("_main");
            subRtsp = subRtsp.substring(0, idx) + "_sub" + subRtsp.substring(idx + 5);
        } else if (lowerRtsp.includes("/stream1")) {
            const idx = lowerRtsp.indexOf("/stream1");
            subRtsp = subRtsp.substring(0, idx) + "/stream2" + subRtsp.substring(idx + 8);
        } else if (lowerRtsp.includes("/h264")) {
            const idx = lowerRtsp.indexOf("/h264");
            subRtsp = subRtsp.substring(0, idx) + "/h264_sub" + subRtsp.substring(idx + 5);
        } else if (lowerRtsp.includes("/h.264")) {
            const idx = lowerRtsp.indexOf("/h.264");
            subRtsp = subRtsp.substring(0, idx) + "/H.264_sub" + subRtsp.substring(idx + 6);
        }
        
        stream.webrtc_url_sub = (subRtsp !== stream.rtsp_url) 
            ? `${mediaServerBase}stream_${stream.id}_sub/whep` 
            : `${mediaServerBase}stream_${stream.id}/whep`;

        // Panggil popup modal player yang sudah ada
        window.openCameraPopup(stream, [stream]);
    };

    // User Accounts Management Logic
    function renderAdminUsersTable() {
        const tableBody = document.getElementById("admin-users-table-body");
        if (!tableBody) return;
        tableBody.innerHTML = "";

        // Update users count badge
        const usersBadge = document.getElementById("admin-subtab-users-badge");
        if (usersBadge) usersBadge.textContent = adminUsers.length;

        if (!adminUsers || adminUsers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                <div class="flex flex-col items-center space-y-2">
                    <svg class="w-6 h-6 text-slate-300 dark:text-cyber-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                    <span>Belum ada akun pengguna terdaftar. Klik "+ Add User Account" untuk menambahkan.</span>
                </div>
            </td></tr>`;
            return;
        }

        // Akun bergrup dikelompokkan di bawah satu baris induk bernama
        // grupnya, seperti Camera Access. Yang tanpa grup tetap berdiri
        // sendiri sebagai baris root. Induk murni mewakili grup: admin
        // pemiliknya ikut bersarang sebagai anggota, bukan jadi judulnya,
        // sehingga satu grup tetap satu baris walau adminnya berganti.
        const perGrup = new Map();
        const lepas = [];
        adminUsers.forEach(u => {
            const g = u.admin_group;
            if (!g) { lepas.push(u); return; }
            if (!perGrup.has(g)) perGrup.set(g, []);
            perGrup.get(g).push(u);
        });

        // Anggota diurutkan supaya pengelolanya di atas: admin dulu, lalu
        // sisanya menurut nama, agar urutannya tidak berubah-ubah tiap muat.
        const bobot = r => (["super_admin", "admin"].includes((r || "").toLowerCase()) ? 0 : 1);
        perGrup.forEach(a => a.sort((x, y) =>
            bobot(x.role) - bobot(y.role) ||
            String(x.username).localeCompare(String(y.username))));

        const lencanaPeran = user => {
            const p = (user.role || "").toLowerCase();
            const warna = ["super_admin", "admin"].includes(p)
                ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30"
                : p === "user"
                    ? "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/30"
                    : "bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50";
            return `<span class="pgn-peran ${warna}">${(user.role || "").toUpperCase()}</span>`;
        };

        const tombolAksi = user => `<span class="pgn-aksi">
                        <button onclick="event.stopPropagation(); openEditUserModal(${user.id})" class="ang-tombol">Edit</button>
                        <button onclick="event.stopPropagation(); deleteUser(${user.id})" class="ang-tombol ang-tombol--bahaya">Delete</button>
                    </span>`;

        // Sakelar iklan: hanya ada di baris grup (dan Tanpa Grup), sebab
        // menyala/matinya iklan diatur SERENTAK untuk seisi grup, anggota
        // di dalamnya tidak punya sakelar sendiri-sendiri.
        // Akun tanpa grup menyebut pembuatnya; yang bergrup tidak perlu,
        // sebab grupnya sudah tertulis di baris induk di atasnya.
        const lencanaIklan = aktif => `<span class="badge-iklan ${aktif ? "badge-iklan--on" : "badge-iklan--off"}" title="${aktif ? "Iklan tampil" : "Iklan disembunyikan"}">iklan ${aktif ? "on" : "off"}</span>`;

        const barisLepas = (user, nomor) => `<tr class="hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors border-b border-slate-100 dark:border-cyber-outline/20 text-slate-800 dark:text-cyber-text">
                <td class="py-4 px-4 font-bold text-slate-500 dark:text-cyber-dim">${nomor}</td>
                <td class="py-4 px-4 font-semibold text-slate-900 dark:text-white">
                    ${user.username}
                    ${user.dibuat_oleh ? `<span class="pgn-ket pgn-ket--desktop">Dibuat oleh: ${user.dibuat_oleh}</span>` : ""}
                </td>
                <td class="py-4 px-4">${lencanaPeran(user)}
                    ${user.dibuat_oleh ? `<span class="pgn-ket pgn-ket--mobile">Dibuat oleh: ${user.dibuat_oleh}</span>` : ""}
                </td>
                <td class="py-4 px-4">${!user.admin_group ? lencanaIklan(user.show_ads) : ""}</td>
                <td class="py-4 px-4 text-right">${tombolAksi(user)}</td>
            </tr>`;

        const barisAnggota = (user, akhir) => `<tr class="ang-baris-anggota${akhir ? " ang-baris-anggota--akhir" : ""}">
                <td class="py-2 px-4"></td>
                <td class="py-2 px-4">
                    <span class="ang-anak">
                        <span class="ang-nama" title="${user.username}">${user.username}</span>
                    </span>
                    ${user.dibuat_oleh ? `<span class="pgn-ket pgn-ket--desktop">Dibuat oleh: ${user.dibuat_oleh}</span>` : ""}
                </td>
                <td class="py-2 px-4">${lencanaPeran(user)}
                    ${user.dibuat_oleh ? `<span class="pgn-ket pgn-ket--mobile">Dibuat oleh: ${user.dibuat_oleh}</span>` : ""}
                </td>
                <td class="py-2 px-4"></td>
                <td class="py-2 px-4 text-right">${tombolAksi(user)}</td>
            </tr>`;

        const barisGrup = (nama, anggota, nomor) => {
            const buka = grupPenggunaTerbentang.has(nama);
            const sandi = encodeURIComponent(nama);
            // Isi hanya disusun saat panelnya terbuka: baris tersembunyi
            // tetap terbaca pencarian dalam halaman dan pembaca layar,
            // sehingga nama ditemukan di grup yang layarnya tidak menampilkan.
            const isi = buka
                ? anggota.map((a, i) => barisAnggota(a, i === anggota.length - 1)).join("")
                : "";
            return `<tr onclick="window.bentangGrupPengguna('${sandi}')" class="ang-baris-grup${buka ? " ang-baris-grup--buka" : ""} hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors border-b border-slate-100 dark:border-cyber-outline/20 text-slate-800 dark:text-cyber-text">
                <td class="py-4 px-4 font-bold text-slate-500 dark:text-cyber-dim">${nomor}</td>
                <td class="py-4 px-4 font-semibold text-slate-900 dark:text-white">
                    <span class="inline-flex items-center gap-1.5">
                        <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/30">grup</span>
                        <span class="ang-nama">${nama}</span>
                    </span>
                </td>
                <td class="py-4 px-4">
                    <button type="button" onclick="event.stopPropagation(); window.bentangGrupPengguna('${sandi}')"
                        class="ang-pemicu${buka ? " ang-pemicu--buka" : ""}" aria-expanded="${buka}">
                        <span class="ang-pemicu-jml">${anggota.length}</span>
                        <span class="ang-pemicu-teks">anggota</span>
                    </button>
                </td>
                <td class="py-4 px-4">${lencanaIklan(anggota.length > 0 && anggota.every(a => a.show_ads))}</td>
                <td class="py-4 px-4 text-right">
                    <span class="pgn-aksi">
                        <button onclick="event.stopPropagation(); window.bukaGantiNamaGrup('${sandi}')" class="ang-tombol" title="Ubah nama grup ${nama}">Edit</button>
                        <button class="ang-tombol invisible" tabindex="-1" aria-hidden="true">Delete</button>
                    </span>
                </td>
            </tr>${isi}`;
        };

        // Grup lebih dahulu, lalu akun lepas: keduanya berbagi satu deret
        // nomor sebab keduanya sama-sama baris tingkat pertama.
        let nomor = 0;
        const potongan = [];
        [...perGrup.keys()].sort().forEach(g =>
            potongan.push(barisGrup(g, perGrup.get(g), ++nomor)));
        lepas.forEach(u => potongan.push(barisLepas(u, ++nomor)));
        tableBody.innerHTML = potongan.join("");
    }

    // Pelipatan hidup di luar fungsi render: tabel disusun ulang tiap kali
    // akun disimpan atau dihapus, dan state di dalamnya akan menutup semua
    // grup setiap habis menyunting anggotanya.
    const grupPenggunaTerbentang = new Set();

    window.bukaGantiNamaGrup = function(namaTersandi) {
        const nama = decodeURIComponent(namaTersandi);
        const modal = document.getElementById("grup-nama-modal");
        const isian = document.getElementById("grup-nama-baru");
        const lama = document.getElementById("grup-nama-lama");
        if (!modal || !isian) return;
        isian.value = nama;
        isian.dataset.grupLama = nama;
        if (lama) lama.textContent = nama;
        const jml = document.getElementById("grup-nama-jumlah");
        const anggotaGrup = (adminUsers || []).filter(u => u.admin_group === nama);
        if (jml) jml.textContent = anggotaGrup.length;
        const iklanChk = document.getElementById("grup-nama-iklan");
        if (iklanChk) iklanChk.checked = anggotaGrup.length > 0 && anggotaGrup.every(u => u.show_ads);
        modal.classList.remove("hidden");
        isian.focus();
        isian.select();
    };

    window.toggleGrupIklan = async function(groupKey, nilaiBaru) {
        try {
            const res = await fetch(`${API_URL}/admin/groups/${encodeURIComponent(groupKey)}/ads`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({ show_ads: nilaiBaru })
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                alert(e.detail || "Gagal mengubah setelan iklan grup");
                return;
            }
            loadAdminData();
        } catch (err) {
            alert("Gagal mengubah setelan iklan grup: " + err.message);
        }
    };

    window.tutupGantiNamaGrup = function() {
        const modal = document.getElementById("grup-nama-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.simpanNamaGrup = async function(ev) {
        if (ev) ev.preventDefault();
        const isian = document.getElementById("grup-nama-baru");
        if (!isian) return;
        const lama = isian.dataset.grupLama || "";
        const baru = (isian.value || "").trim();
        if (!baru) { alert("Nama grup tidak boleh kosong"); return; }
        // Nama tak berubah -> lewati rename, tapi toggle iklan tetap wajib
        // tersimpan kalau diubah, jadi tidak boleh langsung return di sini.
        if (baru === lama) {
            const iklanChkSama = document.getElementById("grup-nama-iklan");
            if (iklanChkSama) {
                await fetch(`${API_URL}/admin/groups/${encodeURIComponent(lama)}/ads`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
                    body: JSON.stringify({ show_ads: iklanChkSama.checked })
                }).catch(() => {});
                loadAdminData();
            }
            window.tutupGantiNamaGrup();
            return;
        }

        try {
            const res = await fetch(`${API_URL}/admin/groups/${encodeURIComponent(lama)}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify({ nama_baru: baru })
            });
            if (res.status === 401 || res.status === 403) {
                const e = await res.json().catch(() => ({}));
                alert(e.detail || "Anda tidak berhak mengubah nama grup");
                return;
            }
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                alert(e.detail || "Gagal mengubah nama grup");
                return;
            }
            const hasil = await res.json();
            // Grup yang sedang terbuka ikut pindah nama, supaya panelnya
            // tidak menutup sendiri hanya karena kuncinya berganti.
            if (grupPenggunaTerbentang.has(lama)) {
                grupPenggunaTerbentang.delete(lama);
                grupPenggunaTerbentang.add(baru);
            }

            const iklanChk = document.getElementById("grup-nama-iklan");
            if (iklanChk) {
                await fetch(`${API_URL}/admin/groups/${encodeURIComponent(baru)}/ads`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
                    body: JSON.stringify({ show_ads: iklanChk.checked })
                }).catch(() => {});
            }

            window.tutupGantiNamaGrup();

            loadAdminData();
        } catch (err) {
            alert("Gagal menghubungi server");
        }
    };

    window.bentangGrupPengguna = function(namaTersandi) {
        const nama = decodeURIComponent(namaTersandi);
        if (grupPenggunaTerbentang.has(nama)) grupPenggunaTerbentang.delete(nama);
        else grupPenggunaTerbentang.add(nama);
        renderAdminUsersTable();
    };

    function siapkanPilihanGrup(terpilih) {
        // Grup menentukan wewenang, jadi hanya Super Admin yang menentukannya.
        // Bagi Admin, server memaksa akun baru masuk grupnya sendiri.
        const wrap = document.getElementById("modal-user-grup-wrap");
        const isian = document.getElementById("modal-user-grup");
        if (!wrap || !isian) return;

        // Admin tetap melihat kolomnya, tetapi terkunci: server memaksa
        // akun baru masuk grup pembuatnya, jadi kolom yang disembunyikan
        // hanya membuat modal Admin dan Super Admin tampak berlainan tanpa
        // alasan yang terlihat pemakai.
        wrap.classList.remove("hidden");
        if (!window.kuasaPenuh(userRole)) {
            const saya = (adminUsers || []).find(u => u.username === username);
            const grupSaya = (saya && saya.admin_group) || "";
            isian.innerHTML = grupSaya
                ? `<option value="${grupSaya}">${grupSaya}</option>`
                : '<option value="">Belum masuk grup</option>';
            isian.value = grupSaya;
            isian.disabled = true;
            const nama = document.getElementById("modal-user-grup-baru");
            if (nama) { nama.classList.add("hidden"); nama.value = ""; }
            return;
        }
        isian.disabled = false;

        // Grup yang sudah dipakai ditawarkan supaya tidak lahir grup kembar
        // akibat salah ketik.
        const ada = [...new Set((adminUsers || [])
            .map(u => u.admin_group).filter(Boolean))].sort();
        // Grup akun yang sedang disunting ikut ditawarkan walau pemiliknya
        // satu-satunya dan belum tentu ada di daftar yang termuat.
        if (terpilih && !ada.includes(terpilih)) ada.push(terpilih);

        isian.innerHTML = '<option value="">Belum masuk grup</option>';
        ada.forEach(g => {
            const opt = document.createElement("option");
            opt.value = g;
            opt.textContent = g;
            isian.appendChild(opt);
        });
        const opsiBaru = document.createElement("option");
        opsiBaru.value = GRUP_BARU;
        opsiBaru.textContent = "Buat grup baru";
        isian.appendChild(opsiBaru);

        isian.value = terpilih || "";
        pasangPilihanGrupBaru();
        tampilkanIsianGrupBaru();
    }

    // Nilai penanda, bukan nama grup: dipakai untuk membedakan "buat grup
    // baru" dari nama grup mana pun yang mungkin diketik orang.
    const GRUP_BARU = "__grup_baru__";

    function tampilkanIsianGrupBaru() {
        const isian = document.getElementById("modal-user-grup");
        const nama = document.getElementById("modal-user-grup-baru");
        if (!isian || !nama) return;
        const baru = isian.value === GRUP_BARU;
        nama.classList.toggle("hidden", !baru);
        if (baru) nama.focus(); else nama.value = "";

        // Switch iklan berarti untuk akun tanpa grup DAN grup baru (belum
        // ada baris "Rename Group" untuk mengaturnya). Hanya disembunyikan
        // saat grup EXISTING dipilih, sebab grup itu sudah diatur lewat
        // popup Rename Group tersendiri.
        const iklanWrap = document.getElementById("modal-user-iklan-wrap");
        const iklanKet = document.getElementById("modal-user-iklan-ket");
        const grupExisting = isian.value !== "" && isian.value !== GRUP_BARU;
        if (iklanWrap) iklanWrap.classList.toggle("hidden", grupExisting);
        if (iklanKet) iklanKet.textContent = baru
            ? "Berlaku utk seluruh anggota grup baru ini"
            : "Berlaku utk semua akun tanpa grup";
    }

    function pasangPilihanGrupBaru() {
        const isian = document.getElementById("modal-user-grup");
        if (!isian || isian.dataset.siap === "1") return;
        isian.dataset.siap = "1";
        isian.addEventListener("change", tampilkanIsianGrupBaru);
    }



    function batasiPilihanPeran(namaDisunting) {
        // Admin hanya boleh mencetak user; menampilkan pilihan lain hanya
        // berujung galat 403 tanpa penjelasan.
        const sel = document.getElementById("modal-user-role");
        if (!sel) return;
        const penuh = window.kuasaPenuh(userRole);
        // Peran guest melekat pada satu akun bawaan dan tidak dapat
        // diberikan ke akun lain. Pilihannya hanya muncul saat akun itu
        // sendiri yang disunting, supaya pemilihnya tidak kosong dan
        // perannya tidak berubah tanpa sengaja saat disimpan.
        const sedangGuestBawaan = (namaDisunting || "").toLowerCase() === "guest";
        Array.from(sel.options).forEach(opt => {
            // Admin boleh mencetak sesamanya: akun itu terkurung di
            // grupnya sendiri, jadi wewenangnya tidak melebar. Backend
            // sudah mengizinkannya (admin_create_user), jadi menyembunyikan
            // pilihan ini hanya membuat layar berbohong.
            let terlarang = !penuh && opt.value === "super_admin";
            if (opt.value === "guest") terlarang = !sedangGuestBawaan;
            opt.hidden = terlarang;
            opt.disabled = terlarang;
        });
    }

    window.openCreateUserModal = function() {
        const mTitle = document.getElementById("user-modal-title");
        if (mTitle) mTitle.textContent = "Add User Account";

        const mId = document.getElementById("modal-user-id");
        const mUsername = document.getElementById("modal-user-username");
        const mPassword = document.getElementById("modal-user-password");
        const mPasswordLabel = document.getElementById("modal-user-password-label");
        const mPasswordHelp = document.getElementById("modal-user-password-help");
        const mRole = document.getElementById("modal-user-role");

        if (mId) mId.value = "";
        if (mUsername) mUsername.value = "";
        if (mPassword) {
            mPassword.value = "";
            mPassword.required = true;
        }
        if (mPasswordLabel) mPasswordLabel.textContent = "Password";
        if (mPasswordHelp) mPasswordHelp.classList.add("hidden");
        if (mRole) mRole.value = "user";
        batasiPilihanPeran();
        siapkanPilihanGrup(null);

        const modal = document.getElementById("user-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.openEditUserModal = function(userId) {
        const user = adminUsers.find(u => u.id === userId);
        if (!user) return;

        const mTitle = document.getElementById("user-modal-title");
        if (mTitle) mTitle.textContent = `Edit User: ${user.username}`;

        const mId = document.getElementById("modal-user-id");
        const mUsername = document.getElementById("modal-user-username");
        const mPassword = document.getElementById("modal-user-password");
        const mPasswordLabel = document.getElementById("modal-user-password-label");
        const mPasswordHelp = document.getElementById("modal-user-password-help");
        const mRole = document.getElementById("modal-user-role");

        if (mId) mId.value = user.id;
        if (mUsername) mUsername.value = user.username;
        if (mPassword) {
            mPassword.value = "";
            mPassword.required = false;
        }
        if (mPasswordLabel) mPasswordLabel.textContent = "New Password (Optional)";
        if (mPasswordHelp) mPasswordHelp.classList.remove("hidden");
        if (mRole) mRole.value = user.role;
        batasiPilihanPeran(user.username);
        siapkanPilihanGrup(user.admin_group);

        // Switch iklan hanya berarti untuk akun tanpa grup: yang bergrup
        // sudah diatur lewat modal Rename Group, jadi disembunyikan di sini
        // supaya tidak ada dua sumber kebenaran untuk pengaturan yang sama.
        const iklanWrap = document.getElementById("modal-user-iklan-wrap");
        const iklanChk = document.getElementById("modal-user-iklan");
        if (iklanWrap && iklanChk) {
            if (!user.admin_group) {
                iklanWrap.classList.remove("hidden");
                iklanChk.checked = !!user.show_ads;
            } else {
                iklanWrap.classList.add("hidden");
            }
        }

        const modal = document.getElementById("user-modal");
        if (modal) modal.classList.remove("hidden");
    };

    window.closeUserModal = function() {
        const modal = document.getElementById("user-modal");
        if (modal) modal.classList.add("hidden");
    };

    window.handleUserSubmit = async function(event) {
        event.preventDefault();
        
        const userIdVal = document.getElementById("modal-user-id").value;
        const usernameVal = document.getElementById("modal-user-username").value;
        const passwordVal = document.getElementById("modal-user-password").value;
        const roleVal = document.getElementById("modal-user-role").value;

        const payload = {
            username: usernameVal,
            role: roleVal
        };

        // Hanya Super Admin yang menentukan grup. Untuk Admin, server
        // memaksa akun baru masuk grup pembuatnya, jadi kolom ini tidak
        // dikirim sama sekali.
        if (window.kuasaPenuh(userRole)) {
            const isianGrup = document.getElementById("modal-user-grup");
            const namaBaru = document.getElementById("modal-user-grup-baru");
            if (isianGrup) {
                payload.admin_group = isianGrup.value === GRUP_BARU
                    ? (namaBaru ? namaBaru.value.trim() : "")
                    : isianGrup.value;
            }
        }
        if (passwordVal && passwordVal.trim() !== "") {
            payload.password = passwordVal;
        }

        // SUPER_ADMIN tak ikut toggle grup/tanpa-grup (kewenangannya beda),
        // jadi nilainya dikirim langsung di sini kalau switch iklan tampil.
        if (roleVal === "super_admin") {
            const iklanChkPre = document.getElementById("modal-user-iklan");
            const iklanWrapPre = document.getElementById("modal-user-iklan-wrap");
            if (iklanChkPre && iklanWrapPre && !iklanWrapPre.classList.contains("hidden")) {
                payload.show_ads = iklanChkPre.checked;
            }
        }

        try {
            let response;
            if (userIdVal) {
                // Edit / Update User
                response = await fetch(`${API_URL}/admin/users/${userIdVal}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${userToken}`
                    },
                    body: JSON.stringify(payload)
                });
            } else {
                // Create User
                payload.password = passwordVal;
                response = await fetch(`${API_URL}/admin/users`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${userToken}`
                    },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) {
                const errData = await response.json();
                alert(errData.detail || "Error saving user account");
                return;
            }

            const iklanWrap2 = document.getElementById("modal-user-iklan-wrap");
            const iklanChk2 = document.getElementById("modal-user-iklan");
            if (iklanWrap2 && !iklanWrap2.classList.contains("hidden") && iklanChk2) {
                if (roleVal === "super_admin") {
                    // SUPER_ADMIN independen: sudah terkirim via payload.show_ads
                    // di body PUT/POST utama, tidak lewat endpoint grup.
                } else {
                    // Tanpa grup -> grup semu "__tanpa_grup__". Grup baru -> nama
                    // grup itu sendiri (sudah tersimpan di payload.admin_group
                    // begitu server selesai membuatnya).
                    const targetGrup = payload.admin_group ? payload.admin_group : "__tanpa_grup__";
                    await fetch(`${API_URL}/admin/groups/${encodeURIComponent(targetGrup)}/ads`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
                        body: JSON.stringify({ show_ads: iklanChk2.checked })
                    }).catch(() => {});
                }
            }

            window.closeUserModal();
            loadAdminData();
        } catch (err) {
            console.error("Failed to save user:", err);
            alert("Connection error while saving user account");
        }
    };

    window.deleteUser = async function(userId) {
        if (!confirm("Are you sure you want to delete this user account?")) return;

        try {
            const response = await fetch(`${API_URL}/admin/users/${userId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${userToken}`
                }
            });

            if (!response.ok) {
                const errData = await response.json();
                alert(errData.detail || "Failed to delete user account");
                return;
            }

            loadAdminData();
        } catch (err) {
            console.error("Delete user failed:", err);
            alert("Connection error while deleting user");
        }
    };

    // Custom Monitor Operations
    let customPlaylist = []; // Array of stream objects in order: [ { id, enabled } ]
    let customGridSize = 3;  // Default to 3x3 for custom monitor

    async function loadCustomMonitorData() {
        if (currentPage !== "custom") return;

        const prevStreamIds = streamsData.map(s => s.id).join(",");

        if (streamsData.length > 0) {
            const grid = document.getElementById("custom-cctv-grid");
            const emptyState = document.getElementById("custom-empty-state");
            if (grid?.children.length) {
                if (emptyState) emptyState.classList.add("hidden");
                grid.classList.remove("hidden");
                if (typeof window.scheduleGridStreamConnect === "function") {
                    window.scheduleGridStreamConnect();
                }
            }
        }

        try {
            // BUG FIX #5: Timeout & proper HTTP error handling
            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 12000);

            let response;
            try {
                response = await fetch(`${API_URL}/streams?limit=1000&no_check=true`, {
                    headers: { "Authorization": `Bearer ${userToken}` },
                    signal: controller.signal
                });
            } finally {
                clearTimeout(fetchTimeout);
            }

            if (response.status === 401) { window.handleLogout(); return; }
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

            const pageData = await response.json();
            if (currentPage !== "custom") return;

            streamsData = pageData.items;
            prefetchServerPosters(streamsData.map(s => s.id));

            // 2. Load settings from localStorage
            const savedPlaylistStr = localStorage.getItem(getStorageKey("cctv_custom_playlist"));
            const savedSize = localStorage.getItem(getStorageKey("cctv_custom_grid_size"));
            if (savedSize) {
                customGridSize = parseInt(savedSize);
            } else {
                customGridSize = 3;
            }

            customPlaylist = [];
            if (savedPlaylistStr) {
                try {
                    const savedList = JSON.parse(savedPlaylistStr);
                    // Keep saved items that are still available in streamsData
                    savedList.forEach(item => {
                        const exists = streamsData.some(s => s.id === item.id);
                        if (exists) {
                            customPlaylist.push(item);
                        }
                    });
                    
                    // Add any new available cameras that aren't in the saved list
                    streamsData.forEach(stream => {
                        const inPlaylist = customPlaylist.some(item => item.id === stream.id);
                        if (!inPlaylist) {
                            customPlaylist.push({ id: stream.id, enabled: true });
                        }
                    });
                } catch (e) {
                    console.error("Failed to parse saved playlist:", e);
                }
            }

            // Fallback: If customPlaylist is empty, populate from streamsData
            if (customPlaylist.length === 0) {
                streamsData.forEach(stream => {
                    customPlaylist.push({ id: stream.id, enabled: true });
                });
            }

            // Render groups list in sidebar
            renderCustomGroupsList();
            populateCustomGroupFilter();

            // Restore last view mode and active settings
            const viewMode = localStorage.getItem(getStorageKey("cctv_custom_view_mode")) || "custom";

            const idsChanged = prevStreamIds !== streamsData.map(s => s.id).join(",");
            const gridEmpty = !document.getElementById("custom-cctv-grid")?.children.length;
            if (idsChanged || gridEmpty || !customGridMatchesStreams()) {
                toggleCustomViewMode(viewMode);
            } else {
                if (typeof window.restorePostersInGrid === "function") {
                    window.restorePostersInGrid(document.getElementById("custom-cctv-grid"));
                }
                if (typeof window.scheduleGridStreamConnect === "function") {
                    window.scheduleGridStreamConnect();
                }
            }

            // Render other components
            renderCustomPlaylistSettings();
            renderSavedScreensList();

        } catch (err) {
            // BUG FIX #5: Tampilkan error ke pengguna
            console.error("Failed to initialize custom monitor page:", err);
            const isAbort = err.name === "AbortError";
            if (typeof window.showApiErrorBanner === "function") {
                window.showApiErrorBanner(isAbort
                    ? "Server tidak merespons (timeout). Periksa koneksi atau status backend."
                    : `Gagal memuat data kamera: ${err.message}`);
            }
        }
    }
    window.loadCustomMonitorData = loadCustomMonitorData;

    function renderCustomPlaylistSettings() {
        const container = document.getElementById("custom-camera-select-list");
        if (!container) return;
        container.innerHTML = "";

        if (customPlaylist.length === 0) {
            container.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">No cameras authorized.</p>`;
            return;
        }

        // Group the playlist items by group_name
        const groupsMap = {};
        customPlaylist.forEach((item, index) => {
            const stream = streamsData.find(s => s.id === item.id);
            if (!stream) return;
            const groupName = stream.group_name || "Tanpa Grup";
            if (!groupsMap[groupName]) {
                groupsMap[groupName] = [];
            }
            groupsMap[groupName].push({ item, index, stream });
        });

        // Loop through each group and render header and camera items
        Object.keys(groupsMap).forEach(groupName => {
            const items = groupsMap[groupName];
            const allChecked = items.every(({ item }) => item.enabled);

            // Group Container
            const groupDiv = document.createElement("div");
            groupDiv.className = "space-y-1.5 mb-4";

            // Group Header
            const headerDiv = document.createElement("div");
            headerDiv.className = "flex items-center justify-between bg-slate-100 dark:bg-cyber-container/50 px-2 py-1.5 rounded-md border border-slate-200/50 dark:border-cyber-outline/40 mb-1.5 mt-2.5 shadow-sm";
            
            const groupChecked = allChecked ? "checked" : "";
            const groupHtmlId = "custom-group-chk-" + encodeURIComponent(groupName).replace(/%/g, '');
            headerDiv.innerHTML = `
                <div class="flex items-center space-x-2">
                    <input type="checkbox" id="${groupHtmlId}" ${groupChecked} onchange="toggleCustomGroup('${groupName.replace(/'/g, "\\'")}', this.checked)"
                        class="chk-native chk-native--sm">
                    <label for="${groupHtmlId}" class="text-[10px] font-bold text-slate-500 dark:text-cyber-dim uppercase font-mono cursor-pointer mb-0 select-none">
                        ${groupName}
                    </label>
                </div>
            `;
            groupDiv.appendChild(headerDiv);

            // Group Items Container
            const itemsContainer = document.createElement("div");
            itemsContainer.className = "space-y-1.5 pl-2 border-l border-slate-200/60 dark:border-cyber-outline/20 ml-1.5";

            items.forEach(({ item, index, stream }) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "flex items-center justify-between bg-white dark:bg-cyber-container p-2 rounded-md border border-slate-200/50 dark:border-cyber-outline/40 hover:border-sky-500/40 dark:hover:border-cyber-primary/45 transition-colors shadow-sm";
                
                const isChecked = item.enabled ? "checked" : "";
                itemDiv.innerHTML = `
                    <div class="flex items-center space-x-2.5 truncate flex-1">
                        <input type="checkbox" id="custom-chk-${stream.id}" ${isChecked} onchange="toggleCustomItem(${stream.id})"
                            class="chk-native chk-native--md">
                        <label for="custom-chk-${stream.id}" class="text-[11px] font-bold text-slate-700 dark:text-cyber-text uppercase font-mono mb-0 cursor-pointer select-none truncate">
                            ${stream.name}
                        </label>
                    </div>
                    <div class="flex space-x-1 shrink-0 ml-2">
                        <button onclick="moveCustomItem(${index}, -1)" class="p-1 hover:bg-slate-100 dark:hover:bg-cyber-bg hover:text-sky-500 rounded text-slate-400 transition-colors" title="Move Up">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"></path>
                            </svg>
                        </button>
                        <button onclick="moveCustomItem(${index}, 1)" class="p-1 hover:bg-slate-100 dark:hover:bg-cyber-bg hover:text-sky-500 rounded text-slate-400 transition-colors" title="Move Down">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>
                    </div>
                `;
                itemsContainer.appendChild(itemDiv);
            });

            groupDiv.appendChild(itemsContainer);
            container.appendChild(groupDiv);
        });
    }

    window.toggleCustomItem = function(streamId) {
        const item = customPlaylist.find(i => i.id === streamId);
        if (item) {
            item.enabled = !item.enabled;
        }
        renderCustomPlaylistSettings();
    };

    window.toggleCustomGroup = function(groupName, isChecked) {
        customPlaylist.forEach(item => {
            const stream = streamsData.find(s => s.id === item.id);
            if (stream && (stream.group_name || "Tanpa Grup") === groupName) {
                item.enabled = isChecked;
            }
        });
        renderCustomPlaylistSettings();
    };


    window.moveCustomItem = function(index, direction) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= customPlaylist.length) return;

        // Swap items
        const temp = customPlaylist[index];
        customPlaylist[index] = customPlaylist[targetIndex];
        customPlaylist[targetIndex] = temp;

        renderCustomPlaylistSettings();
    };

    window.changeCustomGridSize = function(size, triggerRender = true) {
        customGridSize = size;
        localStorage.setItem(getStorageKey("cctv_custom_grid_size"), size.toString());
        customPageOffset = 0; // Reset page offset when grid size changes
        [1, 2, 3, 4].forEach(num => {
            const btn = document.getElementById(`cust-grid-btn-${num}`);
            if (btn) {
                if (num === size) {
                    btn.className = "btn-elegant btn-elegant-primary";
                } else {
                    btn.className = "btn-elegant";
                }
            }
        });

        const gridContainer = document.getElementById("custom-cctv-grid");
        if (gridContainer) {
            if (size === 1) {
                gridContainer.className = "grid grid-cols-1 gap-4 transition-all duration-300";
            } else if (size === 2) {
                gridContainer.className = "grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-300";
            } else if (size === 3) {
                gridContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-300";
            } else if (size === 4) {
                gridContainer.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 transition-all duration-300";
            }
        }

        if (triggerRender) {
            renderCustomVideoGrid();
        }
    };


    window.saveCustomPlaylist = function() {
        localStorage.setItem(getStorageKey("cctv_custom_playlist"), JSON.stringify(customPlaylist));
        localStorage.setItem(getStorageKey("cctv_custom_grid_size"), customGridSize.toString());
        customPageOffset = 0; // Reset page offset on playlist load
        renderCustomVideoGrid();
    };

    function renderCustomVideoGrid() {
        if (currentPage !== "custom") return;

        const gridContainer = document.getElementById("custom-cctv-grid");
        const emptyState = document.getElementById("custom-empty-state");
        if (!gridContainer || !emptyState) return;

        if (typeof window.closeAllGridWebRTCConnections === "function") {
            window.closeAllGridWebRTCConnections();
        }

        const viewMode = localStorage.getItem(getStorageKey("cctv_custom_view_mode")) || "custom";
        let activeStreams = [];

        if (viewMode === "group") {
            const selectedGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";

            activeStreams = streamsData.filter(s => s.group_name === selectedGroup);
        } else {
            // Find active feeds from customPlaylist in sequence order
            const activeItems = customPlaylist.filter(item => item.enabled);
            activeItems.forEach(item => {
                const stream = streamsData.find(s => s.id === item.id);
                if (stream) activeStreams.push(stream);
            });
        }
        
        if (activeStreams.length === 0) {
            emptyState.classList.remove("hidden");
            gridContainer.classList.add("hidden");
            const paginationContainer = document.getElementById("custom-cctv-pagination");
            if (paginationContainer) {
                paginationContainer.classList.add("hidden");
            }
            return;
        }


        emptyState.classList.add("hidden");
        gridContainer.classList.remove("hidden");

        const pageCapacity = customGridSize * customGridSize;
        const totalItems = activeStreams.length;
        const totalPages = Math.ceil(totalItems / pageCapacity) || 1;
        
        // Boundaries safety check
        if (customPageOffset >= totalPages) {
            customPageOffset = totalPages - 1;
        }
        if (customPageOffset < 0) {
            customPageOffset = 0;
        }

        const pageStart = customPageOffset * pageCapacity;
        const pageEnd = pageStart + pageCapacity;
        const pageItems = activeStreams.slice(pageStart, pageEnd);
        warmPosterMemoryFromLocal(pageItems.map(s => s.id));
        prefetchServerPosters(pageItems.map(s => s.id));

        // Update pagination UI
        const paginationContainer = document.getElementById("custom-cctv-pagination");
        const pagesContainer = document.getElementById("custom-pagination-pages-container");
        const pageIndicator = document.getElementById("custom-page-indicator");
        const firstBtn = document.getElementById("custom-first-page-btn");
        const prevBtn = document.getElementById("custom-prev-page-btn");
        const nextBtn = document.getElementById("custom-next-page-btn");
        const lastBtn = document.getElementById("custom-last-page-btn");

        if (paginationContainer) {
            if (totalPages <= 1) {
                paginationContainer.classList.add("hidden");
            } else {
                paginationContainer.classList.remove("hidden");
                if (pageIndicator) {
                    pageIndicator.textContent = `Halaman ${customPageOffset + 1} / ${totalPages} · ${totalItems} kamera`;
                }

                updatePaginationNavButtons(firstBtn, prevBtn, nextBtn, lastBtn, customPageOffset, totalPages);
                renderPaginationPageButtons(pagesContainer, customPageOffset, totalPages, (pageIndex) => {
                    window.jumpToCustomPage(pageIndex);
                });
            }
        }

        const customTileFragment = document.createDocumentFragment();
        pageItems.forEach(stream => {
            if (!stream) return;

            const card = document.createElement("div");
            card.id = `custom-cam-tile-${stream.id}`;
            const statusCardClass = stream.status === "online" ? "cctv-card-online" : "cctv-card-offline";
            card.className = `relative cam-placeholder-bg overflow-hidden group aspect-video cursor-pointer ${statusCardClass}`;
            attachCamTileEvents(card, stream);
            
            const statusDotColor = stream.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500";
            const statusLabelText = stream.status === "online" ? "RTSP ONLINE" : "RTSP OFFLINE";
            const statusLabelColor = stream.status === "online" ? "text-emerald-400" : "text-rose-500";
            
            const showTopLeft = (userRole || "").toLowerCase() !== "guest";
            const overlayTopLeftHtml = showTopLeft ? `
                <div class="absolute top-2.5 left-2.5 z-10 bg-[#090e1a]/85 backdrop-blur-md px-2.5 py-1.5 text-[9px] font-mono text-white rounded-md flex items-center space-x-2 border border-white/10 shadow-sm">
                    <span class="w-1.5 h-1.5 rounded-full ${statusDotColor}"></span>
                    <span class="font-bold">CAM_${String(stream.id).padStart(3, '0')}</span>
                    <span class="text-slate-600">|</span>
                    <span class="text-slate-300">${stream.name.toUpperCase()}</span>
                    <span class="text-slate-600">|</span>
                    <span class="font-bold ${statusLabelColor}">${statusLabelText}</span>
                </div>
            ` : "";

            const overlayTop = `
                ${overlayTopLeftHtml}
                <div class="absolute top-2.5 right-2.5 z-10 bg-[#090e1a]/85 backdrop-blur-md px-2.5 py-1.5 text-[9px] font-mono text-white rounded-md border border-white/10 flex items-center space-x-1.5 shadow-sm">
                    <span class="w-1.5 h-1.5 rounded-full ${stream.status === 'online' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}"></span>
                    <span class="font-bold tracking-wider ${stream.status === 'online' ? 'text-red-400' : 'text-slate-400'}">${stream.status === 'online' ? 'REC' : 'LOSS'}</span>
                </div>
            `;

            const overlayBottom = buildTileOverlayBottom();

            if (stream.status === "offline") {
                if (typeof window.primeTilePosterBackground === "function") {
                    window.primeTilePosterBackground(card, stream.id);
                }
                const offlineMarkup = typeof window.buildOfflineTileMediaMarkup === "function" ? window.buildOfflineTileMediaMarkup(stream, true) : "";
                card.innerHTML = `
                    ${overlayTop}
                    ${offlineMarkup}
                    ${overlayBottom}
                `;
                customTileFragment.appendChild(card);
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
                    customTileFragment.appendChild(card);
                    startMockVideoFeed(stream.id, stream.name);
                } else {
                    if (typeof window.primeTilePosterBackground === "function") {
                        window.primeTilePosterBackground(card, stream.id);
                    }
                    const onlineMarkup = typeof window.buildOnlineTileMediaMarkup === "function" ? window.buildOnlineTileMediaMarkup(stream, true) : "";
                    card.innerHTML = `
                        ${overlayTop}
                        ${onlineMarkup}
                        ${overlayBottom}
                    `;
                    customTileFragment.appendChild(card);
                    // Defer WebRTC connection to IntersectionObserver
                }
            }
        });
        gridContainer.replaceChildren(customTileFragment);
        if (typeof window.preloadServerPostersForGrid === "function") {
            window.preloadServerPostersForGrid(gridContainer);
        }
        if (typeof window.setupGridIntersectionObserver === "function") {
            window.setupGridIntersectionObserver();
        }
        if (typeof window.scheduleGridStreamConnect === "function") {
            window.scheduleGridStreamConnect();
        }
    }
    window.renderCustomVideoGrid = renderCustomVideoGrid;

    function populateCustomGroupFilter() {
        const sel = document.getElementById("custom-group-filter");
        if (!sel) return;
        const savedGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";
        const viewMode = localStorage.getItem(getStorageKey("cctv_custom_view_mode")) || "custom";
        const groups = [...new Set(streamsData.map(s => s.group_name).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">All Groups</option>';
        groups.forEach(g => {
            const opt = document.createElement("option");
            opt.value = g;
            opt.textContent = g;
            sel.appendChild(opt);
        });
        sel.value = (viewMode === "group" && savedGroup) ? savedGroup : "";
    }

    window.filterCustomGroupFeeds = function() {
        const val = document.getElementById("custom-group-filter")?.value || "";
        const modeSelect = document.getElementById("custom-view-mode");
        if (val) {
            if (modeSelect) modeSelect.value = "group";
            toggleCustomViewMode("group");
            loadGroupIntoCustomVideoGrid(val);
        } else {
            if (modeSelect) modeSelect.value = "custom";
            toggleCustomViewMode("custom");
        }
    };

    window.toggleCustomViewMode = function(mode) {
        localStorage.setItem(getStorageKey("cctv_custom_view_mode"), mode);
        
        const pCustom = document.getElementById("panel-mode-custom");
        const pGroup = document.getElementById("panel-mode-group");
        const modeSelect = document.getElementById("custom-view-mode");

        if (modeSelect) modeSelect.value = mode;

        const groupFilter = document.getElementById("custom-group-filter");
        if (groupFilter) {
            if (mode === "group") {
                const activeGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";
                groupFilter.value = activeGroup;
            } else {
                groupFilter.value = "";
            }
        }

        if (mode === "group") {
            pCustom?.classList.add("hidden");
            pGroup?.classList.remove("hidden");
            
            const selectedGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";
            renderCustomGroupsList();
            loadGroupIntoCustomVideoGrid(selectedGroup);
        } else {
            pCustom?.classList.remove("hidden");
            pGroup?.classList.add("hidden");
            
            // Re-load custom playlist grid size
            const savedSize = localStorage.getItem(getStorageKey("cctv_custom_grid_size"));
            customGridSize = savedSize ? parseInt(savedSize) : 3;
            changeCustomGridSize(customGridSize, false);
            renderCustomVideoGrid();
        }
    };

    window.loadGroupIntoCustomVideoGrid = function(groupName) {
        customPageOffset = 0; // Reset page offset on group change
        localStorage.setItem(getStorageKey("cctv_custom_selected_group"), groupName || "");


        const groupFilter = document.getElementById("custom-group-filter");
        if (groupFilter) groupFilter.value = groupName || "";
        
        if (groupName) {
            // Auto-adjust grid size
            const count = streamsData.filter(s => s.group_name === groupName).length;
            if (count <= 1) {
                customGridSize = 1;
            } else if (count <= 4) {
                customGridSize = 2;
            } else if (count <= 9) {
                customGridSize = 3;
            } else {
                customGridSize = 4;
            }
            localStorage.setItem(getStorageKey("cctv_custom_grid_size"), customGridSize.toString());
            changeCustomGridSize(customGridSize, false);
        }

        renderCustomVideoGrid();

        renderCustomGroupsList();
    };

    function renderCustomGroupsList() {
        const container = document.getElementById("custom-groups-list");
        if (!container) return;
        container.innerHTML = "";

        const groups = [...new Set(streamsData.map(s => s.group_name).filter(Boolean))].sort();

        if (groups.length === 0) {
            container.innerHTML = `<p class="text-center text-[10px] text-slate-400 py-3 font-mono">Belum ada grup kamera.</p>`;
            return;
        }

        const activeGroup = localStorage.getItem(getStorageKey("cctv_custom_selected_group")) || "";


        groups.forEach(g => {
            const count = streamsData.filter(s => s.group_name === g).length;
            const isActive = (g === activeGroup);

            const div = document.createElement("div");
            if (isActive) {
                div.className = "flex items-center justify-between p-2 rounded-md bg-sky-500/10 dark:bg-cyber-primary/10 border border-sky-500 dark:border-cyber-primary text-sky-700 dark:text-cyber-primary font-bold cursor-pointer text-xs";
            } else {
                div.className = "flex items-center justify-between p-2 rounded-md bg-white dark:bg-cyber-container border border-slate-200/50 dark:border-cyber-outline/40 hover:border-sky-500/40 dark:hover:border-cyber-primary/45 text-slate-800 dark:text-white transition-colors cursor-pointer text-xs";
            }

            div.onclick = () => {
                loadGroupIntoCustomVideoGrid(g);
            };

            div.innerHTML = `
                <span class="truncate">${g}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-cyber-bg text-slate-500 dark:text-cyber-dim font-bold">${count} Cam</span>
            `;

            container.appendChild(div);
        });
    }

    window.saveCurrentAsNewScreen = function() {
        const nameInput = document.getElementById("new-screen-name");
        if (!nameInput) return;
        const name = nameInput.value.trim();
        if (!name) {
            alert("Harap masukkan nama grouping terlebih dahulu.");
            return;
        }

        // Get currently saved screens list from localStorage
        let savedScreens = [];
        const savedStr = localStorage.getItem(getStorageKey("cctv_custom_screens"));
        if (savedStr) {
            try {
                savedScreens = JSON.parse(savedStr);
            } catch(e) {
                savedScreens = [];
            }
        }

        // Check if name already exists
        const existsIndex = savedScreens.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
        
        const newScreen = {
            name: name,
            playlist: JSON.parse(JSON.stringify(customPlaylist)),
            gridSize: customGridSize
        };

        if (existsIndex >= 0) {
            if (!confirm(`Grouping dengan nama "${name}" sudah ada. Apakah Anda ingin menimpanya?`)) return;
            savedScreens[existsIndex] = newScreen;
        } else {
            savedScreens.push(newScreen);
        }

        localStorage.setItem(getStorageKey("cctv_custom_screens"), JSON.stringify(savedScreens));
        nameInput.value = "";
        renderSavedScreensList();
        alert(`Grouping "${name}" berhasil disimpan!`);
    };

    window.renderSavedScreensList = function() {
        const container = document.getElementById("saved-screens-list");
        if (!container) return;
        container.innerHTML = "";

        let savedScreens = [];
        const savedStr = localStorage.getItem(getStorageKey("cctv_custom_screens"));
        if (savedStr) {
            try {
                savedScreens = JSON.parse(savedStr);
            } catch(e) {
                savedScreens = [];
            }
        }

        if (savedScreens.length === 0) {
            container.innerHTML = `<p class="text-center text-[10px] text-slate-400 py-3 font-mono">Belum ada grouping disimpan.</p>`;
            return;
        }

        savedScreens.forEach(screen => {
            const enabledCount = screen.playlist.filter(p => p.enabled).length;

            const div = document.createElement("div");
            div.className = "flex items-center justify-between p-2 rounded-md bg-white dark:bg-cyber-container border border-slate-200/50 dark:border-cyber-outline/40 hover:border-sky-500/40 dark:hover:border-cyber-primary/45 transition-colors cursor-pointer shadow-sm group";
            
            // Clicking the row loads the screen
            div.onclick = (e) => {
                // Prevent trigger if clicking delete button
                if (e.target.closest('.delete-screen-btn')) return;
                applySavedScreen(screen);
            };

            div.innerHTML = `
                <div class="flex-1 min-w-0 font-mono text-xs pr-2">
                    <div class="font-bold text-slate-800 dark:text-white truncate">${screen.name}</div>
                    <div class="text-[9px] text-slate-400 dark:text-cyber-dim/60 mt-0.5">${enabledCount} Kamera · Grid ${screen.gridSize}x${screen.gridSize}</div>
                </div>
                <button class="delete-screen-btn p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded text-slate-400 transition-colors shrink-0" title="Hapus Grouping">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            `;

            // Bind delete button
            const deleteBtn = div.querySelector('.delete-screen-btn');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteSavedScreen(screen.name);
                };
            }

            container.appendChild(div);
        });
    };

    function applySavedScreen(screen) {
        // Map the saved playlist to current active streams to ensure only authorized ones load
        customPlaylist = [];
        screen.playlist.forEach(item => {
            const exists = streamsData.some(s => s.id === item.id);
            if (exists) {
                customPlaylist.push(item);
            }
        });

        // Add any missing authorized cameras as disabled by default
        streamsData.forEach(stream => {
            const inPlaylist = customPlaylist.some(item => item.id === stream.id);
            if (!inPlaylist) {
                customPlaylist.push({ id: stream.id, enabled: false });
            }
        });

        customGridSize = screen.gridSize;

        // Save as current active in localstorage
        localStorage.setItem(getStorageKey("cctv_custom_playlist"), JSON.stringify(customPlaylist));
        localStorage.setItem(getStorageKey("cctv_custom_grid_size"), customGridSize.toString());

        // Update UI and switch to custom mode
        toggleCustomViewMode("custom");
        renderCustomPlaylistSettings();

        alert(`Grouping "${screen.name}" berhasil dimuat!`);
    }

    function deleteSavedScreen(name) {
        if (!confirm(`Apakah Anda yakin ingin menghapus grouping "${name}"?`)) return;

        let savedScreens = [];
        const savedStr = localStorage.getItem(getStorageKey("cctv_custom_screens"));
        if (savedStr) {
            try {
                savedScreens = JSON.parse(savedStr);
            } catch(e) {
                savedScreens = [];
            }
        }

        savedScreens = savedScreens.filter(s => s.name.toLowerCase() !== name.toLowerCase());
        localStorage.setItem(getStorageKey("cctv_custom_screens"), JSON.stringify(savedScreens));

        renderSavedScreensList();
    }

    function exitWebFullscreen() {
        document.body.classList.remove("web-fullscreen");
        document.getElementById("tab-custom")?.classList.remove("is-fullscreen");
    }
    window.exitWebFullscreen = exitWebFullscreen;

    window.toggleFullscreen = function(containerId) {
        if (containerId !== "custom-cctv-grid") return;

        const isFullscreen = document.body.classList.contains("web-fullscreen");
        if (!isFullscreen && currentPage !== "custom") return;

        const isEntering = !isFullscreen;
        document.body.classList.toggle("web-fullscreen", isEntering);
        const tab = document.getElementById("tab-custom");
        if (tab) tab.classList.toggle("is-fullscreen", isEntering);
        if (isEntering) {
            requestAnimationFrame(() => {
                document.getElementById(containerId)?.scrollIntoView({ block: "start" });
            });
        }
    };

    // Listen for Escape key to exit web-fullscreen mode
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            exitWebFullscreen();
        }
    });

    // Tab API Integration hanya untuk Super Admin: kunci API menerbitkan
    // tautan sematan publik yang melewati login, jadi wewenangnya melampaui
    // peran Admin. Server menolak dengan 403; ini sekadar tidak menawarkan
    // pintu yang pasti terkunci.
    window.terapkanBatasTabAdmin = function() {
        const tombol = document.getElementById("admin-subtab-btn-api");
        if (!tombol) return;
        const boleh = window.kuasaPenuh(userRole);
        tombol.classList.toggle("hidden", !boleh);
        const panel = document.getElementById("admin-subtab-api");
        if (!boleh && panel && !panel.classList.contains("hidden")) {
            window.switchAdminTab("streams");
        }
    };

    window.switchAdminTab = function(tabName) {
        // Menolak lompatan langsung, termasuk lewat konsol peramban.
        if (tabName === "api" && !window.kuasaPenuh(userRole)) {
            tabName = "streams";
        }
        ["streams", "users", "access", "scanner", "ads", "api"].forEach(tab => {
            const contentEl = document.getElementById(`admin-subtab-${tab}`);
            const btnEl = document.getElementById(`admin-subtab-btn-${tab}`);
            const isMatch = (tab === tabName);

            if (contentEl) {
                if (isMatch) {
                    contentEl.classList.remove("hidden");
                    contentEl.style.setProperty("display", "block", "important");
                } else {
                    contentEl.classList.add("hidden");
                    contentEl.style.setProperty("display", "none", "important");
                }
            }
            if (btnEl) {
                if (isMatch) {
                    btnEl.classList.add("is-active");
                } else {
                    btnEl.classList.remove("is-active");
                }
            }
        });

        // Computed style check after toggle


        if (tabName === "streams") {
            if (typeof renderAdminStreamsTable === "function") {
                renderAdminStreamsTable({ keepPage: true });
            }
        } else if (tabName === "users") {
            if (typeof renderAdminUsersTable === "function") {
                renderAdminUsersTable();
            }
        } else if (tabName === "access") {
            if (typeof window.muatIkhtisarAkses === "function") {
                window.muatIkhtisarAkses();
            }
        } else if (tabName === "ads") {
            if (typeof window.updateLiveAdPreview === "function") {
                window.updateLiveAdPreview();
            }
        } else if (tabName === "api") {
            if (typeof window.populateApiCameraSelect === "function") {
                window.populateApiCameraSelect();
            }
            if (typeof window.loadApiKeysList === "function") {
                window.loadApiKeysList();
            }
            if (typeof window.loadApiAccessLogs === "function") {
                window.loadApiAccessLogs();
            }
        }
    };

    // --- Camera Access Overview ---
    let ikhtisarAkses = null;
    let arahAkses = "grup";
    // Grup yang sedang dibentangkan. Disimpan supaya tetap terbuka setelah
    // daftar disusun ulang, misalnya sesudah pengaturan disimpan.
    const grupTerbentang = new Set();

    // Baris kamera yang dibentangkan di kartu ponsel (klik untuk detail).
    const streamTerbentang = new Set();
    window.toggleStreamCard = function(id, evt) {
        if (evt && evt.target.closest("button,a,input,label")) return;
        if (streamTerbentang.has(id)) streamTerbentang.delete(id);
        else streamTerbentang.add(id);
        window.filterStreamsTable({ keepPage: true });
    };

    function sorotArah() {
        [["grup", "akses-arah-akun"], ["kamera", "akses-arah-kamera"]]
            .forEach(([nilai, id]) => {
                const el = document.getElementById(id);
                if (!el) return;
                const aktif = (arahAkses === nilai);
                el.className = "ms-btn-toggle px-3 py-2 text-[10px] font-bold uppercase "
                    + "tracking-wider font-mono rounded-lg border "
                    + "transition-colors cursor-pointer"
                    + (aktif ? " ms-btn-toggle--active" : "");
            });
    }

    window.bentangGrup = function(namaTersandi) {
        const nama = decodeURIComponent(namaTersandi);
        if (grupTerbentang.has(nama)) grupTerbentang.delete(nama);
        else grupTerbentang.add(nama);
        window.renderIkhtisarAkses();
    };

    window.gantiArahAkses = function(arah) {
        arahAkses = arah;
        sorotArah();
        window.renderIkhtisarAkses();
    };

    window.muatIkhtisarAkses = async function() {
        const body = document.getElementById("akses-table-body");
        try {
            const res = await fetch(`${API_URL}/admin/access-overview`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            ikhtisarAkses = await res.json();
            sorotArah();
            window.renderIkhtisarAkses();
        } catch (e) {
            if (body) {
                body.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-xs text-rose-500 font-mono">Gagal memuat data akses: ${e.message}</td></tr>`;
            }
        }
    };

    window.renderIkhtisarAkses = function() {
        const body = document.getElementById("akses-table-body");
        if (!body || !ikhtisarAkses) return;

        const cari = (document.getElementById("akses-cari")?.value || "")
            .trim().toLowerCase();
        const perAkun = (arahAkses === "grup");

        document.getElementById("akses-kol-1").textContent = perAkun ? "Group / Account" : "Camera";
        document.getElementById("akses-kol-2").textContent = perAkun ? "Members" : "Group";
        document.getElementById("akses-kol-jml").textContent = perAkun ? "Cameras" : "Holders";


        // Grup lebih dulu, lalu akun yang berdiri sendiri (user dan guest).
        let baris = perAkun
            ? [...(ikhtisarAkses.per_grup || []), ...ikhtisarAkses.per_akun]
            : ikhtisarAkses.per_kamera;
        if (cari) {
            baris = baris.filter(b => {
                const utama = (perAkun ? (b.grup || b.username) : b.stream_name)
                    .toLowerCase();
                if (utama.includes(cari)) return true;
                // Nama anggota ikut dicari: orang mencari "admin1", bukan
                // nama grupnya, ketika hendak tahu apa yang ia pegang.
                if (b.anggota && b.anggota.some(
                    a => a.username.toLowerCase().includes(cari))) return true;
                const anak = perAkun ? b.kamera : b.pemegang;
                return anak.some(d => (perAkun ? d.stream_name : d.username)
                    .toLowerCase().includes(cari));
            });
        }

        const lencana = document.getElementById("admin-subtab-access-badge");
        if (lencana) lencana.textContent = String(baris.length);

        if (!baris.length) {
            body.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">Tidak ada yang cocok.</td></tr>`;
            return;
        }

        body.innerHTML = baris.map((b, i) => {
            // Daftar kamera tidak lagi dicetak di sini. Satu akun dapat
            // memegang puluhan kamera, dan mencetak namanya satu per satu
            // membuat satu baris setinggi layar. Jumlahnya cukup untuk
            // memindai; rinciannya ada di balik tombol Atur.
            const anak = perAkun ? b.kamera : b.pemegang;

            const grup = b.grup !== undefined;

            let aksi = `<span class="aksi-isi"><span class="text-slate-400 dark:text-cyber-dim/40 text-[9px] uppercase">—</span></span>`;
            if (!perAkun) {
                // Arah Per Kamera: satu kamera, siapa saja yang berhak.
                const namaAman = String(b.stream_name || "")
                    .replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                aksi = `<span class="aksi-isi"><button onclick="window.bukaBerbagiKamera(${b.stream_id}, '${namaAman}')" class="ang-tombol" title="Atur siapa saja yang boleh melihat ${b.stream_name}">ATUR</button></span>`;
            } else if (perAkun) {
                if (b.cara_atur === "grup") {
                    aksi = `<span class="aksi-isi"><button onclick="event.stopPropagation(); window.bukaAksesGrup('${encodeURIComponent(b.grup)}')" class="ang-tombol" title="Atur kamera untuk grup ${b.grup}">Atur</button></span>`;
                } else if (b.cara_atur === "pemberian") {
                    aksi = `<span class="aksi-isi"><button onclick="window.bukaAksesKamera(${b.user_id})" class="ang-tombol" title="Atur kamera untuk ${b.username}">Atur</button></span>`;
                }
            }

            // Anggota grup dibentangkan atas permintaan: menampilkan semua
            // sekaligus menenggelamkan daftar kameranya.
            let kol2;
            let barisRinci = "";
            let buka = false;
            if (!perAkun) {
                kol2 = `<span class="ang-nama">${b.group_name || "Default"}</span>`;
            } else if (grup) {
                buka = grupTerbentang.has(b.grup);
                // Tiap anggota jadi satu baris utuh: inisial, nama, peran,
                // lalu satu tindakan. Admin mengikuti kamera grupnya, jadi
                // ia bertanda "otomatis"; User diatur sendiri dan membawa
                // tombolnya. Grup adalah satu-satunya tempat mengatur
                // mereka, sebab akun bergrup tidak lagi berbaris di bawah.
                const jml = (b.anggota || []).length;
                // Isi hanya disusun ketika panelnya memang terbuka: baris
                // yang tersembunyi tetap terbaca pembaca layar dan pencarian
                // dalam halaman, sehingga menemukan nama di grup yang
                // tertutup — padahal layar tidak menampilkannya.
                let anggota = "";
                if (buka) {
                    // Tiap anggota jadi satu baris tabel tersendiri dengan
                    // kolom yang sama persis dengan induknya, sehingga Jml,
                    // Kamera, dan Aksi miliknya jatuh lurus di bawah judul
                    // kolomnya masing-masing.
                    const jmlAnggota = (b.anggota || []).length;
                    anggota = (b.anggota || []).map((a, iA) => {
                        const peran = (a.role || "").replace("_", " ");
                        const tanda = a.otomatis
                            ? `<span class="aksi-isi"><span class="ang-tanda ang-tanda--auto" title="Admin grup mengikuti kamera grupnya; tidak diatur satu per satu">otomatis</span></span>`
                            : `<span class="aksi-isi"><button onclick="window.bukaAksesKamera(${a.user_id})" class="ang-tombol" title="Atur kamera untuk ${a.username}">Atur</button></span>`;
                        return `<tr class="ang-baris-anggota${iA === jmlAnggota - 1 ? " ang-baris-anggota--akhir" : ""}" onclick="event.stopPropagation();">
                            <td class="py-2 px-4"></td>
                            <td class="py-2 px-4">
                                <span class="ang-anak">
                                    
                                    <span class="ang-nama" title="${a.username}">${a.username}</span>
                                </span>
                            </td>
                            <td class="py-2 px-4"><span class="ang-peran">${peran}</span></td>
                            <td class="py-2 px-4 text-center ang-jml">${a.jumlah_kamera}</td>
                            <td class="py-2 px-4 aksi-sel">${tanda}</td>
                        </tr>`;
                    }).join("");
                }
                // Pemicu memenuhi lebar kolomnya: sasaran klik seluas sel,
                // bukan hanya selebar tulisannya. Rincian admin dipindahkan
                // ke dalam panel — kepala baris cukup menyebut jumlahnya.
                // Panelnya sendiri turun ke baris tersendiri di bawah; bila
                // ia tinggal di sel ini, sel-sel tetangga ikut melar
                // mengikuti tingginya dan meninggalkan bidang kosong.
                kol2 = `<button type="button" onclick="event.stopPropagation(); window.bentangGrup('${encodeURIComponent(b.grup)}')"
                        class="ang-pemicu${buka ? " ang-pemicu--buka" : ""}"
                        aria-expanded="${buka}">
                        <span class="ang-pemicu-jml">${jml}</span>
                        <span class="ang-pemicu-teks">anggota</span>
                    </button>`;
                barisRinci = buka
                    ? (anggota || `<tr class="ang-baris-anggota"><td colspan="5" class="px-4 py-2"><span class="ang-kosong">Belum ada anggota</span></td></tr>`)
                    : "";
            } else {
                kol2 = `<span class="ang-peran">${(b.role || "").replace("_", " ")}</span>`;
            }

            // Seluruh baris grup menjadi sasaran klik: menuntut orang mengenai
            // tombol kecil di satu kolom membuat baris terasa mati di tempat
            // lain. Tombol di dalamnya tetap menang lewat stopPropagation.
            const baris_klik = (perAkun && grup)
                ? ` onclick="window.bentangGrup('${encodeURIComponent(b.grup)}')" class="ang-baris-grup${buka ? " ang-baris-grup--buka" : ""} hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors align-middle"`
                : ` class="hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors align-middle"`;
            return `<tr${baris_klik}>
                <td class="py-3.5 px-4 font-bold text-slate-500 dark:text-cyber-dim">${i + 1}</td>
                <td class="py-3.5 px-4">
                    ${perAkun && grup
                        ? `<span class="inline-flex items-center gap-1.5">
                               <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/30">Grup</span>
                               <span class="ang-nama">${b.grup}</span>
                           </span>`
                        : `<span class="ang-nama">${perAkun ? b.username : b.stream_name}</span>`}
                </td>
                <td class="py-3.5 px-4">${kol2}</td>
                <td class="py-3.5 px-4 text-center ang-jml">${b.jumlah}</td>
                <td class="py-3.5 px-4 aksi-sel">${aksi}</td>
            </tr>${barisRinci}`;
        }).join("");
    };

    // --- Modal: siapa saja yang berhak atas satu kamera ---
    // Arah Per Kamera menjawab pertanyaan sebaliknya dari arah Grup: bukan
    // "akun ini pegang kamera apa", tetapi "kamera ini dipegang siapa".
    let berbagiKini = null;

    window.bukaBerbagiKamera = async function(streamId, namaKamera) {
        const modal = document.getElementById("berbagi-modal");
        if (!modal) return;
        berbagiKini = { stream_id: streamId, penerima: [], grup: [] };

        const judul = document.getElementById("berbagi-modal-subtitle");
        if (judul) judul.textContent = `Atur siapa saja yang boleh melihat ${namaKamera || "kamera ini"}`;

        const daftar = document.getElementById("berbagi-daftar");
        if (daftar) daftar.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">Memuat&hellip;</p>`;
        const cari = document.getElementById("berbagi-cari");
        if (cari) cari.value = "";
        modal.classList.remove("hidden");

        // Grup dibaca dari ikhtisar yang sudah termuat: baris pemegang
        // berperan "grup" sudah ada di sana, jadi tak perlu memanggil lagi.
        const barisKamera = (ikhtisarAkses?.per_kamera || [])
            .find(b => b.stream_id === streamId);
        berbagiKini.grup = (barisKamera?.pemegang || [])
            .filter(p => (p.role || "").toLowerCase() === "grup");

        try {
            const r = await fetch(`${API_URL}/admin/streams/${streamId}/sharing`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (r.status === 401) { window.handleLogout(); return; }
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            berbagiKini.penerima = d.penerima || [];
            gambarBerbagi();
        } catch (e) {
            if (daftar) {
                daftar.innerHTML = `<p class="text-center text-xs text-rose-500 py-4 font-mono">Gagal memuat: ${e.message}</p>`;
            }
        }
    };

    function gambarBerbagi() {
        const daftar = document.getElementById("berbagi-daftar");
        const bagianGrup = document.getElementById("berbagi-grup-bagian");
        const daftarGrup = document.getElementById("berbagi-grup-daftar");
        if (!daftar || !berbagiKini) return;

        const grup = berbagiKini.grup || [];
        if (bagianGrup) bagianGrup.classList.toggle("hidden", grup.length === 0);
        if (daftarGrup) {
            daftarGrup.innerHTML = grup.map(g => `
                <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-cyber-surface2/60">
                    <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-sm bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400">Grup</span>
                    <span class="ang-nama flex-1">${g.username}</span>
                    <span class="text-[9px] uppercase font-mono text-slate-400 dark:text-cyber-dim/70">lewat pemilik</span>
                </div>`).join("");
        }

        const cari = (document.getElementById("berbagi-cari")?.value || "")
            .trim().toLowerCase();
        const tampil = berbagiKini.penerima.filter(
            p => !cari || p.username.toLowerCase().includes(cari));

        const hitung = document.getElementById("berbagi-hitung");
        if (hitung) {
            const aktif = berbagiKini.penerima.filter(p => p.can_view || p.can_playback).length;
            hitung.textContent = `${aktif} / ${berbagiKini.penerima.length}`;
        }

        if (!tampil.length) {
            daftar.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">${
                berbagiKini.penerima.length ? "Tak ada akun yang cocok" : "Belum ada akun yang dapat diberi izin"}</p>`;
        } else {
            daftar.innerHTML = tampil.map(p => {
                // Pemberian Admin lain tetap tampil: menyembunyikannya membuat
                // akses yang tak terjelaskan. Tampil, tetapi tak dapat diubah.
                const mati = p.terkunci ? " disabled" : "";
                const ket = p.terkunci
                    ? `<span class="text-[9px] font-mono text-amber-600 dark:text-amber-500" title="Hanya pemberinya yang dapat mencabut">oleh ${p.granted_by_username || "admin lain"}</span>`
                    : "";
                return `
                <div class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors${p.terkunci ? " opacity-70" : ""}">
                    <span class="flex-1 min-w-0">
                        <span class="ang-nama block truncate">${p.username}</span>
                        <span class="ang-peran">${(p.role || "").toUpperCase()}</span> ${ket}
                    </span>
                    <span class="w-14 flex justify-center">
                        <input type="checkbox" data-uid="${p.user_id}" data-jenis="view"
                               onchange="window.ubahBerbagi(${p.user_id}, 'view', this.checked)"
                               ${p.can_view ? "checked" : ""}${mati}
                               aria-label="Lihat ${p.username}"
                               class="w-4 h-4 rounded border-slate-300 dark:border-cyber-outline text-brand-blue cursor-pointer disabled:cursor-not-allowed">
                    </span>
                    <span class="w-16 flex justify-center">
                        <input type="checkbox" data-uid="${p.user_id}" data-jenis="playback"
                               onchange="window.ubahBerbagi(${p.user_id}, 'playback', this.checked)"
                               ${p.can_playback ? "checked" : ""}${mati}
                               aria-label="Rekaman ${p.username}"
                               class="w-4 h-4 rounded border-slate-300 dark:border-cyber-outline text-brand-blue cursor-pointer disabled:cursor-not-allowed">
                    </span>
                </div>`;
            }).join("");
        }

        const terkunci = berbagiKini.penerima.filter(p => p.terkunci).length;
        const catatan = document.getElementById("berbagi-catatan");
        if (catatan) {
            catatan.classList.toggle("hidden", terkunci === 0);
            catatan.textContent = terkunci
                ? `${terkunci} baris diberikan admin lain dan hanya dapat dicabut olehnya.`
                : "";
        }
    }

    window.saringBerbagi = gambarBerbagi;

    window.ubahBerbagi = function(userId, jenis, nyala) {
        if (!berbagiKini) return;
        const p = berbagiKini.penerima.find(x => x.user_id === userId);
        if (!p || p.terkunci) return;
        if (jenis === "view") {
            p.can_view = nyala;
            // Rekaman tanpa live tidak berarti apa-apa: pemutarnya sama.
            if (!nyala) p.can_playback = false;
        } else {
            p.can_playback = nyala;
            // Memberi rekaman berarti memberi live juga; menyimpannya tanpa
            // itu menghasilkan izin yang tak dapat dipakai.
            if (nyala) p.can_view = true;
        }
        gambarBerbagi();
    };

    window.simpanBerbagiKamera = async function() {
        if (!berbagiKini) return;
        const tombol = document.getElementById("berbagi-simpan");
        if (tombol) { tombol.disabled = true; tombol.textContent = "Menyimpan…"; }
        try {
            // Baris tanpa izin apa pun ditolak backend; yang dimatikan
            // centangnya memang harus keluar dari daftar, bukan dikirim kosong.
            const penerima = berbagiKini.penerima
                .filter(p => !p.terkunci && (p.can_view || p.can_playback))
                .map(p => ({ user_id: p.user_id,
                             can_view: !!p.can_view,
                             can_playback: !!p.can_playback }));
            const r = await fetch(`${API_URL}/admin/streams/${berbagiKini.stream_id}/sharing`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${userToken}`,
                           "Content-Type": "application/json" },
                body: JSON.stringify({ penerima })
            });
            if (r.status === 401) { window.handleLogout(); return; }
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
            const dilewati = (d.dilewati_bukan_milik_anda || []).length;
            window.tutupBerbagiKamera();
            await window.muatIkhtisarAkses();
            if (dilewati) {
                alert(`Tersimpan. ${dilewati} baris dibiarkan utuh karena diberikan admin lain.`);
            }
        } catch (e) {
            alert(`Gagal menyimpan: ${e.message}`);
        } finally {
            if (tombol) { tombol.disabled = false; tombol.textContent = "Simpan"; }
        }
    };

    window.tutupBerbagiKamera = function() {
        const modal = document.getElementById("berbagi-modal");
        if (modal) modal.classList.add("hidden");
        berbagiKini = null;
    };

    // --- Modal: kelola akses kamera per akun ---
    // Grup yang sedang diatur lewat modal. Kosong berarti modal sedang
    // mengatur sebuah akun, bukan grup.
    let grupDiatur = "";

    // Mode tambah membiarkan pemilihan; mode atur sudah punya sasaran, jadi
    // yang tampil cukup namanya. Dropdown tetap hidup di balik layar sebagai
    // sumber nilai — bukan sekadar disembunyikan demi rupa.
    function pasangModeAkun(mode, label) {
        const wrapPilih = document.getElementById("akses-modal-pilih-akun-wrap");
        const wrapTetap = document.getElementById("akses-modal-akun-tetap");
        const nama = document.getElementById("akses-modal-akun-nama");
        const sunting = mode === "atur";
        if (wrapPilih) wrapPilih.classList.toggle("hidden", sunting);
        if (wrapTetap) wrapTetap.classList.toggle("hidden", !sunting);
        if (nama) nama.textContent = label || "";
    }

    window.bukaAksesGrup = function(namaTersandi) {
        const nama = decodeURIComponent(namaTersandi);
        const modal = document.getElementById("akses-modal");
        const sel = document.getElementById("akses-modal-akun");
        if (!modal || !sel) return;

        grupDiatur = nama;
        // Pemilih akun tidak berlaku untuk grup: sasarannya sudah pasti.
        sel.innerHTML = `<option value="grup">Grup: ${nama}</option>`;
        sel.value = "grup";
        sel.disabled = true;
        pasangModeAkun("atur", `Grup: ${nama}`);

        modal.classList.remove("hidden");
        window.muatKameraAkses();
    };

    window.bukaAksesKamera = function(userId) {
        grupDiatur = "";
        const selAkun = document.getElementById("akses-modal-akun");
        if (selAkun) selAkun.disabled = false;
        const modal = document.getElementById("akses-modal");
        const sel = document.getElementById("akses-modal-akun");
        if (!modal || !sel) return;

        // Super Admin tidak ikut: ia sudah melihat segalanya, tidak ada
        // yang perlu diberikan. Admin ikut, tetapi hanya bila yang membuka
        // adalah Super Admin — Admin tidak boleh memberi sesamanya.
        const calon = (adminUsers || []).filter(u => {
            if (window.kuasaPenuh(u.role)) return false;
            if ((u.role || "").toLowerCase() === "admin") {
                return window.kuasaPenuh(userRole);
            }
            return true;
        });
        // Admin didahulukan: merekalah yang paling jarang diatur sehingga
        // paling mudah terlewat di daftar yang panjang.
        const urut = { admin: 0, user: 1, guest: 2 };
        calon.sort((a, b) => {
            const p = (urut[(a.role || "").toLowerCase()] ?? 9)
                    - (urut[(b.role || "").toLowerCase()] ?? 9);
            return p || a.username.localeCompare(b.username);
        });
        sel.innerHTML = `<option value="">Pilih akun</option>`
            + calon.map(u => `<option value="${u.id}">${u.username} (${(u.role || "").toUpperCase()})</option>`).join("");

        if (userId) sel.value = String(userId);

        // Dipanggil dengan userId berarti tombol Atur pada satu baris: akunnya
        // sudah tertentu, jadi tak ada yang perlu dipilih. Tanpa userId berarti
        // Add Access, dan daftar akun itulah gunanya.
        if (userId) {
            const akun = (adminUsers || []).find(u => String(u.id) === String(userId));
            pasangModeAkun("atur", akun
                ? `${akun.username} (${(akun.role || "").toUpperCase()})`
                : sel.options[sel.selectedIndex]?.text || "");
        } else {
            pasangModeAkun("tambah");
        }

        const daftar = document.getElementById("akses-modal-kamera");
        if (daftar && !sel.value) {
            daftar.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">Pilih akun dahulu</p>`;
        }

        modal.classList.remove("hidden");
        if (sel.value) window.muatKameraAkses();
    };

    window.tutupAksesKamera = function() {
        const modal = document.getElementById("akses-modal");
        if (modal) modal.classList.add("hidden");
        // Dikembalikan agar modal berikutnya tidak mewarisi keadaan grup.
        grupDiatur = "";
        const sel = document.getElementById("akses-modal-akun");
        if (sel) sel.disabled = false;
        pasangModeAkun("tambah");
    };

    function peranAkunTerpilih() {
        // Grup diperlakukan seperti Admin: kolom BAGIKAN berlaku, sebab
        // anggotanya memang boleh meneruskan kamera ke bawahannya.
        if (grupDiatur) return "admin";
        const sel = document.getElementById("akses-modal-akun");
        if (!sel || !sel.value) return "";
        const u = (adminUsers || []).find(x => String(x.id) === sel.value);
        return (u?.role || "").toLowerCase();
    }

    function alamatAkses() {
        if (grupDiatur) {
            return `${API_URL}/admin/groups/`
                + `${encodeURIComponent(grupDiatur)}/camera-grants`;
        }
        const sel = document.getElementById("akses-modal-akun");
        if (!sel || !sel.value) return "";
        return peranAkunTerpilih() === "admin"
            ? `${API_URL}/admin/admins/${sel.value}/camera-grants`
            : `${API_URL}/admin/users/${sel.value}/camera-access`;
    }

    window.muatKameraAkses = async function() {
        const sel = document.getElementById("akses-modal-akun");
        const daftar = document.getElementById("akses-modal-kamera");
        const kolA = document.getElementById("akses-kol-a");
        const kolB = document.getElementById("akses-kol-b");
        const kolC = document.getElementById("akses-kol-c");
        const catatan = document.getElementById("akses-modal-catatan");
        if (!sel || !daftar) return;
        if (!sel.value) {
            daftar.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">Pilih akun dahulu</p>`;
            const kepala = document.getElementById("akses-modal-kepala");
            if (kepala) kepala.classList.add("hidden");
            const hitung = document.getElementById("akses-modal-hitung");
            if (hitung) hitung.textContent = "";
            return;
        }

        // Admin dan User sama-sama diberi LIVE dan REKAMAN. Admin mendapat
        // satu kolom tambahan: izin meneruskan kamera itu ke bawahannya —
        // wewenang yang memang hanya dimiliki Admin.
        const keAdmin = (peranAkunTerpilih() === "admin");
        if (kolA) kolA.textContent = "LIVE";
        if (kolB) kolB.textContent = "REKAMAN";
        if (kolC) {
            kolC.textContent = "BAGIKAN";
            kolC.classList.toggle("hidden", !keAdmin);
        }
        if (catatan) {
            catatan.textContent = keAdmin
                ? "BAGIKAN = boleh meneruskan kamera ke bawahannya"
                : "";
            catatan.classList.toggle("hidden", !keAdmin);
        }

        daftar.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">Memuat…</p>`;
        try {
            const jalur = alamatAkses();
            const res = await fetch(jalur, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();

            if (!d.kamera.length) {
                daftar.innerHTML = `<p class="text-center text-xs text-slate-400 py-4 font-mono">Tidak ada kamera untuk dibagikan</p>`;
                return;
            }

            const grup = {};
            d.kamera.forEach(k => {
                (grup[k.group_name] = grup[k.group_name] || []).push(k);
            });

            daftar.innerHTML = Object.keys(grup).sort().map(nama => `
                <div class="mb-3 akses-grup" data-grup="${nama.toLowerCase()}">
                    <div class="akses-grup-kepala">
                        <p class="akses-grup-nama">${nama}<span class="akses-grup-jumlah">${grup[nama].length}</span></p>
                        <button type="button" onclick="window.pilihGrupAkses(this)"
                            class="akses-grup-tombol"
                            title="Centang atau hapus seluruh grup ini">Semua</button>
                    </div>
                    ${grup[nama].map(k => {
                        // Kamera milik Admin itu sendiri: sudah sepenuhnya di
                        // tangannya, pemberian tambahan tak ada gunanya.
                        const mati = keAdmin ? k.pemilik : k.terkunci;
                        const a = k.can_view;
                        const b = k.can_playback;
                        const c = keAdmin ? k.can_reshare : false;
                        const ket = keAdmin
                            ? (k.pemilik ? "Kamera miliknya sendiri" : k.stream_name)
                            : (k.terkunci ? "Diberikan oleh orang lain; Anda tidak dapat mengubahnya" : k.stream_name);
                        const tanda = keAdmin
                            ? (k.pemilik ? " &#11088;" : "")
                            : (k.terkunci ? " &#128274;" : "");
                        // Alasan baris mati ditulis, bukan hanya dilambangkan:
                        // lambang kecil pada nama tidak memberi tahu apa pun.
                        const sebab = !mati ? "" : (keAdmin
                            ? `<span class="block text-[9px] font-mono text-amber-600/80 dark:text-amber-400/70">kamera miliknya sendiri</span>`
                            : `<span class="block text-[9px] font-mono text-slate-400 dark:text-cyber-dim/60">diberikan oleh orang lain</span>`);
                        return `
                        <div class="akses-baris${mati ? " akses-baris--mati" : ""}" data-nama="${k.stream_name.toLowerCase()}">
                            <span class="min-w-0 pr-2">
                                <span class="block text-[11px] text-slate-700 dark:text-cyber-text truncate" title="${ket}">${k.stream_name}${tanda}</span>
                                ${sebab}
                            </span>
                            <span class="flex items-center gap-2 shrink-0">
                                <span class="akses-kol text-center">
                                    <input type="checkbox" onchange="window.hitungAksesTerpilih()" class="akses-cb-view w-4 h-4 cursor-pointer" data-sid="${k.stream_id}" ${a ? "checked" : ""} ${mati ? "disabled" : ""}>
                                </span>
                                <span class="akses-kol text-center">
                                    <input type="checkbox" onchange="window.hitungAksesTerpilih()" class="akses-cb-play w-4 h-4 cursor-pointer" data-sid="${k.stream_id}" ${b ? "checked" : ""} ${mati ? "disabled" : ""}>
                                </span>
                                <span class="akses-kol text-center ${keAdmin ? "" : "hidden"}">
                                    <input type="checkbox" onchange="window.hitungAksesTerpilih()" class="akses-cb-share w-4 h-4 cursor-pointer" data-sid="${k.stream_id}" ${c ? "checked" : ""} ${mati ? "disabled" : ""}>
                                </span>
                            </span>
                        </div>`;
                    }).join("")}
                </div>`).join("");

            const kepala = document.getElementById("akses-modal-kepala");
            if (kepala) kepala.classList.remove("hidden");
            const cari = document.getElementById("akses-modal-cari");
            if (cari) cari.value = "";
            window.hitungAksesTerpilih();
        } catch (e) {
            daftar.innerHTML = `<p class="text-center text-xs text-rose-500 py-4 font-mono">Gagal memuat kamera: ${e.message}</p>`;
            const kepala = document.getElementById("akses-modal-kepala");
            if (kepala) kepala.classList.add("hidden");
        }
    };

    window.saringKameraAkses = function() {
        const q = (document.getElementById("akses-modal-cari")?.value || "")
            .trim().toLowerCase();
        document.querySelectorAll("#akses-modal-kamera .akses-grup").forEach(g => {
            const grupCocok = g.dataset.grup.includes(q);
            let tampak = 0;
            g.querySelectorAll(".akses-baris").forEach(b => {
                // Grup yang namanya cocok menampilkan seluruh isinya; kalau
                // tidak, tiap kamera dinilai sendiri.
                const ok = !q || grupCocok || b.dataset.nama.includes(q);
                b.classList.toggle("hidden", !ok);
                if (ok) tampak++;
            });
            g.classList.toggle("hidden", tampak === 0);
        });
    };

    window.pilihGrupAkses = function(tombol) {
        const g = tombol.closest(".akses-grup");
        if (!g) return;
        // Hanya baris yang sedang tampak yang terpengaruh, supaya tombol ini
        // tidak diam-diam mengubah kamera yang sedang tersaring keluar.
        const kotak = [...g.querySelectorAll(".akses-baris:not(.hidden) input[type=checkbox]")]
            .filter(cb => !cb.disabled);
        if (!kotak.length) return;
        const semua = kotak.every(cb => cb.checked);
        kotak.forEach(cb => { cb.checked = !semua; });
        window.hitungAksesTerpilih();
    };

    window.hitungAksesTerpilih = function() {
        const el = document.getElementById("akses-modal-hitung");
        if (!el) return;
        const sid = new Set();
        // Hanya live dan rekaman yang menentukan sebuah kamera terpilih.
        // Izin membagikan saja tidak diberikan, jadi tidak ikut dihitung —
        // kalau ikut, angkanya berbeda dari yang benar-benar tersimpan.
        document.querySelectorAll(
            "#akses-modal-kamera .akses-cb-view, #akses-modal-kamera .akses-cb-play")
            .forEach(cb => { if (cb.checked && !cb.disabled) sid.add(cb.dataset.sid); });
        const n = sid.size;

        // Tiap grup memberi tahu berapa kameranya yang terpilih, supaya
        // grup yang belum tersentuh terlihat tanpa membuka isinya.
        document.querySelectorAll("#akses-modal-kamera .akses-grup").forEach(g => {
            const tandaGrup = g.querySelector(".akses-grup-jumlah");
            if (!tandaGrup) return;
            const punya = new Set();
            g.querySelectorAll(".akses-cb-view, .akses-cb-play").forEach(cb => {
                if (cb.checked && !cb.disabled) punya.add(cb.dataset.sid);
            });
            const total = g.querySelectorAll(".akses-baris").length;
            tandaGrup.textContent = punya.size ? `${punya.size}/${total}` : String(total);
            tandaGrup.classList.toggle("akses-grup-jumlah--isi", punya.size > 0);
        });
        el.textContent = n ? `${n} kamera dipilih` : "belum ada yang dipilih";
        // Hanya penanda "ada isinya" yang diubah: menimpa className akan
        // menghapus kelas lencana yang datang dari markup.
        el.classList.toggle("akses-lencana--isi", n > 0);
    };

    window.simpanAksesKamera = async function() {
        const sel = document.getElementById("akses-modal-akun");
        const tombol = document.getElementById("akses-modal-simpan");
        if (!sel || !sel.value) {
            alert("Pilih akun terlebih dahulu.");
            return;
        }

        const keAdmin = (peranAkunTerpilih() === "admin");
        const pilihan = {};
        const kosong = () => keAdmin
            ? { can_view: false, can_playback: false, can_reshare: false }
            : { can_view: false, can_playback: false };

        document.querySelectorAll("#akses-modal-kamera .akses-cb-view").forEach(cb => {
            if (cb.disabled) return;
            const sid = parseInt(cb.dataset.sid, 10);
            pilihan[sid] = pilihan[sid] || Object.assign({ stream_id: sid }, kosong());
            pilihan[sid].can_view = cb.checked;
        });
        document.querySelectorAll("#akses-modal-kamera .akses-cb-play").forEach(cb => {
            if (cb.disabled) return;
            const sid = parseInt(cb.dataset.sid, 10);
            pilihan[sid] = pilihan[sid] || Object.assign({ stream_id: sid }, kosong());
            pilihan[sid].can_playback = cb.checked;
        });
        document.querySelectorAll("#akses-modal-kamera .akses-cb-share").forEach(cb => {
            if (cb.disabled) return;
            const sid = parseInt(cb.dataset.sid, 10);
            pilihan[sid] = pilihan[sid] || Object.assign({ stream_id: sid }, kosong());
            pilihan[sid].can_reshare = cb.checked;
        });

        // Kamera tanpa live maupun rekaman berarti tidak diberikan sama
        // sekali. Berlaku sama untuk Admin dan User sekarang: izin membagikan
        // tanpa hak menonton tidak berarti apa-apa.
        const kamera = Object.values(pilihan)
            .filter(k => k.can_view || k.can_playback);

        if (tombol) { tombol.disabled = true; tombol.textContent = "Menyimpan..."; }
        try {
            const jalurSimpan = alamatAkses();
            const res = await fetch(jalurSimpan, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${userToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ kamera })
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);

            window.tutupAksesKamera();
            if (typeof window.muatIkhtisarAkses === "function") {
                window.muatIkhtisarAkses();
            }
            const dilewati = (d.dilewati_bukan_milik_anda || []).length;
            if (dilewati) {
                alert(`Akses disimpan. ${dilewati} pemberian dari admin lain dibiarkan utuh.`);
            }
        } catch (e) {
            alert(`Gagal menyimpan akses: ${e.message}`);
        } finally {
            if (tombol) { tombol.disabled = false; tombol.textContent = "Simpan Akses"; }
        }
    };

    // --- Ad Configuration Global Handlers ---
    window.handleAdImageUrlInput = function(val) {
        const preview = document.getElementById("ad-image-preview");
        const placeholder = document.getElementById("ad-image-placeholder");
        if (preview && placeholder) {
            if (val.trim()) {
                preview.src = val.trim();
                preview.classList.remove("hidden");
                placeholder.classList.add("hidden");
            } else {
                preview.src = "";
                preview.classList.add("hidden");
                placeholder.classList.remove("hidden");
            }
        }
    };

    window.handleAdImageSelect = async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${API_URL}/admin/ad-config/upload-image`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${userToken}`
                },
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Gagal mengunggah gambar");
            }

            const data = await res.json();
            const adImageUrl = document.getElementById("ad-image-url");
            if (adImageUrl) {
                adImageUrl.value = data.image_url;
                window.handleAdImageUrlInput(data.image_url);
            }
            showApiSuccessBanner("Gambar berhasil diunggah!");
        } catch (err) {
            console.error("Upload error:", err);
            showApiErrorBanner(`Gagal mengunggah gambar: ${err.message}`);
        }
    };

    window.handleSaveAdConfig = async function(event) {
        event.preventDefault();
        
        const adActive = document.getElementById("ad-active");
        const adImageUrl = document.getElementById("ad-image-url");
        const adBgColor = document.getElementById("ad-bg-color");
        const adTextColor = document.getElementById("ad-text-color");
        const adMarqueeText = document.getElementById("ad-marquee-text");
        const adScrollSpeed = document.getElementById("ad-scroll-speed");
        const adFontSize = document.getElementById("ad-font-size");
        const adFontFamily = document.getElementById("ad-font-family");
        const adImageOpacity = document.getElementById("ad-image-opacity");
        const adBgOpacity = document.getElementById("ad-bg-opacity");
        const adTextOpacity = document.getElementById("ad-text-opacity");
        const adBoxWidth = document.getElementById("ad-box-width");
        const adTextAlign = document.getElementById("ad-text-align");
        const adImageSize = document.getElementById("ad-image-size");
        const embedClickToPlay = document.getElementById("embed-click-to-play");
        const embedTimeoutSeconds = document.getElementById("embed-timeout-seconds");

        const payload = {
            is_active: adActive ? adActive.checked : true,
            image_url: adImageUrl ? adImageUrl.value.trim() : "",
            bg_color: adBgColor ? adBgColor.value : "#1e293b",
            text_color: adTextColor ? adTextColor.value : "#ffffff",
            marquee_text: adMarqueeText ? adMarqueeText.value : "",
            scroll_speed: adScrollSpeed ? parseInt(adScrollSpeed.value, 10) : 5,
            font_size: adFontSize ? parseInt(adFontSize.value, 10) : 10,
            font_family: adFontFamily ? adFontFamily.value : "monospace",
            image_opacity: adImageOpacity ? parseFloat(adImageOpacity.value) / 100 : 1.0,
            bg_opacity: adBgOpacity ? parseFloat(adBgOpacity.value) / 100 : 1.0,
            text_opacity: adTextOpacity ? parseFloat(adTextOpacity.value) / 100 : 1.0,
            box_width: adBoxWidth ? parseInt(adBoxWidth.value, 10) : 100,
            text_align: adTextAlign ? adTextAlign.value : "left",
            image_height: adImageSize ? parseInt(adImageSize.value, 10) : 20,
            embed_timeout_seconds: embedTimeoutSeconds ? parseInt(embedTimeoutSeconds.value, 10) : 300,
            click_to_play: embedClickToPlay ? embedClickToPlay.checked : true
        };

        try {
            const res = await fetch(`${API_URL}/admin/ad-config`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Gagal menyimpan konfigurasi");
            }
            const savedData = await res.json();
            window.adConfigData = savedData;
            if (typeof window.updateLiveAdPreview === "function") {
                window.updateLiveAdPreview();
            }
            showApiSuccessBanner("Konfigurasi iklan berhasil disimpan!");
        } catch (err) {
            console.error("Save ad config error:", err);
            showApiErrorBanner(`Gagal menyimpan konfigurasi iklan: ${err.message}`);
        }
    };

    window.handleSaveEmbedConfig = async function(event) {
        event.preventDefault();
        try {
            // Load current adConfig first, so we don't overwrite other fields with defaults
            const resGet = await fetch(`${API_URL}/ad-config`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!resGet.ok) throw new Error("Gagal mengambil konfigurasi");
            const adData = await resGet.json();

            const embedClickToPlay = document.getElementById("embed-click-to-play");
            const embedTimeoutSeconds = document.getElementById("embed-timeout-seconds");

            const payload = {
                ...adData,
                embed_timeout_seconds: embedTimeoutSeconds ? parseInt(embedTimeoutSeconds.value, 10) : 300,
                click_to_play: embedClickToPlay ? embedClickToPlay.checked : true
            };

            const resPost = await fetch(`${API_URL}/admin/ad-config`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${userToken}`
                },
                body: JSON.stringify(payload)
            });

            if (!resPost.ok) {
                const errData = await resPost.json();
                throw new Error(errData.detail || "Gagal menyimpan konfigurasi embed");
            }

            window.showToast("✅ Konfigurasi default Embed Player berhasil disimpan!", "success");
        } catch (err) {
            console.error("Save embed config error:", err);
            window.showToast(`Gagal menyimpan konfigurasi: ${err.message}`, "error");
        }
    };

    // --- API Integration Operations ---
    window.copyTextToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert("Berhasil disalin ke clipboard!");
        }).catch(err => {
            console.error("Gagal menyalin teks: ", err);
        });
    };


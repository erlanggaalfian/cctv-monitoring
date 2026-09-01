    // --- 5. System Administration Operations ---
    async function loadAdminData(options = {}) {
        if ((userRole || "").toLowerCase() !== "admin") {
            renderNonAdminAccessNotice();
            return;
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
            tableBody.innerHTML = `<tr><td colspan="9" class="py-12 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                <div class="flex flex-col items-center space-y-2">
                    <svg class="w-6 h-6 text-slate-300 dark:text-cyber-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>No cameras match your search criteria</span>
                    <button onclick="clearStreamFilter()" class="text-sky-500 hover:underline text-[10px]">Clear filter</button>
                </div>
            </td></tr>`;
            return;
        }

        pageItems.forEach((stream, index) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors text-slate-800 dark:text-cyber-text";
            const groupName = stream.group_name || "-";
            const coordinates = stream.coordinates || "-";
            const rtspUrl = stream.rtsp_url || "-";
            const hasCoords = !!(stream.coordinates && stream.coordinates.trim() && stream.coordinates !== "-");
            const connectionStatus = stream.status || "offline";
            const rowNumber = pageStart + index + 1;

            tr.innerHTML = `
                <td class="py-4 px-4 text-center">
                    <input type="checkbox" class="admin-stream-checkbox w-4 h-4 text-sky-500 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer" 
                        value="${stream.id}" onchange="window.updateSelectedAdminStreamsCount()">
                </td>
                <td class="py-4 px-4 font-bold text-slate-500 dark:text-cyber-dim">${rowNumber}</td>
                <td class="py-4 px-4 font-semibold text-slate-900 dark:text-white">${stream.name}</td>
                <td class="py-4 px-4">
                    <span class="inline-block px-2 py-0.5 bg-sky-50 dark:bg-cyber-primary/10 text-sky-700 dark:text-cyber-primary border border-sky-200 dark:border-cyber-primary/20 rounded text-[10px] font-bold font-mono max-w-24 truncate" title="${groupName}">${groupName}</span>
                </td>
                <td class="py-4 px-4 max-w-36 truncate text-slate-500 dark:text-cyber-dim font-mono text-[10px]" title="${coordinates}">${coordinates}</td>
                <td class="py-4 px-4 max-w-xs truncate text-slate-500 dark:text-cyber-dim font-mono text-[10px] select-all" title="${rtspUrl}">${rtspUrl}</td>
                <td class="py-4 px-4 space-y-1">
                    <div>
                        <span class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${stream.is_active ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30' : 'bg-slate-100 dark:bg-cyber-bg text-slate-500 dark:text-cyber-dim border border-slate-300 dark:border-cyber-outline/40'}">
                            ${stream.is_active ? 'ACTIVE' : 'DISABLED'}
                        </span>
                    </div>
                    <div>
                        <span id="admin-stream-status-${stream.id}" class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${connectionStatus === 'online' ? 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-cyber-primary border border-sky-200/50 dark:border-cyber-primary/20' : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-cyber-error border border-rose-200/50 dark:border-cyber-error/20'}">
                            ${connectionStatus === 'online' ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                    </div>
                </td>
                <td class="py-4 px-4 text-center">
                    ${stream.record_enabled ? `<span class="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/30">
                        <svg class="w-2.5 h-2.5 mr-0.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
                        REC
                    </span>` : `<span class="text-[9px] text-slate-300 dark:text-slate-600">—</span>`}
                </td>
                <td class="py-4 px-4 text-right space-x-2">
                    <button onclick="window.viewAdminStream(${stream.id})" class="text-amber-600 dark:text-amber-400 hover:underline font-bold text-[11px] uppercase">
                        View
                    </button>
                    <button onclick="openMapModal(${stream.id})" title="${hasCoords ? 'View on Map' : 'No coordinates set'}" class="${hasCoords ? 'text-emerald-600 dark:text-emerald-400 hover:underline' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'} font-bold text-[11px] uppercase">
                        &#9737; Map
                    </button>
                    <button onclick="openEditStreamModal(${stream.id})" class="text-sky-600 dark:text-cyber-primary hover:underline font-bold text-[11px] uppercase">Edit</button>
                    <button onclick="deleteStream(${stream.id})" class="text-red-500 dark:text-cyber-error hover:underline font-bold text-[11px] uppercase">Delete</button>
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
                                class="group-select-checkbox w-4 h-4 text-sky-500 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer">
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
                                class="permissions-modal-checkbox w-3.5 h-3.5 text-sky-600 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer">
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
        if (mRtsp) mRtsp.value = stream.rtsp_url;
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

        adminUsers.forEach((user, index) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50 dark:hover:bg-cyber-hover/35 transition-colors border-b border-slate-100 dark:border-cyber-outline/20 text-slate-800 dark:text-cyber-text";
            
            const permissionsBtn = (user.role || "").toLowerCase() !== "admin"
                ? `<button onclick="openPermissionsModal(${user.id})" class="text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-[11px] uppercase">Access</button>`
                : `<span class="text-slate-400 dark:text-cyber-dim/40 text-[9px] uppercase font-mono">All Access</span>`;
            
            tr.innerHTML = `
                <td class="py-4 px-4 font-bold text-slate-500 dark:text-cyber-dim">${index + 1}</td>
                <td class="py-4 px-4 font-semibold text-slate-900 dark:text-white">${user.username}</td>
                <td class="py-4 px-4">
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded-sm ${(user.role || "").toLowerCase() === 'admin' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30' : (user.role || "").toLowerCase() === 'user' ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/30' : 'bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50'}">
                        ${(user.role || '').toUpperCase()}
                    </span>
                </td>
                <td class="py-4 px-4 text-right space-x-3.5">
                    ${permissionsBtn}
                    <button onclick="openEditUserModal(${user.id})" class="text-sky-600 dark:text-cyber-primary hover:underline font-bold text-[11px] uppercase">Edit</button>
                    <button onclick="deleteUser(${user.id})" class="text-red-500 dark:text-cyber-error hover:underline font-bold text-[11px] uppercase">Delete</button>
                </td>
            `;
            tableBody.appendChild(tr);
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
        if (passwordVal && passwordVal.trim() !== "") {
            payload.password = passwordVal;
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
                        class="w-3.5 h-3.5 text-sky-600 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer">
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
                            class="w-4 h-4 text-sky-600 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer">
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

    window.switchAdminTab = function(tabName) {
        ["streams", "users", "scanner", "ads", "api"].forEach(tab => {
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


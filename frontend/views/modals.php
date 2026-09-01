<!-- ============================================================ -->
<!-- MODAL: CRUD Stream Edit / Create                             -->
<!-- ============================================================ -->
<div id="stream-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--pad" style="max-width: 32rem;">
        <div class="flex justify-between items-center border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-5">
            <h3 id="modal-title" class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Add CCTV Stream URL</h3>
            <button onclick="closeStreamModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <form id="stream-form" onsubmit="handleStreamSubmit(event)" class="space-y-4">
            <input type="hidden" id="modal-stream-id">
            <div>
                <label for="modal-stream-name" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Camera Name / ID</label>
                <input type="text" id="modal-stream-name" required
                    class="app-input w-full"
                    placeholder="e.g., Office Back Entrance">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label for="modal-stream-group" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Camera Group</label>
                    <input type="text" id="modal-stream-group" list="existing-groups-list" required
                        class="app-input w-full"
                        placeholder="e.g., Kantor">
                    <datalist id="existing-groups-list">
                        <!-- Dynamically populated via JS -->
                    </datalist>
                </div>
                <div>
                    <label for="modal-stream-coordinates" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Coordinates (lat, lon)</label>
                    <input type="text" id="modal-stream-coordinates"
                        class="app-input w-full"
                        placeholder="-6.2095, 106.8456">
                </div>
            </div>
            <div>
                <label for="modal-stream-rtsp" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">RTSP Target URL (Raw Source)</label>
                <input type="text" id="modal-stream-rtsp" required
                    class="app-input w-full"
                    placeholder="rtsp://username:password@ip_address:554/path">
                <p class="text-[9px] text-slate-400 dark:text-cyber-dim/60 mt-1.5 font-mono">RTSP credential links will remain securely hidden from user role profiles.</p>
            </div>

            <!-- Toggle Switches -->
            <div class="space-y-2">
                <!-- Active Feed Toggle -->
                <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                    <div class="flex items-center space-x-2.5">
                        <div class="p-1.5 rounded-md bg-emerald-500/10">
                            <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.07 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono">Active Feed</span>
                            <span class="text-[9px] text-slate-400 dark:text-slate-500 font-mono">Camera will be visible to users</span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="modal-stream-active" class="sr-only peer" checked>
                        <div class="w-10 h-5 bg-slate-300 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>

                <!-- Recording Toggle -->
                <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                    <div class="flex items-center space-x-2.5">
                        <div class="p-1.5 rounded-md bg-rose-500/10">
                            <svg class="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-rose-600 dark:text-rose-400 font-mono">Recording</span>
                            <span class="text-[9px] text-slate-400 dark:text-slate-500 font-mono">Simpan rekaman ke disk</span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="modal-stream-record" class="sr-only peer"
                            onchange="document.getElementById('recording-options').classList.toggle('hidden', !this.checked)">
                        <div class="w-10 h-5 bg-slate-300 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                </div>
            </div>

            <!-- Recording Options (expandable) -->
            <div id="recording-options" class="hidden space-y-3 p-3 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/40 dark:border-rose-800/30">
                <div>
                    <label for="modal-stream-disk" class="block text-[10px] font-bold uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70 mb-1.5 font-mono">Save to Disk</label>
                    <select id="modal-stream-disk" class="app-input w-full text-xs">
                        <option value="/">/ (Root)</option>
                    </select>
                    <p id="disk-info" class="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-mono"></p>
                </div>
                <div class="p-2.5 bg-white/60 dark:bg-slate-900/40 rounded-lg border border-rose-200/30 dark:border-rose-800/20">
                    <p class="text-[10px] font-bold uppercase tracking-wider text-rose-600/60 dark:text-rose-400/60 font-mono mb-1">Recording Path</p>
                    <p id="record-path-preview" class="text-[11px] font-mono text-sky-600 dark:text-sky-400 break-all font-semibold">{disk}/recordings/{group}/{nama_kamera}/</p>
                    <p class="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-mono">Otomatis dari grup dan nama kamera</p>
                </div>
                <div>
                    <label for="modal-stream-retention" class="block text-[10px] font-bold uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70 mb-1.5 font-mono">Retention (days)</label>
                    <input type="number" id="modal-stream-retention" min="1" max="365" value="7" class="app-input w-24 text-xs">
                    <p class="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-mono">Auto-delete recording lebih lama dari ini</p>
                </div>
            </div>

            <div class="flex justify-end space-x-3 border-t border-slate-200/60 dark:border-cyber-outline/40 pt-4 mt-2">
                <button type="button" onclick="closeStreamModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button type="submit"
                    class="px-4 py-2 bg-sky-500 hover:bg-sky-600 dark:bg-cyber-primary dark:hover:bg-sky-500 text-white dark:text-cyber-bg text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95">
                    Save Configuration
                </button>
            </div>
        </form>
    </div>
</div>

<!-- ============================================================ -->
<!-- MODAL: CRUD User Edit / Create                               -->
<!-- ============================================================ -->
<div id="user-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--pad" style="max-width: 28rem;">
        <div class="flex justify-between items-center border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-5">
            <h3 id="user-modal-title" class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Add User Account</h3>
            <button onclick="closeUserModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <form id="user-form" onsubmit="handleUserSubmit(event)" class="space-y-5">
            <input type="hidden" id="modal-user-id">
            <div>
                <label for="modal-user-username" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Username</label>
                <input type="text" id="modal-user-username" required
                    class="app-input w-full"
                    placeholder="e.g., operator_123">
            </div>
            <div>
                <label for="modal-user-password" id="modal-user-password-label" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Password</label>
                <input type="password" id="modal-user-password" required
                    class="app-input w-full"
                    placeholder="••••••••">
                <p id="modal-user-password-help" class="hidden text-[8px] text-slate-400 dark:text-cyber-dim/60 mt-1.5 font-mono">Leave empty to keep current password.</p>
            </div>
            <div>
                <label for="modal-user-role" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Account Role</label>
                <div class="app-field-wrap app-select-field">
                    <select id="modal-user-role" required class="app-input app-select app-select-icon-left">
                        <option value="user">USER (Standard Operator)</option>
                        <option value="guest">GUEST (Restricted Viewer)</option>
                        <option value="admin">ADMIN (Full Console Control)</option>
                    </select>
                    <span class="app-field-icon app-field-icon-right" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </span>
                </div>
            </div>
            <div class="flex justify-end space-x-3 border-t border-slate-200/60 dark:border-cyber-outline/40 pt-4 mt-6">
                <button type="button" onclick="closeUserModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button type="submit"
                    class="px-4 py-2 bg-sky-500 hover:bg-sky-600 dark:bg-cyber-primary dark:hover:bg-sky-500 text-white dark:text-cyber-bg text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95">
                    Save User Account
                </button>
            </div>
        </form>
    </div>
</div>

<!-- ============================================================ -->
<!-- MODAL: CCTV Access Permissions Per-User Mapping              -->
<!-- ============================================================ -->
<div id="permissions-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--pad" style="max-width: 28rem;">
        <div class="flex justify-between items-center border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-4">
            <div>
                <h3 id="permissions-modal-title" class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">CCTV Access Mapping</h3>
                <p id="permissions-modal-subtitle" class="text-[9px] text-slate-500 dark:text-cyber-dim mt-0.5 font-mono">Select cameras allowed for this account</p>
            </div>
            <button onclick="closePermissionsModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <div class="space-y-4">
            <input type="hidden" id="permissions-modal-user-id">
            <div class="border border-slate-200/50 dark:border-cyber-outline/40 rounded-md p-3 bg-slate-50 dark:bg-cyber-bg/50 max-h-72 overflow-y-auto">
                <div id="permissions-camera-list" class="space-y-2.5">
                    <!-- Cameras list checkboxes loaded dynamically -->
                </div>
            </div>
            <div class="flex justify-end space-x-3 border-t border-slate-200/60 dark:border-cyber-outline/40 pt-4 mt-6">
                <button type="button" onclick="closePermissionsModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button onclick="saveUserPermissions()" id="save-permissions-btn"
                    class="px-4 py-2 bg-sky-500 hover:bg-sky-600 dark:bg-cyber-primary dark:hover:bg-sky-500 text-white dark:text-cyber-bg text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95">
                    Save Permissions
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ============================================================ -->
<!-- MODAL: Camera Map View (Leaflet OpenStreetMap)               -->
<!-- ============================================================ -->
<div id="map-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--pad" style="max-width: 42rem;">
        <!-- Header -->
        <div class="flex justify-between items-start border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-5">
            <div class="flex-1 min-w-0 mr-4">
                <div class="flex items-center space-x-2 mb-1">
                    <span class="inline-flex items-center justify-center p-1.5 bg-emerald-500/10 rounded-md border border-emerald-500/20 shrink-0">
                        <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </span>
                    <h3 id="map-modal-title" class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white truncate">Camera Location</h3>
                </div>
                <p id="map-modal-group" class="text-[10px] text-sky-500 dark:text-cyber-primary font-mono font-bold pl-9">—</p>
                <p id="map-modal-coords" class="text-[10px] text-slate-400 dark:text-cyber-dim font-mono pl-9 mt-0.5">No coordinates</p>
            </div>
            <div class="flex items-center space-x-2 shrink-0">
                <a id="map-gmaps-link" href="#" target="_blank" rel="noopener noreferrer"
                    class="hidden items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase rounded-md tracking-wider transition-all duration-150 active:scale-95">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    <span>Google Maps</span>
                </a>
                <button onclick="closeMapModal()" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-cyber-hover/60 rounded-md transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        </div>

        <!-- Map Container -->
        <div id="camera-leaflet-map" class="w-full rounded-md border border-slate-200/50 dark:border-cyber-outline/40 overflow-hidden" style="height: 400px;"></div>

        <!-- Footer -->
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/40 dark:border-cyber-outline/20">
            <p class="text-[9px] text-slate-400 dark:text-cyber-dim/50 font-mono">Map data © OpenStreetMap contributors</p>
            <p class="text-[9px] text-slate-400 dark:text-cyber-dim/50 font-mono">Scroll to zoom · Drag to pan</p>
        </div>
    </div>
</div>

<!-- ============================================================ -->
<!-- MODAL: Bulk CCTV Add Configurations                          -->
<!-- ============================================================ -->
<div id="bulk-add-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--pad" style="max-width: 28rem;">
        <div class="flex justify-between items-center border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-5">
            <h3 class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Bulk Add CCTV Config</h3>
            <button type="button" onclick="closeBulkAddModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <form id="bulk-add-form" onsubmit="window.handleBulkAddSubmit(event)" class="space-y-4">
            <!-- Group Checkbox -->
            <div class="flex items-center space-x-3 pt-1">
                <input type="checkbox" id="bulk-enable-grouping" checked onchange="window.toggleBulkGroupInput(this.checked)"
                    class="w-4 h-4 text-sky-600 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline focus:ring-0 cursor-pointer">
                <label for="bulk-enable-grouping" class="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-cyber-dim font-mono cursor-pointer select-none">Kelompokkan ke dalam Grup</label>
            </div>
            
            <!-- Group Name Input -->
            <div id="bulk-group-input-container">
                <label for="bulk-stream-group" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Nama Grup Kamera</label>
                <input type="text" id="bulk-stream-group" value="Scanned" list="existing-groups-list" required
                    class="app-input w-full"
                    placeholder="e.g., Scanned atau Kantor">
            </div>

            <!-- Coordinates Input -->
            <div>
                <label for="bulk-stream-coordinates" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Koordinat Kamera (lat, lon)</label>
                <input type="text" id="bulk-stream-coordinates" value=""
                    class="app-input w-full"
                    placeholder="-6.2095, 106.8456 (opsional)">
            </div>

            <!-- Naming Mode -->
            <div>
                <label for="bulk-naming-mode" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Tipe Penamaan CCTV</label>
                <select id="bulk-naming-mode" onchange="window.toggleBulkNamingPrefix(this.value)"
                    class="app-input app-select-block w-full">
                    <option value="original">Penamaan Asli (contoh: Kamera 192.168.36.242)</option>
                    <option value="prefix-ip">Nama Kustom + IP (contoh: Lobi - 192.168.36.242)</option>
                    <option value="prefix-seq">Nama Kustom + Nomor Urut (contoh: Lobi 1, Lobi 2, ...)</option>
                </select>
            </div>

            <!-- Naming Prefix Input -->
            <div id="bulk-naming-prefix-container" class="hidden">
                <label for="bulk-naming-prefix" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Nama Kustom (Prefix)</label>
                <input type="text" id="bulk-naming-prefix"
                    class="app-input w-full"
                    placeholder="e.g., Lobi Depan">
            </div>

            <div class="flex justify-end space-x-3 border-t border-slate-200/60 dark:border-cyber-outline/40 pt-4 mt-2">
                <button type="button" onclick="closeBulkAddModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button type="submit"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95">
                    Tambahkan Kamera
                </button>
            </div>
        </form>
    </div>
</div>

<!-- ============================================================ -->
<!-- MODAL: Bulk CCTV Coordinates Edit                            -->
<!-- ============================================================ -->
<div id="bulk-coords-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--pad" style="max-width: 28rem;">
        <div class="flex justify-between items-center border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-5">
            <h3 class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Bulk Edit Coordinates</h3>
            <button type="button" onclick="window.closeBulkCoordsModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <form id="bulk-coords-form" onsubmit="window.handleBulkCoordsSubmit(event)" class="space-y-4">
            <!-- Coordinates Input -->
            <div>
                <label for="bulk-cctv-coordinates" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Koordinat Kamera Baru (lat, lon)</label>
                <input type="text" id="bulk-cctv-coordinates" required
                    class="app-input w-full"
                    placeholder="e.g., -6.2095, 106.8456">
                <p class="text-[9px] text-slate-400 dark:text-cyber-dim/50 mt-1 font-mono">Koordinat ini akan diterapkan ke <span id="bulk-coords-target-count" class="font-bold text-sky-500">0</span> kamera terpilih secara bersamaan.</p>
            </div>

            <div class="flex justify-end space-x-3 border-t border-slate-200/60 dark:border-cyber-outline/40 pt-4 mt-2">
                <button type="button" onclick="window.closeBulkCoordsModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button type="submit"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95">
                    Simpan Koordinat
                </button>
            </div>
        </form>
    </div>
</div>

<!-- ============================================================ -->
<!-- MODAL: API Setup Guide (Cara Set di Server Lain)             -->
<!-- ============================================================ -->
<div id="api-setup-modal" class="hidden ms-modal">
    <div class="ms-modal__panel ms-modal__panel--scroll ms-modal__panel--pad" style="max-width: 32rem;">
        <div class="flex justify-between items-center border-b border-slate-200/60 dark:border-cyber-outline/40 pb-4 mb-4">
            <div>
                <h3 class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Panduan Integrasi API</h3>
                <p id="api-setup-client-title" class="text-[9px] text-slate-500 dark:text-cyber-dim mt-0.5 font-mono">Cara memasang stream di server lain</p>
            </div>
            <button onclick="window.closeApiSetupModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        
        <div class="space-y-5 text-xs text-slate-700 dark:text-cyber-text font-mono">
            <!-- Alert domain whitelist / password -->
            <div id="api-setup-security-notice" class="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md text-[10px] hidden">
                <strong>Catatan Keamanan:</strong> <span id="api-setup-security-text"></span>
            </div>

            <!-- Metode 1: Embed Iframe -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">Metode 1: Pemutar Embed (Iframe HTML)</span>
                    <button onclick="window.copySetupCode('api-setup-iframe-code', 'btn-copy-iframe')" id="btn-copy-iframe" class="text-[10px] text-sky-500 hover:underline font-bold">Salin Code</button>
                </div>
                <p class="text-[10px] text-slate-400 dark:text-cyber-dim">Gunakan kode HTML berikut untuk menyematkan pemutar video langsung di halaman web Anda.</p>
                <textarea id="api-setup-iframe-code" readonly class="w-full h-16 p-2 bg-slate-900 text-sky-400 border border-slate-700 rounded text-[10px] font-mono focus:outline-none focus:border-sky-500 resize-none"></textarea>
            </div>

            <!-- Metode 2: REST API Endpoint -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">Metode 2: REST API Endpoint (JSON)</span>
                    <button onclick="window.copySetupCode('api-setup-api-url', 'btn-copy-api')" id="btn-copy-api" class="text-[10px] text-sky-500 hover:underline font-bold">Salin URL</button>
                </div>
                <p class="text-[10px] text-slate-400 dark:text-cyber-dim">Gunakan HTTP GET request untuk mengambil detail stream format JSON (termasuk WebRTC / WHEP URL untuk player kustom).</p>
                <textarea id="api-setup-api-url" readonly class="w-full h-12 p-2 bg-slate-900 text-sky-400 border border-slate-700 rounded text-[10px] font-mono focus:outline-none focus:border-sky-500 resize-none"></textarea>
            </div>

            <!-- Metode 3: Link Direct Player -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">Metode 3: URL Pemutar Langsung</span>
                    <button onclick="window.copySetupCode('api-setup-direct-url', 'btn-copy-direct')" id="btn-copy-direct" class="text-[10px] text-sky-500 hover:underline font-bold">Salin URL</button>
                </div>
                <p class="text-[10px] text-slate-400 dark:text-cyber-dim">Link direct untuk membuka halaman pemutar mandiri.</p>
                <textarea id="api-setup-direct-url" readonly class="w-full h-12 p-2 bg-slate-900 text-sky-400 border border-slate-700 rounded text-[10px] font-mono focus:outline-none focus:border-sky-500 resize-none"></textarea>
            </div>

            <div class="flex justify-end pt-2 border-t border-slate-200/60 dark:border-cyber-outline/40">
                <button type="button" onclick="window.closeApiSetupModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Close
                </button>
            </div>
        </div>
    </div>
</div>

<!-- MODAL: Edit API Key Modal -->
<div id="api-key-edit-modal" class="hidden ms-modal">
    <div class="ms-modal__panel" style="max-width: 36rem;">
        <div class="px-5 py-4 bg-slate-50 dark:bg-cyber-bg/40 border-b border-slate-200/60 dark:border-cyber-outline/40 flex items-center justify-between">
            <h3 class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Edit Integrasi Kunci API</h3>
            <button onclick="window.closeApiKeyEditModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        
        <form id="api-key-edit-form" onsubmit="window.handleUpdateApiKey(event)" class="p-5 space-y-4">
            <input type="hidden" id="edit-api-key-id">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="edit-api-camera-select" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Pilih Kamera</label>
                    <select id="edit-api-camera-select" required class="app-input w-full app-select text-xs">
                        <option value="">-- Pilih Kamera --</option>
                    </select>
                </div>
                <div>
                    <label for="edit-api-client-name" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Nama Klien / Server Penerima</label>
                    <input type="text" id="edit-api-client-name" required class="app-input w-full text-xs" placeholder="Contoh: Server A, Website Dinas">
                </div>
            </div>

            <div>
                <label for="edit-api-custom-camera-name" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Judul Kamera Kustom (Opsional)</label>
                <input type="text" id="edit-api-custom-camera-name" class="app-input w-full text-xs" placeholder="Contoh: Kamera Depan, Pos Jaga (Untuk menyamarkan nama asli)">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="edit-api-allowed-domain" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Batasi Domain Asal (Whitelisting)</label>
                    <input type="text" id="edit-api-allowed-domain" class="app-input w-full text-xs" placeholder="Contoh: domain.com (Kosongkan jika ingin PUBLIC)">
                </div>
                <div>
                    <label for="edit-api-secret-pass" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Password Keamanan Tambahan</label>
                    <input type="text" id="edit-api-secret-pass" class="app-input w-full text-xs" placeholder="Masukkan password (Kosongkan jika tanpa password)">
                </div>
            </div>


            <div class="flex justify-end gap-3 pt-3 border-t border-slate-200/60 dark:border-cyber-outline/40">
                <button type="button" onclick="window.closeApiKeyEditModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button type="submit"
                    class="px-4 py-2 bg-sky-500 hover:bg-sky-600 dark:bg-cyber-primary dark:hover:bg-sky-500 text-white dark:text-cyber-bg text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95 shadow-sm shadow-sky-500/20">
                    Simpan Perubahan
                </button>
            </div>
        </form>
    </div>
</div>

<!-- MODAL: Generate API Key Modal -->
<div id="api-key-generate-modal" class="hidden ms-modal">
    <div class="ms-modal__panel" style="max-width: 42rem;">
        <div class="px-5 py-4 bg-slate-50 dark:bg-cyber-bg/40 border-b border-slate-200/60 dark:border-cyber-outline/40 flex items-center justify-between">
            <h3 class="font-bold text-sm uppercase tracking-wider font-mono text-slate-955 dark:text-white">Generate API Key Baru</h3>
            <button onclick="window.closeApiKeyGenerateModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        
        <form id="api-key-form" onsubmit="window.handleGenerateApiKey(event)" class="p-5 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="api-camera-select" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Pilih Kamera</label>
                    <select id="api-camera-select" required class="app-input w-full app-select text-xs">
                        <option value="">-- Pilih Kamera --</option>
                    </select>
                </div>
                <div>
                    <label for="api-client-name" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Nama Klien / Server Penerima</label>
                    <input type="text" id="api-client-name" required class="app-input w-full text-xs" placeholder="Contoh: Server A, Website Dinas">
                </div>
                <div>
                    <label for="api-custom-camera-name" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Judul Kamera Kustom (Opsional)</label>
                    <input type="text" id="api-custom-camera-name" class="app-input w-full text-xs" placeholder="Contoh: Kamera Depan, Pos Jaga (Untuk menyamarkan nama asli)">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="api-allowed-domain" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Batasi Domain Asal (Whitelisting Referrer)</label>
                    <input type="text" id="api-allowed-domain" class="app-input w-full text-xs" placeholder="Contoh: klien.com (Kosongkan jika ingin PUBLIC)">
                    <p class="text-[9px] text-slate-400 dark:text-cyber-dim/50 mt-1 font-mono">Jika diisi, iframe hanya bisa diputar dari domain tersebut.</p>
                </div>
                <div>
                    <label for="api-secret-pass" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 mb-2 font-mono">Password Keamanan Tambahan (Opsional)</label>
                    <input type="text" id="api-secret-pass" class="app-input w-full text-xs" placeholder="Masukkan password tambahan (Kosongkan jika tanpa password)">
                    <p class="text-[9px] text-slate-400 dark:text-cyber-dim/50 mt-1 font-mono">Jika diisi, pemanggil wajib menambahkan parameter &pass=... pada url.</p>
                </div>
            </div>


            <div class="flex justify-end gap-3 pt-3 border-t border-slate-200/60 dark:border-cyber-outline/40">
                <button type="button" onclick="window.closeApiKeyGenerateModal()"
                    class="px-4 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-300 dark:hover:border-white text-slate-600 dark:text-cyber-text text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-colors">
                    Cancel
                </button>
                <button type="submit"
                    class="px-4 py-2 bg-sky-500 hover:bg-sky-600 dark:bg-cyber-primary dark:hover:bg-sky-500 text-white dark:text-cyber-bg text-xs font-bold uppercase tracking-wider font-mono rounded-md transition-all duration-150 active:scale-95 shadow-sm shadow-sky-500/20">
                    Generate API Key
                </button>
            </div>
        </form>
    </div>
</div>

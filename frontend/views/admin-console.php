<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>
<!-- Leaflet Map CSS -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />

<!-- Admin Dashboard Console View -->
<div id="tab-admin" class="page-layout tab-view-bottom-space">

    <div class="layout-section layout-intro">
        <?php
        $tabIntroTitle = 'Admin Console';
        $tabIntroDesc = 'Kelola stream CCTV, hak akses pengguna, dan perangkat jaringan.';
        $tabIntroIcon = 'admin';
        $tabIntroBadge = null;
        $tabIntroBadgeId = null;
        include __DIR__ . '/../includes/tab-intro-box.php';
        ?>
    </div>

    <!-- Modern Natural Subtab Navigation Bar -->
    <div class="layout-section layout-tabs">
        <div class="admin-tab-nav">
            <!-- 1. CCTV Directory -->
            <button type="button" id="admin-subtab-btn-streams" onclick="switchAdminTab('streams')" class="admin-tab-box is-active">
                <span class="admin-tab-box-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                </span>
                <span class="admin-tab-box-body">
                    <span class="admin-tab-box-title">CCTV Directory</span>
                    <span id="admin-subtab-streams-badge" class="admin-tab-box-badge">0</span>
                </span>
            </button>

            <!-- 2. Console Users -->
            <button type="button" id="admin-subtab-btn-users" onclick="switchAdminTab('users')" class="admin-tab-box">
                <span class="admin-tab-box-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                </span>
                <span class="admin-tab-box-body">
                    <span class="admin-tab-box-title">Console Users</span>
                    <span id="admin-subtab-users-badge" class="admin-tab-box-badge">0</span>
                </span>
            </button>

            <!-- 3. Network Scanner -->
            <button type="button" id="admin-subtab-btn-scanner" onclick="switchAdminTab('scanner')" class="admin-tab-box">
                <span class="admin-tab-box-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
                    </svg>
                </span>
                <span class="admin-tab-box-body">
                    <span class="admin-tab-box-title">Network Scanner</span>
                </span>
            </button>

            <!-- 4. Ad Space Manager -->
            <button type="button" id="admin-subtab-btn-ads" onclick="switchAdminTab('ads')" class="admin-tab-box">
                <span class="admin-tab-box-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h3a1 1 0 011 1v6a1 1 0 01-1 1h-3a1 1 0 01-1-1v-6z"/>
                    </svg>
                </span>
                <span class="admin-tab-box-body">
                    <span class="admin-tab-box-title">Ad Space Manager</span>
                </span>
            </button>

            <!-- 5. API Integration -->
            <button type="button" id="admin-subtab-btn-api" onclick="switchAdminTab('api')" class="admin-tab-box">
                <span class="admin-tab-box-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                    </svg>
                </span>
                <span class="admin-tab-box-body">
                    <span class="admin-tab-box-title">API Integration</span>
                    <span id="admin-subtab-api-badge" class="admin-tab-box-badge">0</span>
                </span>
            </button>
        </div>
    </div>

    <!-- TAB 1: CCTV Directory -->
    <div id="admin-subtab-streams" class="layout-section layout-panel space-y-4">
        <div class="panel-card">

            <div class="layout-section layout-toolbar">
            <!-- Toolbar Row -->
            <div class="admin-filter-bar mb-4">
                <!-- Search -->
                <div class="app-search-wrap">
                    <span class="app-search-icon" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                    </span>
                    <input type="text" id="stream-search-input" oninput="filterStreamsTable()"
                        placeholder="Search camera name or RTSP..."
                        class="app-input app-search-input">
                </div>

                <!-- Group Filter -->
                <div class="app-field-wrap">
                    <span class="app-field-icon app-field-icon-left" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm3 4a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zm3 4a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z"/>
                        </svg>
                    </span>
                    <select id="stream-group-filter" onchange="filterStreamsTable()"
                        class="app-input app-select app-select-icon-left">
                        <option value="">All Groups</option>
                    </select>
                    <span class="app-field-icon app-field-icon-right" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </span>
                </div>

                <!-- RTSP Status Filter -->
                <div class="app-field-wrap">
                    <span class="app-field-icon app-field-icon-left" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.07 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"/>
                        </svg>
                    </span>
                    <select id="stream-status-filter" onchange="filterStreamsTable()"
                        class="app-input app-select app-select-icon-left">
                        <option value="">All Statuses</option>
                        <option value="online">Connected (Online)</option>
                        <option value="offline">Disconnected (Offline)</option>
                    </select>
                    <span class="app-field-icon app-field-icon-right" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </span>
                </div>

                <div class="admin-filter-actions flex items-center space-x-2">
                    <!-- Clear Filter -->
                    <button id="stream-filter-clear" onclick="clearStreamFilter()"
                        class="hidden px-3 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-rose-300 dark:hover:border-rose-500/40 text-slate-500 dark:text-cyber-dim hover:text-rose-500 text-xs font-mono rounded-xl transition-all duration-150 cursor-pointer">
                        ✕ Clear
                    </button>

                    <!-- Bulk Set Coordinates Button -->
                    <button id="set-selected-streams-coords-btn" onclick="window.setSelectedAdminStreamsCoords()"
                        class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap flex items-center space-x-1.5 hidden cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <span>Set Coords (<span id="selected-streams-coords-count">0</span>)</span>
                    </button>

                    <!-- Delete Selected Button -->
                    <button id="delete-selected-streams-btn" onclick="window.deleteSelectedAdminStreams()"
                        class="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap flex items-center space-x-1.5 hidden cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        <span>Delete Selected (<span id="selected-streams-count">0</span>)</span>
                    </button>

                    <!-- Add Camera Button -->
                    <button onclick="openCreateStreamModal()"
                        class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap flex items-center space-x-1.5 cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 4v16m8-8H4"/></svg>
                        <span>Add Camera</span>
                    </button>
                </div>
            </div>
            </div>

            <div class="layout-section layout-filter-status">
                <!-- Filter Status Badge -->
                <div id="stream-filter-status" class="hidden flex items-center space-x-1.5 mb-3 px-1">
                    <svg class="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span id="stream-filter-status-text" class="text-[11px] text-sky-600 dark:text-cyber-primary font-mono font-medium"></span>
                </div>
            </div>

            <div class="layout-section layout-table">
            <!-- CCTV Data Table -->
            <div class="admin-table-wrap overflow-x-auto border border-slate-200/80 dark:border-cyber-outline/30 rounded-xl bg-white dark:bg-cyber-container/40">
                <table class="w-full text-left text-xs font-mono">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-cyber-outline text-slate-400 dark:text-cyber-dim uppercase tracking-wider bg-slate-50 dark:bg-cyber-bg/60">
                            <th class="py-3.5 px-4 font-semibold w-12 text-center">
                                <input type="checkbox" id="admin-streams-select-all" onclick="window.toggleSelectAllAdminStreams(this.checked)" 
                                    class="w-4 h-4 text-sky-500 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline cursor-pointer">
                            </th>
                            <th class="py-3.5 px-4 font-semibold w-10">No</th>
                            <th class="py-3.5 px-4 font-semibold">Camera Name</th>
                            <th class="py-3.5 px-4 font-semibold w-28">Group</th>
                            <th class="py-3.5 px-4 font-semibold w-36">Coordinates</th>
                            <th class="py-3.5 px-4 font-semibold">RTSP Endpoint</th>
                            <th class="py-3.5 px-4 font-semibold w-20">Status</th>
                            <th class="py-3.5 px-4 font-semibold w-16">Record</th>
                            <th class="py-3.5 px-4 font-semibold text-right w-44">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-streams-table-body" class="divide-y divide-slate-100 dark:divide-cyber-outline/20">
                        <tr><td colspan="9" class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                            <div class="flex items-center justify-center space-x-2">
                                <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                <span>Loading camera directory...</span>
                            </div>
                        </td></tr>
                    </tbody>
                </table>
            </div>
            </div>

            <div class="layout-section layout-pagination-wrap">
            <?php
            $paginationId = 'admin-streams-pagination';
            $pagesContainerId = 'admin-pagination-pages-container';
            $pageIndicatorId = 'admin-page-indicator';
            $firstBtnId = 'admin-first-page-btn';
            $prevBtnId = 'admin-prev-page-btn';
            $nextBtnId = 'admin-next-page-btn';
            $lastBtnId = 'admin-last-page-btn';
            $onFirst = 'window.jumpToAdminStreamsPage(0)';
            $onPrev = 'window.changeAdminStreamsPageOffset(-1)';
            $onNext = 'window.changeAdminStreamsPageOffset(1)';
            $onLast = 'window.jumpToLastAdminStreamsPage()';
            $paginationExtraClass = 'border-t border-slate-200/60 dark:border-cyber-outline/30 pt-4 mt-4';
            include __DIR__ . '/../includes/pagination-bar.php';
            ?>
            </div>
        </div>
    </div>

    <!-- TAB 2: Console Users -->
    <div id="admin-subtab-users" class="layout-section layout-panel space-y-4 hidden">
        <div class="panel-card">
            <div class="panel-card-header flex flex-wrap gap-3 items-center justify-between pb-4">
                <div>
                    <h3 class="panel-card-title">Console Users</h3>
                    <p class="panel-card-desc">Kelola akun pengguna, peran, dan hak akses kamera</p>
                </div>
                <button onclick="openCreateUserModal()"
                    class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm flex items-center space-x-1.5 cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                    <span>Add User</span>
                </button>
            </div>

            <!-- Users Data Table -->
            <div class="admin-table-wrap overflow-x-auto border border-slate-200/80 dark:border-cyber-outline/30 rounded-xl bg-white dark:bg-cyber-container/40">
                <table class="w-full text-left text-xs font-mono">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-cyber-outline text-slate-400 dark:text-cyber-dim uppercase tracking-wider bg-slate-50 dark:bg-cyber-bg/60">
                            <th class="py-3.5 px-4 font-semibold w-10">No</th>
                            <th class="py-3.5 px-4 font-semibold">Username</th>
                            <th class="py-3.5 px-4 font-semibold w-24">Role</th>
                            <th class="py-3.5 px-4 font-semibold text-right w-44">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-users-table-body" class="divide-y divide-slate-100 dark:divide-cyber-outline/20">
                        <tr><td colspan="4" class="py-10 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                            <div class="flex items-center justify-center space-x-2">
                                <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                <span>Loading user accounts...</span>
                            </div>
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- TAB 3: Network Camera Scanner -->
    <div id="admin-subtab-scanner" class="layout-section layout-panel space-y-4 hidden">
        <!-- Scanner Input Parameters -->
        <div class="panel-card">
            <div class="panel-card-header pb-4">
                <h3 class="panel-card-title">Scanner Config</h3>
                <p class="panel-card-desc">Parameter scan jaringan lokal untuk kamera RTSP</p>
            </div>
            
            <form id="scanner-form" onsubmit="handleStartScan(event)" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label for="scan-ip-range" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">IP Subnet Range (CIDR)</label>
                        <input type="text" id="scan-ip-range" required value="192.168.1.0/24"
                            class="app-input w-full">
                        <p class="text-[10px] text-slate-400 dark:text-cyber-dim/60 mt-1 font-mono">Contoh: 192.168.1.0/24, 10.0.0.0/24</p>
                    </div>

                    <div>
                        <label for="scan-port" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Target Port (RTSP)</label>
                        <input type="number" id="scan-port" required value="554" min="1" max="65535"
                            class="app-input w-full">
                    </div>

                    <div>
                        <label for="scan-username" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Default Username</label>
                        <input type="text" id="scan-username" required value="admin"
                            class="app-input w-full">
                    </div>

                    <div>
                        <label for="scan-password" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Default Password</label>
                        <input type="text" id="scan-password" required value="admin"
                            class="app-input w-full">
                    </div>

                    <div>
                        <label for="scan-codec" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Codec / Stream Path</label>
                        <input type="text" id="scan-codec" required value="H.264"
                            class="app-input w-full">
                        <p class="text-[10px] text-slate-400 dark:text-cyber-dim/60 mt-1 font-mono">Suffix URL RTSP (e.g. H.264, stream1)</p>
                    </div>

                    <div>
                        <label for="scan-coordinates" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Default Coordinates (lat, lon)</label>
                        <input type="text" id="scan-coordinates" value=""
                            class="app-input w-full"
                            placeholder="-6.2095, 106.8456">
                    </div>
                </div>

                <button type="submit" id="start-scan-btn"
                    class="w-full py-3 bg-brand-blue hover:bg-blue-600 text-white text-xs font-bold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 active:scale-[0.98] shadow-sm cursor-pointer mt-4">
                    <svg id="scan-icon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <span>Scan Network</span>
                </button>
            </form>

            <!-- Progress Bar -->
            <div class="mt-5 space-y-2 border-t border-slate-100 dark:border-cyber-outline/20 pt-4">
                <div class="flex justify-between text-[11px] font-mono text-slate-500 dark:text-cyber-dim uppercase font-semibold">
                    <span id="scan-progress-label">Scanner Idle</span>
                    <span id="scan-progress-percent">0%</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-cyber-bg h-2 rounded-full overflow-hidden">
                    <div id="scan-progress-bar" class="w-0 bg-brand-blue h-full transition-all duration-200"></div>
                </div>
            </div>
        </div>

        <!-- Discovered Table Card -->
        <div id="scan-results-card" class="panel-card hidden">
            <div class="panel-card-header flex justify-between items-center gap-3 pb-4">
                <div>
                    <h3 class="panel-card-title">Discovered Camera Feeds</h3>
                    <p class="panel-card-desc">Kamera yang terdeteksi dari hasil scan jaringan</p>
                </div>
                <button id="add-selected-cams-btn" onclick="window.addSelectedScannedCameras()" 
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm hidden cursor-pointer">
                    + Add Selected (<span id="selected-cams-count">0</span>)
                </button>
            </div>
            
            <div class="admin-table-wrap overflow-x-auto border border-slate-200/80 dark:border-cyber-outline/30 rounded-xl bg-white dark:bg-cyber-container/40">
                <table class="w-full text-left text-xs font-mono font-medium">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-cyber-outline text-slate-400 dark:text-cyber-dim uppercase tracking-wider bg-slate-50 dark:bg-cyber-bg/60">
                            <th class="py-3.5 px-4 font-semibold w-12 text-center">
                                <input type="checkbox" id="scan-select-all" onclick="window.toggleSelectAllScanned(this.checked)" 
                                    class="w-4 h-4 text-sky-500 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 dark:bg-cyber-bg dark:border-cyber-outline cursor-pointer">
                            </th>
                            <th class="py-3.5 px-4 font-semibold">IP Address</th>
                            <th class="py-3.5 px-4 font-semibold w-24">Port</th>
                            <th class="py-3.5 px-4 font-semibold w-36">Credentials</th>
                            <th class="py-3.5 px-4 font-semibold">RTSP Target URL</th>
                            <th class="py-3.5 px-4 font-semibold text-right w-56">Action</th>
                        </tr>
                    </thead>
                    <tbody id="scan-results-table-body" class="divide-y divide-slate-100 dark:divide-cyber-outline/20">
                        <!-- Loaded dynamically -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- TAB 4: Ad Space Manager -->
    <div id="admin-subtab-ads" class="layout-section layout-panel space-y-4 hidden">
        <div class="panel-card">
            <div class="panel-card-header pb-4">
                <h3 class="panel-card-title">Konfigurasi Space Iklan (Guest Only)</h3>
                <p class="panel-card-desc">Atur tampilan iklan gambar dan teks bergulir yang akan muncul pada popup guest</p>
            </div>
            
            <!-- Live Preview Area -->
            <div class="mb-6 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-lg">
                <div class="flex items-center justify-between mb-3">
                    <span class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Live Preview (Pratinjau Langsung)</span>
                    <span class="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-md border border-sky-500/20">Widescreen Monitor (16:9)</span>
                </div>
                <div class="relative w-full h-44 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden" style="background-image: radial-gradient(circle, #0f172a 10%, #020617 100%);">
                    <div class="absolute inset-0 opacity-15 pointer-events-none select-none" style="background-size: 20px 20px; background-image: linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px);"></div>
                    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 opacity-25 border border-sky-400 rounded-full flex items-center justify-center pointer-events-none select-none">
                        <div class="w-1.5 h-1.5 bg-sky-400 rounded-full"></div>
                    </div>

                    <!-- Top Left: Camera Label -->
                    <div class="absolute top-3 left-3 bg-slate-950/80 border border-slate-800/80 px-2.5 py-1 rounded-md text-[10px] font-mono text-white select-none flex items-center space-x-1.5 shadow-sm">
                        <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span class="font-bold tracking-wide">📹 LOBBY UTAMA - LIVE</span>
                    </div>

                    <!-- Top Right: REC Blinking Indicator -->
                    <div class="absolute top-3 right-3 bg-slate-950/80 border border-slate-800/80 px-2.5 py-1 rounded-md text-[10px] font-mono text-rose-500 select-none flex items-center space-x-1.5 shadow-sm">
                        <span class="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                        <span class="font-bold tracking-widest">● REC</span>
                    </div>

                    <!-- Bottom Right: Mock Time -->
                    <div id="preview-mock-time" class="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400 select-none bg-slate-950/60 px-2 py-0.5 rounded-md">
                        2026-07-16 19:48:00
                    </div>
                    
                    <!-- Preview Banner Overlay -->
                    <div id="ad-preview-banner" class="absolute bottom-10 px-2.5 py-1 rounded-lg border border-white/10 flex items-center transition-all duration-300 overflow-hidden shadow-lg" style="min-height: 24px;">
                        <img id="ad-preview-image" src="" alt="Preview Logo" class="h-4 w-auto rounded object-contain shrink-0 mr-2 hidden">
                        <div class="flex-grow overflow-hidden relative flex items-center">
                            <div class="marquee-track flex whitespace-nowrap" style="animation: marquee-scroll 25s linear infinite;">
                                <span id="ad-preview-marquee-text-1" class="marquee-item text-[10px]">Teks Iklan Anda</span>
                                <span id="ad-preview-marquee-text-2" class="marquee-item text-[10px]">Teks Iklan Anda</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <form id="ad-config-form" onsubmit="window.handleSaveAdConfig(event)" class="space-y-6">
                <!-- Toggle Active Switch -->
                <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-cyber-bg/40 border border-slate-200 dark:border-cyber-outline/30 rounded-xl shadow-sm">
                    <div>
                        <span class="block text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-white font-mono">Status Penayangan Iklan</span>
                        <span class="text-[10px] text-slate-400 dark:text-cyber-dim font-mono">Tampilkan space iklan ini di video stream guest</span>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="ad-active" class="sr-only peer">
                        <div class="w-11 h-6 bg-slate-300 dark:bg-cyber-outline rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- SECTION 1: Layout & Latar Belakang -->
                    <div class="p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/80 dark:border-cyber-outline/20 space-y-4">
                        <div class="border-b border-slate-200 dark:border-cyber-outline/20 pb-2 mb-2">
                            <span class="text-xs font-semibold uppercase text-brand-blue dark:text-cyber-primary font-mono">1. Tata Letak & Latar</span>
                        </div>

                        <!-- Lebar Kotak Iklan -->
                        <div>
                            <label for="ad-box-width" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Lebar Wadah Iklan (10% - 100%)</label>
                            <div class="flex items-center space-x-3">
                                <input type="range" id="ad-box-width" min="10" max="100" value="100" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-box-width-val').textContent = this.value + '%'">
                                <span id="ad-box-width-val" class="text-xs font-bold font-mono text-sky-500 w-10 text-right">100%</span>
                            </div>
                        </div>

                        <!-- Perataan Konten Iklan -->
                        <div>
                            <label for="ad-text-align" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Posisi Aliran Konten</label>
                            <select id="ad-text-align" class="app-input w-full text-xs">
                                <option value="left">Rata Kiri</option>
                                <option value="center">Rata Tengah</option>
                                <option value="right">Rata Kanan</option>
                            </select>
                        </div>

                        <!-- Warna Background -->
                        <div>
                            <label for="ad-bg-color" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Warna Latar Belakang</label>
                            <div class="flex space-x-2">
                                <input type="color" id="ad-bg-color" required class="w-9 h-9 border border-slate-300 dark:border-cyber-outline rounded-lg cursor-pointer bg-transparent">
                                <input type="text" id="ad-bg-color-text" class="app-input flex-grow font-mono uppercase text-xs" placeholder="#1E293B" oninput="if (this.value.startsWith('#') && this.value.length === 7) { document.getElementById('ad-bg-color').value = this.value; }">
                            </div>
                        </div>

                        <!-- Background Transparency -->
                        <div>
                            <label for="ad-bg-opacity" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Transparansi Latar (0% - 100%)</label>
                            <div class="flex items-center space-x-3">
                                <input type="range" id="ad-bg-opacity" min="0" max="100" value="100" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-bg-opacity-val').textContent = this.value + '%'">
                                <span id="ad-bg-opacity-val" class="text-xs font-bold font-mono text-sky-500 w-10 text-right">100%</span>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2: Logo & Media Gambar -->
                    <div class="p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/80 dark:border-cyber-outline/20 space-y-4">
                        <div class="border-b border-slate-200 dark:border-cyber-outline/20 pb-2 mb-2">
                            <span class="text-xs font-semibold uppercase text-brand-blue dark:text-cyber-primary font-mono">2. Logo Sponsor & Media</span>
                        </div>

                        <!-- Upload logo image -->
                        <div>
                            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Gambar Sponsor (Kiri Iklan)</label>
                            <div class="flex flex-col space-y-3">
                                <div class="w-full h-16 bg-slate-950/40 border border-slate-300 dark:border-cyber-outline rounded-xl flex items-center justify-center overflow-hidden">
                                    <img id="ad-image-preview" src="" alt="Preview" class="max-h-14 object-contain hidden">
                                    <span id="ad-image-placeholder" class="text-[10px] text-slate-500 font-mono">Tidak ada gambar</span>
                                </div>
                                <div class="flex space-x-2">
                                    <input type="file" id="ad-image-file" accept="image/*" onchange="window.handleAdImageSelect(event)" class="hidden">
                                    <button type="button" onclick="document.getElementById('ad-image-file').click()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-cyber-bg dark:hover:bg-cyber-hover text-slate-700 dark:text-cyber-text text-[10px] font-bold uppercase font-mono rounded-lg border border-slate-300 dark:border-cyber-outline transition-all flex-grow text-center cursor-pointer">
                                        Pilih Berkas
                                    </button>
                                </div>
                                <input type="text" id="ad-image-url" class="app-input w-full text-[10px]" placeholder="Atau tempel URL gambar..." oninput="window.handleAdImageUrlInput(this.value)">
                            </div>
                        </div>

                        <!-- Image Transparency -->
                        <div>
                            <label for="ad-image-opacity" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Transparansi Logo (0% - 100%)</label>
                            <div class="flex items-center space-x-3">
                                <input type="range" id="ad-image-opacity" min="0" max="100" value="100" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-image-opacity-val').textContent = this.value + '%'">
                                <span id="ad-image-opacity-val" class="text-xs font-bold font-mono text-sky-500 w-10 text-right">100%</span>
                            </div>
                        </div>

                        <!-- Tinggi Logo (Image Height/Size) -->
                        <div>
                            <label for="ad-image-size" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Tinggi Ukuran Logo (10px - 60px)</label>
                            <div class="flex items-center space-x-3">
                                <input type="range" id="ad-image-size" min="10" max="60" value="20" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-image-size-val').textContent = this.value + 'px'">
                                <span id="ad-image-size-val" class="text-xs font-bold font-mono text-sky-500 w-10 text-right">20px</span>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 3: Teks Bergulir & Font -->
                    <div class="p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/80 dark:border-cyber-outline/20 space-y-4">
                        <div class="border-b border-slate-200 dark:border-cyber-outline/20 pb-2 mb-2">
                            <span class="text-xs font-semibold uppercase text-brand-blue dark:text-cyber-primary font-mono">3. Teks Bergulir (Marquee)</span>
                        </div>

                        <!-- Teks marquee -->
                        <div>
                            <label for="ad-marquee-text" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Isi Teks Marquee</label>
                            <textarea id="ad-marquee-text" rows="2" required class="app-input w-full text-xs" placeholder="Ketik kalimat informasi iklan..."></textarea>
                        </div>

                        <div class="grid grid-cols-2 gap-2">
                            <!-- Warna Teks -->
                            <div>
                                <label for="ad-text-color" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-1 font-mono">Warna Teks</label>
                                <input type="color" id="ad-text-color" required class="w-full h-8 border border-slate-300 dark:border-cyber-outline rounded-lg cursor-pointer bg-transparent">
                                <input type="text" id="ad-text-color-text" class="app-input w-full font-mono uppercase text-[10px] mt-1" placeholder="#FFFFFF" oninput="if (this.value.startsWith('#') && this.value.length === 7) { document.getElementById('ad-text-color').value = this.value; }">
                            </div>
                            <!-- Font Family -->
                            <div>
                                <label for="ad-font-family" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-1 font-mono">Jenis Font</label>
                                <select id="ad-font-family" required class="app-input w-full text-xs" style="height: 32px; padding: 2px 4px;">
                                    <option value="monospace">Monospace</option>
                                    <option value="sans-serif">Sans-Serif</option>
                                    <option value="serif">Serif</option>
                                    <option value="cursive">Cursive</option>
                                    <option value="Arial, sans-serif">Arial</option>
                                    <option value="'Courier New', monospace">Courier</option>
                                </select>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-2">
                            <!-- Font Size -->
                            <div>
                                <label for="ad-font-size" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-1.5 font-mono">Ukuran Font</label>
                                <div class="flex items-center space-x-2">
                                    <input type="range" id="ad-font-size" min="8" max="24" value="10" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-font-size-val').textContent = this.value + 'px'">
                                    <span id="ad-font-size-val" class="text-[10px] font-bold font-mono text-sky-500 w-8 text-right">10px</span>
                                </div>
                            </div>
                            <!-- Scroll Speed -->
                            <div>
                                <label for="ad-scroll-speed" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-1.5 font-mono">Kecepatan</label>
                                <div class="flex items-center space-x-2">
                                    <input type="range" id="ad-scroll-speed" min="1" max="10" value="5" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-scroll-speed-val').textContent = this.value">
                                    <span id="ad-scroll-speed-val" class="text-[10px] font-bold font-mono text-sky-500 w-4 text-right">5</span>
                                </div>
                            </div>
                        </div>

                        <!-- Text Transparency -->
                        <div>
                            <label for="ad-text-opacity" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-cyber-dim mb-2 font-mono">Transparansi Teks (0% - 100%)</label>
                            <div class="flex items-center space-x-3">
                                <input type="range" id="ad-text-opacity" min="0" max="100" value="100" class="flex-grow h-1.5 bg-slate-300 dark:bg-cyber-outline rounded-lg appearance-none cursor-pointer accent-sky-500" oninput="document.getElementById('ad-text-opacity-val').textContent = this.value + '%'">
                                <span id="ad-text-opacity-val" class="text-xs font-bold font-mono text-sky-500 w-10 text-right">100%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Action Button -->
                <button type="submit"
                    class="w-full py-3 bg-brand-blue hover:bg-blue-600 text-white text-xs font-bold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 active:scale-[0.98] shadow-sm cursor-pointer">
                    <span>Simpan Konfigurasi Iklan</span>
                </button>
            </form>
        </div>
    </div>

    <!-- Script binding for real-time Live Preview -->
    <script>
    document.addEventListener("DOMContentLoaded", () => {
        const inputs = [
            'ad-active', 'ad-image-url', 'ad-bg-color', 'ad-text-color',
            'ad-font-family', 'ad-font-size', 'ad-image-opacity',
            'ad-bg-opacity', 'ad-text-opacity', 'ad-box-width',
            'ad-text-align', 'ad-marquee-text', 'ad-scroll-speed', 'ad-image-size'
        ];
        
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const eventType = el.tagName === 'SELECT' || el.type === 'color' || el.type === 'checkbox' ? 'change' : 'input';
                el.addEventListener(eventType, updateAdPreview);
            }
        });

        // Running mock clock timer in preview
        setInterval(() => {
            const clockEl = document.getElementById("preview-mock-time");
            if (clockEl) {
                const now = new Date();
                const format = (v) => String(v).padStart(2, '0');
                clockEl.textContent = `${now.getFullYear()}-${format(now.getMonth()+1)}-${format(now.getDate())} ${format(now.getHours())}:${format(now.getMinutes())}:${format(now.getSeconds())}`;
            }
        }, 1000);

        // Expose function to global scope
        window.updateLiveAdPreview = updateAdPreview;
        
        // Delay to allow fetch function to complete loading initial values
        setTimeout(updateAdPreview, 1200);
    });

    function updateAdPreview() {
        const active = document.getElementById('ad-active')?.checked;
        const imageUrl = document.getElementById('ad-image-url')?.value || '';
        const bgColor = document.getElementById('ad-bg-color')?.value || '#1e293b';
        const bgOpacity = (document.getElementById('ad-bg-opacity')?.value || 100) / 100;
        const textColor = document.getElementById('ad-text-color')?.value || '#ffffff';
        const textOpacity = (document.getElementById('ad-text-opacity')?.value || 100) / 100;
        const fontSize = document.getElementById('ad-font-size')?.value || 10;
        const fontFamily = document.getElementById('ad-font-family')?.value || 'monospace';
        const boxWidth = document.getElementById('ad-box-width')?.value || 100;
        const textAlign = document.getElementById('ad-text-align')?.value || 'left';
        const marqueeText = document.getElementById('ad-marquee-text')?.value || 'Teks Iklan Anda';
        const imageOpacity = (document.getElementById('ad-image-opacity')?.value || 100) / 100;
        const imageSize = document.getElementById('ad-image-size')?.value || 20;
        const speed = document.getElementById('ad-scroll-speed')?.value || 5;

        const previewBanner = document.getElementById('ad-preview-banner');
        const previewImg = document.getElementById('ad-preview-image');
        const previewText1 = document.getElementById('ad-preview-marquee-text-1');
        const previewText2 = document.getElementById('ad-preview-marquee-text-2');

        if (!previewBanner) return;

        if (!active) {
            previewBanner.style.opacity = '0.3';
        } else {
            previewBanner.style.opacity = '1';
        }

        const hexToRgba = (hex, opacity) => {
            let c = hex.substring(1);
            if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
            const r = parseInt(c.substring(0, 2), 16);
            const g = parseInt(c.substring(2, 4), 16);
            const b = parseInt(c.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        };
        
        previewBanner.style.backgroundColor = hexToRgba(bgColor, bgOpacity);
        
        // Apply width and positioning
        previewBanner.style.left = "";
        previewBanner.style.right = "";
        previewBanner.style.width = "";
        previewBanner.style.transform = "";
        
        if (boxWidth >= 100) {
            previewBanner.style.left = "10px";
            previewBanner.style.right = "10px";
            previewBanner.style.width = "calc(100% - 20px)";
        } else {
            previewBanner.style.width = `${boxWidth}%`;
            if (textAlign === 'left') {
                previewBanner.style.left = "10px";
            } else if (textAlign === 'right') {
                previewBanner.style.right = "10px";
            } else { // center
                previewBanner.style.left = "50%";
                previewBanner.style.transform = "translateX(-50%)";
            }
        }

        // Align internal flex direction
        if (textAlign === 'center') {
            previewBanner.style.justifyContent = 'center';
        } else if (textAlign === 'right') {
            previewBanner.style.justifyContent = 'flex-end';
        } else {
            previewBanner.style.justifyContent = 'flex-start';
        }

        // Image logo preview
        if (imageUrl) {
            previewImg.src = imageUrl;
            previewImg.style.opacity = imageOpacity;
            previewImg.style.height = `${imageSize}px`;
            previewImg.classList.remove('hidden');
        } else {
            previewImg.classList.add('hidden');
        }

        // Update animation speed
        const track = previewBanner.querySelector(".marquee-track");
        if (track) {
            const duration = Math.max(10, (11 - speed) * 18);
            track.style.animationDuration = `${duration}s`;
        }

        // Text preview (two items for seamless infinite scroll)
        const formattedText = `${marqueeText} \u00A0\u00A0|\u00A0\u00A0 `;
        [previewText1, previewText2].forEach(pText => {
            if (pText) {
                pText.textContent = formattedText;
                pText.style.color = textColor;
                pText.style.opacity = textOpacity;
                pText.style.fontSize = `${fontSize}px`;
                pText.style.fontFamily = fontFamily;
            }
        });
    }
    </script>

    <!-- TAB 5: API Keys Integration -->
    <div id="admin-subtab-api" class="layout-section layout-panel space-y-4 hidden">
        <!-- Settings Embed Player -->
        <div class="panel-card">
            <div class="panel-card-header pb-4">
                <div>
                    <h3 class="panel-card-title">Pengaturan Embed Player (Eksternal API)</h3>
                    <p class="panel-card-desc">Konfigurasi batas waktu pemutaran dan status click to play untuk semua pemutar eksternal (API Integration)</p>
                </div>
            </div>
            <form id="global-embed-config-form" onsubmit="window.handleSaveEmbedConfig(event)" class="space-y-4 pt-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Click to Play Switch -->
                    <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-cyber-bg/40 border border-slate-200 dark:border-cyber-outline/30 rounded-xl shadow-sm">
                        <div>
                            <span class="block text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-white font-mono">Click to Play</span>
                            <span class="text-[10px] text-slate-400 dark:text-cyber-dim font-mono">Wajib klik tombol Play untuk mulai memutar video</span>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="embed-click-to-play" class="sr-only peer" checked>
                            <div class="w-11 h-6 bg-slate-300 dark:bg-cyber-outline rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>
                    
                    <!-- Timeout Duration Input -->
                    <div class="flex flex-col justify-center p-4 bg-slate-50 dark:bg-cyber-bg/40 border border-slate-200 dark:border-cyber-outline/30 rounded-xl shadow-sm space-y-2">
                        <div class="flex justify-between items-center">
                            <label for="embed-timeout-seconds" class="block text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-white font-mono">Batas Waktu Pemutaran (Detik)</label>
                            <span id="embed-timeout-val-desc" class="text-[10px] font-mono text-sky-500 font-bold">5.0 Menit</span>
                        </div>
                        <input type="number" id="embed-timeout-seconds" min="10" max="86400" value="300" 
                            class="app-input w-full font-mono text-xs" 
                            placeholder="Default: 300 (5 menit)" 
                            oninput="
                                const val = parseInt(this.value, 10);
                                const desc = document.getElementById('embed-timeout-val-desc');
                                if(isNaN(val) || val <= 0) { desc.textContent = 'Nonaktif'; }
                                else if(val >= 3600) { desc.textContent = (val/3600).toFixed(1) + ' Jam'; }
                                else if(val >= 60) { desc.textContent = (val/60).toFixed(1) + ' Menit'; }
                                else { desc.textContent = val + ' Detik'; }
                            ">
                    </div>
                </div>
                
                <div class="flex justify-end pt-2">
                    <button type="submit"
                        class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm cursor-pointer">
                        Simpan Pengaturan Embed
                    </button>
                </div>
            </form>
        </div>
        
        <!-- Manage Active Keys -->
        <div class="panel-card">
            <div class="panel-card-header flex items-center justify-between flex-wrap gap-3 pb-4">
                <div>
                    <h3 class="panel-card-title">Kunci API & Integrasi Aktif</h3>
                    <p class="panel-card-desc">Daftar kunci akses eksternal yang terdaftar aktif dalam sistem</p>
                </div>
                <button onclick="window.openApiKeyGenerateModal()" class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm cursor-pointer">
                    + Generate API Key Baru
                </button>
            </div>
            
            <div class="admin-table-wrap overflow-x-auto border border-slate-200/80 dark:border-cyber-outline/30 rounded-xl bg-white dark:bg-cyber-container/40">
                <table class="w-full text-left text-xs font-mono">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-cyber-outline text-slate-400 dark:text-cyber-dim uppercase tracking-wider bg-slate-50 dark:bg-cyber-bg/60">
                            <th class="py-3.5 px-4 font-semibold">Klien / Kamera</th>
                            <th class="py-3.5 px-4 font-semibold w-40">Keamanan</th>
                            <th class="py-3.5 px-4 font-semibold">API Key &amp; Embed URL</th>
                            <th class="py-3.5 px-4 font-semibold text-right w-48">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="api-keys-table-body" class="divide-y divide-slate-100 dark:divide-cyber-outline/20">
                        <tr><td colspan="4" class="py-8 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                            <div class="flex items-center justify-center space-x-2">
                                <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                <span>Memuat daftar API key...</span>
                            </div>
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- API Access Log Panel -->
        <div class="panel-card">
            <div class="panel-card-header flex items-center justify-between flex-wrap gap-3 pb-4">
                <div class="flex-1 min-w-0">
                    <h3 class="panel-card-title">Log Akses API</h3>
                    <p class="panel-card-desc">Rekam jejak setiap server/domain yang mengakses stream melalui API Key</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <!-- Filter dropdown -->
                    <select id="api-log-filter-key" onchange="window.loadApiAccessLogs()" class="app-input text-[11px] font-mono py-1.5 px-2.5 h-9 rounded-xl">
                        <option value="">Semua Kunci</option>
                    </select>
                    <select id="api-log-filter-status" onchange="window.loadApiAccessLogs()" class="app-input text-[11px] font-mono py-1.5 px-2.5 h-9 rounded-xl">
                        <option value="">Semua Status</option>
                        <option value="hit">HIT saja</option>
                        <option value="denied">DENIED saja</option>
                    </select>
                    <button onclick="window.loadApiAccessLogs()" title="Refresh log"
                        class="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-400 dark:hover:border-white text-slate-700 dark:text-cyber-text text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        <span>Refresh</span>
                    </button>
                    <button onclick="window.clearApiAccessLogs()" title="Hapus semua log"
                        class="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        <span>Hapus Log</span>
                    </button>
                </div>
            </div>

            <!-- Summary Stats Cards -->
            <div id="api-log-summary" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-cyber-bg/40 border border-slate-200/80 dark:border-cyber-outline/20 flex flex-col gap-1">
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-cyber-dim font-mono">Total Akses</span>
                    <span id="log-stat-total" class="text-xl font-bold font-mono text-slate-800 dark:text-white">—</span>
                </div>
                <div class="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col gap-1">
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">HIT</span>
                    <span id="log-stat-hits" class="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">—</span>
                </div>
                <div class="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 flex flex-col gap-1">
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-rose-500 dark:text-rose-400 font-mono">DENIED</span>
                    <span id="log-stat-denied" class="text-xl font-bold font-mono text-rose-500 dark:text-rose-400">—</span>
                </div>
                <div class="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/20 flex flex-col gap-1">
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-cyber-primary font-mono">IP Unik</span>
                    <span id="log-stat-ips" class="text-xl font-bold font-mono text-sky-600 dark:text-cyber-primary">—</span>
                </div>
            </div>

            <!-- Log Table -->
            <div class="admin-table-wrap overflow-x-auto border border-slate-200/80 dark:border-cyber-outline/30 rounded-xl bg-white dark:bg-cyber-container/40">
                <table class="w-full text-left text-xs font-mono">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-cyber-outline text-slate-400 dark:text-cyber-dim uppercase tracking-wider bg-slate-50 dark:bg-cyber-bg/60">
                            <th class="py-3.5 px-4 font-semibold w-36">Waktu</th>
                            <th class="py-3.5 px-4 font-semibold">Klien / Kamera</th>
                            <th class="py-3.5 px-4 font-semibold">IP Asal</th>
                            <th class="py-3.5 px-4 font-semibold">Referer / Domain</th>
                            <th class="py-3.5 px-4 font-semibold w-24 text-center">Status</th>
                            <th class="py-3.5 px-4 font-semibold">Keterangan</th>
                        </tr>
                    </thead>
                    <tbody id="api-log-table-body" class="divide-y divide-slate-100 dark:divide-cyber-outline/20">
                        <tr><td colspan="6" class="py-8 text-center text-xs text-slate-400 dark:text-cyber-dim font-mono">
                            <div class="flex items-center justify-center space-x-2">
                                <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                <span>Memuat log akses...</span>
                            </div>
                        </td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Load More -->
            <div class="flex items-center justify-between mt-3">
                <span id="api-log-count-label" class="text-[11px] text-slate-400 dark:text-cyber-dim font-mono"></span>
                <button id="api-log-load-more" onclick="window.loadMoreApiAccessLogs()" class="hidden px-3.5 py-2 bg-slate-100 dark:bg-cyber-bg border border-slate-200 dark:border-cyber-outline hover:border-slate-400 text-slate-700 dark:text-cyber-text text-xs font-semibold uppercase tracking-wider font-mono rounded-xl transition-all duration-150 active:scale-95 shadow-sm cursor-pointer">
                    Muat 100 Log Lebih
                </button>
            </div>

            <!-- Auto-refresh notice -->
            <p class="text-[10px] text-slate-400 dark:text-cyber-dim/60 font-mono mt-2">Log diperbarui otomatis setiap 30 detik saat tab ini aktif.</p>
        </div>

    </div>

</div>

<!-- Leaflet JS — must load before app.js (footer) -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>

<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>
<!-- Semua Kamera (All Cameras) View -->
<div id="tab-viewer" class="monitor-page page-layout tab-view-bottom-space">

    <div class="layout-section layout-intro">
        <?php
        $tabIntroTitle = 'Semua Kamera';
        $tabIntroDesc = 'Pantau feed CCTV real-time, filter grup, dan atur tata letak grid.';
        $tabIntroIcon = 'camera';
        include __DIR__ . '/../includes/tab-intro-box.php';
        ?>
    </div>

    <div class="layout-section layout-toolbar">
        <div class="control-bar monitor-toolbar-bar">
            <div class="app-field-wrap">
                <span class="app-field-icon app-field-icon-left" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm3 4a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zm3 4a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z"/>
                    </svg>
                </span>
                <select id="viewer-group-filter" onchange="window.filterViewerStreams()" class="app-input app-select app-select-icon-left">
                    <option value="">All Groups</option>
                </select>
                <span class="app-field-icon app-field-icon-right" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </span>
            </div>

            <div class="control-bar-group">
                <span class="control-bar-label">Grid</span>
                <div class="grid-picker">
                    <button onclick="changeGridLayout(1, true)" id="grid-btn-1" class="btn-elegant">1x1</button>
                    <button onclick="changeGridLayout(2, true)" id="grid-btn-2" class="btn-elegant">2x2</button>
                    <button onclick="changeGridLayout(3, true)" id="grid-btn-3" class="btn-elegant btn-elegant-primary">3x3</button>
                    <button onclick="changeGridLayout(4, true)" id="grid-btn-4" class="btn-elegant">4x4</button>
                </div>
            </div>
        </div>
    </div>

    <div class="layout-section layout-grid">
        <div id="cctv-grid" class="monitor-camera-grid grid grid-cols-1 gap-3 md:gap-4 transition-all duration-300">
            <!-- Populated dynamically via JS -->
        </div>
    </div>

    <div class="layout-section layout-pagination-wrap">
        <?php include __DIR__ . '/../includes/pagination-bar.php'; ?>
    </div>

    <div class="layout-section layout-empty">
        <div id="viewer-empty-state" class="hidden panel-card py-16 text-center">
            <svg class="w-16 h-16 mx-auto text-slate-300 dark:text-cyber-outline mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"></path>
            </svg>
            <p class="panel-card-title">No Feeds Available</p>
            <p class="panel-card-desc mt-2 max-w-md mx-auto">Tidak ada stream CCTV yang terhubung ke profil Anda. Hubungi administrator untuk mengatur akses kamera.</p>
        </div>
    </div>

</div>

<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>
<!-- Custom Monitor View -->
<div id="tab-custom" class="monitor-page page-layout tab-view-bottom-space">

    <div class="layout-section layout-intro">
        <?php
        $tabIntroTitle = 'Screen';
        $tabIntroDesc = 'Atur layar monitoring personal, kustomisasi grid, dan simpan grouping kamera.';
        $tabIntroIcon = 'screen';
        $tabIntroActionHtml = '<button type="button" onclick="window.toggleFullscreen(\'custom-cctv-grid\')" class="btn-elegant btn-elegant-primary">'
            . '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
            . '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>'
            . '</svg><span>Fullscreen</span></button>';
        include __DIR__ . '/../includes/tab-intro-box.php';
        ?>
    </div>

    <div class="layout-section layout-body layout-body-split">

    <!-- Sidebar Panel -->
    <div id="custom-monitor-sidebar" class="layout-section layout-sidebar space-y-5">
        <div class="panel-card space-y-5">
            <div class="panel-card-header">
                <h3 class="panel-card-title">Custom Playlist</h3>
                <p class="panel-card-desc">Pilih dan susun kamera aktif untuk layar monitoring personal</p>
            </div>

            <div class="space-y-2">
                <label for="custom-view-mode" class="field-label">Tipe Tampilan</label>
                <div class="app-field-wrap app-select-field">
                    <span class="app-field-icon app-field-icon-left" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/>
                        </svg>
                    </span>
                    <select id="custom-view-mode" onchange="toggleCustomViewMode(this.value)" class="app-input app-select app-select-icon-left">
                        <option value="custom">Kustom (Pilih Manual)</option>
                        <option value="group">Per Grup Kamera</option>
                    </select>
                    <span class="app-field-icon app-field-icon-right" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </span>
                </div>
            </div>

            <div id="panel-mode-custom" class="space-y-4">
                <div class="space-y-2">
                    <label class="field-label">Select & Sort Feeds</label>
                    <div class="field-scroll max-h-96 space-y-2" id="custom-camera-select-list">
                        <!-- Loaded dynamically via JS -->
                    </div>
                </div>

                <button onclick="saveCustomPlaylist()"
                    class="w-full btn-elegant btn-elegant-primary py-2.5 uppercase tracking-wider">
                    Save & Load Playlist
                </button>
            </div>

            <div id="panel-mode-group" class="space-y-4 hidden">
                <div class="space-y-2">
                    <label class="field-label">Pilih Grup Kamera</label>
                    <div id="custom-groups-list" class="field-scroll max-h-96 space-y-1.5">
                        <!-- Populated dynamically via JS -->
                    </div>
                </div>
            </div>
        </div>

        <div class="panel-card space-y-5">
            <div class="panel-card-header">
                <h3 class="panel-card-title">Gruping Layar</h3>
                <p class="panel-card-desc">Simpan & muat konfigurasi susunan kamera Anda</p>
            </div>

            <div class="space-y-2">
                <label for="new-screen-name" class="field-label">Nama Grouping Baru</label>
                <div class="flex gap-2">
                    <input type="text" id="new-screen-name" placeholder="e.g., Lobby & Parkir" class="field-input flex-1">
                    <button onclick="saveCurrentAsNewScreen()" class="btn-elegant btn-elegant-primary shrink-0">Simpan</button>
                </div>
            </div>

            <div class="space-y-2">
                <label class="field-label">Daftar Grouping</label>
                <div id="saved-screens-list" class="field-scroll max-h-60 space-y-1.5">
                    <!-- Populated dynamically via JS -->
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content Panel -->
    <div id="custom-monitor-content-wrapper" class="layout-section layout-main flex-1 w-full min-w-0">

        <div class="layout-section layout-toolbar">
            <div class="control-bar monitor-toolbar-bar">
                <div class="app-field-wrap">
                    <span class="app-field-icon app-field-icon-left" aria-hidden="true">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm3 4a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zm3 4a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z"/>
                        </svg>
                    </span>
                    <select id="custom-group-filter" onchange="window.filterCustomGroupFeeds()" class="app-input app-select app-select-icon-left">
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
                        <button onclick="changeCustomGridSize(1)" id="cust-grid-btn-1" class="btn-elegant">1x1</button>
                        <button onclick="changeCustomGridSize(2)" id="cust-grid-btn-2" class="btn-elegant">2x2</button>
                        <button onclick="changeCustomGridSize(3)" id="cust-grid-btn-3" class="btn-elegant btn-elegant-primary">3x3</button>
                        <button onclick="changeCustomGridSize(4)" id="cust-grid-btn-4" class="btn-elegant">4x4</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="layout-section layout-grid">
            <div id="custom-cctv-grid" class="monitor-camera-grid grid grid-cols-1 gap-3 md:gap-4 transition-all duration-300">
                <!-- Populated dynamically via JS -->
            </div>
        </div>

        <div class="layout-section layout-pagination-wrap">
            <?php
            $paginationId = 'custom-cctv-pagination';
            $pagesContainerId = 'custom-pagination-pages-container';
            $pageIndicatorId = 'custom-page-indicator';
            $firstBtnId = 'custom-first-page-btn';
            $prevBtnId = 'custom-prev-page-btn';
            $nextBtnId = 'custom-next-page-btn';
            $lastBtnId = 'custom-last-page-btn';
            $onFirst = 'window.jumpToCustomPage(0)';
            $onPrev = 'window.changeCustomPageOffset(-1)';
            $onNext = 'window.changeCustomPageOffset(1)';
            $onLast = 'window.jumpToLastCustomPage()';
            include __DIR__ . '/../includes/pagination-bar.php';
            ?>
        </div>

        <div class="layout-section layout-empty">
            <div id="custom-empty-state" class="hidden panel-card py-16 text-center">
                <svg class="w-16 h-16 mx-auto text-slate-300 dark:text-cyber-outline mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                </svg>
                <p class="panel-card-title">Playlist Empty</p>
                <p class="panel-card-desc mt-2 max-w-sm mx-auto">Centang minimal satu kamera di panel kiri untuk mulai monitoring.</p>
            </div>
        </div>
    </div>

    </div>

    <button type="button" id="exit-web-fullscreen-btn" onclick="window.toggleFullscreen('custom-cctv-grid')" class="fs-exit-btn" aria-label="Keluar fullscreen">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        <span>Keluar Fullscreen</span>
    </button>

</div>

<?php
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>
<!-- Playback View -->
<div id="tab-playback" class="page-layout tab-view-bottom-space">
    <div class="layout-section layout-intro">
        <?php
        $tabIntroTitle = 'Playback';
        $tabIntroDesc = 'Putar rekaman CCTV yang tersimpan. Pilih kamera pada grid, lalu geser timeline untuk melompat ke jam mana pun.';
        $tabIntroIcon = 'playback';
        $tabIntroBadge = null;
        $tabIntroBadgeId = null;
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
                <select id="pb-group-filter" class="app-input app-select app-select-icon-left">
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
                    <button type="button" data-pb-grid="2" class="btn-elegant">2x2</button>
                    <button type="button" data-pb-grid="3" class="btn-elegant btn-elegant-primary">3x3</button>
                    <button type="button" data-pb-grid="4" class="btn-elegant">4x4</button>
                </div>
            </div>
        </div>
    </div>

    <div class="layout-section layout-grid">
        <div id="pb-camera-grid" class="monitor-camera-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 transition-all duration-300"></div>
    </div>

    <div class="layout-section layout-empty">
        <div id="playback-empty" class="panel-card text-center py-12">
            <svg class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p id="pb-empty-text" class="text-xs text-slate-400 dark:text-cyber-dim font-mono">Belum ada kamera dengan rekaman tersimpan</p>
        </div>
    </div>
</div>

<!-- Playback Modal -->
<div id="pb-modal" class="hidden ms-modal">
    <div class="ms-modal__panel" style="max-width: 64rem;">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <div class="min-w-0">
                <h3 id="pb-modal-title" class="font-bold text-sm uppercase tracking-wider font-mono text-slate-900 dark:text-white truncate">Playback</h3>
                <p id="pb-modal-sub" class="text-[10px] font-mono text-slate-400 dark:text-cyber-dim truncate">&nbsp;</p>
            </div>
            <button type="button" id="pb-modal-close" class="shrink-0 ml-3 text-slate-400 hover:text-rose-500 transition-colors" title="Tutup">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>

        <div class="p-4 space-y-3">
            <div class="flex items-center gap-3">
                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-cyber-dim/80 font-mono">Tanggal</label>
                <select id="playback-date-select" class="app-input text-xs flex-1 max-w-xs"></select>
                <span id="playback-info" class="text-[10px] font-mono text-slate-400 dark:text-cyber-dim"></span>
            </div>

            <div class="relative bg-black rounded-md overflow-hidden" style="aspect-ratio: 16/9;">
                <video id="playback-video" class="w-full h-full" controls playsinline preload="auto"></video>
                <div id="playback-loading" class="absolute inset-0 flex items-center justify-center bg-black/60 hidden">
                    <div class="flex items-center space-x-2 text-white text-xs font-mono">
                        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        <span>Memuat rekaman...</span>
                    </div>
                </div>
                <div id="pb-no-rec" class="absolute inset-0 hidden flex-col items-center justify-center bg-black/70 text-center px-4">
                    <p class="text-xs font-mono text-slate-300">Belum ada rekaman untuk kamera ini</p>
                </div>
            </div>

            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <button type="button" onclick="window.pbSeekRelative(-30)" class="btn-elegant text-[10px]" title="Mundur 30 detik">&#8592; 30s</button>
                        <button type="button" onclick="window.pbTogglePlay()" id="pb-play-btn" class="btn-elegant btn-elegant-primary text-[10px]">Play / Pause</button>
                        <button type="button" onclick="window.pbSeekRelative(30)" class="btn-elegant text-[10px]">30s &#8594;</button>
                    </div>
                    <div class="text-right">
                        <div id="pb-clock" class="text-sm font-mono font-bold text-slate-700 dark:text-white">--:--:--</div>
                        <div id="pb-range-label" class="text-[9px] font-mono text-slate-400 dark:text-cyber-dim">&nbsp;</div>
                    </div>
                </div>

                <div id="pb-timeline" class="relative h-12 rounded-lg bg-slate-100 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 cursor-pointer select-none overflow-hidden">
                    <div id="pb-timeline-ranges" class="absolute inset-0"></div>
                    <div id="pb-timeline-ticks" class="absolute inset-x-0 bottom-0 h-4"></div>
                    <div id="pb-playhead" class="absolute top-0 bottom-0 w-0.5 bg-rose-500 pointer-events-none hidden">
                        <div class="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                    </div>
                </div>

                <div class="flex items-center justify-between text-[9px] font-mono text-slate-400 dark:text-cyber-dim">
                    <span id="pb-tl-start">00:00</span>
                    <span>Klik timeline untuk melompat ke jam tertentu</span>
                    <span id="pb-tl-end">23:59</span>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
(function() {
    const API_URL = '/api';
    const CHUNK = 900;               // seconds fetched per playback request
    let cameras = [];
    let ranges = [];                 // continuous recording ranges (epoch seconds)
    let dayStart = 0, dayEnd = 0;    // timeline bounds (epoch seconds)
    let chunkStartEpoch = 0;
    let activeCamera = null;
    let camerasLoaded = false;

    const $ = (id) => document.getElementById(id);
    const token = () => localStorage.getItem('cctv_auth_token');
    const authHeaders = () => ({ Authorization: 'Bearer ' + token() });

    // .view-section animates `transform`, creating a containing block that traps
    // position:fixed children. Portal the modal to <body> so it covers the viewport.
    const pbModalEl = document.getElementById('pb-modal');
    if (pbModalEl && pbModalEl.parentElement !== document.body) document.body.appendChild(pbModalEl);

    const fmtClock = (epoch) => new Date(epoch * 1000).toLocaleTimeString('id-ID', {hour12: false});
    const fmtHM = (epoch) => new Date(epoch * 1000).toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', hour12: false});

    // ---------- Camera grid ----------

    window.loadPlaybackCameras = async function() {
        if (!token()) return;
        try {
            const res = await fetch(`${API_URL}/recordings/cameras`, { headers: authHeaders() });
            if (!res.ok) return;
            cameras = await res.json();
            camerasLoaded = true;
            buildGroupFilter();
            renderCameraGrid();
        } catch (e) { console.warn('playback cameras:', e); }
    };

    function buildGroupFilter() {
        const sel = $('pb-group-filter');
        if (!sel) return;
        const prev = sel.value;
        const groups = [...new Set(cameras.map(c => c.group_name).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">All Groups</option>';
        groups.forEach(g => {
            const o = document.createElement('option');
            o.value = g; o.textContent = g;
            sel.appendChild(o);
        });
        if (groups.includes(prev)) sel.value = prev;
    }

    function visibleCameras() {
        const g = $('pb-group-filter')?.value || '';
        return g ? cameras.filter(c => c.group_name === g) : cameras;
    }

    function renderCameraGrid() {
        const grid = $('pb-camera-grid');
        const empty = $('playback-empty');
        if (!grid) return;
        const list = visibleCameras();

        grid.innerHTML = '';
        if (!list.length) {
            empty.classList.remove('hidden');
            $('pb-empty-text').textContent = camerasLoaded
                ? 'Belum ada kamera dengan rekaman tersimpan'
                : 'Memuat daftar kamera...';
            return;
        }
        empty.classList.add('hidden');

        list.forEach(cam => {
            const card = document.createElement('div');
            card.id = `pb-tile-${cam.id}`;
            card.className = 'relative cam-placeholder-bg overflow-hidden group aspect-video cursor-pointer rounded-md border border-slate-200/70 dark:border-slate-700/60';
            card.innerHTML = `
                <img src="${API_URL}/posters/stream_${cam.id}.jpg?t=${Date.now()}"
                     alt="${cam.name}"
                     class="absolute inset-0 w-full h-full object-cover"
                     onerror="this.style.display='none'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"></div>

                <div class="absolute top-2 left-2 flex items-center space-x-1.5 bg-slate-950/70 backdrop-blur-md px-2 py-1 rounded border border-white/10">
                    <span class="w-1.5 h-1.5 rounded-full ${cam.has_recordings ? 'bg-emerald-500' : 'bg-slate-500'}"></span>
                    <span class="text-[8px] font-bold uppercase tracking-widest font-mono ${cam.has_recordings ? 'text-emerald-400' : 'text-slate-400'}">
                        ${cam.has_recordings ? 'ADA REKAMAN' : 'KOSONG'}
                    </span>
                </div>

                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div class="p-3 rounded-full bg-sky-500/25 border border-sky-400/50 backdrop-blur-sm">
                        <svg class="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>

                <div class="absolute bottom-0 inset-x-0 px-3 py-2">
                    <p class="text-[11px] font-bold text-white font-mono truncate">${cam.name}</p>
                    <p class="text-[9px] text-slate-300 font-mono truncate">${cam.group_name || ''}</p>
                </div>
            `;
            card.addEventListener('click', () => window.openPlaybackModal(cam.id));
            grid.appendChild(card);
        });
    }

    window.setPlaybackGrid = function(cols) {
        const grid = $('pb-camera-grid');
        if (!grid) return;
        const map = {
            2: 'grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 transition-all duration-300',
            3: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 transition-all duration-300',
            4: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 transition-all duration-300'
        };
        grid.className = 'monitor-camera-grid ' + (map[cols] || map[3]);
        document.querySelectorAll('[data-pb-grid]').forEach(b => {
            b.className = parseInt(b.dataset.pbGrid, 10) === cols
                ? 'btn-elegant btn-elegant-primary' : 'btn-elegant';
        });
    };

    // ---------- Modal + player ----------

    window.openPlaybackModal = async function(streamId) {
        activeCamera = cameras.find(c => c.id === parseInt(streamId, 10));
        if (!activeCamera) return;
        $('pb-modal-title').textContent = activeCamera.name;
        $('pb-modal-sub').textContent = activeCamera.group_name || '';
        $('pb-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        resetPlayer();
        await loadPlaybackDates();
    };

    window.closePlaybackModal = function() {
        const v = $('playback-video');
        v.pause();
        v.removeAttribute('src');
        v.load();
        $('pb-modal').classList.add('hidden');
        document.body.style.overflow = '';
        activeCamera = null;
    };

    function resetPlayer() {
        ranges = []; dayStart = 0; dayEnd = 0; chunkStartEpoch = 0;
        $('pb-timeline-ranges').innerHTML = '';
        $('pb-timeline-ticks').innerHTML = '';
        $('pb-playhead').classList.add('hidden');
        $('pb-clock').textContent = '--:--:--';
        $('pb-no-rec').classList.add('hidden');
        $('pb-no-rec').classList.remove('flex');
    }

    function showNoRecording(msg) {
        $('playback-loading').classList.add('hidden');
        $('pb-no-rec').classList.remove('hidden');
        $('pb-no-rec').classList.add('flex');
        $('pb-no-rec').querySelector('p').textContent = msg;
    }

    async function loadPlaybackDates() {
        if (!activeCamera) return;
        const dateSel = $('playback-date-select');
        const info = $('playback-info');
        try {
            const res = await fetch(`${API_URL}/recordings/${activeCamera.id}/dates`, { headers: authHeaders() });
            if (!res.ok) throw new Error('dates failed');
            const dates = await res.json();
            dateSel.innerHTML = '';
            dates.forEach(d => {
                const o = document.createElement('option');
                o.value = d.date;
                o.textContent = `${d.date} (${d.segment_count} segment)`;
                dateSel.appendChild(o);
            });
            dateSel.disabled = dates.length === 0;
            if (!dates.length) {
                dateSel.innerHTML = '<option value="">-- Tidak ada --</option>';
                info.textContent = '';
                showNoRecording('Belum ada rekaman untuk kamera ini');
                return;
            }
            info.textContent = `${dates.length} tanggal tersedia`;
            dateSel.value = dates[0].date;
            await loadPlaybackTimeline();
        } catch (e) {
            info.textContent = '';
            showNoRecording('Gagal memuat tanggal rekaman');
        }
    }
    window.loadPlaybackDates = loadPlaybackDates;

    async function loadPlaybackTimeline() {
        if (!activeCamera) return;
        const date = $('playback-date-select').value;
        if (!date) return;
        try {
            const res = await fetch(`${API_URL}/recordings/${activeCamera.id}/timeline?date=${date}`, { headers: authHeaders() });
            if (!res.ok) throw new Error('timeline failed');
            const data = await res.json();
            ranges = data.ranges || [];
            if (!ranges.length) { showNoRecording('Belum ada rekaman pada tanggal ini'); return; }

            $('pb-no-rec').classList.add('hidden');
            $('pb-no-rec').classList.remove('flex');

            dayStart = ranges[0].start_epoch;
            const last = ranges[ranges.length - 1];
            dayEnd = last.start_epoch + last.duration;

            $('pb-tl-start').textContent = fmtHM(dayStart);
            $('pb-tl-end').textContent = fmtHM(dayEnd);
            $('playback-info').textContent =
                `${ranges.length} rekaman - total ${Math.round(data.total_duration / 60)} menit`;

            renderTimeline();
            await seekToEpoch(dayStart);
        } catch (e) {
            console.warn('timeline:', e);
            showNoRecording('Gagal memuat timeline');
        }
    }
    window.loadPlaybackTimeline = loadPlaybackTimeline;

    function renderTimeline() {
        const wrap = $('pb-timeline-ranges');
        const ticks = $('pb-timeline-ticks');
        const span = Math.max(dayEnd - dayStart, 1);
        wrap.innerHTML = '';
        ticks.innerHTML = '';

        ranges.forEach(r => {
            const left = ((r.start_epoch - dayStart) / span) * 100;
            const width = Math.max((r.duration / span) * 100, 0.4);
            const bar = document.createElement('div');
            bar.className = 'absolute top-1 bottom-4 rounded-sm bg-emerald-500/70 hover:bg-emerald-400 transition-colors';
            bar.style.left = left + '%';
            bar.style.width = width + '%';
            bar.title = `${fmtClock(r.start_epoch)} - ${fmtClock(r.start_epoch + r.duration)}`;
            wrap.appendChild(bar);
        });

        const firstHour = Math.ceil(dayStart / 3600) * 3600;
        for (let t = firstHour; t <= dayEnd; t += 3600) {
            const left = ((t - dayStart) / span) * 100;
            const tick = document.createElement('div');
            tick.className = 'absolute bottom-0 text-[8px] font-mono text-slate-400 dark:text-cyber-dim border-l border-slate-300/60 dark:border-slate-600/60 pl-0.5';
            tick.style.left = left + '%';
            tick.textContent = fmtHM(t);
            ticks.appendChild(tick);
        }
    }

    function nearestRangeEpoch(epoch) {
        for (const r of ranges) {
            if (epoch >= r.start_epoch && epoch <= r.start_epoch + r.duration) return epoch;
        }
        let best = ranges[0].start_epoch, dist = Infinity;
        for (const r of ranges) {
            const d = Math.abs(r.start_epoch - epoch);
            if (d < dist) { dist = d; best = r.start_epoch; }
        }
        return best;
    }

    async function seekToEpoch(epoch) {
        if (!activeCamera || !ranges.length) return;
        const video = $('playback-video');
        const loading = $('playback-loading');
        const target = nearestRangeEpoch(epoch);

        loading.classList.remove('hidden');
        chunkStartEpoch = target;

        const startIso = new Date(target * 1000).toISOString();
        const url = `${API_URL}/recordings/${activeCamera.id}/stream?start=${encodeURIComponent(startIso)}&duration=${CHUNK}&token=${encodeURIComponent(token())}`;

        video.src = url;
        video.load();
        video.onloadeddata = () => { loading.classList.add('hidden'); video.play().catch(() => {}); };
        video.onerror = () => { loading.classList.add('hidden'); };
    }

    window.pbSeekRelative = function(delta) {
        const video = $('playback-video');
        const now = chunkStartEpoch + (video.currentTime || 0);
        const target = now + delta;
        if (target >= chunkStartEpoch && video.duration && target - chunkStartEpoch < video.duration) {
            video.currentTime = target - chunkStartEpoch;
        } else {
            seekToEpoch(target);
        }
    };

    window.pbTogglePlay = function() {
        const v = $('playback-video');
        if (v.paused) v.play().catch(() => {}); else v.pause();
    };

    // ---------- Events ----------

    // Timeline: bisa diketuk DAN digeser (mouse, sentuh, pena).
    // Pointer Events menyatukan ketiganya, jadi tidak perlu handler
    // touch terpisah dan tidak ada seek ganda.
    (() => {
        const tl = $('pb-timeline');
        if (!tl) return;
        let scrubbing = false;

        const ratioAt = (clientX) => {
            const rect = tl.getBoundingClientRect();
            return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        };
        const preview = (clientX) => {
            const head = $('pb-playhead');
            if (!head) return;
            head.classList.remove('hidden');
            head.style.left = (ratioAt(clientX) * 100) + '%';
        };
        const commit = (clientX) => {
            if (!ranges.length) return;
            seekToEpoch(dayStart + ratioAt(clientX) * (dayEnd - dayStart));
        };

        tl.addEventListener('pointerdown', (e) => {
            if (!ranges.length) return;
            scrubbing = true;
            tl.setPointerCapture(e.pointerId);
            preview(e.clientX);
            e.preventDefault();
        });
        tl.addEventListener('pointermove', (e) => {
            if (scrubbing) preview(e.clientX);
        });
        const end = (e) => {
            if (!scrubbing) return;
            scrubbing = false;
            try { tl.releasePointerCapture(e.pointerId); } catch (_) {}
            commit(e.clientX);
        };
        tl.addEventListener('pointerup', end);
        tl.addEventListener('pointercancel', () => { scrubbing = false; });
    })();

    $('playback-video').addEventListener('timeupdate', () => {
        if (!ranges.length) return;
        const v = $('playback-video');
        const cur = chunkStartEpoch + (v.currentTime || 0);
        const span = Math.max(dayEnd - dayStart, 1);
        const pct = Math.min(Math.max(((cur - dayStart) / span) * 100, 0), 100);
        const head = $('pb-playhead');
        head.classList.remove('hidden');
        head.style.left = pct + '%';
        $('pb-clock').textContent = fmtClock(cur);
        $('pb-range-label').textContent = $('playback-date-select').value || '';
    });

    $('playback-video').addEventListener('ended', () => {
        const next = chunkStartEpoch + CHUNK;
        if (next < dayEnd) seekToEpoch(next);
    });

    $('playback-date-select').addEventListener('change', loadPlaybackTimeline);
    $('pb-group-filter').addEventListener('change', renderCameraGrid);
    $('pb-modal-close').addEventListener('click', window.closePlaybackModal);
    $('pb-modal').addEventListener('click', (e) => {
        if (e.target === $('pb-modal')) window.closePlaybackModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('pb-modal').classList.contains('hidden')) window.closePlaybackModal();
    });
    document.querySelectorAll('[data-pb-grid]').forEach(btn => {
        btn.addEventListener('click', () => window.setPlaybackGrid(parseInt(btn.dataset.pbGrid, 10)));
    });

    // ---------- Boot ----------

    function bootIfVisible() {
        const tab = $('tab-playback');
        if (tab && !tab.classList.contains('hidden') && !camerasLoaded) {
            window.loadPlaybackCameras();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const view = document.getElementById('view-playback') || $('tab-playback');
        if (view) {
            new MutationObserver(bootIfVisible).observe(view, { attributes: true, attributeFilter: ['class'] });
        }
        bootIfVisible();
    });
    bootIfVisible();
})();
</script>

<?php
// Secure guard to prevent direct access
if(!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}
?>
<!-- Viewer Console Grid View -->
<div id="tab-viewer" class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-cyber-outline/60 pb-5">
        <div>
            <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white uppercase font-mono">Live Monitor Grid</h2>
            <p class="text-xs text-slate-500 dark:text-cyber-dim mt-1 font-mono">Real-time WebRTC camera cluster authorization feed</p>
        </div>
        
        <!-- Grid controls -->
        <div class="flex items-center space-x-4 bg-white dark:bg-cyber-container border border-slate-200 dark:border-cyber-outline px-3 py-2 rounded-sm text-xs font-mono">
            <span class="text-slate-500 dark:text-cyber-dim uppercase">Grid Array:</span>
            <div class="flex space-x-1">
                <button onclick="changeGridLayout(1)" id="grid-btn-1" class="px-2.5 py-1 bg-slate-50 dark:bg-cyber-hover/50 text-slate-600 dark:text-cyber-dim border border-transparent rounded-sm hover:border-slate-300 dark:hover:border-cyber-outline">1x1</button>
                <button onclick="changeGridLayout(2)" id="grid-btn-2" class="px-2.5 py-1 bg-slate-50 dark:bg-cyber-hover/50 text-slate-600 dark:text-cyber-dim border border-transparent rounded-sm hover:border-slate-300 dark:hover:border-cyber-outline">2x2</button>
                <button onclick="changeGridLayout(3)" id="grid-btn-3" class="px-2.5 py-1 bg-sky-100 dark:bg-cyber-bg text-sky-700 dark:text-cyber-primary border border-sky-200 dark:border-cyber-primary/30 rounded-sm font-bold">3x3</button>
                <button onclick="changeGridLayout(4)" id="grid-btn-4" class="px-2.5 py-1 bg-slate-50 dark:bg-cyber-hover/50 text-slate-600 dark:text-cyber-dim border border-transparent rounded-sm hover:border-slate-300 dark:hover:border-cyber-outline">4x4</button>
            </div>
        </div>
    </div>

    <!-- CCTV Video feeds grid -->
    <div id="cctv-grid" class="grid grid-cols-1 gap-4 transition-all duration-300">
        <!-- Populated dynamically via JS -->
    </div>

    <!-- Empty state view -->
    <div id="viewer-empty-state" class="hidden py-24 text-center">
        <svg class="w-16 h-16 mx-auto text-slate-300 dark:text-cyber-outline mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"></path>
        </svg>
        <p class="text-base font-bold text-slate-700 dark:text-white uppercase font-mono">No Feeds Available</p>
        <p class="text-xs text-slate-400 dark:text-cyber-dim/80 mt-1 max-w-md mx-auto">No CCTV streams are linked to your profile. Contact system administrator to map camera authorizations.</p>
    </div>
</div>

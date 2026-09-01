<?php
if(!defined('SECURE_ACCESS')) { header("HTTP/1.1 403 Forbidden"); exit; }
$page = isset($_GET['page']) ? $_GET['page'] : 'monitor';
if ($page === 'viewer') $page = 'monitor';
?>

<!-- ── Desktop Sidebar (hidden on mobile — use bottom nav) ── -->
<aside id="main-sidebar" class="app-sidebar">
    <div class="sidebar-inner">

        <!-- Nav Section -->
        <div class="sidebar-nav-section">
            <nav class="sidebar-nav-list space-y-2">
                <!-- 1. Semua Kamera -->
                <a href="index.php?page=monitor" id="nav-viewer"
                   class="sidebar-nav-link sidebar-btn-card <?php echo ($page==='monitor') ? 'active' : ''; ?>">
                    <div class="nav-btn-icon-wrap">
                        <svg class="sidebar-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Semua Kamera</span>
                    <span class="nav-btn-indicator"></span>
                </a>

                <!-- 2. Screen -->
                <a href="index.php?page=custom" id="nav-custom"
                   class="sidebar-nav-link sidebar-btn-card <?php echo ($page==='custom') ? 'active' : ''; ?>">
                    <div class="nav-btn-icon-wrap">
                        <svg class="sidebar-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h3a1 1 0 011 1v6a1 1 0 01-1 1h-3a1 1 0 01-1-1v-6z"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Screen</span>
                    <span class="nav-btn-indicator"></span>
                </a>

                <!-- 3. Peta Kamera -->
                <a href="index.php?page=maps" id="nav-maps"
                   class="sidebar-nav-link sidebar-btn-card <?php echo ($page==='maps') ? 'active' : ''; ?>">
                    <div class="nav-btn-icon-wrap">
                        <svg class="sidebar-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Peta Kamera</span>
                    <span class="nav-btn-indicator"></span>
                </a>

                                <!-- 3b. Playback -->
                <a href="index.php?page=playback" id="nav-playback"
                   class="sidebar-nav-link sidebar-btn-card <?php echo ($page==='playback') ? 'active' : ''; ?>">
                    <div class="nav-btn-icon-wrap">
                        <svg class="sidebar-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Playback</span>
                    <span class="nav-btn-indicator"></span>
                </a>
                <!-- 4. System Admin -->
                <a href="index.php?page=admin" id="nav-admin"
                   class="sidebar-nav-link sidebar-btn-card hidden <?php echo ($page==='admin') ? 'active' : ''; ?>">
                    <div class="nav-btn-icon-wrap">
                        <svg class="sidebar-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">System Admin</span>
                    <span class="nav-btn-indicator"></span>
                </a>
            </nav>
        </div>

        <!-- Profile Card -->
        <div class="sidebar-profile-card">
            <div class="sidebar-avatar" id="profile-initial">U</div>
            <div class="sidebar-profile-meta">
                <div class="sidebar-profile-name" id="profile-name">Operator</div>
                <span class="sidebar-role-badge" id="profile-role">Operator</span>
            </div>
        </div>

    </div>
</aside>

<?php
if (!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}

$tabIntroTitle = $tabIntroTitle ?? 'Tab';
$tabIntroDesc = $tabIntroDesc ?? '';
$tabIntroIcon = $tabIntroIcon ?? 'camera';
$tabIntroBadge = $tabIntroBadge ?? null;
$tabIntroBadgeId = $tabIntroBadgeId ?? null;
$tabIntroActionHtml = $tabIntroActionHtml ?? null;

$iconPaths = [
    'camera' => 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    'screen' => 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7',
    'map' => 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
    'admin' => 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    'directory' => 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
    'users' => 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    'scanner' => 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253',
    'playback' => 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
];
$iconPath = $iconPaths[$tabIntroIcon] ?? $iconPaths['camera'];
?>
<div class="tab-intro-box">
    <div class="tab-intro-accent" aria-hidden="true"></div>
    <div class="tab-intro-icon" aria-hidden="true">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?php echo htmlspecialchars($iconPath); ?>"/>
        </svg>
    </div>
    <div class="tab-intro-content">
        <div class="tab-intro-title-row">
            <h2 class="tab-intro-title"><?php echo htmlspecialchars($tabIntroTitle); ?></h2>
            <?php if ($tabIntroBadge !== null || $tabIntroBadgeId): ?>
                <span <?php if ($tabIntroBadgeId): ?>id="<?php echo htmlspecialchars($tabIntroBadgeId); ?>"<?php endif; ?> class="tab-intro-badge"><?php echo htmlspecialchars($tabIntroBadge ?? ''); ?></span>
            <?php endif; ?>
        </div>
        <?php if ($tabIntroDesc): ?>
            <p class="tab-intro-desc"><?php echo htmlspecialchars($tabIntroDesc); ?></p>
        <?php endif; ?>
    </div>
    <?php if ($tabIntroActionHtml): ?>
        <div class="tab-intro-actions"><?php echo $tabIntroActionHtml; ?></div>
    <?php endif; ?>
</div>

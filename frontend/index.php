<?php
// Define secure access token to authorize include files
define('SECURE_ACCESS', true);

// Fetch current page request parameter
$page = isset($_GET['page']) ? $_GET['page'] : 'monitor';

// Backward compatibility for old page name
if ($page === 'viewer') {
    $page = 'monitor';
}

// Restrict to safe page templates
if (!in_array($page, ['monitor', 'admin', 'custom', 'maps', 'playback'])) {
    $page = 'monitor';
}

// Guard sesi klien dicetak di <head> oleh header.php
$authGuard = true;
include __DIR__ . '/includes/header.php';
?>

<!-- App Shell: sidebar + main content row -->
<div class="app-shell">
    <?php include __DIR__ . '/includes/sidebar.php'; ?>

    <main class="app-main" id="app-main">
        <div id="view-monitor" class="view-section view-layout <?php echo ($page === 'monitor') ? '' : 'hidden'; ?>">
            <?php include __DIR__ . '/views/live-monitor.php'; ?>
        </div>
        <div id="view-custom" class="view-section view-layout <?php echo ($page === 'custom') ? '' : 'hidden'; ?>">
            <?php include __DIR__ . '/views/custom-monitor.php'; ?>
        </div>
        <div id="view-maps" class="view-section view-layout <?php echo ($page === 'maps') ? '' : 'hidden'; ?>">
            <?php include __DIR__ . '/views/maps.php'; ?>
        </div>
        <div id="view-admin" class="view-section view-layout <?php echo ($page === 'admin') ? '' : 'hidden'; ?>">
            <?php include __DIR__ . '/views/admin-console.php'; ?>
        </div>
        <div id="view-playback" class="view-section view-layout <?php echo ($page === 'playback') ? '' : 'hidden'; ?>">
            <?php include __DIR__ . '/views/playback.php'; ?>
        </div>
    </main>
</div>

<?php include __DIR__ . '/views/modals.php'; ?>

<?php include __DIR__ . '/includes/mobile-nav.php'; ?>

<?php include __DIR__ . '/includes/footer.php'; ?>


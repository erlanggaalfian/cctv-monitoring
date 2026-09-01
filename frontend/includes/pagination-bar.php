<?php
if (!defined('SECURE_ACCESS')) {
    header("HTTP/1.1 403 Forbidden");
    exit("Direct access forbidden.");
}

$paginationId = $paginationId ?? 'cctv-pagination';
$pagesContainerId = $pagesContainerId ?? 'pagination-pages-container';
$pageIndicatorId = $pageIndicatorId ?? 'page-indicator';
$firstBtnId = $firstBtnId ?? 'first-page-btn';
$prevBtnId = $prevBtnId ?? 'prev-page-btn';
$nextBtnId = $nextBtnId ?? 'next-page-btn';
$lastBtnId = $lastBtnId ?? 'last-page-btn';
$onFirst = $onFirst ?? 'window.jumpToPage(0)';
$onPrev = $onPrev ?? 'window.changePageOffset(-1)';
$onNext = $onNext ?? 'window.changePageOffset(1)';
$onLast = $onLast ?? 'window.jumpToLastPage()';
$paginationExtraClass = $paginationExtraClass ?? '';
?>
<div id="<?php echo htmlspecialchars($paginationId); ?>" class="monitor-pagination layout-pagination <?php echo htmlspecialchars($paginationExtraClass); ?> hidden">
    <div class="pagination-bar">
        <div class="pagination-nav pagination-nav-start">
            <button id="<?php echo htmlspecialchars($firstBtnId); ?>" type="button" onclick="<?php echo $onFirst; ?>" class="pagination-btn pagination-btn-edge" aria-label="Halaman pertama">&laquo;</button>
            <button id="<?php echo htmlspecialchars($prevBtnId); ?>" type="button" onclick="<?php echo $onPrev; ?>" class="pagination-btn pagination-btn-step" aria-label="Halaman sebelumnya">&lsaquo;</button>
        </div>
        <div id="<?php echo htmlspecialchars($pagesContainerId); ?>" class="pagination-pages">
            <!-- n-2 · n-1 · n · n+1 · n+2 -->
        </div>
        <div class="pagination-nav pagination-nav-end">
            <button id="<?php echo htmlspecialchars($nextBtnId); ?>" type="button" onclick="<?php echo $onNext; ?>" class="pagination-btn pagination-btn-step" aria-label="Halaman berikutnya">&rsaquo;</button>
            <button id="<?php echo htmlspecialchars($lastBtnId); ?>" type="button" onclick="<?php echo $onLast; ?>" class="pagination-btn pagination-btn-edge" aria-label="Halaman terakhir">&raquo;</button>
        </div>
    </div>
    <div class="pagination-meta">
        <span id="<?php echo htmlspecialchars($pageIndicatorId); ?>" class="pagination-indicator"></span>
    </div>
</div>

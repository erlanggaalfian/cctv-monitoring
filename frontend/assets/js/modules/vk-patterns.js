/**
 * vk-patterns.js — Kontrak pola interaksi global (satu handler untuk semua halaman).
 *
 * Sumber kebenaran: design-system §3 (accordion .m-item, filter collapsible,
 * mConfirm, judul halaman diketuk) dan §4.7/§4.8 (toast, tab bar).
 *
 * Aman dimuat dini di <head>: delegated listener dipasang segera di tingkat
 * dokumen (bekerja untuk elemen yang muncul belakangan); inisialisasi yang
 * butuh DOM dibungkus DOMContentLoaded. Tidak mengasumsikan modul lain
 * sudah dimuat. Tidak memakai nama aplikasi/proyek apa pun.
 */
(function () {
    'use strict';

    var MOBILE_MQ = '(max-width: 768px)';
    var mobileMQ = window.matchMedia ? window.matchMedia(MOBILE_MQ) : { matches: true };

    /* ==================================================================
       Gaya dasar + varian DESKTOP untuk mConfirm (disuntik dari JS).
       Alasan: vk-mobile.css dilarang memuat aturan di luar @media mobile,
       sedangkan dialog desktop butuh CSS juga. Gaya bottom-sheet mobile
       ada di vk-mobile.css (@media max-width:768px); yang di sini hanya
       struktur dasar + dialog tengah desktop + aturan desktop untuk pola
       lipat (.m-filter-more memakai display:contents agar piksel-identik).
       ================================================================== */
    var BASE_CSS = [
        '.vk-confirm-backdrop{',
        'position:fixed;inset:0;z-index:500;',
        'display:flex;align-items:center;justify-content:center;',
        'padding:24px;',
        'background:rgba(10,17,32,.55);',
        '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);',
        'opacity:0;transition:opacity 200ms cubic-bezier(0,0,.2,1);',
        '}',
        '.vk-confirm-backdrop.vk-show{opacity:1;}',
        '.vk-confirm-dialog{',
        'width:100%;max-width:400px;',
        'background:var(--color-bg-content,#fff);',
        'color:var(--color-text-body,#3f4750);',
        'font-family:var(--vk-font-sans,system-ui,sans-serif);',
        'border:1px solid var(--color-border,#e2e6e9);',
        'border-radius:12px;',
        'box-shadow:0 20px 60px rgba(0,0,0,.25);',
        'padding:20px;',
        'transform:translateY(8px) scale(.98);',
        'transition:transform 200ms cubic-bezier(0,0,.2,1);',
        '}',
        '.vk-confirm-backdrop.vk-show .vk-confirm-dialog{transform:none;}',
        '.vk-confirm-title{',
        'margin:0 0 8px;font-size:16px;font-weight:700;',
        'color:var(--color-text-header,#282e33);',
        '}',
        '.vk-confirm-message{',
        'margin:0 0 20px;font-size:14px;line-height:1.5;',
        'color:var(--color-text-muted,#657381);',
        'overflow-wrap:anywhere;',
        '}',
        '.vk-confirm-actions{display:flex;gap:10px;}',
        '.vk-confirm-btn{',
        'flex:1;min-height:44px;padding:0 16px;',
        'font-size:14px;font-weight:600;font-family:inherit;',
        'border-radius:8px;cursor:pointer;border:1px solid transparent;',
        'transition:background-color 150ms cubic-bezier(0,0,.2,1),transform 100ms cubic-bezier(0,0,.2,1);',
        '}',
        '.vk-confirm-btn:active{transform:scale(.98);}',
        '.vk-confirm-cancel{',
        'background:var(--color-bg-hover,#f9fafb);',
        'color:var(--color-text-body,#3f4750);',
        'border-color:var(--color-border,#e2e6e9);',
        '}',
        '.vk-confirm-ok{',
        'background:var(--color-primary,#3081d1);',
        'color:var(--color-primary-text,#fff);',
        '}',
        '.vk-confirm-ok:hover{background:var(--color-primary-hover,#1f61a3);}',
        '.vk-confirm-ok.is-danger{background:var(--color-danger,#dc2626);color:#fff;}',
        '.vk-confirm-ok.is-danger:hover{filter:brightness(.94);}',
        /* Pola lipat HANYA aktif di mobile — di desktop .m-filter-more
           memakai display:contents agar layout piksel-identik. */
        '@media (min-width:769px){',
        '.m-filter-more{display:contents;}',
        '.m-filter-head{display:none;}',
        '}',
        '@media (prefers-reduced-motion:reduce){',
        '.vk-confirm-backdrop,.vk-confirm-dialog,.vk-confirm-btn{transition:none !important;}',
        '}'
    ].join('');

    function injectBaseCss() {
        if (document.getElementById('vk-patterns-style')) return;
        var style = document.createElement('style');
        style.id = 'vk-patterns-style';
        style.textContent = BASE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }
    injectBaseCss();

    /* ==================================================================
       (a) Handler [data-toggle] — §3.3 filter collapsible.
       data-toggle berisi ID dipisah spasi, mis. data-toggle="filter-a filter-b".
       ================================================================== */
    document.addEventListener('click', function (e) {
        var head = e.target && e.target.closest ? e.target.closest('[data-toggle]') : null;
        if (!head) return;
        if (head.tagName === 'A' && head.getAttribute('href') === '#') e.preventDefault();
        var ids = (head.getAttribute('data-toggle') || '').trim().split(/\s+/);
        ids.forEach(function (id) {
            if (!id) return;
            var el = document.getElementById(id);
            if (el) el.classList.toggle('is-open');
        });
        var open = head.classList.toggle('is-open');
        head.setAttribute('aria-expanded', String(open));
    });

    /* ==================================================================
       (b) Handler .m-item — §3.1 accordion per-item & §3.5 judul halaman.
       Ketuk pada link/tombol/input di dalam TIDAK melipat. Hanya aktif
       di mobile (pola lipat: max-width 768px).
       ================================================================== */
    document.addEventListener('click', function (e) {
        if (!mobileMQ.matches) return;
        var target = e.target;
        if (!target || !target.closest) return;
        var item = target.closest('.m-item');
        if (!item) return;
        // Abaikan klik pada kontrol interaktif di dalam item.
        if (target.closest('a,button,input,select,textarea,[data-no-toggle],[data-toggle]')) return;
        var open = item.classList.toggle('is-open');
        item.setAttribute('aria-expanded', String(open));
    });

    /* ==================================================================
       (b2) Handler tr.m-row — §3.2 accordion tabel→kartu generik.
       Untuk baris TANPA toggle sendiri (baris streams/groups punya
       onclick sendiri: toggleStreamCard / bentangGrupPengguna — dilewati
       agar tidak double-toggle). Hanya aktif di mobile.
       ================================================================== */
    document.addEventListener('click', function (e) {
        if (!mobileMQ.matches) return;
        var target = e.target;
        if (!target || !target.closest) return;
        var row = target.closest('tr.m-row');
        if (!row) return;
        // Baris dengan onclick sendiri mengatur status lipatnya sendiri.
        if (row.hasAttribute('onclick')) return;
        // Abaikan klik pada kontrol interaktif di dalam baris.
        if (target.closest('a,button,input,select,textarea,label,[data-no-toggle],[data-toggle]')) return;
        var open = row.classList.toggle('is-expanded');
        row.setAttribute('aria-expanded', String(open));
    });

    /* ==================================================================
       (c) window.mConfirm — §3.4 pengganti confirm() bawaan.
       Mobile = bottom-sheet (CSS di vk-mobile.css); desktop = dialog tengah.
       Klik di luar popup HANYA menutup — event ditelan di capture phase
       agar tidak mengaktifkan elemen di belakangnya. Mengembalikan
       Promise<boolean>: true = dikonfirmasi, false = dibatalkan/ESC/klik luar.
       ================================================================== */
    var openCount = 0;
    var scrollLockCount = 0;

    function lockScroll() {
        if (scrollLockCount === 0) {
            document.documentElement.dataset.vkPrevOverflow = document.documentElement.style.overflow || '';
            document.documentElement.style.overflow = 'hidden';
        }
        scrollLockCount++;
    }
    function unlockScroll() {
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        if (scrollLockCount === 0) {
            document.documentElement.style.overflow = document.documentElement.dataset.vkPrevOverflow || '';
            delete document.documentElement.dataset.vkPrevOverflow;
        }
    }

    window.mConfirm = function (opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var title = opts.title || 'Konfirmasi';
            var message = opts.message || '';
            var confirmText = opts.confirmText || 'Ya';
            var cancelText = opts.cancelText || 'Batal';
            var danger = !!opts.danger;

            var backdrop = document.createElement('div');
            backdrop.className = 'vk-confirm-backdrop';

            var dialog = document.createElement('div');
            dialog.className = 'vk-confirm-dialog';
            dialog.setAttribute('role', 'alertdialog');
            dialog.setAttribute('aria-modal', 'true');

            var h = document.createElement('h3');
            h.className = 'vk-confirm-title';
            h.textContent = title;

            var p = document.createElement('p');
            p.className = 'vk-confirm-message';
            p.textContent = message;

            var actions = document.createElement('div');
            actions.className = 'vk-confirm-actions';

            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'vk-confirm-btn vk-confirm-cancel';
            cancelBtn.textContent = cancelText;

            var okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'vk-confirm-btn vk-confirm-ok' + (danger ? ' is-danger' : '');
            okBtn.textContent = confirmText;

            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            dialog.appendChild(h);
            dialog.appendChild(p);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);

            var prevFocus = document.activeElement;
            var settled = false;

            function close(result) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKey, true);
                backdrop.classList.remove('vk-show');
                openCount = Math.max(0, openCount - 1);
                unlockScroll();
                // Tunggu transisi keluar selesai sebelum menghapus dari DOM.
                setTimeout(function () {
                    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                    if (prevFocus && typeof prevFocus.focus === 'function') {
                        try { prevFocus.focus({ preventScroll: true }); } catch (err) { /* abaikan */ }
                    }
                    resolve(result);
                }, 180);
            }

            function onKey(e) {
                if (e.key === 'Escape' || e.key === 'Esc') {
                    e.preventDefault();
                    e.stopPropagation();
                    close(false);
                }
            }

            okBtn.addEventListener('click', function () { close(true); });
            cancelBtn.addEventListener('click', function () { close(false); });

            // (d) Klik di luar popup hanya menutup — tangkap di capture phase.
            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    close(false);
                }
            }, true);

            // ESC menutup dialog yang sedang terbuka.
            document.addEventListener('keydown', onKey, true);

            document.body.appendChild(backdrop);
            openCount++;
            lockScroll();

            // Animasikan masuk pada frame berikutnya.
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    backdrop.classList.add('vk-show');
                });
            });
            try { okBtn.focus({ preventScroll: true }); } catch (err) { /* abaikan */ }
        });
    };

    /**
     * window.mConfirmSubmit(form, opts) — konfirmasi sebelum submit form.
     * Mengembalikan Promise<boolean>; submit hanya bila dikonfirmasi.
     */
    window.mConfirmSubmit = function (form, opts) {
        return window.mConfirm(opts || {}).then(function (ok) {
            if (ok && form) {
                if (typeof form.requestSubmit === 'function') form.requestSubmit();
                else form.submit();
            }
            return ok;
        });
    };
})();

/* Penghitung filter aktif §3.3: <span class="m-filter-head-count"> di kepala
   filter menampilkan "N aktif". Terdelegasi: setiap .m-filter-more yang
   berubah (input/change) memperbarui count milik kepala filter-nya. */
(function () {
    'use strict';

    function vkCountActive(container) {
        var n = 0;
        var els = container.querySelectorAll('input, select, textarea');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) n++; }
            else if (String(el.value || '').trim() !== '') n++;
        }
        return n;
    }

    function vkRefreshFilterCount(container) {
        if (!container || !container.id) return;
        // Kepala filter adalah .m-filter-head sebelum .m-filter-more ini.
        var head = container.previousElementSibling;
        while (head && !head.classList.contains('m-filter-head')) {
            head = head.previousElementSibling;
        }
        var countEl = head ? head.querySelector('.m-filter-head-count') : null;
        if (!countEl) return;
        var n = vkCountActive(container);
        countEl.textContent = n > 0 ? n + ' aktif' : '';
        countEl.hidden = n === 0;
    }

    function vkInitFilterCounts() {
        var cons = document.querySelectorAll('.m-filter-more');
        for (var i = 0; i < cons.length; i++) vkRefreshFilterCount(cons[i]);
    }

    document.addEventListener('input', function (e) {
        var c = e.target && e.target.closest ? e.target.closest('.m-filter-more') : null;
        if (c) vkRefreshFilterCount(c);
    }, true);
    document.addEventListener('change', function (e) {
        var c = e.target && e.target.closest ? e.target.closest('.m-filter-more') : null;
        if (c) vkRefreshFilterCount(c);
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', vkInitFilterCounts);
    } else {
        vkInitFilterCounts();
    }
    window.vkRefreshFilterCount = vkRefreshFilterCount;
})();

/* Tombol "Clear" me-reset via JS tanpa event input/change — segarkan
   hitungan setelah handler clear berjalan. */
(function () {
    'use strict';
    document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('#stream-filter-clear') : null;
        if (!t) return;
        setTimeout(function () {
            var c = document.getElementById('stream-filter-more');
            if (c && window.vkRefreshFilterCount) window.vkRefreshFilterCount(c);
        }, 0);
    }, true);
})();

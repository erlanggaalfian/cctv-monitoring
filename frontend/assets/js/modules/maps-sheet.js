
/* ==============================================================
   TAHAP 7 — Peta: daftar kamera bisa ditarik naik-turun di HP.

   Hanya aktif di bawah 640px. Di desktop daftar tetap sidebar kiri
   dan skrip ini tidak memasang apa pun.

   Pointer Events dipakai (pola sama seperti scrub timeline), jadi
   satu handler melayani sentuh dan mouse.
   ============================================================== */
(function () {
  "use strict";

  var MQ = window.matchMedia("(max-width: 639px)");
  var SNAPS = [25, 45, 80];          // persen tinggi daftar
  var handle, body, installed = false;

  function pct(v) { return Math.min(Math.max(v, 15), 85); }

  function apply(p) {
    body.style.flex = "0 0 " + p + "%";
    body.style.height = p + "%";
    var canvas = document.querySelector(".layout-body-maps .maps-canvas");
    if (canvas) {
      canvas.style.flex = "1 1 " + (100 - p) + "%";
      canvas.style.height = (100 - p) + "%";
    }
    // Leaflet mendengarkan event resize bawaan window, jadi cukup
    // picu itu — tidak perlu menebak nama variabel instance peta.
    clearTimeout(apply._t);
    apply._t = setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
    }, 60);
  }

  function nearestSnap(p) {
    return SNAPS.reduce(function (a, b) {
      return Math.abs(b - p) < Math.abs(a - p) ? b : a;
    });
  }

  function install() {
    if (installed) return;
    body = document.querySelector(".layout-body-maps .maps-sidebar");
    if (!body) return;

    handle = document.createElement("div");
    handle.className = "maps-drag-handle";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", "Tarik untuk mengubah tinggi daftar kamera");
    handle.setAttribute("tabindex", "0");
    body.insertBefore(handle, body.firstChild);

    var dragging = false, wrap = body.parentElement;

    handle.addEventListener("pointerdown", function (e) {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("is-dragging");
      e.preventDefault();
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var rect = wrap.getBoundingClientRect();
      apply(pct(((rect.bottom - e.clientY) / rect.height) * 100));
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("is-dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      var rect = wrap.getBoundingClientRect();
      apply(nearestSnap(pct(((rect.bottom - e.clientY) / rect.height) * 100)));
    }
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", function () { dragging = false; });

    // Keyboard: panah atas/bawah pindah snap (aksesibilitas)
    var idx = 1;
    handle.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp")   { idx = Math.min(idx + 1, SNAPS.length - 1); apply(SNAPS[idx]); e.preventDefault(); }
      if (e.key === "ArrowDown") { idx = Math.max(idx - 1, 0);                apply(SNAPS[idx]); e.preventDefault(); }
    });

    installed = true;
  }

  function remove() {
    if (!installed) return;
    if (handle && handle.parentElement) handle.parentElement.removeChild(handle);
    if (body) { body.style.flex = ""; body.style.height = ""; }
    var canvas = document.querySelector(".layout-body-maps .maps-canvas");
    if (canvas) { canvas.style.flex = ""; canvas.style.height = ""; }
    installed = false;
  }

  function sync() { MQ.matches ? install() : remove(); }

  function boot() {
    // Peta dimuat lewat router, jadi tunggu elemennya muncul
    if (document.querySelector(".layout-body-maps")) sync();
    new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
    MQ.addEventListener ? MQ.addEventListener("change", sync) : MQ.addListener(sync);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();

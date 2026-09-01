
/* ==============================================================
   TAHAP 4 — label kolom untuk tampilan kartu di mobile.

   Baris tabel dibangun oleh admin.js secara dinamis. Daripada
   menyunting setiap pembuat baris (berisiko), label disalin dari
   <thead> ke tiap <td> sebagai data-label. CSS yang memakainya.

   Hanya menambah atribut; tidak mengubah isi sel, event, atau
   struktur baris mana pun.
   ============================================================== */
(function () {
  "use strict";

  var TABLES = [
    "admin-streams-table-body",
    "admin-users-table-body",
    "scan-results-table-body",
    "api-keys-table-body",
    "api-log-table-body"
  ];

  function headersOf(tbody) {
    var table = tbody.closest("table");
    if (!table) return [];
    var head = table.querySelector("thead tr");
    if (!head) return [];
    return Array.prototype.map.call(head.children, function (th) {
      return (th.textContent || "").trim();
    });
  }

  function label(tbody) {
    var heads = headersOf(tbody);
    if (!heads.length) return;
    Array.prototype.forEach.call(tbody.rows, function (row) {
      // Lewati baris pesan ("Memuat...", "Tidak ada data") — 1 sel colspan
      if (row.cells.length < 2) return;
      Array.prototype.forEach.call(row.cells, function (cell, i) {
        var text = heads[i];
        if (!text) return;                       // kolom checkbox: biarkan
        if (cell.hasAttribute("data-label")) return;
        cell.setAttribute("data-label", text);
      });
    });
  }

  function attach(id) {
    var tbody = document.getElementById(id);
    if (!tbody) return;
    label(tbody);
    new MutationObserver(function () { label(tbody); })
      .observe(tbody, { childList: true });
  }

  function init() { TABLES.forEach(attach); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

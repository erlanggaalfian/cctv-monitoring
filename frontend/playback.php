<?php
/**
 * Pemutar rekaman untuk klien kunci API.
 *
 * Satu URL, tanpa login:
 *   /frontend/playback.php?key=API_KEY&camera=1
 *
 * Kredensial hanya diteruskan ke backend; semua otorisasi ada di sana
 * (kunci harus punya izin playback, kamera harus milik kunci itu).
 */
?>
<!DOCTYPE html>
<html lang="id" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="robots" content="noindex, nofollow">
    <title>Rekaman CCTV</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root { color-scheme: dark; }
        * { -webkit-tap-highlight-color: transparent; }
        body {
            margin: 0; background: #05070d; color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            overscroll-behavior: none;
        }
        .kartu { background: #0b1220; border: 1px solid rgba(148,163,184,.16); }
        select, button { font-family: inherit; }
        select {
            background: #0b1220; color: #e2e8f0;
            border: 1px solid rgba(148,163,184,.22); border-radius: .5rem;
            padding: .5rem .75rem; font-size: .75rem; min-height: 44px;
        }
        .tombol {
            background: #0b1220; color: #cbd5e1;
            border: 1px solid rgba(148,163,184,.22); border-radius: .5rem;
            min-height: 44px; min-width: 44px;
            display: inline-flex; align-items: center; justify-content: center;
            gap: .35rem; padding: 0 .75rem; font-size: .7rem; cursor: pointer;
            transition: border-color .15s, color .15s;
        }
        .tombol:hover { border-color: #38bdf8; color: #38bdf8; }
        .tombol:disabled { opacity: .35; cursor: not-allowed; }
        .tombol--aktif { background: rgba(56,189,248,.12); border-color: rgba(56,189,248,.5); color: #38bdf8; }
        video { background: #000; width: 100%; height: 100%; display: block; }
        /* Timeline cukup tinggi untuk digeser jari */
        #garis-waktu { height: 3.5rem; touch-action: none; }
        @media (min-width: 768px) { #garis-waktu { height: 3rem; } }
    </style>
</head>
<body class="min-h-screen">

<div class="mx-auto w-full max-w-5xl p-3 sm:p-4 space-y-3">

    <!-- Kepala -->
    <div class="kartu rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div class="min-w-0">
            <div id="judul" class="text-xs font-bold text-white truncate">Rekaman CCTV</div>
            <div id="subjudul" class="text-[10px] text-slate-500 truncate">Memuat...</div>
        </div>
        <div id="lencana-tanggal" class="text-[10px] text-sky-400 shrink-0"></div>
    </div>

    <!-- Pemilih kamera (muncul bila kunci punya >1 kamera) -->
    <div id="pilih-kamera-wrap" class="kartu rounded-xl p-2.5 hidden">
        <div class="pb-section-label">Kamera</div>
        <div id="pilih-kamera" class="flex flex-wrap gap-1.5"></div>
    </div>

    <!-- Pemutar -->
    <div class="kartu rounded-xl overflow-hidden">
        <div class="relative bg-black aspect-video">
            <video id="video" controls playsinline preload="auto"></video>
            <div id="memuat" class="absolute inset-0 hidden items-center justify-center bg-black/70 text-[11px] text-slate-300">
                Memuat video...
            </div>
            <div id="kosong" class="absolute inset-0 hidden flex-col items-center justify-center bg-black/80 text-center px-6 gap-2">
                <div class="text-sm font-bold text-slate-300">Tidak ada rekaman</div>
                <div id="kosong-pesan" class="text-[11px] text-slate-500"></div>
            </div>
        </div>

        <!-- Kendali -->
        <div class="p-2.5 sm:p-3 space-y-2.5 border-t border-slate-800/60">
            <div class="flex items-center gap-2 flex-wrap">
                <select id="pilih-tanggal" class="flex-1 min-w-[10rem] max-w-xs"></select>
                <button type="button" class="tombol" onclick="mundur(-30)" title="Mundur 30 detik">&#8592; 30d</button>
                <button type="button" class="tombol" onclick="putarJeda()" id="tombol-putar">Putar</button>
                <button type="button" class="tombol" onclick="mundur(30)" title="Maju 30 detik">30d &#8594;</button>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-500">
                <span id="jam">--:--:--</span>
                <span id="info-segmen"></span>
            </div>

            <!-- Timeline: ketuk atau geser -->
            <div id="garis-waktu" class="relative rounded-lg bg-slate-900/70 border border-slate-800 overflow-hidden cursor-pointer">
                <div id="rentang" class="absolute inset-0"></div>
                <div id="penanda" class="absolute top-0 bottom-0 w-0.5 bg-rose-500 hidden pointer-events-none"></div>
            </div>
            <div class="flex justify-between pb-meta-text">
                <span>00:00</span><span>12:00</span><span>23:59</span>
            </div>
        </div>
    </div>

    <div class="text-center pb-meta-text pb-2">
        Rekaman disimpan terbatas sesuai kebijakan retensi.
    </div>
</div>

<script>
(function () {
    "use strict";

    var p = new URLSearchParams(location.search);
    var KEY = p.get("key");
    var PASS = p.get("pass") || "";
    var kameraAktif = parseInt(p.get("camera") || "1", 10) || 1;

    var API = "/api/external/playback";
    var CHUNK = 3600;               // detik per potongan video
    var rentangList = [];
    var mulaiPotongan = 0;
    var tanggalAktif = "";
    var idKameraInternal = null;    // dipakai untuk URL video

    var $ = function (id) { return document.getElementById(id); };

    function kredensial() {
        var q = "key=" + encodeURIComponent(KEY);
        if (PASS) q += "&pass=" + encodeURIComponent(PASS);
        return q;
    }

    function galat(judul, pesan) {
        $("judul").textContent = judul;
        $("subjudul").textContent = pesan;
        $("kosong").style.display = "flex";
        $("kosong-pesan").textContent = pesan;
    }

    function duaAngka(n) { return (n < 10 ? "0" : "") + n; }

    function jamDari(epoch) {
        var d = new Date(epoch * 1000);
        return duaAngka(d.getHours()) + ":" + duaAngka(d.getMinutes()) + ":" + duaAngka(d.getSeconds());
    }

    if (!KEY) {
        galat("Akses ditolak", "Parameter key wajib disertakan.");
        return;
    }

    // ---------- muat daftar tanggal + kamera ----------
    function muatTanggal() {
        var url = API + "?" + kredensial() + "&camera=" + kameraAktif;
        return fetch(url).then(function (r) {
            return r.json().then(function (d) {
                if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
                return d;
            });
        }).then(function (d) {
            $("judul").textContent = d.camera_name || "Rekaman CCTV";
            $("subjudul").textContent = "Kamera " + d.camera + " dari " + d.total_cameras;

            gambarPilihKamera(d.cameras || []);

            var sel = $("pilih-tanggal");
            sel.innerHTML = "";
            var tgl = d.dates || [];
            if (!tgl.length) {
                $("kosong").style.display = "flex";
                $("kosong-pesan").textContent = "Belum ada rekaman untuk kamera ini.";
                $("lencana-tanggal").textContent = "";
                gambarRentang([]);
                return;
            }
            $("kosong").style.display = "none";
            tgl.forEach(function (t) {
                var o = document.createElement("option");
                o.value = t.date;
                o.textContent = t.date + " (" + t.segment_count + " segmen)";
                sel.appendChild(o);
            });
            return muatSegmen(tgl[0].date);
        }).catch(function (e) {
            galat("Tidak dapat memuat", e.message);
        });
    }

    function gambarPilihKamera(daftar) {
        var wrap = $("pilih-kamera-wrap");
        var box = $("pilih-kamera");
        if (!daftar || daftar.length < 2) { wrap.classList.add("hidden"); return; }
        wrap.classList.remove("hidden");
        box.innerHTML = "";
        daftar.forEach(function (c) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "tombol" + (c.camera === kameraAktif ? " tombol--aktif" : "");
            b.textContent = c.camera + ". " + c.name;
            b.onclick = function () {
                if (c.camera === kameraAktif) return;
                kameraAktif = c.camera;
                var v = $("video");
                v.pause(); v.removeAttribute("src"); v.load();
                rentangList = []; gambarRentang([]);
                muatTanggal();
            };
            box.appendChild(b);
        });
    }

    // ---------- muat segmen satu tanggal ----------
    function muatSegmen(tanggal) {
        tanggalAktif = tanggal;
        $("lencana-tanggal").textContent = tanggal;
        var url = API + "?" + kredensial() + "&camera=" + kameraAktif + "&date=" + encodeURIComponent(tanggal);
        return fetch(url).then(function (r) {
            return r.json().then(function (d) {
                if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
                return d;
            });
        }).then(function (d) {
            rentangList = d.ranges || [];
            $("info-segmen").textContent = (d.segment_count || 0) + " segmen";

            // id internal diambil dari URL segmen (klien tak perlu tahu, tapi
            // tag <video> butuh alamat pasti)
            var seg = (d.segments || [])[0];
            if (seg && seg.url) {
                var m = seg.url.match(/\/api\/recordings\/(\d+)\//);
                if (m) idKameraInternal = m[1];
            }

            gambarRentang(rentangList);

            if (rentangList.length) {
                $("kosong").style.display = "none";
                lompatKe(rentangList[0].start_epoch);
            } else if (seg) {
                // tak ada data timeline: putar berkas pertama apa adanya
                $("kosong").style.display = "none";
                $("video").src = seg.url;
                $("video").load();
            } else {
                $("kosong").style.display = "flex";
                $("kosong-pesan").textContent = "Tidak ada segmen pada tanggal ini.";
            }
        }).catch(function (e) {
            galat("Tidak dapat memuat", e.message);
        });
    }

    // ---------- timeline ----------
    function awalHari() {
        var d = new Date(tanggalAktif + "T00:00:00");
        return d.getTime() / 1000;
    }

    function gambarRentang(list) {
        var box = $("rentang");
        box.innerHTML = "";
        var t0 = awalHari();
        list.forEach(function (r) {
            var kiri = ((r.start_epoch - t0) / 86400) * 100;
            var lebar = (r.duration / 86400) * 100;
            if (lebar < 0.15) lebar = 0.15;
            var el = document.createElement("div");
            el.style.cssText = "position:absolute;top:0;bottom:0;left:" + kiri + "%;width:" + lebar +
                               "%;background:rgba(56,189,248,.45);border-left:1px solid rgba(56,189,248,.8)";
            box.appendChild(el);
        });
    }

    function rentangTerdekat(epoch) {
        if (!rentangList.length) return epoch;
        for (var i = 0; i < rentangList.length; i++) {
            var r = rentangList[i];
            if (epoch >= r.start_epoch && epoch <= r.start_epoch + r.duration) return epoch;
        }
        var pilih = rentangList[0], jarak = Math.abs(epoch - rentangList[0].start_epoch);
        rentangList.forEach(function (r) {
            var j = Math.abs(epoch - r.start_epoch);
            if (j < jarak) { jarak = j; pilih = r; }
        });
        return pilih.start_epoch;
    }

    function lompatKe(epoch) {
        if (!idKameraInternal) return;
        var target = rentangTerdekat(epoch);
        mulaiPotongan = target;
        var v = $("video");
        $("memuat").style.display = "flex";
        v.src = "/api/recordings/" + idKameraInternal + "/stream?start=" +
                encodeURIComponent(new Date(target * 1000).toISOString()) +
                "&duration=" + CHUNK + "&" + kredensial();
        v.load();
        v.onloadeddata = function () {
            $("memuat").style.display = "none";
            v.play().catch(function () {});
        };
        v.onerror = function () {
            $("memuat").style.display = "none";
            $("kosong").style.display = "flex";
            $("kosong-pesan").textContent = "Video tidak dapat diputar di peramban ini.";
        };
    }

    // ---------- kendali ----------
    window.putarJeda = function () {
        var v = $("video");
        if (v.paused) { v.play().catch(function () {}); } else { v.pause(); }
    };

    window.mundur = function (detik) {
        var v = $("video");
        var sekarang = mulaiPotongan + (v.currentTime || 0);
        var target = sekarang + detik;
        if (target >= mulaiPotongan && v.duration && target - mulaiPotongan < v.duration) {
            v.currentTime = target - mulaiPotongan;
        } else {
            lompatKe(target);
        }
    };

    $("pilih-tanggal").addEventListener("change", function () {
        muatSegmen(this.value);
    });

    $("video").addEventListener("timeupdate", function () {
        var v = $("video");
        var epoch = mulaiPotongan + (v.currentTime || 0);
        $("jam").textContent = jamDari(epoch);
        $("tombol-putar").textContent = v.paused ? "Putar" : "Jeda";
        var t0 = awalHari();
        var rasio = (epoch - t0) / 86400;
        if (rasio >= 0 && rasio <= 1) {
            var ph = $("penanda");
            ph.style.display = "block";
            ph.style.left = (rasio * 100) + "%";
        }
    });

    // ketuk / geser timeline (Pointer Events menyatukan mouse + sentuh)
    (function () {
        var tl = $("garis-waktu"), geser = false;
        function rasioDi(x) {
            var b = tl.getBoundingClientRect();
            var r = (x - b.left) / b.width;
            return Math.max(0, Math.min(1, r));
        }
        tl.addEventListener("pointerdown", function (e) {
            geser = true; tl.setPointerCapture(e.pointerId);
            lompatKe(awalHari() + rasioDi(e.clientX) * 86400);
        });
        tl.addEventListener("pointermove", function (e) {
            if (!geser) return;
            var ph = $("penanda");
            ph.style.display = "block";
            ph.style.left = (rasioDi(e.clientX) * 100) + "%";
        });
        tl.addEventListener("pointerup", function (e) {
            if (!geser) return;
            geser = false;
            lompatKe(awalHari() + rasioDi(e.clientX) * 86400);
        });
    })();

    muatTanggal();
})();
</script>
</body>
</html>

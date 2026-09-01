<?php
// Secure Access Token checking
// Direct execution is fine as this page serves public embeds
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mamura Stream - Embedded CCTV Feed</title>
    <!-- Google Fonts (Plus Jakarta Sans & JetBrains Mono) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    <!-- Tailwind CDN for layout utilities -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="/assets/js/tailwind.js?v=<?= @filemtime(__DIR__ . '/../assets/js/tailwind.js') ?: time() ?>"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
                    },
                    colors: {
                        brand: {
                            blue:     '#3081d1',
                            orange:   '#F26935',
                            navy:     '#2F578E',
                            'blue-h': '#1e68be',
                            'navy-h': '#1e3d6b',
                        },
                        cyber: {
                            bg:        '#080c12',
                            container: '#0f1520',
                            hover:     '#141c2b',
                            highest:   '#1a2438',
                            text:      '#dde5f4',
                            dim:       '#7a8faa',
                            outline:   'rgba(48,129,209,0.14)',
                            primary:   '#3081d1',
                            secondary: '#F26935',
                            accent:    '#F26935',
                            error:     '#ef4444',
                        },
                        sky: {
                            50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                            300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                            600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                            900: '#193a5f', 950: '#11253d',
                        },
                        emerald: {
                            50:  '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
                            300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
                            600: '#059669', 700: '#047857', 800: '#065f46',
                            900: '#064e3b', 950: '#022c22',
                        },
                        green: {
                            50:  '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
                            300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
                            600: '#059669', 700: '#047857', 800: '#065f46',
                            900: '#064e3b', 950: '#022c22',
                        },
                        rose: {
                            50:  '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                            300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
                            600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
                            900: '#7f1d1d', 950: '#450a0a',
                        },
                        red: {
                            50:  '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                            300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
                            600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
                            900: '#7f1d1d', 950: '#450a0a',
                        },
                        amber: {
                            50:  '#fef5f0', 100: '#fde8dd', 200: '#fbcfba',
                            300: '#f8ad8c', 400: '#f58a5e', 500: '#F26935',
                            600: '#d9521f', 700: '#b43f18', 800: '#8f3416',
                            900: '#742d15', 950: '#3f1408',
                        },
                        indigo: {
                            50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                            300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                            600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                            900: '#193a5f', 950: '#11253d',
                        },
                        blue: {
                            50:  '#eef6fd', 100: '#d8ebfa', 200: '#b3d7f4',
                            300: '#7fbaea', 400: '#4f9cdd', 500: '#3081d1',
                            600: '#2569b0', 700: '#1e548e', 800: '#1b4573',
                            900: '#193a5f', 950: '#11253d',
                        },
                        slate: {
                            50:  '#f0f5ff',
                            100: '#e6edf8',
                            200: '#ccd8ee',
                            300: '#a8bcdb',
                            400: '#7a8faa',
                            500: '#4a5f80',
                            600: '#3a4f6e',
                            700: '#2a3b58',
                            800: '#1a2438',
                            900: '#0f1520',
                            950: '#080c12',
                        }
                    },
                    borderRadius: { 'sm':'8px','md':'12px','lg':'16px','xl':'20px','2xl':'24px' }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="/assets/css/global.css?v=<?= @filemtime(__DIR__ . '/assets/css/global.css') ?: time() ?>">
</head>
<body class="embed-body relative flex items-center justify-center">

    <!-- 1. LOADING SCREEN -->
    <div id="loading-screen" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-50 transition-opacity duration-300">
        <div class="spinner mb-4"></div>
        <p class="text-sky-400 text-xs tracking-wider uppercase font-semibold font-mono animate-pulse">Menghubungkan ke server stream...</p>
    </div>

    <!-- 2. ERROR SCREEN (Hidden by default) -->
    <div id="error-screen" class="absolute inset-0 flex flex-col items-center justify-center z-50 p-6 text-center hidden">
        <div class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
        </div>
        <h3 id="error-title" class="text-white text-base font-bold mb-1">Akses Ditolak</h3>
        <p id="error-message" class="text-slate-400 text-xs max-w-md">Kunci API tidak valid atau tidak memiliki akses ke kamera ini.</p>
    </div>

    <!-- 3. MAIN PLAYER CONTAINER -->
    <div id="player-container" class="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
        <!-- The HTML5 Video Element -->
        <video id="video-element" class="w-full h-full object-contain" playsinline muted></video>
        
        <!-- Play Button Overlay -->
        <div id="play-overlay" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 cursor-pointer z-30 group hidden transition-all duration-300">
            <button type="button" class="w-16 h-16 rounded-full bg-sky-500/90 hover:bg-sky-600 flex items-center justify-center shadow-lg group-hover:scale-110 active:scale-95 transition-all duration-150 border border-white/20 mb-3">
                <svg class="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"></path>
                </svg>
            </button>
            <p id="play-overlay-text" class="text-white text-[10px] uppercase font-bold tracking-wider font-mono px-4 py-1.5 rounded-full bg-slate-955/80 border border-slate-800/60 backdrop-blur-md hidden"></p>
        </div>
        
        <!-- Camera Info Label Overlay -->
        <div id="camera-info-overlay" class="absolute top-4 left-4 z-20 bg-slate-955/70 border border-slate-800/60 backdrop-blur-md px-3 py-1.5 rounded-md text-white text-xs font-semibold tracking-wide flex items-center gap-2 hidden">
            <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span id="camera-name">CCTV Camera</span>
        </div>

        <!-- Stop Button Overlay -->
        <button id="stop-button" onclick="stopWhep(false)" class="absolute top-4 right-4 z-20 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-700/50 backdrop-blur-md px-3 py-1.5 rounded-md text-white text-xs font-semibold tracking-wide flex items-center gap-1.5 hidden transition-all duration-150 active:scale-95">
            <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16"></rect>
            </svg>
            <span>Stop Feed</span>
        </button>

        <!-- Keep Alive Toast Overlay -->
        <div id="keep-alive-toast" class="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 bg-slate-950/90 border border-slate-800/80 backdrop-blur-md px-4 py-3 rounded-lg text-white text-xs font-mono tracking-wide flex flex-col items-center gap-2 hidden shadow-2xl transition-all duration-300">
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                <span>Pemutaran akan dihentikan dalam <span id="keep-alive-countdown" class="font-bold text-amber-400">15</span> detik.</span>
            </div>
            <button id="keep-alive-btn" onclick="extendPlaytime()" class="mt-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 active:scale-95 text-slate-950 font-bold uppercase rounded text-[10px] tracking-wider transition-all duration-150">
                Lanjutkan Menonton
            </button>
        </div>

        <!-- Ad Banner Overlay -->
        <div id="ad-banner-overlay" class="ad-banner-overlay hidden">
            <!-- Ad Image -->
            <img id="ad-image" src="" alt="Sponsor" class="w-auto rounded object-contain shrink-0 mr-2 hidden" style="height: 20px !important;">
            <!-- Marquee Ticker -->
            <div id="ad-marquee-wrap" class="flex-grow overflow-hidden relative flex items-center font-mono">
                <div class="marquee-container w-full">
                    <div id="ad-marquee-content" class="marquee-content flex whitespace-nowrap">
                        <span id="ad-marquee-text" class="marquee-item"></span>
                    </div>
                </div>
            </div>
        </div>

    </div>

    <script>
        let pc = null;
        let playTimeout = null;
        let keepAliveTimeout = null;
        let keepAliveInterval = null;
        let activePlayUrl = null;
        let embedTimeoutSeconds = 300; // default 5 menit (diperbarui dinamis dari API)
        let clickToPlay = true; // default true (diperbarui dinamis dari API)

        function resetTimers() {
            if (playTimeout) {
                clearTimeout(playTimeout);
                playTimeout = null;
            }
            if (keepAliveTimeout) {
                clearTimeout(keepAliveTimeout);
                keepAliveTimeout = null;
            }
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            const toast = document.getElementById('keep-alive-toast');
            if (toast) {
                toast.classList.add('hidden');
            }
        }

        function showKeepAliveToast() {
            const toast = document.getElementById('keep-alive-toast');
            const countdownEl = document.getElementById('keep-alive-countdown');
            if (!toast) return;

            toast.classList.remove('hidden');
            
            let timeLeft = Math.min(15, embedTimeoutSeconds);
            if (countdownEl) countdownEl.textContent = timeLeft;

            if (keepAliveInterval) clearInterval(keepAliveInterval);
            keepAliveInterval = setInterval(() => {
                timeLeft--;
                if (countdownEl) countdownEl.textContent = timeLeft;
                if (timeLeft <= 0) {
                    clearInterval(keepAliveInterval);
                    keepAliveInterval = null;
                }
            }, 1000);
        }

        window.extendPlaytime = function() {
            // Reset timer dari nol
            resetTimers();
            
            // Jadwalkan ulang batas pemutaran
            if (embedTimeoutSeconds > 0) {
                const keepAliveStartDelay = Math.max(0, (embedTimeoutSeconds - 15) * 1000);
                keepAliveTimeout = setTimeout(() => {
                    showKeepAliveToast();
                }, keepAliveStartDelay);

                playTimeout = setTimeout(() => {
                    stopWhep(true);
                }, embedTimeoutSeconds * 1000);
            }
        };

        function stopWhep(isTimeout = false) {
            resetTimers();
            if (pc) {
                try { pc.close(); } catch(e) {}
                pc = null;
            }
            const video = document.getElementById('video-element');
            if (video) {
                video.srcObject = null;
            }
            const playOverlay = document.getElementById('play-overlay');
            const playText = document.getElementById('play-overlay-text');
            const stopBtn = document.getElementById('stop-button');
            if (playOverlay) {
                playOverlay.classList.remove('hidden');
            }
            if (stopBtn) {
                stopBtn.classList.add('hidden');
            }
            if (playText) {
                if (isTimeout) {
                    playText.textContent = "Waktu pemutaran habis. Klik untuk memutar kembali.";
                    playText.classList.remove('hidden');
                } else {
                    playText.classList.add('hidden');
                }
            }
        }

        function showError(title, msg) {
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('player-container').classList.add('hidden');
            document.getElementById('error-title').textContent = title;
            document.getElementById('error-message').textContent = msg;
            document.getElementById('error-screen').classList.remove('hidden');
        }

        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const key = urlParams.get('key');
            const pass = urlParams.get('pass');

            if (!key) {
                showError("Akses Ditolak", "Parameter API Key (key) wajib disertakan untuk mengakses stream.");
                return;
            }

            // Fetch stream info dari backend
            let apiUrl = `/api/external/stream?key=${encodeURIComponent(key)}`;
            if (pass) apiUrl += `&pass=${encodeURIComponent(pass)}`;

            fetch(apiUrl)
                .then(res => {
                    if (!res.ok) {
                        return res.json().then(data => {
                            throw new Error(data.detail || `HTTP ${res.status}`);
                        });
                    }
                    return res.json();
                })
                .then(data => {
                    // Sembunyikan loading screen
                    document.getElementById('loading-screen').classList.add('hidden');

                    // Tampilkan info kamera
                    if (data.stream?.name) {
                        document.getElementById('camera-name').textContent = `${data.stream.name} - Live`;
                        document.getElementById('camera-info-overlay').classList.remove('hidden');
                    }

                    // Tampilkan iklan jika aktif
                    if (data.ad) {
                        applyAd(data.ad);
                    }

                    // Terapkan batas waktu & click to play dari kamera (API Key config)
                    if (data.stream) {
                        if (data.stream.embed_timeout_seconds !== undefined) {
                            embedTimeoutSeconds = parseInt(data.stream.embed_timeout_seconds, 10);
                        }
                        if (data.stream.click_to_play !== undefined) {
                            clickToPlay = data.stream.click_to_play;
                        }
                    }

                    const video = document.getElementById('video-element');
                    const playOverlay = document.getElementById('play-overlay');

                    // Atur poster gambar CCTV statis
                    if (data.stream?.id) {
                        video.poster = `/api/posters/stream_${data.stream.id}.jpg`;
                    }

                    if (data.stream?.webrtc_url) {
                        const playUrl = data.stream.webrtc_url_sub || data.stream.webrtc_url;
                        
                        if (clickToPlay) {
                            // Wajib klik untuk memutar
                            if (playOverlay) {
                                playOverlay.classList.remove('hidden');
                                
                                // Reset event listener dengan cloning untuk menghindari duplikasi
                                const newOverlay = playOverlay.cloneNode(true);
                                playOverlay.parentNode.replaceChild(newOverlay, playOverlay);
                                
                                newOverlay.addEventListener('click', () => {
                                    newOverlay.classList.add('hidden');
                                    
                                    // Tampilkan tombol stop
                                    const stopBtn = document.getElementById('stop-button');
                                    if (stopBtn) {
                                        stopBtn.classList.remove('hidden');
                                    }
                                    
                                    startWhep(playUrl);
                                });
                            } else {
                                startWhep(playUrl);
                            }
                        } else {
                            // Putar otomatis (Click to play dinonaktifkan)
                            if (playOverlay) {
                                playOverlay.classList.add('hidden');
                            }
                            const stopBtn = document.getElementById('stop-button');
                            if (stopBtn) {
                                stopBtn.classList.remove('hidden');
                            }
                            startWhep(playUrl);
                        }
                    } else {
                        throw new Error("Respons API tidak memuat URL WebRTC.");
                    }
                })
                .catch(err => {
                    showError("Gagal Memutar CCTV", err.message);
                });
        });

        function hexToRgba(hex, alpha) {
            if (!hex) return '';
            hex = hex.replace('#', '');
            if (hex.length === 3) {
                hex = hex.split('').map(char => char + char).join('');
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function applyAd(ad) {
            const adOverlay = document.getElementById('ad-banner-overlay');
            const adImg = document.getElementById('ad-image');
            const marqueeContent = document.getElementById('ad-marquee-content');

            if (!ad || !ad.is_active) {
                adOverlay.classList.add('hidden');
                return;
            }

            adOverlay.classList.remove('hidden');

            // Terapkan style iklan kustom
            const bgOpacity = ad.bg_opacity !== undefined ? ad.bg_opacity : 1.0;
            if (ad.bg_color) adOverlay.style.backgroundColor = hexToRgba(ad.bg_color, bgOpacity);
            if (ad.text_color) adOverlay.style.color = ad.text_color;

            // Terapkan box width dan text align
            const boxWidth = ad.box_width !== undefined ? ad.box_width : 100;
            const textAlign = ad.text_align || "left";

            // Reset inline styles
            adOverlay.style.left = "";
            adOverlay.style.right = "";
            adOverlay.style.width = "";
            adOverlay.style.transform = "";

            if (boxWidth >= 100) {
                adOverlay.style.left = "10px";
                adOverlay.style.right = "10px";
                adOverlay.style.width = "calc(100% - 20px)";
            } else {
                adOverlay.style.width = `${boxWidth}%`;
                if (textAlign === "left") {
                    adOverlay.style.left = "10px";
                } else if (textAlign === "right") {
                    adOverlay.style.right = "10px";
                } else { // center
                    adOverlay.style.left = "50%";
                    adOverlay.style.transform = "translateX(-50%)";
                }
            }

            if (textAlign === "center") {
                adOverlay.style.justifyContent = "center";
            } else if (textAlign === "right") {
                adOverlay.style.justifyContent = "flex-end";
            } else {
                adOverlay.style.justifyContent = "flex-start";
            }

            // Gambar Iklan
            if (ad.image_url) {
                adImg.src = ad.image_url;
                const imgOpacity = ad.image_opacity !== undefined ? ad.image_opacity : 1.0;
                adImg.style.opacity = imgOpacity;
                const imgHeight = ad.image_height !== undefined ? ad.image_height : 20;
                adImg.style.setProperty('height', `${imgHeight}px`, 'important');
                adImg.classList.remove('hidden');
                adImg.onerror = () => adImg.classList.add('hidden');
            } else {
                adImg.classList.add('hidden');
            }

            // Teks Berjalan (Marquee)
            if (ad.marquee_text) {
                const speed = ad.scroll_speed || 5;
                const duration = Math.max(10, (11 - speed) * 18);
                marqueeContent.style.animationDuration = `${duration}s`;
                
                // Isi marquee-content dengan beberapa span teks agar tersambung tanpa jeda kosong
                marqueeContent.innerHTML = '';
                const textOpacity = ad.text_opacity !== undefined ? ad.text_opacity : 1.0;
                for (let i = 0; i < 4; i++) {
                    const span = document.createElement('span');
                    span.className = 'marquee-item';
                    span.textContent = ad.marquee_text;
                    if (ad.font_size) span.style.fontSize = `${ad.font_size}px`;
                    if (ad.font_family) span.style.fontFamily = ad.font_family;
                    if (ad.text_color) span.style.color = ad.text_color;
                    span.style.opacity = textOpacity;
                    marqueeContent.appendChild(span);
                }
            }
        }

        async function startWhep(whepUrl) {
            activePlayUrl = whepUrl;
            const video = document.getElementById('video-element');
            
            // Reset timer lama jika ada
            resetTimers();
            
            // Jadwalkan auto-stop & keep-alive jika timeout diaktifkan (> 0)
            if (embedTimeoutSeconds > 0) {
                const keepAliveStartDelay = Math.max(0, (embedTimeoutSeconds - 15) * 1000);
                
                // Setel timer Keep-Alive
                keepAliveTimeout = setTimeout(() => {
                    showKeepAliveToast();
                }, keepAliveStartDelay);

                // Setel timer auto-stop
                playTimeout = setTimeout(() => stopWhep(true), embedTimeoutSeconds * 1000);
            }
            
            pc = new RTCPeerConnection({
                iceServers: []
            });

            pc.ontrack = (e) => {
                if (e.streams?.[0]) {
                    video.srcObject = e.streams[0];
                    video.play().catch(err => console.warn("Auto-play failed, waiting for user interaction:", err));
                }
            };

            pc.oniceconnectionstatechange = () => {
                const s = pc.iceConnectionState;
                if (s === 'failed') {
                    showError("Koneksi Gagal", "Koneksi WebRTC ke media server terputus.");
                }
            };

            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const resp = await fetch(whepUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/sdp' },
                    body: pc.localDescription.sdp
                });

                if (!resp.ok) throw new Error(`Media server HTTP ${resp.status}`);

                const sdp = await resp.text();
                await pc.setRemoteDescription({ type: 'answer', sdp });
            } catch (err) {
                showError("Gagal Handshake WHEP", "Media server tidak merespons koneksi stream.");
            }
        }

        window.addEventListener('beforeunload', () => {
            if (pc) {
                try { pc.close(); } catch(e) {}
            }
        });
    </script>
</body>
</html>

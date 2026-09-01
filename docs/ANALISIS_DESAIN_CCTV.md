# Analisis Desain — Mamura Stream CCTV Monitoring Portal v2.0

## Ringkasan Eksekutif

**Mamura Stream** adalah portal monitoring CCTV berbasis web dengan arsitektur **Python FastAPI backend + PHP frontend + MediaMTX media server**. Sistem ini dirancang untuk mengelola multiple stream RTSP dari kamera CCTV, menampilkannya dalam grid real-time via WebRTC/WHEP, dan menyediakan fitur administrasi lengkap (CRUD kamera, user permission, network scan, peta lokasi).

---

## 1. Arsitektur Sistem

### 1.1 Stack Teknologi

| Layer | Teknologi | Keterangan |
|-------|-----------|------------|
| **OS** | Debian 12 (Bookworm) | Target deployment |
| **Database** | MySQL/MariaDB (fallback SQLite) | Penyimpanan user, stream, access control |
| **Backend** | Python FastAPI v2.0.0 | REST API, JWT Auth, Background Workers |
| **Frontend** | PHP 8.2 + Tailwind CSS | Server-side rendered, modular template |
| **Media Server** | MediaMTX | RTSP ingest → WebRTC/WHEP output |
| **Reverse Proxy** | Apache | ProxyPass /api → :8000, /media/ → :8889 |
| **Font** | Plus Jakarta Sans + JetBrains Mono | UI dan label teknis |

### 1.2 Aliran Data (Data Flow)

```
[CCTV Camera (RTSP)]
        │
        ▼
[MediaMTX — preloaded 24/7]
   stream_{id}      (main stream)
   stream_{id}_sub  (sub-stream / transcoded)
        │
        ├── RTSP relay localhost:8554 ──► ffmpeg poster capture
        │
        ▼ (WHEP / WebRTC)
[Apache /media/] ───► [Browser WebRTC Client (app.js)]
        ▲
        │
[FastAPI /api] ←── JWT Auth ────► [MySQL/MariaDB]
```

### 1.3 Background Workers

| Worker | Fungsi | Interval |
|--------|--------|----------|
| `background_status_monitor` | Cek status kamera via MediaMTX API | 45 detik |
| `background_frame_capturer` | Capture poster JPG dari MediaMTX relay | 5 menit |

---

## 2. Database Design

### 2.1 Skema Relasional

```
┌─────────────┐     ┌─────────────────┐     ┌───────────────┐
│   users     │◄────┤ user_cctv_access├────►│ cctv_streams  │
├─────────────┤  M:N├─────────────────┤     ├───────────────┤
│ id (PK)     │     │ user_id (FK)    │     │ id (PK)       │
│ username    │     │ stream_id (FK)  │     │ name          │
│ password_hash│    └─────────────────┘     │ rtsp_url      │
│ role        │                             │ group_name    │
└─────────────┘                             │ coordinates   │
                                            │ is_active     │
                                            └───────────────┘
```

### 2.2 Tabel & Analisis

#### `users`
- **Struktur**: id, username (unique), password_hash, role (admin/user/guest), created_at
- **Kelebihan**: Role-based access control sederhana dengan enum
- **Catatan**: Password hash menggunakan bcrypt (terlihat di import)

#### `cctv_streams`
- **Struktur**: id, name, rtsp_url, group_name, coordinates, is_active, created_at
- **Kelebihan**: Mendukung grouping dan koordinat GPS untuk peta
- **Risiko**: `rtsp_url` menyimpan kredensial plain text (user:password@host)

#### `user_cctv_access` (Pivot)
- **Struktur**: user_id, stream_id, assigned_at
- **Kelebihan**: Many-to-many relationship memungkinkan granular access control

#### `ad_config`
- **Struktur**: Konfigurasi iklan/marquee untuk guest view
- **Kelebihan**: Customizable appearance untuk public display

#### `api_keys`
- **Struktur**: key_value, camera_id, client_name, allowed_domain, secret_pass
- **Kelebihan**: Mendukung embed eksternal dengan domain restriction

#### `api_access_logs`
- **Struktur**: Logging akses API key untuk audit trail
- **Kelebihan**: Tracking IP, referer, user-agent, status hit/denied

### 2.3 Database Migrations (Inline)

Backend menggunakan **runtime schema migration** yang berjalan saat startup:
- Auto-detect kolom yang belum ada (`group_name`, `coordinates`, dll.)
- Auto-create tabel baru (`api_access_logs`)
- SQLite-safe migration path

**Kelebihan**: Tidak perlu tool migration eksternal (Alembic, Flyway).
**Risiko**: Potensi race condition saat multiple instance startup bersamaan.

---

## 3. Backend Design (FastAPI)

### 3.1 Struktur Kode

```
backend/
├── main.py              # Monolithic — seluruh API, auth, workers, poster logic
├── requirements.txt     # Dependensi Python
└── static/posters/      # Poster JPG per kamera
```

### 3.2 Modul & Fungsi Utama

| Area | Implementasi | Status |
|------|-------------|--------|
| **Auth** | JWT Bearer (jose + bcrypt) | ✅ Baik |
| **DB ORM** | SQLAlchemy declarative | ✅ Baik |
| **MediaMTX Integration** | urllib.request (blocking I/O) | ⚠️ Perlu perhatian |
| **Poster Capture** | ffmpeg subprocess | ✅ Baik |
| **Threading** | ThreadPoolExecutor (max 20) | ✅ Baik |
| **Async** | asyncio Semaphore (max 2 capture) | ✅ Baik |

### 3.3 API Endpoints

```
Auth:
  POST /api/auth/login          — JWT Login
  POST /api/auth/guest          — Guest token

Streams (User):
  GET  /api/streams             — Paginated list + status cache
  POST /api/streams/{id}/reconnect — Soft reconnect

Admin:
  GET  /api/admin/streams       — CRUD list dengan rtsp_url
  POST /api/admin/streams       — Tambah kamera
  PUT  /api/admin/streams/{id}  — Update kamera
  DELETE /api/admin/streams/{id}
  POST /api/admin/scan          — Network scan RTSP
  POST /api/admin/scan/preview  — Preview kamera sementara

Static:
  GET  /api/posters/stream_{id}.jpg
  GET  /static/posters/stream_{id}.jpg
```

### 3.4 MediaMTX Integration Strategy

**Preloaded Mode** (24/7):
- Semua kamera aktif didaftarkan ke MediaMTX saat startup
- `sourceOnDemand: false` → RTSP selalu connect
- Sub-stream otomatis via ffmpeg transcoding (480x270, 120kbps, 8fps)
- `REGISTERED_PATHS` cache mencegah PATCH berulang

**Fallback API Versions**:
- Mencoba v3 → v2 → v1 secara berurutan
- Pattern: POST add → PATCH → DELETE + recreate

**Risiko**: `urllib.request` blocking I/O dipanggil dari async context via `run_in_executor`. Ini benar, tapi timeout 1 detik mungkin terlalu agresif untuk operasi network.

---

## 4. Frontend Design (PHP + JavaScript)

### 4.1 Struktur File

```
frontend/
├── index.php              # Router halaman (monitor, custom, maps, admin)
├── login.php              # Login & guest access
├── logout.php
├── includes/
│   ├── header.php         # Head, Tailwind, font, theme anti-flicker
│   ├── sidebar.php        # Sidebar desktop + profile card
│   ├── mobile-nav.php     # Bottom nav mobile
│   ├── footer.php         # Load app.js
│   ├── tab-intro-box.php  # Intro card per halaman
│   └── pagination-bar.php # Pagination UI
├── views/
│   ├── live-monitor.php   # Grid 1x1–4x4 + pagination
│   ├── custom-monitor.php # Playlist kustom, gruping, fullscreen
│   ├── admin-console.php  # CRUD kamera, user permission, network scan
│   ├── maps.php           # Peta Leaflet + sidebar kamera
│   └── modals.php         # Popup kamera (theater/fullscreen)
└── assets/
    ├── css/global.css     # Design tokens, layout, dark/light, fullscreen
    └── js/app.js          # WebRTC WHEP, lazy load, popup, admin, maps
```

### 4.2 Routing Pattern

- **Server-side**: PHP `$_GET['page']` dengan whitelist: `['monitor', 'admin', 'custom', 'maps']`
- **Client-side**: SPA navigation via `history.pushState` + `popstate` listener
- **Auth guard**: Client-side via `localStorage.getItem("cctv_auth_token")`

### 4.3 State Management

| State | Storage | Scope |
|-------|---------|-------|
| JWT Token | localStorage | Session |
| User Role | localStorage | Session |
| Theme | localStorage | Persistent |
| Grid Layout | localStorage per user | Persistent per user |
| Custom Playlist | localStorage per user | Persistent per user |
| Grid Cache | sessionStorage | Tab-level (1 jam TTL) |
| Poster Memory | JavaScript variable | Runtime |

### 4.4 WebRTC/WHEP Implementation

- **Native WHEP**: fetch POST SDP → MediaMTX
- **Lazy load**: IntersectionObserver (connect saat tile visible)
- **Grid default**: Sub-stream untuk bitrate lebih rendah
- **Auto-reconnect**: 6× retry dengan 350ms delay
- **PeerConnection key**: `video-feed-{streamId}` (konsisten)

---

## 5. UI/UX Design Analysis

### 5.1 Design System

| Aspek | Implementasi | Rating |
|-------|-------------|--------|
| **Color Palette** | Brand colors: #3081d1 (blue), #F26935 (orange), #1a2a4a (navy) | ⭐⭐⭐⭐⭐ |
| **Typography** | Plus Jakarta Sans (UI) + JetBrains Mono (teknikal) | ⭐⭐⭐⭐⭐ |
| **Dark Mode** | CSS class-based toggle, instant init via inline script | ⭐⭐⭐⭐⭐ |
| **Responsive** | Sidebar desktop + bottom nav mobile | ⭐⭐⭐⭐ |
| **Glassmorphism** | Header dengan backdrop-blur | ⭐⭐⭐⭐ |

### 5.2 Temuan UI/UX (dari plan.txt)

| Komponen | Status | Issue |
|----------|--------|-------|
| **Login Page** | ⚠️ Perlu polish | Tidak ada background visual menarik, font label kecil di mobile |
| **Header** | ✅ Baik, minor tweak | Ukuran 56px → 58px, clock hidden di mobile |
| **Sidebar Desktop** | ⚠️ Perlu polish | Avatar kecil, stream list terlalu compact |
| **Mobile Bottom Nav** | ⚠️ Perlu polish | Dot indicator kecil, label terlalu kecil |
| **Card Consistency** | ⚠️ Perlu polish | Padding tidak konsisten di admin/maps |

### 5.3 Halaman & Fitur

| Halaman | Fitur Utama | Status |
|---------|------------|--------|
| **Semua Kamera** | Grid 1x1–4x4, filter grup, pagination, lazy WebRTC | ✅ Lengkap |
| **Screen** | Playlist kustom, gruping, layout save/load, fullscreen | ✅ Lengkap |
| **Peta Kamera** | Leaflet OSM, marker online/offline, sidebar searchable | ✅ Lengkap |
| **Admin Console** | CRUD kamera, matriks permission, network scan, preview | ✅ Lengkap |

---

## 6. Security Design

| Aspek | Implementasi | Rating |
|-------|-------------|--------|
| **Auth** | JWT Bearer (HS256, 10 jam expiry) | ⭐⭐⭐⭐ |
| **Password** | bcrypt hashing | ⭐⭐⭐⭐⭐ |
| **RTSP Masking** | rtsp_url hanya exposed ke admin API | ⭐⭐⭐⭐⭐ |
| **Role Access** | admin / user / guest dengan pivot table | ⭐⭐⭐⭐⭐ |
| **CORS** | `allow_origins=["*"]` — terlalu permissive | ⚠️ Risiko |
| **Input Validation** | Pydantic models di FastAPI | ⭐⭐⭐⭐ |
| **Client Auth Guard** | JavaScript localStorage check | ⭐⭐⭐ |

### 6.1 Catatan Keamanan Penting

1. **RTSP URL dengan kredensial**: Kamera URL menyimpan password plain text di database (`rtsp://admin:password@host...`). Ini adalah risiko keamanan signifikan.
2. **CORS allow_origins="*"**: Mengizinkan semua origin mengakses API — perlu dibatasi di production.
3. **Client-side auth guard**: `localStorage` check di JavaScript bisa di-bypass. Perlu server-side guard di PHP.
4. **JWT_SECRET fallback**: Hardcoded default secret key — harus selalu di-set via env var.

---

## 7. Kelebihan Desain

### 7.1 Arsitektur

1. **Separation of Concerns** — Backend (FastAPI) murni API, Frontend (PHP) murni presentation
2. **MediaMTX Preloaded** — Stream selalu ready, instant playback tanpa warm-up
3. **Poster System** — JPG fallback sebelum WebRTC ready, mencegah "layar hitam"
4. **Lazy Loading** — IntersectionObserver menghemat bandwidth dan resource
5. **Sub-stream Auto-detection** — Pattern matching otomatis untuk kamera dengan dual stream

### 7.2 Kode

1. **Graceful Degradation** — SQLite fallback saat MySQL tidak tersedia
2. **API Version Fallback** — v3 → v2 → v1 untuk kompatibilitas MediaMTX
3. **Blank Frame Detection** — ffmpeg-based image analysis menolak frame gray/hitam
4. **Concurrent Control** — Semaphore max 2 capture paralel + stagger 0.75s
5. **Caching Strategy** — RTSP status cache 45s, poster cache 60s

### 7.3 UX

1. **SPA Navigation** — Tidak ada full page reload antar menu
2. **Theme Toggle** — Dark/light mode dengan instant init (anti-flicker)
3. **Grid Layout Persisted** — User preference disimpan per user
4. **Pagination Numerik** — Navigasi halaman yang jelas
5. **Mobile Responsive** — Bottom nav untuk mobile, sidebar untuk desktop

---

## 8. Kekurangan & Risiko

### 8.1 Arsitektur

| # | Issue | Dampak | Rekomendasi |
|---|-------|--------|-------------|
| 1 | **Monolithic main.py** (~2372 baris) | Sulit maintain, test, dan scale | Split ke modules: `auth.py`, `streams.py`, `admin.py`, `workers.py` |
| 2 | **CORS allow_origins="*"** | Risiko CSRF/XSS | Batasi ke domain production |
| 3 | **RTSP password plain text** | Credential exposure | Enkripsi URL atau gunakan secrets manager |
| 4 | **No rate limiting** | Potensi DDoS/brute force | Tambah `slowapi` atau nginx rate limit |
| 5 | **SQLite fallback di production** | Data inconsistency | Hapus fallback atau warning lebih keras |

### 8.2 Frontend

| # | Issue | Dampak | Rekomendasi |
|---|-------|--------|-------------|
| 1 | **Client-side only auth guard** | Bypasable | Tambah PHP session/token validation di setiap page |
| 2 | **Hardcoded Tailwind CDN** | Tidak bisa offline, version drift | Build Tailwind ke file CSS lokal |
| 3 | **app.js monolithic** (~6953 baris) | Sulit debug dan test | Split ke modules: `webrtc.js`, `grid.js`, `admin.js`, `maps.js` |
| 4 | **No service worker** | Tidak bisa offline/PWA | Pertimbangkan PWA untuk mobile |
| 5 | **LocalStorage untuk token** | XSS vulnerability | Pertimbangkan httpOnly cookie |

### 8.3 Database

| # | Issue | Dampak | Rekomendasi |
|---|-------|--------|-------------|
| 1 | **No indexing pada user_cctv_access** | Query lambat saat scale | Tambah index pada foreign keys |
| 2 | **Coordinates sebagai VARCHAR** | Tidak bisa query geospatial | Gunakan POINT type (MySQL) atau split lat/lng |
| 3 | **No audit log untuk admin actions** | Tidak traceable | Tambah admin_activity_logs table |

---

## 9. Rekomendasi Perbaikan

### 9.1 High Priority

1. **🔴 Split backend monolith**
   ```
   backend/
   ├── api/
   │   ├── auth.py
   │   ├── streams.py
   │   ├── admin.py
   │   └── embed.py
   ├── core/
   │   ├── database.py
   │   ├── security.py
   │   └── config.py
   ├── services/
   │   ├── mediamtx.py
   │   ├── poster.py
   │   └── scanner.py
   └── workers/
       ├── status_monitor.py
       └── frame_capturer.py
   ```

2. **🔴 Enkripsi RTSP URL**
   - Gunakan `cryptography.fernet` untuk encrypt/decrypt RTSP URL
   - Atau pisahkan kredensial ke tabel terpisah

3. **🔴 Harden CORS**
   ```python
   allow_origins=[os.getenv("FRONTEND_URL", "http://localhost")]
   ```

4. **🟡 Server-side auth validation**
   ```php
   // Di index.php — validasi JWT via FastAPI sebelum render
   ```

### 9.2 Medium Priority

5. **🟡 Rate limiting** — `slowapi` atau `fastapi-limiter` dengan Redis
6. **🟡 Frontend modularization** — Split `app.js` ke ES modules
7. **🟡 Build Tailwind locally** — `npm install -D tailwindcss` + build step
8. **🟡 Add database indexes**
   ```sql
   CREATE INDEX idx_user_cctv_access_user ON user_cctv_access(user_id);
   CREATE INDEX idx_user_cctv_access_stream ON user_cctv_access(stream_id);
   CREATE INDEX idx_cctv_streams_group ON cctv_streams(group_name);
   CREATE INDEX idx_cctv_streams_active ON cctv_streams(is_active);
   ```

### 9.3 Low Priority (Enhancement)

9. **🟢 PWA Support** — Service worker + manifest.json
10. **🟢 WebSocket untuk real-time status** — Ganti polling 15 detik ke WebSocket
11. **🟢 Helm chart / Docker Compose** — Untuk deployment yang lebih mudah
12. **🟢 Metrics & Monitoring** — Prometheus + Grafana endpoint

---

## 10. Kesimpulan

Mamura Stream v2.0 adalah sistem monitoring CCTV dengan **arsitektur yang solid dan fitur yang lengkap**. Keputusan desain utama (FastAPI + PHP + MediaMTX) adalah pilihan yang tepat untuk use case ini — Python menangani I/O berat (streaming, ffmpeg, async workers) sementara PHP menyediakan frontend yang ringan dan cepat.

**Poin Kuat:**
- Preloaded stream → instant playback
- Poster system → UX yang halus
- Lazy loading → efisien resource
- Role-based access → keamanan granular

**Area Perbaikan Utama:**
- Monolithic codebase perlu di-modularisasi
- Keamanan RTSP credential perlu diperketat
- CORS dan auth guard perlu diharden

**Skor Keseluruhan: 7.5/10** — Sistem yang baik dengan fondasi kuat, namun perlu refactoring struktural untuk scalability dan maintainability jangka panjang.

---

*Analisis dibuat berdasarkan inspeksi kode dari:*
- `blueprint.txt` — Dokumentasi arsitektur
- `plan.txt` — Temuan modernisasi UI
- `database/schema.sql` — Skema database
- `backend/main.py` — Backend FastAPI
- `frontend/index.php`, `login.php`, `includes/*.php`, `views/*.php` — Frontend
- `frontend/assets/css/global.css` — Design system
- `frontend/assets/js/app.js` — Client logic

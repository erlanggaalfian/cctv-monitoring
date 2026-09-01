#!/bin/bash

# =============================================================================
# Mamura Stream — System Updater (Debian 12)
# Diperbarui: Juli 2026
#
# AMAN dijalankan berkali-kali — tidak mengubah DB, SSL, atau password.
# Mendukung eksekusi dari direktori mana saja.
# Aligned with NetBackup updater arguments and confirmation steps.
# =============================================================================

set -e

# Definisi Warna untuk Logging
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Resolusi SCRIPT_DIR secara absolut dari script ini diluncurkan
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# Lokasi rekaman — timpa dengan: RECORDINGS_DIR=/path bash update.sh
REC_DIR="${RECORDINGS_DIR:-/mnt/cctv-storage}"
if [ -z "$SCRIPT_DIR" ]; then
    SCRIPT_DIR="."
fi

# Default versi release
DEFAULT_APP_VERSION="1.0.0"
APP_VERSION=""
VERSION_ARG=""
SKIP_CONFIRM=0
SKIP_BACKUP=0
LOG_FILE="/var/log/cctv_monitoring_update.log"
BACKUP_DIR="/var/backups/cctv-monitoring"

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) SKIP_CONFIRM=1 ;;
        --no-backup) SKIP_BACKUP=1 ;;
        --version|-v)
            shift
            if [ -z "${1:-}" ]; then
                echo -e "${RED}✗ Error: Opsi --version membutuhkan nilai (contoh: 1.0.0)${NC}"
                exit 1
            fi
            VERSION_ARG="$1"
            ;;
        --help|-h)
            echo "Usage: sudo bash update.sh [opsi]"
            echo ""
            echo "Opsi:"
            echo "  --yes, -y              Lewati konfirmasi interaktif"
            echo "  --no-backup            Lewati backup database"
            echo "  --version, -v VER      Set versi release (default: ${DEFAULT_APP_VERSION})"
            echo "  --help, -h             Tampilkan bantuan ini"
            exit 0
            ;;
        *)
            echo -e "${RED}✗ Error: Opsi tidak dikenal: $1${NC}"
            echo "Gunakan: sudo bash update.sh --help"
            exit 1
            ;;
    esac
    shift
done

# Tampilan Header Premium
clear
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}        MAMURA STREAM — SYSTEM UPDATER & MAINTENANCE           ${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "  Lokasi Source  : ${YELLOW}$SCRIPT_DIR${NC}"
echo -e "  User Eksekusi  : ${YELLOW}$(whoami)${NC}"
echo -e "  File Log       : ${YELLOW}$LOG_FILE${NC}"
echo -e "----------------------------------------------------------------"

# Helpers
error_exit() {
    echo ""
    echo -e "${RED}================================================================${NC}"
    echo -e "${RED}                   ✗ PROSES UPDATE GAGAL                        ${NC}"
    echo -e "${RED}================================================================${NC}"
    if [ -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}Detail error (20 baris terakhir):${NC}"
        tail -20 "$LOG_FILE"
        echo ""
        echo -e "File Log Lengkap: ${CYAN}$LOG_FILE${NC}"
    fi
    exit 1
}
trap error_exit ERR

log() {
    echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✔ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# ── 1. Verifikasi Hak Akses Root ──────────────────────────────────────────────
echo -e "${BLUE}[1/8] Memeriksa hak akses administrator (root)...${NC}"
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Error: Harap jalankan script ini sebagai root: sudo bash $0${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Hak akses root diverifikasi."

# ── 2. Deteksi Lokasi Target `/var/www/xxx` ───────────────────────────────────
echo -e "\n${BLUE}[2/8] Mendeteksi direktori instalasi aktif...${NC}"
TARGET_DIR=""
SERVICE_FILE="/etc/systemd/system/cctv-backend.service"

if [ -f "$SERVICE_FILE" ]; then
    VENV_WORK_DIR=$(grep -i 'WorkingDirectory' "$SERVICE_FILE" | cut -d= -f2 | xargs)
    if [ -n "$VENV_WORK_DIR" ]; then
        TARGET_DIR="${VENV_WORK_DIR%/backend}"
        echo -e "  ${GREEN}✓${NC} Menemukan target dari systemd: ${CYAN}$TARGET_DIR${NC}"
    fi
fi

if [ -z "$TARGET_DIR" ]; then
    for dir in /var/www/*; do
        if [ -d "$dir/backend" ] && [ -f "$dir/backend/main.py" ]; then
            TARGET_DIR="$dir"
            echo -e "  ${GREEN}✓${NC} Menemukan target melalui scan /var/www: ${CYAN}$TARGET_DIR${NC}"
            break
        fi
    done
fi

if [ -z "$TARGET_DIR" ] && [ -d "/var/www/cctv-monitoring" ]; then
    TARGET_DIR="/var/www/cctv-monitoring"
    echo -e "  ${GREEN}✓${NC} Menemukan target default: ${CYAN}$TARGET_DIR${NC}"
fi

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}✗ Error: Gagal mendeteksi lokasi instalasi Mamura Stream.${NC}"
    echo -e "  Silakan jalankan script instalasi terlebih dahulu: ${GREEN}sudo bash install.sh${NC}"
    exit 1
fi

# Parsing DB Credentials dari Systemd Service
db_env_get() {
    local key="$1"
    if [ -f "$SERVICE_FILE" ]; then
        grep "Environment=\"${key}=" "$SERVICE_FILE" | sed -n "s/.*Environment=\"${key}=\([^\"]*\)\".*/\1/p"
    fi
}

DB_HOST=$(db_env_get "DB_HOST")
DB_PORT=$(db_env_get "DB_PORT")
DB_NAME=$(db_env_get "DB_NAME")
DB_USER=$(db_env_get "DB_USER")
DB_PASS=$(db_env_get "DB_PASS")
[ -z "$DB_PORT" ] && DB_PORT="3306"

# Membaca versi terpasang
read_version_file() {
    local file="$1"
    local fallback="${2:-}"
    if [ -f "$file" ]; then
        local v
        v="$(tr -d '\r\n' < "$file" | head -n1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        if [ -n "$v" ]; then
            echo "$v"
            return
        fi
    fi
    echo "$fallback"
}

# Membaca versi kode secara dinamis dari file VERSION atau parsing main.py
get_code_version() {
    local base_dir="$1"
    local fallback="$2"
    
    # 1. Coba baca dari berkas VERSION
    if [ -f "$base_dir/VERSION" ]; then
        local v
        v="$(read_version_file "$base_dir/VERSION" "")"
        if [ -n "$v" ]; then
            echo "$v"
            return
        fi
    fi
    
    # 2. Coba parse dari backend/main.py (FastAPI version)
    if [ -f "$base_dir/backend/main.py" ]; then
        local parsed_ver
        parsed_ver=$(grep -o "version\s*=\s*\"[^\"]*\"" "$base_dir/backend/main.py" 2>/dev/null | cut -d'"' -f2)
        if [ -n "$parsed_ver" ]; then
            echo "$parsed_ver"
            return
        fi
    fi
    
    echo "$fallback"
}

INSTALLED_VERSION="$(get_code_version "$TARGET_DIR" "")"

resolve_app_version() {
    local suggested
    suggested="$(get_code_version "$SCRIPT_DIR" "$DEFAULT_APP_VERSION")"

    if [ -n "$VERSION_ARG" ]; then
        APP_VERSION="$VERSION_ARG"
        return
    fi
    if [ "$SKIP_CONFIRM" -eq 1 ]; then
        APP_VERSION="$suggested"
        return
    fi

    echo -e "${YELLOW}Informasi Versi Release Mamura Stream:${NC}"
    if [ -n "$INSTALLED_VERSION" ]; then
        echo -e "  Versi Terpasang : ${CYAN}v${INSTALLED_VERSION}${NC}"
    else
        echo -e "  Versi Terpasang : ${YELLOW}Tidak Diketahui (Default v1.0.0)${NC}"
        INSTALLED_VERSION="1.0.0"
    fi
    echo -e "  Versi Script    : ${CYAN}v${suggested}${NC}"
    read -rp "  Versi yang akan diinstall [${suggested}]: " INPUT_VERSION
    APP_VERSION="${INPUT_VERSION:-$suggested}"
}

resolve_app_version

# Ringkasan sebelum update
echo -e "\n${CYAN}================================================================${NC}"
echo -e "                 RINGKASAN PROSES UPDATE SISTEM                 "
echo -e "${CYAN}================================================================${NC}"
echo -e "  Direktori Target: ${GREEN}$TARGET_DIR${NC}"
echo -e "  Versi Update    : ${GREEN}v$APP_VERSION${NC}"
echo -e "  Database Target : ${GREEN}${DB_NAME:-cctv_monitoring}${NC} @ ${GREEN}${DB_HOST:-localhost}:${DB_PORT}${NC}"
echo -e "----------------------------------------------------------------"

if [ "$SKIP_CONFIRM" -ne 1 ]; then
    read -rp "  Lanjutkan update sistem? (y/n) [default: y]: " CONFIRM
    CONFIRM=${CONFIRM:-y}
    case "$CONFIRM" in
        y|Y|yes|YES) ;;
        *) warn "Proses update dibatalkan oleh pengguna."; exit 0 ;;
    esac

    if [ "$SKIP_BACKUP" -eq 0 ]; then
        read -rp "  Buat backup database saat ini sebelum update? (y/n) [default: y]: " CONFIRM_BACKUP
        CONFIRM_BACKUP=${CONFIRM_BACKUP:-y}
        case "$CONFIRM_BACKUP" in
            n|N|no|NO) SKIP_BACKUP=1 ;;
            *) SKIP_BACKUP=0 ;;
        esac
    fi
fi

# ── 3. Backup Database ────────────────────────────────────────────────────────
echo -e "\n${BLUE}[3/8] Backup database (opsional)...${NC}"
if [ "$SKIP_BACKUP" -eq 1 ]; then
    log "Backup database dilewati."
else
    mkdir -p "$BACKUP_DIR"
    DB_BACKUP_FILE="$BACKUP_DIR/${DB_NAME:-cctv_monitoring}_$(date +%Y%m%d_%H%M%S).sql"
    if [ -n "$DB_NAME" ] && [ -n "$DB_USER" ] && command -v mysqldump &>/dev/null; then
        if [ -n "$DB_PASS" ]; then
            mysqldump -h "${DB_HOST:-localhost}" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" \
                --single-transaction --routines --triggers "$DB_NAME" \
                > "$DB_BACKUP_FILE" 2>> "$LOG_FILE"
        else
            mysqldump -h "${DB_HOST:-localhost}" -P "$DB_PORT" -u "$DB_USER" \
                --single-transaction --routines --triggers "$DB_NAME" \
                > "$DB_BACKUP_FILE" 2>> "$LOG_FILE"
        fi
        success "Database berhasil di-backup ke: $DB_BACKUP_FILE"
    else
        warn "Backup database dilewati (mysqldump tidak ditemukan/kredensial tidak valid)."
    fi
fi

# ── 4. Pembersihan Aman (Safe Cleanup) & Copy File Baru ──────────────────────
echo -e "\n${BLUE}[4/8] Sinkronisasi kode baru & pembersihan folder lama...${NC}"
echo -e "  Membersihkan file lama di $TARGET_DIR (Kecuali DB, Venv, & Media)..."

# Hapus folder frontend & database yang lama sepenuhnya (aman karena data dinamis ada di backend)
if [ -d "$TARGET_DIR/frontend" ]; then
    rm -rf "$TARGET_DIR/frontend"
fi
if [ -d "$TARGET_DIR/database" ]; then
    rm -rf "$TARGET_DIR/database"
fi

# Hapus file backend secara selektif untuk melindungi DB SQLite, Venv, & Media Uploads
if [ -d "$TARGET_DIR/backend" ]; then
    find "$TARGET_DIR/backend" -mindepth 1 -maxdepth 1 \
        ! -name 'venv' \
        ! -name 'cctv_monitoring.db' \
        ! -name 'static' \
        -exec rm -rf {} +
fi

# Re-create directories jika terhapus
mkdir -p "$TARGET_DIR/frontend"
mkdir -p "$TARGET_DIR/database"
mkdir -p "$TARGET_DIR/backend"

# Salin file codebase baru secara absolut menggunakan SCRIPT_DIR
echo "$APP_VERSION" > "$SCRIPT_DIR/VERSION" 2>/dev/null || true
echo "$APP_VERSION" > "$TARGET_DIR/VERSION"

cp -r "$SCRIPT_DIR/frontend"/* "$TARGET_DIR/frontend/"
cp -r "$SCRIPT_DIR/database"/* "$TARGET_DIR/database/"
cp -v "$SCRIPT_DIR/backend"/*.py "$TARGET_DIR/backend/" 2>/dev/null || true
cp -v "$SCRIPT_DIR/backend/requirements.txt" "$TARGET_DIR/backend/" 2>/dev/null || true
cp -v "$SCRIPT_DIR/install.sh" "$TARGET_DIR/" 2>/dev/null || true
cp -v "$SCRIPT_DIR/update.sh" "$TARGET_DIR/" 2>/dev/null || true

# Buat folder media/uploads jika belum ada dan atur ownership
mkdir -p "$TARGET_DIR/backend/static/posters"
mkdir -p "$TARGET_DIR/backend/static/ads"
mkdir -p /recordings
    # Fix MediaMTX recording permissions
    if [ -d "$REC_DIR" ]; then
        chmod -R 777 "$REC_DIR/recordings/" 2>/dev/null
    fi
    # Update mediamtx service ReadWritePaths
    if [ -f "/etc/systemd/system/mediamtx.service" ]; then
        if ! grep -q "$REC_DIR" /etc/systemd/system/mediamtx.service; then
            sed -i "s|ReadWritePaths=/var/log/mediamtx|ReadWritePaths=/var/log/mediamtx $REC_DIR|" /etc/systemd/system/mediamtx.service
            systemctl daemon-reload
        fi
    fi
chown -R www-data:www-data "$TARGET_DIR"
success "Kode baru disalin & folder lama dibersihkan secara aman."

# ── 5. Konfigurasi Domain & Apache Proxy ──────────────────────────────────────
echo -e "\n${BLUE}[5/8] Memeriksa konfigurasi server Apache & VirtualHost...${NC}"
# Deteksi domain publik dari VirtualHost aktif
SERVER_DOMAIN=""
APACHE_CONF=""
for conf in /etc/apache2/sites-available/*.conf; do
    if grep -q "$TARGET_DIR" "$conf" 2>/dev/null; then
        SERVER_DOMAIN=$(grep -i 'ServerName' "$conf" | head -1 | awk '{print $2}' | xargs)
        APACHE_CONF="$conf"
        break
    fi
done
if [ -z "$SERVER_DOMAIN" ]; then
    SERVER_DOMAIN=$(hostname -f 2>/dev/null || hostname)
fi

# Perbaikan Mandiri Apache DocumentRoot & Alias /frontend agar aset CSS/JS dapat terbaca kembali
if [ -n "$APACHE_CONF" ] && [ -f "$APACHE_CONF" ]; then
    # Kembalikan DocumentRoot ke subfolder /frontend agar link /assets/... valid
    if ! grep -q "DocumentRoot.*$TARGET_DIR/frontend" "$APACHE_CONF" 2>/dev/null; then
        echo "  Menyelaraskan DocumentRoot Apache kembali ke /frontend..."
        sed -i "s|DocumentRoot $TARGET_DIR|DocumentRoot $TARGET_DIR/frontend|g" "$APACHE_CONF"
        sed -i "s|<Directory $TARGET_DIR>|<Directory $TARGET_DIR/frontend>|g" "$APACHE_CONF"
    fi
    
    # Tambahkan Alias /frontend untuk melayani URL /frontend/embed.php
    if ! grep -q "Alias /frontend" "$APACHE_CONF" 2>/dev/null; then
        echo "  Menambahkan Alias /frontend ke Apache config..."
        sed -i "/DocumentRoot/a \    Alias /frontend $TARGET_DIR/frontend" "$APACHE_CONF"
    fi
    
    # Hapus file index.php redirect di root jika tersisa karena sudah tidak diperlukan lagi
    rm -f "$TARGET_DIR/index.php"

    # Cek dan sesuaikan juga SSL Let's Encrypt config-nya jika ada
    LE_SSL_CONF="/etc/apache2/sites-available/$(basename "${APACHE_CONF%.conf}")-le-ssl.conf"
    if [ -f "$LE_SSL_CONF" ]; then
        if ! grep -q "DocumentRoot.*$TARGET_DIR/frontend" "$LE_SSL_CONF" 2>/dev/null; then
            sed -i "s|DocumentRoot $TARGET_DIR|DocumentRoot $TARGET_DIR/frontend|g" "$LE_SSL_CONF"
            sed -i "s|<Directory $TARGET_DIR>|<Directory $TARGET_DIR/frontend>|g" "$LE_SSL_CONF"
        fi
        if ! grep -q "Alias /frontend" "$LE_SSL_CONF" 2>/dev/null; then
            sed -i "/DocumentRoot/a \    Alias /frontend $TARGET_DIR/frontend" "$LE_SSL_CONF"
        fi
    fi
    
    systemctl restart apache2
    success "Penyelarasan DocumentRoot dan Alias /frontend di Apache selesai."
fi

# Tentukan protokol dasar URL
if [[ "$SERVER_DOMAIN" =~ ^[0-9.]+$ ]] || [ "$SERVER_DOMAIN" = "localhost" ]; then
    PUBLIC_BASE_URL="http://$SERVER_DOMAIN"
else
    PUBLIC_BASE_URL="https://$SERVER_DOMAIN"
fi
echo -e "  Domain Terdeteksi: ${GREEN}$PUBLIC_BASE_URL${NC}"

# Perbarui variabel lingkungan (env) di service systemd
patch_systemd_env() {
    local svc="$SERVICE_FILE"
    local key="$1"
    local val="$2"
    if [ -f "$svc" ]; then
        if ! grep -q "^Environment=\"${key}=" "$svc" 2>/dev/null; then
            if grep -q "^Environment=" "$svc"; then
                sed -i "/^Environment=/a Environment=\"${key}=${val}\"" "$svc"
            else
                sed -i "/^\[Service\]/a Environment=\"${key}=${val}\"" "$svc"
            fi
        else
            sed -i "s|^Environment=\"${key}=.*\"|Environment=\"${key}=${val}\"|" "$svc"
        fi
    fi
}

if [ -f "$SERVICE_FILE" ]; then
    patch_systemd_env "PUBLIC_BASE_URL" "$PUBLIC_BASE_URL"
    success "Variabel lingkungan di systemd disesuaikan."
else
    warn "Layanan $SERVICE_FILE tidak ditemukan, melewati penyelarasan env."
fi

# ── 6. Verifikasi Dependensi Sistem & Python ───────────────────────────────
echo -e "\n${BLUE}[6/8] Memverifikasi dependensi pustaka Python & FFmpeg...${NC}"
# Pastikan ffmpeg tersedia
if ! command -v ffmpeg &>/dev/null; then
    echo "  FFmpeg tidak ditemukan, menginstal..."
    apt-get install -y ffmpeg -qq
fi

# Update dependensi Python
if [ -d "$TARGET_DIR/backend/venv" ]; then
    "$TARGET_DIR/backend/venv/bin/pip" install -r "$TARGET_DIR/backend/requirements.txt" -q --no-warn-script-location
    success "Dependensi Python berhasil diperbarui."
else
    echo "  Virtual environment tidak ditemukan — membuat venv baru..."
    python3 -m venv "$TARGET_DIR/backend/venv"
    "$TARGET_DIR/backend/venv/bin/pip" install --upgrade pip -q
    "$TARGET_DIR/backend/venv/bin/pip" install -r "$TARGET_DIR/backend/requirements.txt" -q --no-warn-script-location
    success "Virtual environment & dependensi Python berhasil dibangun."
fi

# ── 7. Restart Layanan Sistem ─────────────────────────────────────────────────
echo -e "\n${BLUE}[7/8] Memuat ulang dan memulai ulang layanan sistem...${NC}"
if [ -f "$SERVICE_FILE" ]; then
    systemctl daemon-reload
    systemctl restart cctv-backend.service
    sleep 2
    if systemctl is-active --quiet cctv-backend.service; then
        success "Layanan cctv-backend.service aktif."
    else
        warn "Gagal me-restart cctv-backend.service!"
    fi
fi

if command -v apache2ctl &>/dev/null; then
    systemctl restart apache2
    if systemctl is-active --quiet apache2; then
        success "Layanan apache2 aktif."
    else
        warn "Gagal me-restart apache2!"
    fi
fi

# ── 8. Pengujian Koneksi (Health Check) ───────────────────────────────────────
echo -e "\n${BLUE}[8/8] Menjalankan uji koneksi (Health Check)...${NC}"
sleep 1
if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
    success "Koneksi internal backend sukses (127.0.0.1:8000)"
else
    warn "Backend internal tidak merespons!"
fi

if curl -sf "$PUBLIC_BASE_URL/api/health" >/dev/null 2>&1; then
    success "Koneksi eksternal proxy sukses ($PUBLIC_BASE_URL)"
else
    warn "Koneksi eksternal melalui proxy belum terhubung (mungkin perlu waktu)."
fi

# ── Ringkasan Sukses ──────────────────────────────────────────────────────────
echo -e "\n${GREEN}================================================================${NC}"
echo -e "                  SISTEM BERHASIL DIPERBARUI                    "
echo -e "${GREEN}================================================================${NC}"
echo -e "  Versi Baru       : ${GREEN}v$APP_VERSION${NC}"
echo -e "  Target Instalasi : ${CYAN}$TARGET_DIR${NC}"
echo -e "  URL Pemutar      : ${CYAN}$PUBLIC_BASE_URL/frontend/embed.php?key=API_KEY${NC}"
echo -e "----------------------------------------------------------------"
echo -e "  Status Database  : ${GREEN}Terhubung${NC} ($DB_NAME)"
[ -f "$DB_BACKUP_FILE" ] && echo -e "  Berkas Backup DB : $DB_BACKUP_FILE"
echo -e "  Berkas Log Update: $LOG_FILE"
echo -e "================================================================"
echo -e "  ${YELLOW}Catatan:${NC} Database, SSL, dan konfigurasi tidak ada yang diubah."
echo -e "  Silakan bersihkan cache browser Anda (${CYAN}Ctrl + F5${NC}) untuk menerapkan tema baru."
echo -e "================================================================"

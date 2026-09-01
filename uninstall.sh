#!/bin/bash

# =============================================================================
# Mamura Stream — Automated Uninstaller (Debian 12)
# Diperbarui: Juli 2026
#
# Harus dijalankan sebagai root (sudo bash uninstall.sh)
# Mendukung eksekusi dari direktori mana saja.
# Aligned with NetBackup uninstaller structure and setup flows.
# =============================================================================

set -e

# Definisi Warna untuk Logging
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Resolusi SCRIPT_DIR secara absolut
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
if [ -z "$SCRIPT_DIR" ]; then
    SCRIPT_DIR="."
fi

# Tampilan Header Selamat Datang
clear
echo -e "${RED}================================================================${NC}"
echo -e "${RED}            MAMURA STREAM — UNINSTALLER ENGINE                 ${NC}"
echo -e "${RED}================================================================${NC}"
echo -e "  User Eksekusi : $(whoami)"
echo -e "  Direktori     : $SCRIPT_DIR"
echo -e "----------------------------------------------------------------"

# ── 1. Verifikasi Hak Akses Root ──────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Error: Harap jalankan script ini sebagai root (sudo bash uninstall.sh)${NC}"
    exit 1
fi

# Parse arguments
SKIP_CONFIRM=0
DB_ACTION="ask"
BACKUP_DB="ask"
TARGET_ARG=""
LOG_FILE="/var/log/cctv_monitoring_uninstall.log"
BACKUP_DIR="/var/backups/cctv-monitoring"

while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) SKIP_CONFIRM=1 ;;
        --drop-db) DB_ACTION="drop" ;;
        --keep-db) DB_ACTION="keep" ;;
        --backup-db) BACKUP_DB=1 ;;
        --no-backup) BACKUP_DB=0 ;;
        --target)
            shift
            if [ -z "${1:-}" ]; then
                echo -e "${RED}✗ Error: Opsi --target membutuhkan path instalasi${NC}"
                exit 1
            fi
            TARGET_ARG="$1"
            ;;
        --help|-h)
            echo "Usage: sudo bash uninstall.sh [opsi]"
            echo ""
            echo "Opsi:"
            echo "  --yes, -y           Lewati konfirmasi utama"
            echo "  --drop-db           Hapus database & user MySQL (tanpa tanya)"
            echo "  --keep-db           Pertahankan database (tanpa tanya)"
            echo "  --backup-db         Paksa backup database sebelum uninstall"
            echo "  --no-backup         Lewati backup database"
            echo "  --target PATH       Path instalasi spesifik (tanpa auto-detect)"
            echo "  --help, -h          Tampilkan bantuan"
            exit 0
            ;;
        *)
            echo -e "${RED}✗ Error: Opsi tidak dikenal: $1${NC}"
            echo "Gunakan: sudo bash uninstall.sh --help"
            exit 1
            ;;
    esac
    shift
done

# Helpers
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

# ── 2. Deteksi Lokasi Target `/var/www/xxx` ───────────────────────────────────
TARGET_DIR=""
SERVICE_FILE="/etc/systemd/system/cctv-backend.service"

if [ -n "$TARGET_ARG" ]; then
    TARGET_DIR="$TARGET_ARG"
    success "Menggunakan target manual: $TARGET_DIR"
else
    if [ -f "$SERVICE_FILE" ]; then
        VENV_WORK_DIR=$(grep -i 'WorkingDirectory' "$SERVICE_FILE" | cut -d= -f2 | xargs 2>/dev/null || true)
        if [ -n "$VENV_WORK_DIR" ]; then
            TARGET_DIR="${VENV_WORK_DIR%/backend}"
            success "Terdeteksi target dari systemd: $TARGET_DIR"
        fi
    fi

    if [ -z "$TARGET_DIR" ]; then
        for dir in /var/www/*; do
            if [ -d "$dir/backend" ] && [ -f "$dir/backend/main.py" ]; then
                TARGET_DIR="$dir"
                success "Terdeteksi target melalui scan /var/www: $TARGET_DIR"
                break
            fi
        done
    fi

    if [ -z "$TARGET_DIR" ] && [ -d "/var/www/cctv-monitoring" ]; then
        TARGET_DIR="/var/www/cctv-monitoring"
        success "Menggunakan target default: $TARGET_DIR"
    fi
fi

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}✗ Error: Gagal mendeteksi lokasi instalasi Mamura Stream.${NC}"
    echo -e "  Silakan tentukan path manual: ${GREEN}sudo bash uninstall.sh --target /var/www/cctv-monitoring${NC}"
    exit 1
fi

# Parsing DB Credentials dari Systemd Service jika file ada
DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASS=""

db_env_get() {
    local key="$1"
    if [ -f "$SERVICE_FILE" ]; then
        grep "Environment=\"${key}=" "$SERVICE_FILE" | sed -n "s/.*Environment=\"${key}=\([^\"]*\)\".*/\1/p" 2>/dev/null || true
    fi
}

if [ -f "$SERVICE_FILE" ]; then
    DB_HOST=$(db_env_get "DB_HOST")
    DB_PORT=$(db_env_get "DB_PORT")
    DB_NAME=$(db_env_get "DB_NAME")
    DB_USER=$(db_env_get "DB_USER")
    DB_PASS=$(db_env_get "DB_PASS")
fi

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

UNINSTALLED_VERSION="$(get_code_version "$TARGET_DIR" "1.0.0")"

# Deteksi konfigurasi VirtualHost Apache
CONF_NAME=$(basename "$TARGET_DIR")
APACHE_CONF="/etc/apache2/sites-available/$CONF_NAME.conf"
if [ ! -f "$APACHE_CONF" ] && [ -f "/etc/apache2/sites-available/cctv-monitoring.conf" ]; then
    APACHE_CONF="/etc/apache2/sites-available/cctv-monitoring.conf"
fi

# ── 3. Konfirmasi Uninstall & Opsi Backup DB ──────────────────────────────────
echo -e "\n${CYAN}================================================================${NC}"
echo -e "                 RINGKASAN PROSES UNINSTALL                     "
echo -e "${CYAN}================================================================${NC}"
echo -e "  Direktori Target: ${RED}$TARGET_DIR${NC}"
echo -e "  Service Systemd : $SERVICE_FILE"
echo -e "  Apache Config   : $APACHE_CONF"
echo -e "  Database Target : ${DB_NAME:-cctv_monitoring}"
echo -e "  Versi Terpasang : ${CYAN}v$UNINSTALLED_VERSION${NC}"
echo -e "-------------------------------------------------------------------------"

if [ "$SKIP_CONFIRM" -ne 1 ]; then
    read -rp "  Apakah Anda yakin ingin menghapus Mamura Stream sepenuhnya? (y/n) [default: n]: " CONFIRM_OK
    CONFIRM_OK=${CONFIRM_OK:-n}
    if [[ ! "$CONFIRM_OK" =~ ^[yY]$ ]]; then
        echo -e "${YELLOW}Proses uninstall dibatalkan oleh pengguna.${NC}"
        exit 0
    fi
    
    if [ "$BACKUP_DB" = "ask" ]; then
        read -rp "  Apakah Anda ingin melakukan backup database sebelum uninstall? (y/n) [default: y]: " DB_BACKUP_CONFIRM
        DB_BACKUP_CONFIRM=${DB_BACKUP_CONFIRM:-y}
        if [[ "$DB_BACKUP_CONFIRM" =~ ^[yY]$ ]]; then
            BACKUP_DB=1
        else
            BACKUP_DB=0
        fi
    fi

    if [ "$DB_ACTION" = "ask" ]; then
        read -rp "  Apakah Anda ingin menghapus database & user database MySQL dari server? (y/n) [default: n]: " DB_CONFIRM
        DB_CONFIRM=${DB_CONFIRM:-n}
        if [[ "$DB_CONFIRM" =~ ^[yY]$ ]]; then
            DB_ACTION="drop"
        else
            DB_ACTION="keep"
        fi
    fi
fi

# Mengatur CLI mariadb root access untuk backup & drop jika diperlukan
if [ -n "$DB_NAME" ]; then
    if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
        MARIADB_CMD="mariadb -u root"
    else
        MARIADB_CMD="mariadb -h $DB_HOST -P ${DB_PORT:-3306} -u root"
    fi
    
    DB_PASS_ARG=""
    # Jika salah satu tindakan database aktif, uji akses root mysql
    if [ "$BACKUP_DB" -eq 1 ] || [ "$DB_ACTION" = "drop" ]; then
        if ! $MARIADB_CMD -e "SELECT 1" < /dev/null &>/dev/null; then
            echo -e "  ${YELLOW}* Koneksi root MariaDB/MySQL memerlukan password.${NC}"
            echo -n "  Masukkan password root MySQL/MariaDB Anda: "
            read -s DB_ROOT_PASS
            echo
            [ -n "$DB_ROOT_PASS" ] && DB_PASS_ARG="-p${DB_ROOT_PASS}"
        fi
    fi
fi

# ── 4. Eksekusi Backup Database (Jika dipilih) ────────────────────────────────
DB_BACKUP_FILE=""
if [ "$BACKUP_DB" -eq 1 ] && [ -n "$DB_NAME" ]; then
    echo -e "\n${BLUE}[1/6] Menjalankan backup database sebelum uninstall...${NC}"
    mkdir -p "$BACKUP_DIR"
    DB_BACKUP_FILE="$BACKUP_DIR/uninstall_${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql"
    
    if command -v mysqldump &>/dev/null; then
        if [ -n "$DB_PASS" ]; then
            mysqldump -h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASS" \
                --single-transaction --routines --triggers "$DB_NAME" \
                > "$DB_BACKUP_FILE" 2>> "$LOG_FILE"
        else
            # Jika user password kosong, gunakan root mysql credential jika diberikan
            mysqldump_cmd="mysqldump -h ${DB_HOST:-localhost} -P ${DB_PORT:-3306}"
            if [ -n "$DB_PASS_ARG" ]; then
                $mysqldump_cmd -u root $DB_PASS_ARG --single-transaction --routines --triggers "$DB_NAME" > "$DB_BACKUP_FILE" 2>> "$LOG_FILE"
            else
                $mysqldump_cmd -u "$DB_USER" --single-transaction --routines --triggers "$DB_NAME" > "$DB_BACKUP_FILE" 2>> "$LOG_FILE"
            fi
        fi
        success "Database berhasil di-backup ke: $DB_BACKUP_FILE"
    else
        warn "Gagal melakukan backup database (mysqldump tidak ditemukan)."
    fi
fi

# ── 5. Matikan & Hapus Service cctv-backend ──────────────────────────────────
echo -e "\n${BLUE}[2/6] Menghentikan & menghapus layanan systemd backend...${NC}"
if [ -f "$SERVICE_FILE" ]; then
    systemctl stop cctv-backend.service 2>/dev/null || true
    systemctl disable cctv-backend.service 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
    success "Layanan cctv-backend.service berhasil dinonaktifkan & dihapus."
else
    warn "Layanan cctv-backend.service tidak ditemukan, melewati langkah ini."
fi

# ── 6. Nonaktifkan & Hapus Konfigurasi Apache ─────────────────────────────────
echo -e "\n${BLUE}[3/6] Menonaktifkan & menghapus konfigurasi Apache VirtualHost...${NC}"
if [ -f "$APACHE_CONF" ]; then
    CONF_FILE_NAME=$(basename "$APACHE_CONF")
    a2dissite "$CONF_FILE_NAME" 2>/dev/null || true
    rm -f "$APACHE_CONF"
    
    # Hapus juga file Let's Encrypt SSL VirtualHost jika ada
    LE_SSL_CONF="/etc/apache2/sites-available/${CONF_FILE_NAME%.conf}-le-ssl.conf"
    if [ -f "$LE_SSL_CONF" ]; then
        a2dissite "$(basename "$LE_SSL_CONF")" 2>/dev/null || true
        rm -f "$LE_SSL_CONF"
    fi

    systemctl restart apache2 2>/dev/null || true
    success "Konfigurasi Apache VirtualHost berhasil dihapus."
else
    warn "File konfigurasi Apache tidak ditemukan, melewati langkah ini."
fi

# ── 7. Hapus Database & User Database (Opsional) ──────────────────────────────
echo -e "\n${BLUE}[4/6] Mengonfigurasi penghapusan database...${NC}"
if [ "$DB_ACTION" = "drop" ] && [ -n "$DB_NAME" ]; then
    log "Menghapus database '$DB_NAME' & user '$DB_USER'..."
    $MARIADB_CMD $DB_PASS_ARG -e "DROP DATABASE IF EXISTS \`$DB_NAME\`;" 2>/dev/null || true
    if [ -n "$DB_USER" ] && [ "$DB_USER" != "root" ]; then
        $MARIADB_CMD $DB_PASS_ARG -e "DROP USER IF EXISTS '$DB_USER'@'%';" 2>/dev/null || true
        $MARIADB_CMD $DB_PASS_ARG -e "DROP USER IF EXISTS '$DB_USER'@'localhost';" 2>/dev/null || true
    fi
    $MARIADB_CMD $DB_PASS_ARG -e "FLUSH PRIVILEGES;" 2>/dev/null || true
    success "Database '$DB_NAME' & user database '$DB_USER' berhasil dihapus."
else
    success "Database dipertahankan (sesuai permintaan)."
fi

# ── 8. Hapus Folder Aplikasi ──────────────────────────────────────────────────
echo -e "\n${BLUE}[5/6] Menghapus folder instalasi aplikasi...${NC}"
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
    success "Folder $TARGET_DIR berhasil dihapus sepenuhnya."
else
    warn "Folder $TARGET_DIR tidak ditemukan."
fi

# ── 9. Bersihkan File Log ─────────────────────────────────────────────────────
echo -e "\n${BLUE}[6/6] Pembersihan log file maintenance...${NC}"
rm -f "/var/log/cctv_monitoring_update.log"
rm -f "/var/log/cctv_monitoring_uninstall.log"
success "Log pemeliharaan sistem dibersihkan."

# ── Ringkasan Sukses ──────────────────────────────────────────────────────────
echo -e "\n${GREEN}================================================================${NC}"
echo -e "                 UNINSTALL BERHASIL & SELESAI                   "
echo -e "${GREEN}================================================================${NC}"
echo -e "  Mamura Stream CCTV Monitoring v$UNINSTALLED_VERSION telah dihapus dari server Anda."
echo -e "  - Folder instalasi dihapus."
echo -e "  - Service cctv-backend.service dihapus."
echo -e "  - Konfigurasi Apache VirtualHost dihapus."
if [ -n "$DB_BACKUP_FILE" ]; then
    echo -e "  - Database di-backup ke: ${CYAN}$DB_BACKUP_FILE${NC}"
fi
if [ "$DB_ACTION" = "drop" ]; then
    echo -e "  - Database & user database dihapus."
else
    echo -e "  - Database & user database tetap disimpan."
fi
echo -e "================================================================\n"

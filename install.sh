#!/bin/bash

# =============================================================================
# Mamura Stream — Automated Installation & Deployment (Debian 12)
# Diperbarui: Juli 2026
#
# Harus dijalankan sebagai root (sudo bash install.sh)
# Mendukung eksekusi dari direktori mana saja.
# Aligned with NetBackup installer structure and setup flows.
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

# Resolusi SCRIPT_DIR secara absolut
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# Lokasi rekaman — timpa dengan: RECORDINGS_DIR=/path bash install.sh
REC_DIR="${RECORDINGS_DIR:-/mnt/cctv-storage}"
if [ -z "$SCRIPT_DIR" ]; then
    SCRIPT_DIR="."
fi

# Tampilan Header Selamat Datang
clear
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}             MAMURA STREAM — AUTO-INSTALLER ENGINE              ${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "  OS Target     : Debian 12 (Bookworm)"
echo -e "  User Eksekusi : $(whoami)"
echo -e "  Direktori     : $SCRIPT_DIR"
echo -e "----------------------------------------------------------------"

# ── 1. Verifikasi Hak Akses Root ──────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Error: Harap jalankan script ini sebagai root (sudo bash install.sh)${NC}"
    exit 1
fi

# Resolusi Versi Rilis secara dinamis
get_code_version() {
    local base_dir="$1"
    local fallback="$2"
    
    # 1. Coba baca dari berkas VERSION
    if [ -f "$base_dir/VERSION" ]; then
        local v
        v="$(tr -d '\r\n' < "$base_dir/VERSION" | head -n1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
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

APP_VERSION="$(get_code_version "$SCRIPT_DIR" "1.0.0")"

# Memasang MediaMTX bila belum ada: unduh rilis, buat pengguna sistem,
# tulis config awal, daftarkan sebagai layanan systemd.
# Tanpa ini frontend berjalan tapi tidak ada video sama sekali.
install_mediamtx() {
    local ip="$1"
    local ver="${MEDIAMTX_VERSION:-v1.16.1}"
    local rec_dir="$REC_DIR/recordings"

    if command -v mediamtx >/dev/null 2>&1 || [ -x /usr/local/bin/mediamtx ]; then
        echo -e "  ${GREEN}✓${NC} MediaMTX sudah terpasang ($(/usr/local/bin/mediamtx --version 2>/dev/null | head -1))."
        return 0
    fi

    echo -e "\n${BLUE}>>> Memasang MediaMTX $ver...${NC}"

    # Arsitektur mesin -> nama berkas rilis
    local arch
    case "$(uname -m)" in
        x86_64)  arch="amd64" ;;
        aarch64) arch="arm64" ;;
        armv7l)  arch="armv7" ;;
        *)
            echo -e "  ${RED}✗ Arsitektur $(uname -m) tidak dikenali.${NC}"
            echo -e "    Pasang MediaMTX manual dari https://github.com/bluenviron/mediamtx/releases"
            return 1
            ;;
    esac

    local tarball="mediamtx_${ver}_linux_${arch}.tar.gz"
    local url="https://github.com/bluenviron/mediamtx/releases/download/${ver}/${tarball}"
    local tmp
    tmp="$(mktemp -d)"

    if ! curl -fsSL "$url" -o "$tmp/$tarball"; then
        echo -e "  ${RED}✗ Gagal mengunduh MediaMTX dari:${NC}"
        echo -e "    $url"
        rm -rf "$tmp"
        return 1
    fi

    tar -xzf "$tmp/$tarball" -C "$tmp"
    install -m 755 "$tmp/mediamtx" /usr/local/bin/mediamtx
    rm -rf "$tmp"
    echo -e "  ${GREEN}✓${NC} Biner terpasang di /usr/local/bin/mediamtx"

    # Pengguna sistem khusus — layanan tidak berjalan sebagai root
    id -u mediamtx >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mediamtx
    mkdir -p /etc/mediamtx /var/log/mediamtx "$rec_dir"
    chown -R mediamtx:mediamtx /var/log/mediamtx "$rec_dir" 2>/dev/null || true

    # Config awal. webrtcAddress diikat ke localhost: Apache mem-proxy /media/
    # ke sini, jadi jalan pintas langsung ke MediaMTX tertutup.
    if [ ! -f /etc/mediamtx/mediamtx.yml ]; then
        cat > /etc/mediamtx/mediamtx.yml <<MTXEOF
# MediaMTX — dibuat otomatis oleh install.sh
logLevel: info
logDestinations: [stdout]
logFile: /var/log/mediamtx/mediamtx.log

api: yes
apiAddress: 127.0.0.1:9997

metrics: yes
metricsAddress: 127.0.0.1:9998

playback: yes

rtspAddress: :8554
protocols: [tcp]

hlsAddress: :8888
hlsAlwaysRemux: yes
hlsSegmentCount: 3
hlsSegmentDuration: 1s
hlsAllowOrigin: "*"

# Port sinyal WebRTC sengaja hanya localhost (diproxy Apache lewat /media/).
# UDP 8189 di bawah HARUS tetap terbuka ke publik — itu jalur video ICE.
webrtcAddress: 127.0.0.1:8889
webrtcEncryption: no
webrtcAllowOrigin: "*"
webrtcLocalUDPAddress: :8189
webrtcICEHostNAT1To1IPs: [${ip}]

# Kamera ditambahkan lewat halaman System Admin, bukan di sini.
paths:
MTXEOF
        chown mediamtx:mediamtx /etc/mediamtx/mediamtx.yml
        echo -e "  ${GREEN}✓${NC} Config awal ditulis ke /etc/mediamtx/mediamtx.yml"
    else
        echo -e "  ${YELLOW}⚠${NC} /etc/mediamtx/mediamtx.yml sudah ada — tidak ditimpa."
    fi

    cat > /etc/systemd/system/mediamtx.service <<MTXSVC
[Unit]
Description=MediaMTX streaming server for CCTV Monitoring
After=network.target

[Service]
Type=simple
User=mediamtx
Group=mediamtx
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx/mediamtx.yml
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/mediamtx ${rec_dir}

[Install]
WantedBy=multi-user.target
MTXSVC

    systemctl daemon-reload
    systemctl enable mediamtx >/dev/null 2>&1
    systemctl restart mediamtx
    sleep 3

    if systemctl is-active --quiet mediamtx; then
        echo -e "  ${GREEN}✓${NC} Layanan mediamtx berjalan."
    else
        echo -e "  ${RED}✗ Layanan mediamtx gagal start. Periksa: journalctl -u mediamtx -n 30${NC}"
        return 1
    fi
}

# Fungsi mengonfigurasi NAT 1-to-1 IP dan STUN di MediaMTX secara otomatis
configure_mediamtx() {
    local ip="$1"
    local config_files=("/etc/mediamtx/mediamtx.yml" "/usr/local/etc/mediamtx.yml" "/etc/mediamtx.yml" "/opt/mediamtx/mediamtx.yml")
    local found=0
    
    for conf in "${config_files[@]}"; do
        if [ -f "$conf" ]; then
            echo -e "\n${BLUE}>>> Mengonfigurasi MediaMTX di $conf...${NC}"
            
            # Backup config
            cp "$conf" "${conf}.bak"
            
            # Ganti webrtcICEHostNAT1To1IPs
            if grep -q "^#\?webrtcICEHostNAT1To1IPs:" "$conf"; then
                sed -i "s|^#\?webrtcICEHostNAT1To1IPs:.*|webrtcICEHostNAT1To1IPs: [$ip]|g" "$conf"
            else
                echo "webrtcICEHostNAT1To1IPs: [$ip]" >> "$conf"
            fi
            
            # Ganti webrtcICEServers
            if grep -q "^#\?webrtcICEServers:" "$conf"; then
                sed -i "s|^#\?webrtcICEServers:.*|webrtcICEServers: [stun:stun.l.google.com:19302]|g" "$conf"
            else
                echo "webrtcICEServers: [stun:stun.l.google.com:19302]" >> "$conf"
            fi
            
            # Restart mediamtx service
            if systemctl is-active --quiet mediamtx 2>/dev/null; then
                systemctl restart mediamtx
                echo -e "  ${GREEN}✓${NC} Layanan mediamtx berhasil di-restart."
            elif systemctl is-active --quiet mediamtx.service 2>/dev/null; then
                systemctl restart mediamtx.service
                echo -e "  ${GREEN}✓${NC} Layanan mediamtx.service berhasil di-restart."
            fi
            
            echo -e "  ${GREEN}✓${NC} Konfigurasi MediaMTX diperbarui dengan IP Publik: $ip"
            found=1
            break
        fi
    done
    
    if [ "$found" -eq 0 ]; then
        echo -e "  ${YELLOW}⚠ Berkas konfigurasi MediaMTX tidak ditemukan secara otomatis.${NC}"
        echo -e "    Harap tambahkan 'webrtcICEHostNAT1To1IPs: [$ip]' di mediamtx.yml Anda secara manual."
    fi
}

# ── Deteksi IP Publik di Awal secara otomatis ─────────────────────────────────
echo -e "${BLUE}>>> Mendeteksi IP Publik server secara otomatis...${NC}"
DETECTED_IP=""
if command -v python3 &>/dev/null; then
    DETECTED_IP=$(python3 -c "
import urllib.request
for url in ['https://icanhazip.com', 'https://api.ipify.org', 'https://ifconfig.me']:
    try:
        print(urllib.request.urlopen(url, timeout=3).read().decode('utf-8').strip())
        break
    except:
        pass
" 2>/dev/null)
fi

if [ -z "$DETECTED_IP" ] && command -v curl &>/dev/null; then
    DETECTED_IP=$(curl -s --max-time 3 icanhazip.com || curl -s --max-time 3 ifconfig.me || curl -s --max-time 3 api.ipify.org || echo "")
fi

if [ -z "$DETECTED_IP" ] && command -v wget &>/dev/null; then
    DETECTED_IP=$(wget -qO- --timeout=3 https://icanhazip.com || wget -qO- --timeout=3 https://ifconfig.me || echo "")
fi

DETECTED_IP=$(echo "$DETECTED_IP" | xargs)

if [[ "$DETECTED_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "  ${GREEN}✓${NC} IP Publik Terdeteksi: ${CYAN}$DETECTED_IP${NC}"
else
    DETECTED_IP=""
    echo -e "  ${YELLOW}⚠ Gagal mendeteksi IP Publik secara otomatis.${NC}"
fi
echo -e "----------------------------------------------------------------"

# ── Deteksi & Pilihan Backup Database Terlebih Dahulu ────────────────────────
BACKUP_FILES=()
if [ -d "/var/backups/cctv-monitoring" ]; then
    while IFS= read -r file; do
        [ -f "$file" ] && BACKUP_FILES+=("$file")
    done < <(find "/var/backups/cctv-monitoring" -maxdepth 1 -name "*.sql" -type f | sort -r)
fi

SELECTED_BACKUP=""
if [ ${#BACKUP_FILES[@]} -gt 0 ]; then
    echo -e "${YELLOW}>>> Ditemukan berkas backup database di /var/backups/cctv-monitoring:${NC}"
    echo "    0) Gunakan skema database baru (Default / Instalasi Baru)"
    for i in "${!BACKUP_FILES[@]}"; do
        echo "    $((i+1))) $(basename "${BACKUP_FILES[$i]}")"
    done
    echo ""
    while true; do
        read -p "  Pilih file backup untuk dipulihkan [0]: " BACKUP_CHOICE
        [ -z "$BACKUP_CHOICE" ] && BACKUP_CHOICE=0
        if [ "$BACKUP_CHOICE" -eq 0 ]; then
            break
        elif [[ "$BACKUP_CHOICE" =~ ^[0-9]+$ ]] && [ "$BACKUP_CHOICE" -le ${#BACKUP_FILES[@]} ]; then
            SELECTED_BACKUP="${BACKUP_FILES[$((BACKUP_CHOICE-1))]}"
            echo -e "  ${GREEN}✓${NC} Berkas backup terpilih: $(basename "$SELECTED_BACKUP")"
            break
        else
            echo -e "  ${RED}✗ Pilihan tidak valid!${NC}"
        fi
    done
    echo ""
fi

# ── 2. Formulir Konfigurasi Interaktif ─────────────────────────────────────────
echo -e "${BLUE}>>> Langkah 1: Pengaturan Database (MySQL / MariaDB)${NC}"

read -p "  Masukkan host database [default: localhost]: " DB_HOST
[ -z "$DB_HOST" ] && DB_HOST="localhost"

while true; do
    read -p "  Masukkan port database [default: 3306]: " DB_PORT
    [ -z "$DB_PORT" ] && DB_PORT="3306"
    if [[ "$DB_PORT" =~ ^[0-9]+$ ]] && [ "$DB_PORT" -ge 1 ] && [ "$DB_PORT" -le 65535 ]; then
        break
    else
        echo -e "  ${RED}✗ Port tidak valid! Masukkan angka antara 1 s.d 65535.${NC}"
    fi
done

read -p "  Masukkan nama database [default: cctv_monitoring]: " DB_NAME
[ -z "$DB_NAME" ] && DB_NAME="cctv_monitoring"

read -p "  Masukkan username database [default: cctv_user]: " DB_USER
[ -z "$DB_USER" ] && DB_USER="cctv_user"

echo -n "  Masukkan password database [kosongkan untuk generate acak]: "
read -s DB_PASS_INPUT
echo
if [ -z "$DB_PASS_INPUT" ]; then
    DB_PASS=$(openssl rand -hex 16)
else
    DB_PASS="$DB_PASS_INPUT"
fi

# Mengatur CLI mariadb root access
if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    DB_USER_HOST="localhost"
    MARIADB_CMD="mariadb -u root"
else
    DB_USER_HOST="%"
    MARIADB_CMD="mariadb -h $DB_HOST -P $DB_PORT -u root"
fi

# Uji akses root MySQL
DB_PASS_ARG=""
if command -v mariadb &>/dev/null; then
    systemctl start mariadb &>/dev/null
    for i in {1..5}; do
        mariadb-admin ping &>/dev/null && break
        sleep 0.5
    done
    
    if ! $MARIADB_CMD -e "SELECT 1" < /dev/null &>/dev/null; then
        echo -e "  ${YELLOW}* Koneksi MariaDB root memerlukan password.${NC}"
        echo -n "  Masukkan password root MariaDB/MySQL Anda: "
        read -s DB_ROOT_PASS
        echo
        [ -n "$DB_ROOT_PASS" ] && DB_PASS_ARG="-p${DB_ROOT_PASS}"
    fi
fi

echo -e "\n${BLUE}>>> Langkah 2: Akun Administrator Aplikasi Web${NC}"
while true; do
    read -p "  Tentukan username admin web [default: admin]: " APP_ADMIN_USER
    [ -z "$APP_ADMIN_USER" ] && APP_ADMIN_USER="admin"
    if [[ "$APP_ADMIN_USER" =~ ^[a-zA-Z0-9_]{3,20}$ ]]; then
        break
    else
        echo -e "  ${RED}✗ Username tidak valid! (3-20 karakter alfanumerik / underscore).${NC}"
    fi
done

APP_ADMIN_PASS=""
while [ -z "$APP_ADMIN_PASS" ]; do
    echo -n "  Tentukan password admin web [tidak boleh kosong]: "
    read -s APP_ADMIN_PASS
    echo
done

echo -e "\n${BLUE}>>> Langkah 3: Pengaturan Nama Domain / Alamat Server${NC}"
echo "  Nama domain ini menentukan:"
echo "  1) Target folder web  -> /var/www/nama_domain"
echo "  2) Nama config Apache -> /etc/apache2/sites-available/nama_domain.conf"
echo ""
while true; do
    read -p "  Masukkan Nama Domain Anda: " SERVER_DOMAIN
    [ -z "$SERVER_DOMAIN" ] && SERVER_DOMAIN="localhost"
    SERVER_DOMAIN=$(echo "$SERVER_DOMAIN" | sed 's/\.*$//g' | xargs)
    if [[ "$SERVER_DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]; then
        break
    else
        echo -e "  ${RED}✗ Domain tidak valid! Gunakan format domain standar (tanpa http:// atau /).${NC}"
    fi
done

# Menentukan lokasi folder tujuan target
if [ -z "$SERVER_DOMAIN" ] || [ "$SERVER_DOMAIN" = "localhost" ]; then
    CONF_NAME="cctv-monitoring"
    TARGET_DIR="/var/www/cctv-monitoring"
else
    CONF_NAME="$SERVER_DOMAIN"
    TARGET_DIR="/var/www/$SERVER_DOMAIN"
fi

echo -e "\n${BLUE}>>> Langkah 4: Konfigurasi Port Web Server (Apache)${NC}"
while true; do
    read -p "  Masukkan port HTTP [default: 80]: " HTTP_PORT
    [ -z "$HTTP_PORT" ] && HTTP_PORT="80"
    if [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ]; then
        break
    else
        echo -e "  ${RED}✗ Port tidak valid!${NC}"
    fi
done

# Deteksi port HTTPS
while true; do
    read -p "  Masukkan port HTTPS [default: 443]: " HTTPS_PORT
    [ -z "$HTTPS_PORT" ] && HTTPS_PORT="443"
    if [[ "$HTTPS_PORT" =~ ^[0-9]+$ ]] && [ "$HTTPS_PORT" -ge 1 ] && [ "$HTTPS_PORT" -le 65535 ]; then
        if [ "$HTTPS_PORT" -eq "$HTTP_PORT" ]; then
            echo -e "  ${RED}✗ Port HTTPS tidak boleh sama dengan port HTTP!${NC}"
        else
            break
        fi
    else
        echo -e "  ${RED}✗ Port tidak valid!${NC}"
    fi
done

# NetBackup-style SSL configuration options
echo -e "\n${BLUE}>>> Langkah 5: SSL (HTTPS) Configuration${NC}"
echo "  1) HTTP saja (tanpa SSL)"
echo "  2) Let's Encrypt (certbot — domain harus mengarah ke server ini)"
echo "  3) Self-signed (development / intranet)"
echo "  4) Sertifikat manual (path file .crt / .key)"
echo ""
while true; do
    read -p "  Pilih opsi SSL [1]: " SSL_CHOICE
    [ -z "$SSL_CHOICE" ] && SSL_CHOICE=1
    if [[ "$SSL_CHOICE" =~ ^[1-4]$ ]]; then
        break
    else
        echo -e "  ${RED}✗ Pilihan tidak valid! Masukkan angka antara 1 s.d 4.${NC}"
    fi
done

SSL_MODE="none"
SSL_EMAIL=""
SSL_CERT=""
SSL_KEY=""

case "$SSL_CHOICE" in
    2)
        SSL_MODE="letsencrypt"
        while true; do
            read -p "  Masukkan alamat email untuk registrasi Let's Encrypt: " SSL_EMAIL
            if [[ "$SSL_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
                break
            else
                echo -e "  ${RED}✗ Format email tidak valid!${NC}"
            fi
        done
        ;;
    3)
        SSL_MODE="selfsigned"
        ;;
    4)
        SSL_MODE="manual"
        while true; do
            read -p "  Masukkan path berkas sertifikat SSL (.crt / .pem): " SSL_CERT
            if [ -f "$SSL_CERT" ]; then
                break
            else
                echo -e "  ${RED}✗ Berkas tidak ditemukan!${NC}"
            fi
        done
        while true; do
            read -p "  Masukkan path berkas private key SSL (.key): " SSL_KEY
            if [ -f "$SSL_KEY" ]; then
                break
            else
                echo -e "  ${RED}✗ Berkas tidak ditemukan!${NC}"
            fi
        done
        ;;
    *)
        SSL_MODE="none"
        ;;
esac

# Tentukan protokol dasar URL untuk PUBLIC_BASE_URL
if [ "$SSL_MODE" != "none" ]; then
    PUBLIC_BASE_URL="https://$SERVER_DOMAIN"
else
    PUBLIC_BASE_URL="http://$SERVER_DOMAIN"
fi

# ── Langkah 6: Konfigurasi IP Publik ─────────────────────────────────────────
echo -e "\n${BLUE}>>> Langkah 6: Konfigurasi IP Publik (Wajib untuk WebRTC)${NC}"

if [ -n "$DETECTED_IP" ]; then
    read -p "  Masukkan IP Publik Server [default: $DETECTED_IP]: " USER_IP
    PUBLIC_IP="${USER_IP:-$DETECTED_IP}"
else
    while true; do
        read -p "  Masukkan IP Publik Server secara manual: " USER_IP
        if [[ "$USER_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            PUBLIC_IP="$USER_IP"
            break
        else
            echo -e "  ${RED}✗ Format IP tidak valid! Masukkan format IPv4 standar.${NC}"
        fi
    done
fi
echo -e "  ${GREEN}✓${NC} Menggunakan IP Publik: ${GREEN}$PUBLIC_IP${NC}"

# Ringkasan Konfigurasi untuk Konfirmasi User
echo -e "\n${CYAN}================================================================${NC}"
echo -e "                 RINGKASAN KONFIGURASI INSTALASI                "
echo -e "${CYAN}================================================================${NC}"
echo -e "  Direktori Target : ${GREEN}$TARGET_DIR${NC}"
echo -e "  ServerName/Domain: ${GREEN}$SERVER_DOMAIN${NC}"
echo -e "  Port HTTP/HTTPS  : ${GREEN}$HTTP_PORT / $HTTPS_PORT${NC}"
echo -e "  IP Publik Server : ${GREEN}$PUBLIC_IP${NC}"
echo -e "  SSL Mode         : ${GREEN}$SSL_MODE${NC}"
echo -e "  URL Publik       : ${GREEN}$PUBLIC_BASE_URL${NC}"
echo -e "  Database Name    : ${GREEN}$DB_NAME${NC}"
echo -e "  Database User    : ${GREEN}$DB_USER${NC}"
echo -e "  Web Admin Login  : ${GREEN}$APP_ADMIN_USER${NC}"
if [ -n "$SELECTED_BACKUP" ]; then
    echo -e "  Database Restore : ${GREEN}(Backup) $(basename "$SELECTED_BACKUP")${NC}"
else
    echo -e "  Database Restore : ${GREEN}Skema Baru (Bersih)${NC}"
fi
echo -e "----------------------------------------------------------------"
while true; do
    read -p "  Apakah data konfigurasi di atas sudah benar? (y/n) [default: y]: " CONFIRM_OK
    [ -z "$CONFIRM_OK" ] && CONFIRM_OK="y"
    if [[ "$CONFIRM_OK" =~ ^[yY]$ ]]; then
        break
    elif [[ "$CONFIRM_OK" =~ ^[nN]$ ]]; then
        echo -e "${YELLOW}Instalasi dibatalkan oleh pengguna.${NC}"
        exit 0
    fi
done

# Memulai instalasi
echo -e "\n${GREEN}✔ Konfigurasi dikonfirmasi. Memulai proses instalasi...${NC}\n"

# ── 3. Update Paket & Install Dependensi ─────────────────────────────────────
echo -e "${BLUE}[1/8] Memperbarui indeks paket sistem (apt update)...${NC}"
apt-get update -y -qq

echo -e "\n${BLUE}[2/8] Menginstal dependensi sistem yang dibutuhkan...${NC}"
INSTALL_PKGS="apache2 libapache2-mod-php php8.2 php8.2-cli php8.2-mysql php8.2-curl mariadb-server mariadb-client openssl python3 python3-pip python3-venv ffmpeg curl"
if [ "$SSL_MODE" = "letsencrypt" ]; then
    INSTALL_PKGS="$INSTALL_PKGS certbot python3-certbot-apache"
fi
apt-get install -y $INSTALL_PKGS

# ── 4. Jalankan MariaDB & Konfigurasi ──────────────────────────────────────────
echo -e "\n${BLUE}[3/8] Memulai dan mengonfigurasi layanan MariaDB...${NC}"
systemctl start mariadb
systemctl enable mariadb
for i in {1..10}; do
    $MARIADB_CMD $DB_PASS_ARG -e "SELECT 1" &>/dev/null && break
    sleep 0.5
done

# ── 5. Import / Restore Database & Create User ────────────────────────────────
echo -e "\n${BLUE}[4/8] Mengimpor skema database / memulihkan backup...${NC}"

# Buat database jika belum ada
$MARIADB_CMD $DB_PASS_ARG -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if [ -n "$SELECTED_BACKUP" ]; then
    echo -e "  Memulihkan database dari backup: ${CYAN}$(basename "$SELECTED_BACKUP")${NC}..."
    if $MARIADB_CMD $DB_PASS_ARG "$DB_NAME" < "$SELECTED_BACKUP"; then
        echo -e "  ${GREEN}✓${NC} Database '$DB_NAME' berhasil dipulihkan dari backup!"
    else
        echo -e "  ${RED}✗ Error: Gagal memulihkan database dari backup!${NC}"
        exit 1
    fi
else
    if [ -f "$SCRIPT_DIR/database/schema.sql" ]; then
        sed "s/cctv_monitoring/$DB_NAME/g" "$SCRIPT_DIR/database/schema.sql" > temp_database.sql
        if $MARIADB_CMD $DB_PASS_ARG < temp_database.sql; then
            echo -e "  ${GREEN}✓${NC} Database '$DB_NAME' berhasil diimpor dengan skema baru."
        else
            echo -e "  ${RED}✗ Error: Gagal mengimpor skema database baru!${NC}"
            rm -f temp_database.sql
            exit 1
        fi
        rm -f temp_database.sql
    else
        echo -e "${RED}✗ Error: File database/schema.sql tidak ditemukan!${NC}"
        exit 1
    fi
fi

# Konfigurasi User khusus database
$MARIADB_CMD $DB_PASS_ARG -e "CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';"
$MARIADB_CMD $DB_PASS_ARG -e "ALTER USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';"
$MARIADB_CMD $DB_PASS_ARG -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'%';"
$MARIADB_CMD $DB_PASS_ARG -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
$MARIADB_CMD $DB_PASS_ARG -e "ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
$MARIADB_CMD $DB_PASS_ARG -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';"
$MARIADB_CMD $DB_PASS_ARG -e "FLUSH PRIVILEGES;"
echo -e "  ${GREEN}✓${NC} User database khusus '$DB_USER' berhasil dikonfigurasi."

# ── 6. Salin Kode Aplikasi (Safe Cleanup if Reinstalling) ─────────────────────
echo -e "\n${BLUE}[5/8] Menyalin codebase proyek ke $TARGET_DIR...${NC}"
# Bersihkan target dir terlebih dahulu secara aman (kecuali data penting)
if [ -d "$TARGET_DIR" ] && [ "$(ls -A "$TARGET_DIR" 2>/dev/null)" ]; then
    echo "  Folder target sudah ada, membersihkan konten lama secara aman..."
    rm -rf "$TARGET_DIR/frontend"
    rm -rf "$TARGET_DIR/database"
    if [ -d "$TARGET_DIR/backend" ]; then
        find "$TARGET_DIR/backend" -mindepth 1 -maxdepth 1 ! -name 'venv' ! -name 'cctv_monitoring.db' ! -name 'static' -exec rm -rf {} +
    fi
else
    mkdir -p "$TARGET_DIR"
fi

mkdir -p "$TARGET_DIR/frontend"
mkdir -p "$TARGET_DIR/database"
mkdir -p "$TARGET_DIR/backend"

# Copy dari SCRIPT_DIR
cp -r "$SCRIPT_DIR/frontend"/* "$TARGET_DIR/frontend/"
cp -r "$SCRIPT_DIR/database"/* "$TARGET_DIR/database/"
cp -r "$SCRIPT_DIR/backend"/* "$TARGET_DIR/backend/" 2>/dev/null || true
cp -v "$SCRIPT_DIR/install.sh" "$TARGET_DIR/" 2>/dev/null || true
cp -v "$SCRIPT_DIR/update.sh" "$TARGET_DIR/" 2>/dev/null || true

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
echo -e "  ${GREEN}✓${NC} Copy codebase sukses."

# ── 7. Build Python Virtual Environment ───────────────────────────────────────
echo -e "\n${BLUE}[6/8] Membangun Python Virtual Environment & dependensi...${NC}"
python3 -m venv "$TARGET_DIR/backend/venv"
"$TARGET_DIR/backend/venv/bin/pip" install --upgrade pip -q
"$TARGET_DIR/backend/venv/bin/pip" install -r "$TARGET_DIR/backend/requirements.txt" -q --no-warn-script-location
echo -e "  ${GREEN}✓${NC} Python venv berhasil dikonfigurasi."

# ── 8. Registrasi User Admin Aplikasi Web ──────────────────────────────────────
echo -e "\n${BLUE}[7/8] Mendaftarkan kredensial administrator web...${NC}"
export APP_ADMIN_PASS
HASHED_PASS=$(php -r "echo password_hash(getenv('APP_ADMIN_PASS'), PASSWORD_BCRYPT);")
unset APP_ADMIN_PASS

if [ -z "$HASHED_PASS" ]; then
    echo -e "${RED}✗ Error: Gagal mengenkripsi kata sandi menggunakan PHP!${NC}"
    exit 1
fi

$MARIADB_CMD $DB_PASS_ARG <<EOF
USE $DB_NAME;
INSERT INTO users (username, password_hash, role) VALUES ('$APP_ADMIN_USER', '$HASHED_PASS', 'admin')
ON DUPLICATE KEY UPDATE password_hash='$HASHED_PASS';
EOF
echo -e "  ${GREEN}✓${NC} Akun admin '$APP_ADMIN_USER' berhasil didaftarkan."

# ── 9. Konfigurasi Apache, Hosts, & Systemd Backend Service ───────────────────
echo -e "\n${BLUE}[8/8] Memasang cctv-backend.service & konfigurasi Apache VirtualHost...${NC}"
echo "$APP_VERSION" > "$TARGET_DIR/VERSION"

# Registrasi domain ke /etc/hosts jika belum terdaftar untuk loopback local resolution
if ! grep -q -E "\s$SERVER_DOMAIN(\s|$)" /etc/hosts; then
    echo "127.0.0.1 $SERVER_DOMAIN" >> /etc/hosts
    echo -e "  ${GREEN}✓${NC} Domain $SERVER_DOMAIN didaftarkan ke /etc/hosts"
fi

JWT_SECRET_GEN=$(openssl rand -hex 32)
cat <<EOT > /etc/systemd/system/cctv-backend.service
[Unit]
Description=Mamura Stream CCTV Backend Service
After=network.target mysql.service mariadb.service

[Service]
User=www-data
WorkingDirectory=$TARGET_DIR/backend
Environment="DB_HOST=$DB_HOST"
Environment="DB_PORT=$DB_PORT"
Environment="DB_USER=$DB_USER"
Environment="DB_PASS=$DB_PASS"
Environment="DB_NAME=$DB_NAME"
Environment="JWT_SECRET=$JWT_SECRET_GEN"
Environment="PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
ExecStart=$TARGET_DIR/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOT

systemctl daemon-reload
systemctl enable cctv-backend.service
systemctl restart cctv-backend.service

# Konfigurasi Apache VirtualHost & Modules
a2enmod ssl proxy proxy_http rewrite headers &>/dev/null

if ! grep -q "Listen $HTTP_PORT" /etc/apache2/ports.conf; then
    echo "Listen $HTTP_PORT" >> /etc/apache2/ports.conf
fi
if [ "$SSL_MODE" != "none" ]; then
    if ! grep -q "Listen $HTTPS_PORT" /etc/apache2/ports.conf; then
        echo "Listen $HTTPS_PORT" >> /etc/apache2/ports.conf
    fi
fi

# Membangun file konfigurasi Apache berdasarkan pilihan SSL
case "$SSL_MODE" in
    letsencrypt)
        # Menulis VirtualHost HTTP terlebih dahulu
        cat <<EOT > "/etc/apache2/sites-available/$CONF_NAME.conf"
<VirtualHost *:$HTTP_PORT>
    ServerName $SERVER_DOMAIN
    DocumentRoot $TARGET_DIR/frontend
    Alias /frontend $TARGET_DIR/frontend

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8000/api
    ProxyPassReverse /api http://127.0.0.1:8000/api
    ProxyPass /static http://127.0.0.1:8000/static
    ProxyPassReverse /static http://127.0.0.1:8000/static
    ProxyPass /media/ http://127.0.0.1:8889/
    ProxyPassReverse /media/ http://127.0.0.1:8889/

    <Directory $TARGET_DIR/frontend>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${CONF_NAME}_error.log
    CustomLog \${APACHE_LOG_DIR}/${CONF_NAME}_access.log combined
</VirtualHost>
EOT
        a2ensite "$CONF_NAME.conf" &>/dev/null
        systemctl restart apache2
        
        echo "  Mendapatkan sertifikat Let's Encrypt SSL tepercaya..."
        if certbot certonly --standalone --non-interactive --agree-tos --email "$SSL_EMAIL" -d "$SERVER_DOMAIN"; then
            SSL_CERT_FILE="/etc/letsencrypt/live/$SERVER_DOMAIN/fullchain.pem"
            SSL_KEY_FILE="/etc/letsencrypt/live/$SERVER_DOMAIN/privkey.pem"
            
            # Ganti config dengan konfigurasi lengkap SSL
            cat <<EOT > "/etc/apache2/sites-available/$CONF_NAME.conf"
<VirtualHost *:$HTTP_PORT>
    ServerName $SERVER_DOMAIN
    Redirect permanent / https://$SERVER_DOMAIN/
</VirtualHost>

<VirtualHost *:$HTTPS_PORT>
    ServerName $SERVER_DOMAIN
    DocumentRoot $TARGET_DIR/frontend
    Alias /frontend $TARGET_DIR/frontend

    SSLEngine on
    SSLCertificateFile $SSL_CERT_FILE
    SSLCertificateKeyFile $SSL_KEY_FILE

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8000/api
    ProxyPassReverse /api http://127.0.0.1:8000/api
    ProxyPass /static http://127.0.0.1:8000/static
    ProxyPassReverse /static http://127.0.0.1:8000/static
    ProxyPass /media/ http://127.0.0.1:8889/
    ProxyPassReverse /media/ http://127.0.0.1:8889/

    <Directory $TARGET_DIR/frontend>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${CONF_NAME}_ssl_error.log
    CustomLog \${APACHE_LOG_DIR}/${CONF_NAME}_ssl_access.log combined
</VirtualHost>
EOT
        else
            warn "Pendaftaran Let's Encrypt gagal. Server berjalan pada HTTP saja."
        fi
        ;;
    selfsigned)
        mkdir -p /etc/ssl/private /etc/ssl/certs
        SSL_CERT_FILE="/etc/ssl/certs/cctv-selfsigned.crt"
        SSL_KEY_FILE="/etc/ssl/private/cctv-selfsigned.key"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout "$SSL_KEY_FILE" \
          -out "$SSL_CERT_FILE" \
          -subj "/CN=$SERVER_DOMAIN" &>/dev/null
          
        cat <<EOT > "/etc/apache2/sites-available/$CONF_NAME.conf"
<VirtualHost *:$HTTP_PORT>
    ServerName $SERVER_DOMAIN
    Redirect permanent / https://$SERVER_DOMAIN/
</VirtualHost>

<VirtualHost *:$HTTPS_PORT>
    ServerName $SERVER_DOMAIN
    DocumentRoot $TARGET_DIR/frontend
    Alias /frontend $TARGET_DIR/frontend

    SSLEngine on
    SSLCertificateFile $SSL_CERT_FILE
    SSLCertificateKeyFile $SSL_KEY_FILE

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8000/api
    ProxyPassReverse /api http://127.0.0.1:8000/api
    ProxyPass /static http://127.0.0.1:8000/static
    ProxyPassReverse /static http://127.0.0.1:8000/static
    ProxyPass /media/ http://127.0.0.1:8889/
    ProxyPassReverse /media/ http://127.0.0.1:8889/

    <Directory $TARGET_DIR/frontend>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${CONF_NAME}_ssl_error.log
    CustomLog \${APACHE_LOG_DIR}/${CONF_NAME}_ssl_access.log combined
</VirtualHost>
EOT
        ;;
    manual)
        cat <<EOT > "/etc/apache2/sites-available/$CONF_NAME.conf"
<VirtualHost *:$HTTP_PORT>
    ServerName $SERVER_DOMAIN
    Redirect permanent / https://$SERVER_DOMAIN/
</VirtualHost>

<VirtualHost *:$HTTPS_PORT>
    ServerName $SERVER_DOMAIN
    DocumentRoot $TARGET_DIR/frontend
    Alias /frontend $TARGET_DIR/frontend

    SSLEngine on
    SSLCertificateFile $SSL_CERT
    SSLCertificateKeyFile $SSL_KEY

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8000/api
    ProxyPassReverse /api http://127.0.0.1:8000/api
    ProxyPass /static http://127.0.0.1:8000/static
    ProxyPassReverse /static http://127.0.0.1:8000/static
    ProxyPass /media/ http://127.0.0.1:8889/
    ProxyPassReverse /media/ http://127.0.0.1:8889/

    <Directory $TARGET_DIR/frontend>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${CONF_NAME}_ssl_error.log
    CustomLog \${APACHE_LOG_DIR}/${CONF_NAME}_ssl_access.log combined
</VirtualHost>
EOT
        ;;
    *)
        cat <<EOT > "/etc/apache2/sites-available/$CONF_NAME.conf"
<VirtualHost *:$HTTP_PORT>
    ServerName $SERVER_DOMAIN
    DocumentRoot $TARGET_DIR/frontend
    Alias /frontend $TARGET_DIR/frontend

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8000/api
    ProxyPassReverse /api http://127.0.0.1:8000/api
    ProxyPass /static http://127.0.0.1:8000/static
    ProxyPassReverse /static http://127.0.0.1:8000/static
    ProxyPass /media/ http://127.0.0.1:8889/
    ProxyPassReverse /media/ http://127.0.0.1:8889/

    <Directory $TARGET_DIR/frontend>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${CONF_NAME}_error.log
    CustomLog \${APACHE_LOG_DIR}/${CONF_NAME}_access.log combined
</VirtualHost>
EOT
        ;;
esac

a2ensite "$CONF_NAME.conf" &>/dev/null
chown -R www-data:www-data "$TARGET_DIR"
systemctl restart apache2

# Konfigurasi NAT IP dan STUN MediaMTX secara otomatis
MEDIAMTX_OK=1
install_mediamtx "$PUBLIC_IP" || MEDIAMTX_OK=0
configure_mediamtx "$PUBLIC_IP" || true

# ── Ringkasan Hasil Instalasi Sukses ──────────────────────────────────────────
echo -e "\n${GREEN}================================================================${NC}"
echo -e "                   INSTALASI SELESAI & SUKSES                   "
echo -e "${GREEN}================================================================${NC}"
if [ "$MEDIAMTX_OK" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠ PERHATIAN: MediaMTX gagal dipasang.${NC}"
    echo -e "    Web berjalan, tetapi TIDAK ADA VIDEO sampai MediaMTX terpasang."
    echo -e "    Pasang manual: https://github.com/bluenviron/mediamtx/releases"
    echo -e "    Lalu jalankan ulang: ${GREEN}sudo bash install.sh${NC}\n"
fi
echo -e "  Direktori Proyek : $TARGET_DIR"
echo -e "  Versi Terpasang  : v$APP_VERSION"
echo -e "  Database Aplikasi: $DB_NAME"
echo -e "  User Database    : $DB_USER"
echo -e "  Kata Sandi DB    : ${GREEN}$DB_PASS${NC}"
echo -e "----------------------------------------------------------------"
echo -e "  Login Admin Web  : ${BLUE}$APP_ADMIN_USER${NC}"
echo -e "  Kata Sandi Admin : [Telah Anda atur sendiri]"
echo -e "----------------------------------------------------------------"
echo -e "  Aplikasi Aktif di:"
echo -e "    - HTTP  : ${CYAN}http://$SERVER_DOMAIN:$HTTP_PORT${NC}"
if [ "$SSL_MODE" != "none" ]; then
    echo -e "    - HTTPS : ${CYAN}https://$SERVER_DOMAIN:$HTTPS_PORT${NC} (Rekomendasi)"
fi
echo -e "================================================================"

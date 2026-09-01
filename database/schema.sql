-- CCTV Streaming Portal DB Schema
-- Target Database: MySQL / MariaDB

CREATE DATABASE IF NOT EXISTS cctv_monitoring;
USE cctv_monitoring;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user', 'guest') NOT NULL DEFAULT 'guest',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. CCTV Streams Table
CREATE TABLE IF NOT EXISTS cctv_streams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rtsp_url VARCHAR(255) NOT NULL,
    group_name VARCHAR(50) NOT NULL DEFAULT 'Default',
    coordinates VARCHAR(100) NULL DEFAULT '',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    record_enabled TINYINT(1) NOT NULL DEFAULT 0,
    record_path VARCHAR(255) DEFAULT NULL,
    record_disk VARCHAR(50) DEFAULT NULL,
    record_retention_days INT DEFAULT 7,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Many-to-Many Pivot Table for Stream Access Control
CREATE TABLE IF NOT EXISTS user_cctv_access (
    user_id INT NOT NULL,
    stream_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, stream_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (stream_id) REFERENCES cctv_streams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Data
-- Note: The administrator account is dynamically created by the installer script.
-- Regular users and guest users should be created via the web admin panel.

-- Seed CCTV Streams
INSERT INTO cctv_streams (name, rtsp_url, is_active) VALUES 
('Front Gate Camera', 'rtsp://admin:gatepass@192.168.1.100:554/h264Preview_01_main', 1),
('Main Lobby Camera', 'rtsp://admin:lobbypass@192.168.1.101:554/h264Preview_01_main', 1),
('Parking Lot Area A', 'rtsp://admin:parkpass@192.168.1.102:554/h264Preview_01_main', 1),
('Server Room Camera', 'rtsp://admin:serverpass@192.168.1.103:554/h264Preview_01_main', 1)
ON DUPLICATE KEY UPDATE id=id;

-- 4. Ad Configuration Table
CREATE TABLE IF NOT EXISTS ad_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_url VARCHAR(255) NULL,
    marquee_text TEXT NULL,
    bg_color VARCHAR(20) NULL DEFAULT '#1e293b',
    text_color VARCHAR(20) NULL DEFAULT '#ffffff',
    scroll_speed INT NOT NULL DEFAULT 5,
    font_size INT NOT NULL DEFAULT 10,
    font_family VARCHAR(50) NULL DEFAULT 'monospace',
    image_opacity FLOAT NOT NULL DEFAULT 1.0,
    bg_opacity FLOAT NOT NULL DEFAULT 1.0,
    text_opacity FLOAT NOT NULL DEFAULT 1.0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    record_enabled TINYINT(1) NOT NULL DEFAULT 0,
    record_path VARCHAR(255) DEFAULT NULL,
    record_disk VARCHAR(50) DEFAULT NULL,
    record_retention_days INT DEFAULT 7,
    box_width INT NOT NULL DEFAULT 100,
    text_align VARCHAR(10) NOT NULL DEFAULT 'left',
    image_height INT NOT NULL DEFAULT 20,
    embed_timeout_seconds INT NOT NULL DEFAULT 300,
    click_to_play TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Ad Configuration (default values)
INSERT INTO ad_config (id, image_url, marquee_text, bg_color, text_color, scroll_speed, font_size, font_family, image_opacity, bg_opacity, text_opacity, is_active, embed_timeout_seconds, click_to_play)
VALUES (1, '', 'Selamat Datang di Portal Monitoring CCTV. Hubungi Admin untuk info lebih lanjut.', '#1e293b', '#ffffff', 5, 10, 'monospace', 1.0, 1.0, 1.0, 1, 300, 1)
ON DUPLICATE KEY UPDATE id=id;

-- 5. API Keys Table for External Integrations
CREATE TABLE IF NOT EXISTS api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_value VARCHAR(64) UNIQUE NOT NULL,
    camera_id INT NOT NULL,
    client_name VARCHAR(100) NOT NULL,
    allowed_domain VARCHAR(255) NULL,
    secret_pass VARCHAR(100) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    record_enabled TINYINT(1) NOT NULL DEFAULT 0,
    record_path VARCHAR(255) DEFAULT NULL,
    record_disk VARCHAR(50) DEFAULT NULL,
    record_retention_days INT DEFAULT 7,
    embed_timeout_seconds INT NOT NULL DEFAULT 300,
    click_to_play TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (camera_id) REFERENCES cctv_streams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



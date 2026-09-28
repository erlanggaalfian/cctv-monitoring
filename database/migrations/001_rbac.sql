-- Tahap A: struktur RBAC empat peran.
--
-- Peran digeser, bukan ditambah di ujung: kekuasaan `admin` yang lama menjadi
-- `super_admin`, dan `user` yang lama menjadi `admin`. Peran `user` kini
-- berarti penonton tanpa panel manajemen.
--
-- Skrip ini hanya menyiapkan struktur. Tidak ada kode yang membacanya sampai
-- Tahap B, sehingga sistem tetap berjalan seperti sebelumnya setelah migrasi.
-- Aman dijalankan berulang: MariaDB mendukung IF NOT EXISTS pada ALTER, dan
-- pergeseran peran dijaga agar hanya terjadi sekali.

-- ── 1. Peran baru ────────────────────────────────────────────────────────────
-- ENUM diperluas lebih dulu agar nilai lama tetap sah selama pemindahan.
ALTER TABLE users
  MODIFY COLUMN role ENUM('super_admin','admin','user','guest')
  NOT NULL DEFAULT 'user';

-- Pergeseran hanya dijalankan bila belum ada super_admin sama sekali.
-- Tanpa penjaga ini, menjalankan ulang skrip akan menaikkan bekas `user`
-- (yang kini bernama `admin`) menjadi super_admin.
SET @sudah_digeser := (SELECT COUNT(*) FROM users WHERE role = 'super_admin');

-- Urutan penting: admin lama dinaikkan LEBIH DULU. Bila `user` dinaikkan
-- duluan, kedua kelompok akan bernama `admin` dan tidak terbedakan lagi.
UPDATE users SET role = 'super_admin'
 WHERE role = 'admin' AND @sudah_digeser = 0;

UPDATE users SET role = 'admin'
 WHERE role = 'user'  AND @sudah_digeser = 0;

-- ── 2. Kepemilikan pengguna ──────────────────────────────────────────────────
-- Admin hanya mengelola bawahannya sendiri; NULL berarti langsung di bawah
-- Super Admin.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS parent_admin_id INT NULL AFTER role;

-- ── 3. Kepemilikan kamera ────────────────────────────────────────────────────
ALTER TABLE cctv_streams
  ADD COLUMN IF NOT EXISTS owner_id INT NULL AFTER id;

-- Kamera yang sudah ada menjadi milik Super Admin pertama, sehingga tidak ada
-- kamera tanpa pemilik saat penyaringan mulai berlaku di Tahap C.
UPDATE cctv_streams
   SET owner_id = (SELECT id FROM (
         SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1
       ) AS sa)
 WHERE owner_id IS NULL;

-- ── 4. Kamera Super Admin yang dibagikan kepada Admin ────────────────────────
-- can_manage = 0 berarti Admin melihat nama kamera saja: rtsp_url tidak
-- pernah dikirim kepadanya, dan kamera itu tidak dapat diubah atau dihapus.
-- can_reshare memisahkan dua hal yang mudah tertukar: meneruskan akses kepada
-- bawahan diizinkan, mengubah kameranya tidak.
CREATE TABLE IF NOT EXISTS stream_admin_grants (
  stream_id   INT NOT NULL,
  admin_id    INT NOT NULL,
  can_manage  TINYINT(1) NOT NULL DEFAULT 0,
  can_reshare TINYINT(1) NOT NULL DEFAULT 1,
  granted_by  INT NULL,
  granted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stream_id, admin_id),
  KEY idx_sag_admin (admin_id),
  CONSTRAINT fk_sag_stream  FOREIGN KEY (stream_id)  REFERENCES cctv_streams(id) ON DELETE CASCADE,
  CONSTRAINT fk_sag_admin   FOREIGN KEY (admin_id)   REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT fk_sag_granter FOREIGN KEY (granted_by) REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. Izin berbutir untuk User dan Guest ────────────────────────────────────
-- granted_by menegakkan aturan pengelolaan Guest: Admin hanya boleh menyunting
-- baris yang ia berikan sendiri, bukan pemberian Super Admin atau Admin lain.
CREATE TABLE IF NOT EXISTS stream_permissions (
  stream_id    INT NOT NULL,
  user_id      INT NOT NULL,
  can_view     TINYINT(1) NOT NULL DEFAULT 1,
  can_playback TINYINT(1) NOT NULL DEFAULT 0,
  granted_by   INT NULL,
  granted_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stream_id, user_id),
  KEY idx_sp_user (user_id),
  KEY idx_sp_granter (granted_by),
  CONSTRAINT fk_sp_stream  FOREIGN KEY (stream_id)  REFERENCES cctv_streams(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_user    FOREIGN KEY (user_id)    REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT fk_sp_granter FOREIGN KEY (granted_by) REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. Kepemilikan API key ───────────────────────────────────────────────────
-- Tanpa ini setiap Admin dapat melihat dan menghapus kunci milik Super Admin.
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS owner_id INT NULL AFTER id;

UPDATE api_keys
   SET owner_id = (SELECT id FROM (
         SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1
       ) AS sa)
 WHERE owner_id IS NULL;

-- ── 7. Pindahkan akses lama ke bentuk berbutir ───────────────────────────────
-- user_cctv_access sengaja TIDAK dihapus: ia menjadi cadangan sampai Tahap B
-- terbukti berjalan. can_playback diberikan agar tidak ada yang kehilangan
-- kemampuan yang sudah dimilikinya hari ini.
INSERT IGNORE INTO stream_permissions (stream_id, user_id, can_view, can_playback, granted_by)
SELECT a.stream_id, a.user_id, 1, 1, NULL
FROM user_cctv_access a
JOIN users u        ON u.id = a.user_id
JOIN cctv_streams s ON s.id = a.stream_id;

-- ── 8. Kunci asing ditambahkan terakhir ──────────────────────────────────────
-- Ditaruh di akhir agar data sudah terisi lebih dulu; menambah kunci asing
-- pada kolom yang masih NULL akan ditolak bila nilainya tidak sah.
-- Dijalankan lewat prosedur karena ALTER ... ADD CONSTRAINT tidak mendukung
-- IF NOT EXISTS, sehingga menjalankan ulang skrip akan gagal.
DELIMITER //
DROP PROCEDURE IF EXISTS tambah_kunci_asing //
CREATE PROCEDURE tambah_kunci_asing()
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

  ALTER TABLE users
    ADD CONSTRAINT fk_users_parent
    FOREIGN KEY (parent_admin_id) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE cctv_streams
    ADD CONSTRAINT fk_streams_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE api_keys
    ADD CONSTRAINT fk_apikeys_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
END //
DELIMITER ;

CALL tambah_kunci_asing();
DROP PROCEDURE tambah_kunci_asing;

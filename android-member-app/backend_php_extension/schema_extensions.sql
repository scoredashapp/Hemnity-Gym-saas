-- Hemnity Gym Member App - Optional Non-Destructive MySQL Schema Extensions
-- Safe to run on the existing Hemnity Gym Management SaaS MySQL database.

CREATE TABLE IF NOT EXISTS member_refresh_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    device_name VARCHAR(120) NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refresh_token_hash (token_hash),
    KEY idx_refresh_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_qr_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT UNSIGNED NOT NULL,
    gym_id BIGINT UNSIGNED NOT NULL,
    membership_id BIGINT UNSIGNED NOT NULL,
    qr_token VARCHAR(128) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_member_qr_token (qr_token),
    KEY idx_qr_member_gym (member_id, gym_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_device_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT UNSIGNED NOT NULL,
    fcm_token VARCHAR(512) NOT NULL,
    platform VARCHAR(24) NOT NULL DEFAULT 'android',
    device_name VARCHAR(120) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_member_device_token (member_id, fcm_token(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT UNSIGNED NOT NULL,
    gym_id BIGINT UNSIGNED NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_member_read (member_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gym_holidays (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gym_id BIGINT UNSIGNED NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_name VARCHAR(160) NOT NULL,
    UNIQUE KEY uq_gym_holiday (gym_id, holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

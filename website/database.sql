-- ============================================================================
-- GYM — Gym Member Management System
-- Complete Production MySQL / MariaDB Schema & Initial Seed Data
-- Compatible with MySQL 8.0+ and MariaDB 10.4+ (cPanel / phpMyAdmin)
-- ============================================================================
-- NOTE FOR cPANEL SHARED HOSTING USERS:
-- On many cPanel servers, databases are created in "MySQL Databases" with an
-- account prefix (e.g., `cpaneluser_gym`) and `CREATE DATABASE` is disabled
-- inside phpMyAdmin. If phpMyAdmin reports an access error on CREATE DATABASE:
--   1. Select your created database (e.g. `cpaneluser_gym`) in phpMyAdmin's
--      left sidebar FIRST.
--   2. Comment out or remove the `CREATE DATABASE` and `USE` lines below before
--      importing this file.
-- ============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `gym`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `gym`;

-- ----------------------------------------------------------------------------
-- 1. Table: admins
-- No plaintext or default admin password is inserted.
-- Create the initial administrator securely via setup_admin.php, then delete
-- setup_admin.php immediately.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `last_login_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: gym_settings
-- Singleton configuration record used across Dashboard, Receipts, and Reports.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gym_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `gym_name` VARCHAR(150) NOT NULL DEFAULT 'GYM',
  `logo_path` VARCHAR(255) NULL DEFAULT NULL,
  `address` TEXT NULL DEFAULT NULL,
  `contact_number` VARCHAR(40) NULL DEFAULT NULL,
  `email` VARCHAR(190) NULL DEFAULT NULL,
  `currency_code` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `currency_symbol` VARCHAR(10) NOT NULL DEFAULT '₹',
  `receipt_footer` VARCHAR(500) NOT NULL DEFAULT 'Thank you for training with GYM. Membership fees are non-refundable and non-transferable.',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `gym_settings` (
  `id`, `gym_name`, `logo_path`, `address`, `contact_number`, `email`,
  `currency_code`, `currency_symbol`, `receipt_footer`
) VALUES (
  1,
  'GYM',
  NULL,
  '2nd Floor, Ironworks Plaza, MG Road, Bengaluru, Karnataka 560001',
  '+91 98765 43210',
  'admin@gym.example.com',
  'INR',
  '₹',
  'Thank you for training with GYM. Membership fees once paid are non-refundable and non-transferable.'
) ON DUPLICATE KEY UPDATE `gym_name` = VALUES(`gym_name`);

-- ----------------------------------------------------------------------------
-- 3. Table: membership_plans
-- Stores fixed-precision prices in DECIMAL(10,2). Deactivating a plan sets
-- is_active = 0 so historical memberships and payments remain intact.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_name` VARCHAR(100) NOT NULL,
  `duration_days` INT UNSIGNED NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `description` VARCHAR(500) NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_plans_active` (`is_active`),
  KEY `idx_plans_name` (`plan_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `membership_plans` (`id`, `plan_name`, `duration_days`, `price`, `description`, `is_active`) VALUES
  (1, 'Monthly', 30, 1000.00, 'Full gym floor, strength & cardio equipment access for 30 days.', 1),
  (2, 'Quarterly', 90, 2700.00, '90-day strength, cardio & functional training access with quarterly body composition check.', 1),
  (3, 'Half-Yearly', 180, 5000.00, '180-day unrestricted gym floor access with 2 complimentary trainer orientation sessions.', 1),
  (4, 'Yearly', 365, 9000.00, '365-day all-access annual membership with best value savings and priority locker access.', 1)
ON DUPLICATE KEY UPDATE
  `plan_name` = VALUES(`plan_name`),
  `duration_days` = VALUES(`duration_days`),
  `price` = VALUES(`price`),
  `description` = VALUES(`description`);

-- ----------------------------------------------------------------------------
-- 4. Table: members
-- Core member directory with unique auto-generated member_code (Member ID).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_code` VARCHAR(30) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `photo_path` VARCHAR(255) NULL DEFAULT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(190) NULL DEFAULT NULL,
  `gender` ENUM('Male', 'Female', 'Other', 'Prefer not to say') NULL DEFAULT NULL,
  `date_of_birth` DATE NULL DEFAULT NULL,
  `address` TEXT NULL DEFAULT NULL,
  `emergency_contact` VARCHAR(150) NULL DEFAULT NULL,
  `joining_date` DATE NOT NULL,
  `plan_id` INT UNSIGNED NULL DEFAULT NULL,
  `membership_start_date` DATE NULL DEFAULT NULL,
  `membership_expiry_date` DATE NULL DEFAULT NULL,
  `status` ENUM('Active', 'Expired', 'Inactive') NOT NULL DEFAULT 'Active',
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_members_code` (`member_code`),
  KEY `idx_members_phone` (`phone`),
  KEY `idx_members_status` (`status`),
  KEY `idx_members_expiry` (`membership_expiry_date`),
  KEY `idx_members_joining` (`joining_date`),
  KEY `idx_members_name` (`full_name`),
  KEY `idx_members_plan` (`plan_id`),
  CONSTRAINT `fk_members_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: memberships
-- Immutable/historical log of every membership assignment, renewal & extension.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `memberships` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id` INT UNSIGNED NOT NULL,
  `plan_id` INT UNSIGNED NOT NULL,
  `plan_name_snapshot` VARCHAR(100) NOT NULL,
  `plan_price_snapshot` DECIMAL(10,2) NOT NULL,
  `start_date` DATE NOT NULL,
  `expiry_date` DATE NOT NULL,
  `action_type` ENUM('Initial', 'Renewal', 'Extension', 'Plan Change') NOT NULL DEFAULT 'Initial',
  `status` ENUM('Active', 'Expired', 'Cancelled', 'Superseded') NOT NULL DEFAULT 'Active',
  `notes` VARCHAR(500) NULL DEFAULT NULL,
  `created_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_memberships_member_dates` (`member_id`, `start_date`, `expiry_date`),
  KEY `idx_memberships_plan` (`plan_id`),
  KEY `idx_memberships_action` (`action_type`),
  KEY `idx_memberships_status` (`status`),
  KEY `idx_memberships_created` (`created_at`),
  CONSTRAINT `fk_memberships_member`
    FOREIGN KEY (`member_id`) REFERENCES `members` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_memberships_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_memberships_admin`
    FOREIGN KEY (`created_by`) REFERENCES `admins` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Table: payments
-- Created ONLY by explicit administrator action in payment_add.php.
-- Supports full, partial, and pending payments plus outstanding balance tracking.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `receipt_number` VARCHAR(40) NOT NULL,
  `member_id` INT UNSIGNED NOT NULL,
  `membership_id` INT UNSIGNED NULL DEFAULT NULL,
  `plan_id` INT UNSIGNED NULL DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `plan_total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `balance_due` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_date` DATE NOT NULL,
  `payment_method` ENUM('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other') NOT NULL DEFAULT 'Cash',
  `transaction_ref` VARCHAR(120) NULL DEFAULT NULL,
  `payment_status` ENUM('Paid', 'Partial', 'Pending') NOT NULL DEFAULT 'Paid',
  `notes` VARCHAR(500) NULL DEFAULT NULL,
  `received_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_receipt` (`receipt_number`),
  KEY `idx_payments_date` (`payment_date`),
  KEY `idx_payments_member` (`member_id`),
  KEY `idx_payments_membership` (`membership_id`),
  KEY `idx_payments_method` (`payment_method`),
  KEY `idx_payments_status` (`payment_status`),
  CONSTRAINT `fk_payments_member`
    FOREIGN KEY (`member_id`) REFERENCES `members` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_membership`
    FOREIGN KEY (`membership_id`) REFERENCES `memberships` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_payments_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_payments_admin`
    FOREIGN KEY (`received_by`) REFERENCES `admins` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: attendance
-- Enforces UNIQUE(member_id, attendance_date) to prevent duplicate check-ins
-- on the same calendar day while allowing authorized admin corrections.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id` INT UNSIGNED NOT NULL,
  `attendance_date` DATE NOT NULL,
  `check_in_time` TIME NOT NULL,
  `check_out_time` TIME NULL DEFAULT NULL,
  `remarks` VARCHAR(255) NULL DEFAULT NULL,
  `recorded_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_member_attendance_date` (`member_id`, `attendance_date`),
  KEY `idx_attendance_date` (`attendance_date`),
  KEY `idx_attendance_member` (`member_id`),
  CONSTRAINT `fk_attendance_member`
    FOREIGN KEY (`member_id`) REFERENCES `members` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_admin`
    FOREIGN KEY (`recorded_by`) REFERENCES `admins` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

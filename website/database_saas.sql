-- ============================================================================
-- Hemnity Gym Management Software — Multi-Tenant SaaS MySQL / MariaDB Schema
-- Parent Brand: Hemnity (https://gym.hemnity.in)
-- Compatible with MySQL 8.0+ and MariaDB 10.4+ (cPanel / phpMyAdmin)
-- ============================================================================
-- NOTE FOR cPANEL SHARED HOSTING USERS:
-- Select your created database (e.g., `cpaneluser_gym`) in phpMyAdmin's left
-- sidebar FIRST. If `CREATE DATABASE` is disabled on shared hosting, comment
-- out or remove the `CREATE DATABASE` and `USE` statements below before import.
-- ============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `hemnity_gym_saas`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `hemnity_gym_saas`;

-- ----------------------------------------------------------------------------
-- 1. Legacy compatibility table (preserved for single-gym upgrade parity)
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
-- 2. Unified SaaS Users (super_admin, gym_owner, gym_member)
-- Zero plaintext or hardcoded passwords are inserted.
-- Use setup_admin.php after installation, then delete setup_admin.php.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role` ENUM('super_admin', 'gym_owner', 'gym_member') NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `phone` VARCHAR(30) NULL DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `google_sub` VARCHAR(120) NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_initial_setup_complete` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Database-Driven SaaS Subscription Plans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saas_plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(60) NOT NULL,
  `plan_name` VARCHAR(100) NOT NULL,
  `tagline` VARCHAR(180) NULL DEFAULT NULL,
  `monthly_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `quarterly_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `yearly_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `trial_days` INT UNSIGNED NOT NULL DEFAULT 14,
  `max_members` INT UNSIGNED NOT NULL DEFAULT 150,
  `max_branches` INT UNSIGNED NOT NULL DEFAULT 1,
  `discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `enabled_features_json` TEXT NOT NULL,
  `description` VARCHAR(500) NULL DEFAULT NULL,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_saas_plans_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `saas_plans` (`id`, `slug`, `plan_name`, `tagline`, `monthly_price`, `quarterly_price`, `yearly_price`, `trial_days`, `max_members`, `max_branches`, `discount_percent`, `enabled_features_json`, `description`, `is_featured`, `is_active`, `sort_order`) VALUES
  (1, 'starter', 'Starter', 'For independent fitness studios & boutique gyms', 999.00, 2699.00, 9590.00, 14, 150, 1, 10.00, '["qr_attendance","member_portal","csv_exports","whatsapp_reminders"]', 'Everything a single-location club needs to digitize member billing and QR check-ins.', 0, 1, 1),
  (2, 'pro', 'Pro', 'Most popular for growing multi-trainer clubs', 2499.00, 6749.00, 23990.00, 14, 750, 3, 20.00, '["qr_attendance","member_portal","online_payments","id_card_printing","csv_exports","whatsapp_reminders","api_access"]', 'Includes custom QR PVC ID card printing, per-gym Razorpay/Cashfree gateway integration, and REST API access.', 1, 1, 2),
  (3, 'enterprise', 'Enterprise', 'For high-volume clubs & fitness chains', 5999.00, 16199.00, 57590.00, 30, 5000, 15, 20.00, '["qr_attendance","member_portal","online_payments","id_card_printing","csv_exports","whatsapp_reminders","api_access","custom_branding","priority_support"]', 'Unlimited branches, priority Hemnity onboarding, custom brand white-labeling, and audit exports.', 0, 1, 3)
ON DUPLICATE KEY UPDATE
  `plan_name` = VALUES(`plan_name`),
  `monthly_price` = VALUES(`monthly_price`),
  `quarterly_price` = VALUES(`quarterly_price`),
  `yearly_price` = VALUES(`yearly_price`);

-- ----------------------------------------------------------------------------
-- 4. Registered Gym Tenants
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gyms` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_code` VARCHAR(30) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `owner_user_id` INT UNSIGNED NULL DEFAULT NULL,
  `email` VARCHAR(190) NULL DEFAULT NULL,
  `phone` VARCHAR(40) NULL DEFAULT NULL,
  `address` TEXT NULL DEFAULT NULL,
  `city` VARCHAR(100) NULL DEFAULT NULL,
  `logo_path` VARCHAR(255) NULL DEFAULT NULL,
  `status` ENUM('Active', 'Trial', 'Suspended', 'Pending') NOT NULL DEFAULT 'Active',
  `operating_hours` VARCHAR(120) NULL DEFAULT '05:30 AM - 10:00 PM',
  `branch_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gyms_code` (`gym_code`),
  UNIQUE KEY `uq_gyms_slug` (`slug`),
  KEY `idx_gyms_owner` (`owner_user_id`),
  CONSTRAINT `fk_gyms_owner_user`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `gyms` (`id`, `gym_code`, `slug`, `name`, `email`, `phone`, `address`, `city`, `status`) VALUES
  (1, 'HEM-GYM-0001', 'ironworks-fitness-club', 'Ironworks Fitness Club', 'desk@gymfitness.in', '+91 98765 43210', '2nd Floor, Ironworks Plaza, MG Road, Bengaluru, Karnataka 560001', 'Bengaluru', 'Active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

CREATE TABLE IF NOT EXISTS `gym_owners` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role_label` VARCHAR(60) NOT NULL DEFAULT 'Owner',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gym_owner` (`gym_id`, `user_id`),
  CONSTRAINT `fk_go_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_go_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Gym SaaS Subscriptions & Billing Invoices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gym_saas_subscriptions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL,
  `saas_plan_id` INT UNSIGNED NOT NULL,
  `billing_cycle` ENUM('monthly', 'quarterly', 'yearly') NOT NULL DEFAULT 'monthly',
  `status` ENUM('Trial', 'Active', 'Grace', 'Expired', 'Suspended') NOT NULL DEFAULT 'Active',
  `trial_ends_at` DATE NULL DEFAULT NULL,
  `current_period_start` DATE NOT NULL,
  `current_period_end` DATE NOT NULL,
  `grace_period_days` INT UNSIGNED NOT NULL DEFAULT 7,
  `auto_renew` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sub_gym` (`gym_id`),
  CONSTRAINT `fk_sub_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_sub_plan` FOREIGN KEY (`saas_plan_id`) REFERENCES `saas_plans` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `gym_saas_subscriptions` (`id`, `gym_id`, `saas_plan_id`, `billing_cycle`, `status`, `current_period_start`, `current_period_end`, `grace_period_days`) VALUES
  (1, 1, 2, 'yearly', 'Active', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 365 DAY), 7)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

CREATE TABLE IF NOT EXISTS `saas_subscription_payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(50) NOT NULL,
  `gym_id` INT UNSIGNED NOT NULL,
  `subscription_id` INT UNSIGNED NULL DEFAULT NULL,
  `saas_plan_id` INT UNSIGNED NULL DEFAULT NULL,
  `billing_cycle` VARCHAR(20) NOT NULL DEFAULT 'monthly',
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'Online',
  `transaction_ref` VARCHAR(120) NULL DEFAULT NULL,
  `status` ENUM('Paid', 'Pending', 'Failed', 'Refunded') NOT NULL DEFAULT 'Paid',
  `paid_at` DATETIME NULL DEFAULT NULL,
  `notes` VARCHAR(500) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_saas_invoice` (`invoice_number`),
  KEY `idx_saas_pay_gym` (`gym_id`),
  CONSTRAINT `fk_sp_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_sp_sub` FOREIGN KEY (`subscription_id`) REFERENCES `gym_saas_subscriptions` (`id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Tenant-Scoped Gym Settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gym_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `gym_name` VARCHAR(150) NOT NULL DEFAULT 'GYM',
  `logo_path` VARCHAR(255) NULL DEFAULT NULL,
  `address` TEXT NULL DEFAULT NULL,
  `contact_number` VARCHAR(40) NULL DEFAULT NULL,
  `email` VARCHAR(190) NULL DEFAULT NULL,
  `currency_code` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `currency_symbol` VARCHAR(10) NOT NULL DEFAULT '₹',
  `receipt_footer` VARCHAR(500) NOT NULL DEFAULT 'Thank you for training with GYM. Membership fees are non-refundable and non-transferable.',
  `operating_hours` VARCHAR(120) NULL DEFAULT '05:30 AM - 10:00 PM (Mon-Sat)',
  `qr_attendance_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `require_photo_verify` TINYINT(1) NOT NULL DEFAULT 1,
  `duplicate_checkin_rule` VARCHAR(30) NOT NULL DEFAULT 'daily',
  `checkin_cooldown_hours` INT UNSIGNED NOT NULL DEFAULT 12,
  `id_card_accent_color` VARCHAR(20) NOT NULL DEFAULT '#ea580c',
  `id_card_show_expiry` TINYINT(1) NOT NULL DEFAULT 1,
  `id_card_template` VARCHAR(40) NOT NULL DEFAULT 'obsidian-split',
  `notification_whatsapp_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `notification_email_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `staff_permissions_json` TEXT NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gym_settings_gym` (`gym_id`),
  CONSTRAINT `fk_gs_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `gym_settings` (
  `id`, `gym_id`, `gym_name`, `address`, `contact_number`, `email`, `currency_code`, `currency_symbol`, `receipt_footer`
) VALUES (
  1, 1, 'Ironworks Fitness Club',
  '2nd Floor, Ironworks Plaza, MG Road, Bengaluru, Karnataka 560001',
  '+91 98765 43210', 'desk@gymfitness.in', 'INR', '₹',
  'Thank you for training with Ironworks Fitness Club. Membership fees once paid are non-refundable and non-transferable.'
) ON DUPLICATE KEY UPDATE `gym_name` = VALUES(`gym_name`);

-- ----------------------------------------------------------------------------
-- 7. Tenant-Scoped Membership Plans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `plan_name` VARCHAR(100) NOT NULL,
  `duration_days` INT UNSIGNED NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `description` VARCHAR(500) NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_plans_gym` (`gym_id`),
  KEY `idx_plans_active` (`is_active`),
  CONSTRAINT `fk_mp_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `membership_plans` (`id`, `gym_id`, `plan_name`, `duration_days`, `price`, `description`, `is_active`) VALUES
  (1, 1, 'Monthly', 30, 1000.00, 'Full gym floor, strength & cardio equipment access for 30 days.', 1),
  (2, 1, 'Quarterly', 90, 2700.00, '90-day strength, cardio & functional training access with quarterly body composition check.', 1),
  (3, 1, 'Half-Yearly', 180, 5000.00, '180-day unrestricted gym floor access with 2 complimentary trainer orientation sessions.', 1),
  (4, 1, 'Yearly', 365, 9000.00, '365-day all-access annual membership with best value savings and priority locker access.', 1)
ON DUPLICATE KEY UPDATE `plan_name` = VALUES(`plan_name`), `price` = VALUES(`price`);

-- ----------------------------------------------------------------------------
-- 8. Tenant-Scoped Members (Composite Unique on gym_id + member_code)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `user_id` INT UNSIGNED NULL DEFAULT NULL,
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
  UNIQUE KEY `uq_gym_member_code` (`gym_id`, `member_code`),
  KEY `idx_members_gym` (`gym_id`),
  KEY `idx_members_user` (`user_id`),
  KEY `idx_members_phone` (`phone`),
  KEY `idx_members_status` (`status`),
  KEY `idx_members_expiry` (`membership_expiry_date`),
  CONSTRAINT `fk_members_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_members_plan` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Tenant-Scoped Membership History
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `memberships` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL DEFAULT 1,
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
  KEY `idx_memberships_gym` (`gym_id`),
  KEY `idx_memberships_member` (`member_id`, `start_date`, `expiry_date`),
  CONSTRAINT `fk_mh_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_mh_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_mh_plan` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Tenant-Scoped Payment Gateways, Orders & Payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gym_payment_gateways` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL,
  `provider` ENUM('manual', 'razorpay', 'cashfree', 'stripe') NOT NULL DEFAULT 'manual',
  `merchant_key_id` VARCHAR(190) NULL DEFAULT '',
  `secret_encrypted` TEXT NULL,
  `webhook_secret_encrypted` TEXT NULL,
  `mode` ENUM('test', 'live') NOT NULL DEFAULT 'test',
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `auto_activate_membership` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gpg_gym` (`gym_id`),
  CONSTRAINT `fk_gpg_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `receipt_number` VARCHAR(40) NOT NULL,
  `member_id` INT UNSIGNED NOT NULL,
  `membership_id` INT UNSIGNED NULL DEFAULT NULL,
  `plan_id` INT UNSIGNED NULL DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `plan_total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `balance_due` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_date` DATE NOT NULL,
  `payment_method` ENUM('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other') NOT NULL DEFAULT 'Cash',
  `transaction_ref` VARCHAR(120) NULL DEFAULT NULL,
  `payment_status` ENUM('Paid', 'Partial', 'Pending', 'Refunded') NOT NULL DEFAULT 'Paid',
  `payment_source` VARCHAR(30) NOT NULL DEFAULT 'manual',
  `gateway_order_id` INT UNSIGNED NULL DEFAULT NULL,
  `notes` VARCHAR(500) NULL DEFAULT NULL,
  `received_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gym_receipt` (`gym_id`, `receipt_number`),
  KEY `idx_payments_gym_date` (`gym_id`, `payment_date`),
  KEY `idx_payments_member` (`member_id`),
  CONSTRAINT `fk_pay_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_pay_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_pay_membership` FOREIGN KEY (`membership_id`) REFERENCES `memberships` (`id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_pay_plan` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_orders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_ref` VARCHAR(80) NOT NULL,
  `gym_id` INT UNSIGNED NOT NULL,
  `member_id` INT UNSIGNED NOT NULL,
  `plan_id` INT UNSIGNED NULL DEFAULT NULL,
  `gateway_provider` VARCHAR(30) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `status` ENUM('Created', 'Paid', 'Failed') NOT NULL DEFAULT 'Created',
  `webhook_event_id` VARCHAR(120) NULL DEFAULT NULL,
  `payment_id` INT UNSIGNED NULL DEFAULT NULL,
  `verified_signature` VARCHAR(255) NULL DEFAULT NULL,
  `raw_verified_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_po_ref` (`order_ref`),
  UNIQUE KEY `uq_po_webhook` (`webhook_event_id`),
  CONSTRAINT `fk_po_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_po_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. Revocable QR Credentials & Tenant Attendance
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `qr_credentials` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL,
  `member_id` INT UNSIGNED NOT NULL,
  `credential_token` VARCHAR(120) NOT NULL,
  `status` ENUM('Active', 'Revoked') NOT NULL DEFAULT 'Active',
  `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` DATETIME NULL DEFAULT NULL,
  `revoke_reason` VARCHAR(255) NULL DEFAULT NULL,
  `issued_by` INT UNSIGNED NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qr_token` (`credential_token`),
  KEY `idx_qr_gym_member` (`gym_id`, `member_id`),
  CONSTRAINT `fk_qr_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_qr_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `member_id` INT UNSIGNED NOT NULL,
  `attendance_date` DATE NOT NULL,
  `check_in_time` TIME NOT NULL,
  `check_out_time` TIME NULL DEFAULT NULL,
  `check_in_method` VARCHAR(30) NOT NULL DEFAULT 'Manual',
  `qr_credential_id` INT UNSIGNED NULL DEFAULT NULL,
  `remarks` VARCHAR(255) NULL DEFAULT NULL,
  `recorded_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gym_member_att_date` (`gym_id`, `member_id`, `attendance_date`),
  KEY `idx_att_gym_date` (`gym_id`, `attendance_date`),
  CONSTRAINT `fk_att_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_att_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. Platform CMS, FAQs, Support Tickets, Notifications, Audit Logs, API Tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `platform_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `brand_name` VARCHAR(80) NOT NULL DEFAULT 'Hemnity',
  `software_name` VARCHAR(150) NOT NULL DEFAULT 'Hemnity Gym Management Software',
  `base_url` VARCHAR(255) NOT NULL DEFAULT 'https://gym.hemnity.in',
  `hero_badge` VARCHAR(160) NOT NULL DEFAULT 'Multi-Tenant SaaS Platform for Fitness Clubs',
  `hero_title` VARCHAR(300) NOT NULL DEFAULT 'Run every gym branch, QR check-in desk, and member billing portal from one platform.',
  `hero_subtitle` TEXT NOT NULL,
  `hero_cta_primary` VARCHAR(80) NOT NULL DEFAULT 'Start Free Trial',
  `hero_cta_secondary` VARCHAR(80) NOT NULL DEFAULT 'Explore Owner Demo',
  `intro_title` VARCHAR(255) NOT NULL DEFAULT 'Built for single clubs ready to scale into multi-gym fitness brands.',
  `intro_body` TEXT NOT NULL,
  `announcement_banner` VARCHAR(500) NULL DEFAULT NULL,
  `support_email` VARCHAR(190) NOT NULL DEFAULT 'support@hemnity.in',
  `support_phone` VARCHAR(40) NOT NULL DEFAULT '+91 80 4123 8900',
  `support_address` VARCHAR(300) NOT NULL DEFAULT 'Hemnity Technologies, Indiranagar 100ft Rd, Bengaluru 560038',
  `seo_title` VARCHAR(190) NOT NULL DEFAULT 'Hemnity Gym Management Software — Multi-Tenant Gym SaaS',
  `seo_description` VARCHAR(500) NOT NULL DEFAULT 'Manage gym memberships, QR attendance, printable ID cards, payments, and member portals with strict multi-tenant isolation.',
  `maintenance_mode` TINYINT(1) NOT NULL DEFAULT 0,
  `platform_gateway_provider` VARCHAR(40) NOT NULL DEFAULT 'razorpay',
  `platform_gateway_key` VARCHAR(190) NULL DEFAULT '',
  `platform_gateway_secret_encrypted` TEXT NULL,
  `platform_gateway_mode` ENUM('test', 'live') NOT NULL DEFAULT 'test',
  `smtp_host` VARCHAR(190) NULL DEFAULT 'smtp.gmail.com',
  `smtp_port` INT UNSIGNED NOT NULL DEFAULT 587,
  `smtp_user` VARCHAR(190) NULL DEFAULT '',
  `smtp_password_encrypted` TEXT NULL,
  `smtp_from_email` VARCHAR(190) NULL DEFAULT 'noreply@hemnity.in',
  `smtp_from_name` VARCHAR(120) NULL DEFAULT 'Hemnity Gym Platform',
  `smtp_encryption` VARCHAR(16) NOT NULL DEFAULT 'tls',
  `whatsapp_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `google_oauth_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `google_client_id` VARCHAR(190) NULL DEFAULT '',
  `google_client_secret_encrypted` TEXT NULL,
  `default_grace_period_days` INT UNSIGNED NOT NULL DEFAULT 7,
  `email_template_welcome` TEXT NOT NULL,
  `email_template_expiry` TEXT NOT NULL,
  `legal_privacy_summary` TEXT NOT NULL,
  `legal_terms_summary` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `platform_settings` (
  `id`, `brand_name`, `software_name`, `base_url`, `hero_subtitle`, `intro_body`,
  `email_template_welcome`, `email_template_expiry`, `legal_privacy_summary`, `legal_terms_summary`
) VALUES (
  1,
  'Hemnity',
  'Hemnity Gym Management Software',
  'https://gym.hemnity.in',
  'Hemnity Gym Management Software gives gym owners independent white-label operations, verifiable QR ID card check-ins, per-gym payment gateways, and a dedicated member portal—hosted cleanly under your domain.',
  'Each registered gym operates in an isolated tenant workspace with its own plans, member directory, printed QR ID cards, GST-ready receipts, and independent Razorpay or Cashfree credentials.',
  'Welcome to Hemnity Gym Management Software! Your workspace {{gym_name}} is active.',
  'Reminder: Your {{gym_name}} subscription expires on {{expiry_date}}. Renew to retain full access.',
  'Hemnity isolates each gym tenant in strict logical partitions. Member biometrics or Aadhaar numbers are never stored in QR codes; QR credentials carry only revocable cryptographic tokens.',
  'Subscriptions renew per selected billing cycle. Expired accounts enter a configurable grace window before write restrictions apply; historical member, attendance, and payment records are never deleted upon expiry.'
) ON DUPLICATE KEY UPDATE `software_name` = VALUES(`software_name`);

CREATE TABLE IF NOT EXISTS `platform_faqs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `question` VARCHAR(300) NOT NULL,
  `answer` TEXT NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `platform_faqs` (`id`, `question`, `answer`, `sort_order`, `is_active`) VALUES
  (1, 'How is my gym data isolated from other gyms on Hemnity?', 'Every tenant query, payment gateway secret, QR token, file upload, and CSV export is strictly scoped by the authenticated user\'s authorized gym_id. Cross-tenant IDs submitted by clients are always rejected.', 1, 1),
  (2, 'Can members check in using printed ID cards and digital passes?', 'Yes. Each member receives a revocable cryptographic QR credential that renders on both their mobile Member Portal and printable PVC/A4 ID cards. Lost cards can be revoked and reissued with one click.', 2, 1),
  (3, 'Do we receive member payments directly in our own gym bank account?', 'Yes. Each gym owner configures their own Razorpay, Cashfree, or Stripe keys inside Settings (stored AES-256 encrypted) alongside manual Cash and UPI ledger tracking.', 3, 1),
  (4, 'Does Hemnity work on cPanel shared hosting without Node.js?', 'Yes. Alongside the cloud web app, Hemnity includes a Core PHP 8.1+ PDO & MySQL shared-hosting deployment bundle ready for public_html and phpMyAdmin.', 4, 1)
ON DUPLICATE KEY UPDATE `question` = VALUES(`question`);

CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL DEFAULT NULL,
  `sender_name` VARCHAR(120) NOT NULL,
  `sender_email` VARCHAR(190) NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('Open', 'In Progress', 'Resolved') NOT NULL DEFAULT 'Open',
  `admin_reply` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_gym` (`gym_id`),
  CONSTRAINT `fk_tickets_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NULL DEFAULT NULL,
  `user_id` INT UNSIGNED NULL DEFAULT NULL,
  `channel` VARCHAR(30) NOT NULL DEFAULT 'in_app',
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_gym` (`gym_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_user_id` INT UNSIGNED NULL DEFAULT NULL,
  `actor_role` VARCHAR(40) NOT NULL,
  `gym_id` INT UNSIGNED NULL DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(60) NOT NULL,
  `target_id` VARCHAR(80) NULL DEFAULT NULL,
  `details_json` TEXT NULL DEFAULT NULL,
  `ip_address` VARCHAR(64) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_gym` (`gym_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `gym_id` INT UNSIGNED NULL DEFAULT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `label` VARCHAR(120) NOT NULL DEFAULT 'Mobile App Token',
  `last_used_at` DATETIME NULL DEFAULT NULL,
  `expires_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_api_token_hash` (`token_hash`),
  CONSTRAINT `fk_token_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

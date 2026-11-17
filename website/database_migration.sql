-- ============================================================================
-- Hemnity Gym Management Software — Safe Single-Gym to Multi-Tenant SaaS Migration
-- Compatible with MySQL 8.0+ and MariaDB 10.4+ (phpMyAdmin / cPanel)
-- ============================================================================
-- PRE-UPGRADE CHECKLIST (DO NOT SKIP):
--   1. In phpMyAdmin, select your existing single-gym database FIRST, open the
--      Export tab, and download a full `.sql` backup of your database.
--   2. Download a ZIP backup of your `uploads/` folder from cPanel File Manager.
--   3. Import THIS file (`database_migration.sql`) into your existing database.
--   4. Zero existing member, plan, membership, payment, or attendance records
--      are deleted. All existing single-gym rows are preserved under `gym_id = 1`.
--
-- ROLLBACK INSTRUCTIONS:
--   If you ever need to revert, restore your pre-upgrade `.sql` export in
--   phpMyAdmin (Drop existing tables -> Import backup `.sql`) and re-upload
--   your pre-upgrade PHP files.
-- ============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET NAMES utf8mb4;
SET @prev_fk_checks = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create SaaS Tables safely if they do not exist
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

INSERT IGNORE INTO `saas_plans` (`id`, `slug`, `plan_name`, `tagline`, `monthly_price`, `quarterly_price`, `yearly_price`, `trial_days`, `max_members`, `max_branches`, `discount_percent`, `enabled_features_json`, `description`, `is_featured`, `is_active`, `sort_order`) VALUES
  (1, 'starter', 'Starter', 'For independent fitness studios & boutique gyms', 999.00, 2699.00, 9590.00, 14, 150, 1, 10.00, '["qr_attendance","member_portal","csv_exports","whatsapp_reminders"]', 'Everything a single-location club needs to digitize member billing and QR check-ins.', 0, 1, 1),
  (2, 'pro', 'Pro', 'Most popular for growing multi-trainer clubs', 2499.00, 6749.00, 23990.00, 14, 750, 3, 20.00, '["qr_attendance","member_portal","online_payments","id_card_printing","csv_exports","whatsapp_reminders","api_access"]', 'Includes custom QR PVC ID card printing, per-gym Razorpay/Cashfree gateway integration, and REST API access.', 1, 1, 2),
  (3, 'enterprise', 'Enterprise', 'For high-volume clubs & fitness chains', 5999.00, 16199.00, 57590.00, 30, 5000, 15, 20.00, '["qr_attendance","member_portal","online_payments","id_card_printing","csv_exports","whatsapp_reminders","api_access","custom_branding","priority_support"]', 'Unlimited branches, priority Hemnity onboarding, custom brand white-labeling, and audit exports.', 0, 1, 3);

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
  UNIQUE KEY `uq_gyms_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default Tenant #1 using existing gym_settings if present
INSERT IGNORE INTO `gyms` (`id`, `gym_code`, `slug`, `name`, `email`, `phone`, `address`, `status`)
SELECT
  1,
  'HEM-GYM-0001',
  'default-gym',
  COALESCE((SELECT `gym_name` FROM `gym_settings` ORDER BY `id` ASC LIMIT 1), 'Ironworks Fitness Club'),
  (SELECT `email` FROM `gym_settings` ORDER BY `id` ASC LIMIT 1),
  (SELECT `contact_number` FROM `gym_settings` ORDER BY `id` ASC LIMIT 1),
  (SELECT `address` FROM `gym_settings` ORDER BY `id` ASC LIMIT 1),
  'Active';

CREATE TABLE IF NOT EXISTS `gym_owners` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gym_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role_label` VARCHAR(60) NOT NULL DEFAULT 'Owner',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gym_owner` (`gym_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  UNIQUE KEY `uq_sub_gym` (`gym_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `gym_saas_subscriptions` (`id`, `gym_id`, `saas_plan_id`, `billing_cycle`, `status`, `current_period_start`, `current_period_end`, `grace_period_days`) VALUES
  (1, 1, 2, 'yearly', 'Active', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 365 DAY), 7);

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
  UNIQUE KEY `uq_saas_invoice` (`invoice_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  UNIQUE KEY `uq_gpg_gym` (`gym_id`)
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
  UNIQUE KEY `uq_po_webhook` (`webhook_event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY `idx_qr_gym_member` (`gym_id`, `member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

INSERT IGNORE INTO `platform_settings` (
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
);

CREATE TABLE IF NOT EXISTS `platform_faqs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `question` VARCHAR(300) NOT NULL,
  `answer` TEXT NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `platform_faqs` (`id`, `question`, `answer`, `sort_order`, `is_active`) VALUES
  (1, 'How is my gym data isolated from other gyms on Hemnity?', 'Every tenant query, payment gateway secret, QR token, file upload, and CSV export is strictly scoped by the authenticated user\'s authorized gym_id.', 1, 1),
  (2, 'Can members check in using printed ID cards and digital passes?', 'Yes. Each member receives a revocable cryptographic QR credential that renders on both their mobile Member Portal and printable PVC/A4 ID cards.', 2, 1),
  (3, 'Do we receive member payments directly in our own gym bank account?', 'Yes. Each gym owner configures their own Razorpay, Cashfree, or Stripe keys inside Settings (stored AES-256 encrypted) alongside manual Cash and UPI ledger tracking.', 3, 1);

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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  UNIQUE KEY `uq_api_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Idempotent column upgrades on existing single-gym tables (works without DELIMITER)
SET @db = DATABASE();

-- gym_settings.gym_id + SaaS operational fields
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='gym_settings' AND COLUMN_NAME='gym_id')=0,
  'ALTER TABLE `gym_settings` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, ADD COLUMN `gym_id` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `id`, ADD UNIQUE KEY `uq_gym_settings_gym` (`gym_id`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='gym_settings' AND COLUMN_NAME='operating_hours')=0,
  'ALTER TABLE `gym_settings` ADD COLUMN `operating_hours` VARCHAR(120) NULL DEFAULT ''05:30 AM - 10:00 PM (Mon-Sat)'', ADD COLUMN `qr_attendance_enabled` TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN `require_photo_verify` TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN `duplicate_checkin_rule` VARCHAR(30) NOT NULL DEFAULT ''daily'', ADD COLUMN `checkin_cooldown_hours` INT UNSIGNED NOT NULL DEFAULT 12, ADD COLUMN `id_card_accent_color` VARCHAR(20) NOT NULL DEFAULT ''#ea580c'', ADD COLUMN `id_card_show_expiry` TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN `id_card_template` VARCHAR(40) NOT NULL DEFAULT ''obsidian-split'', ADD COLUMN `notification_whatsapp_enabled` TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN `notification_email_enabled` TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN `staff_permissions_json` TEXT NULL DEFAULT NULL',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- membership_plans.gym_id
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='membership_plans' AND COLUMN_NAME='gym_id')=0,
  'ALTER TABLE `membership_plans` ADD COLUMN `gym_id` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `id`, ADD KEY `idx_plans_gym` (`gym_id`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- members.gym_id & user_id + composite unique key
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='members' AND COLUMN_NAME='gym_id')=0,
  'ALTER TABLE `members` ADD COLUMN `gym_id` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `id`, ADD COLUMN `user_id` INT UNSIGNED NULL DEFAULT NULL AFTER `gym_id`, ADD KEY `idx_members_gym` (`gym_id`), ADD KEY `idx_members_user` (`user_id`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='members' AND INDEX_NAME='uq_members_code')>0,
  'ALTER TABLE `members` DROP INDEX `uq_members_code`, ADD UNIQUE KEY `uq_gym_member_code` (`gym_id`, `member_code`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- memberships.gym_id & drop strict legacy FK to admins so users.id works cleanly
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='memberships' AND COLUMN_NAME='gym_id')=0,
  'ALTER TABLE `memberships` ADD COLUMN `gym_id` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `id`, ADD KEY `idx_memberships_gym` (`gym_id`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='memberships' AND CONSTRAINT_NAME='fk_memberships_admin')>0,
  'ALTER TABLE `memberships` DROP FOREIGN KEY `fk_memberships_admin`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- payments.gym_id, refund_amount, Refunded enum, payment_source, gateway_order_id & composite receipt unique
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='payments' AND COLUMN_NAME='gym_id')=0,
  'ALTER TABLE `payments` ADD COLUMN `gym_id` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `id`, ADD COLUMN `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `balance_due`, ADD COLUMN `payment_source` VARCHAR(30) NOT NULL DEFAULT ''manual'' AFTER `payment_status`, ADD COLUMN `gateway_order_id` INT UNSIGNED NULL DEFAULT NULL AFTER `payment_source`, MODIFY COLUMN `payment_status` ENUM(''Paid'', ''Partial'', ''Pending'', ''Refunded'') NOT NULL DEFAULT ''Paid'', ADD KEY `idx_payments_gym_date` (`gym_id`, `payment_date`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='payments' AND INDEX_NAME='uq_payments_receipt')>0,
  'ALTER TABLE `payments` DROP INDEX `uq_payments_receipt`, ADD UNIQUE KEY `uq_gym_receipt` (`gym_id`, `receipt_number`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='payments' AND CONSTRAINT_NAME='fk_payments_admin')>0,
  'ALTER TABLE `payments` DROP FOREIGN KEY `fk_payments_admin`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- attendance.gym_id, check_in_method, qr_credential_id & composite daily unique
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='attendance' AND COLUMN_NAME='gym_id')=0,
  'ALTER TABLE `attendance` ADD COLUMN `gym_id` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `id`, ADD COLUMN `check_in_method` VARCHAR(30) NOT NULL DEFAULT ''Manual'' AFTER `check_out_time`, ADD COLUMN `qr_credential_id` INT UNSIGNED NULL DEFAULT NULL AFTER `check_in_method`, ADD KEY `idx_att_gym_date` (`gym_id`, `attendance_date`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='attendance' AND CONSTRAINT_NAME='fk_attendance_admin')>0,
  'ALTER TABLE `attendance` DROP FOREIGN KEY `fk_attendance_admin`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='attendance' AND INDEX_NAME='uq_member_attendance_date')>0,
  'ALTER TABLE `attendance` DROP INDEX `uq_member_attendance_date`, ADD UNIQUE KEY `uq_gym_member_att_date` (`gym_id`, `member_id`, `attendance_date`)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3. Migrate existing single-gym `admins` records into `users` (`gym_owner`) & link to Tenant #1
INSERT IGNORE INTO `users` (`role`, `full_name`, `email`, `password_hash`, `is_active`, `is_initial_setup_complete`, `last_login_at`, `created_at`)
SELECT 'gym_owner', `full_name`, `email`, `password_hash`, 1, 1, `last_login_at`, `created_at`
FROM `admins`;

INSERT IGNORE INTO `gym_owners` (`gym_id`, `user_id`, `role_label`, `is_primary`)
SELECT 1, u.`id`, 'Owner', 1
FROM `users` u
INNER JOIN `admins` a ON a.`email` = u.`email`
WHERE u.`role` = 'gym_owner';

UPDATE `gyms` g
SET g.`owner_user_id` = (
  SELECT go.`user_id` FROM `gym_owners` go WHERE go.`gym_id` = 1 ORDER BY go.`id` ASC LIMIT 1
)
WHERE g.`id` = 1 AND g.`owner_user_id` IS NULL;

-- 4. Issue active cryptographic QR credentials for existing members lacking one
INSERT INTO `qr_credentials` (`gym_id`, `member_id`, `credential_token`, `status`)
SELECT m.`gym_id`, m.`id`, UPPER(SHA2(CONCAT('HEMNITY-', m.`gym_id`, '-', m.`id`, '-', m.`member_code`, '-', UUID()), 256)), 'Active'
FROM `members` m
WHERE NOT EXISTS (
  SELECT 1 FROM `qr_credentials` q WHERE q.`member_id` = m.`id` AND q.`status` = 'Active'
);

SET FOREIGN_KEY_CHECKS = @prev_fk_checks;

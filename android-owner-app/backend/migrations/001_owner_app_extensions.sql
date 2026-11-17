-- Hemnity Gym SaaS — MySQL 8.0 / MariaDB Idempotent Schema Extension
-- Preserves existing historical records while adding transparent fee snapshots,
-- idempotency keys, active-plan controls, and QR attendance constraints.

-- 1. Membership Plans: ensure active toggle, duration_days, price, and tenant scope exist
ALTER TABLE membership_plans
    ADD COLUMN IF NOT EXISTS duration_days INT NOT NULL DEFAULT 30 AFTER name,
    ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER duration_days,
    ADD COLUMN IF NOT EXISTS plan_type VARCHAR(64) NOT NULL DEFAULT 'Monthly' AFTER price,
    ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER plan_type,
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER description,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_membership_plans_gym_active
    ON membership_plans (gym_id, is_active);

-- 2. Members: store historical fee snapshot separately from mutable catalog plan price
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS plan_id BIGINT UNSIGNED NULL AFTER gym_id,
    ADD COLUMN IF NOT EXISTS assigned_fee DECIMAL(10,2) NULL AFTER plan_name,
    ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER assigned_fee,
    ADD COLUMN IF NOT EXISTS final_fee DECIMAL(10,2) NULL AFTER discount_amount,
    ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER final_fee,
    ADD COLUMN IF NOT EXISTS remaining_due DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount_paid,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) NOT NULL DEFAULT 'Unpaid' AFTER remaining_due,
    ADD COLUMN IF NOT EXISTS fee_source VARCHAR(48) NOT NULL DEFAULT 'plan_default' AFTER payment_status,
    ADD COLUMN IF NOT EXISTS adjustment_reason VARCHAR(255) NULL AFTER fee_source,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) NULL AFTER adjustment_reason;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_members_gym_idempotency
    ON members (gym_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_members_gym_qr
    ON members (gym_id, active_qr_token);

-- 3. Payments Ledger: idempotency, receipt numbers, manual methods, and historical snapshot
ALTER TABLE member_payments
    ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(64) NULL AFTER id,
    ADD COLUMN IF NOT EXISTS plan_id BIGINT UNSIGNED NULL AFTER member_id,
    ADD COLUMN IF NOT EXISTS plan_name VARCHAR(120) NULL AFTER plan_id,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'cash' AFTER amount,
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'Paid' AFTER payment_method,
    ADD COLUMN IF NOT EXISTS notes VARCHAR(255) NULL AFTER status,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) NULL AFTER notes,
    ADD COLUMN IF NOT EXISTS paid_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_gym_idempotency
    ON member_payments (gym_id, idempotency_key);

-- 4. Attendance Logs: fast daily lookup per gym & member to reject duplicates cleanly
ALTER TABLE attendance_logs
    ADD COLUMN IF NOT EXISTS checkin_date DATE GENERATED ALWAYS AS (DATE(checked_in_at)) STORED,
    ADD COLUMN IF NOT EXISTS method VARCHAR(32) NOT NULL DEFAULT 'qr_scan' AFTER checked_in_at,
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'Checked In' AFTER method;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_member_daily
    ON attendance_logs (gym_id, member_id, checkin_date);

-- 5. Fee Audit Trail: records price overrides, discounts, and historical price snapshots
CREATE TABLE IF NOT EXISTS fee_audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gym_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    plan_id BIGINT UNSIGNED NULL,
    catalog_plan_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    assigned_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    final_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    remaining_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    fee_source VARCHAR(48) NOT NULL,
    adjustment_reason VARCHAR(255) NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fee_audit_gym_member (gym_id, member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

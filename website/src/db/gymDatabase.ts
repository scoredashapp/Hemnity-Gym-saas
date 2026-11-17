import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateDaysUntilExpiry,
  calculatePaymentBalance,
  calculatePlanExpiryDate,
  computeEffectiveMemberStatus,
  isValidIsoDate,
  normalizeTimeHms,
  type MembershipActionType,
  type PaymentMethod,
  type PaymentStatus,
  type StoredMemberStatus,
} from '../utils/gymRules.ts';
import {
  addSubscriptionDays,
  decryptSecret,
  encryptSecret,
  evaluateSubscriptionAccess,
  generateQrCredentialToken,
  parseFeaturesJson,
  slugifyGymName,
  verifyHmacSignature,
  type BillingCycle,
  type SubscriptionStatus,
} from '../utils/saasRules.ts';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

export function getLocalIsoDate(offsetDays = 0): string {
  const now = new Date();
  const utc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthOffsetIsoDate(monthsBack: number, dayOfMonth = 12): string {
  const now = new Date();
  const dt = new Date(Date.UTC(now.getFullYear(), now.getMonth() - monthsBack, Math.min(28, dayOfMonth)));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table);
  return Boolean(row);
}

export function createGymDatabase(dbFilePath?: string): DatabaseSync {
  const resolvedPath = dbFilePath ?? path.resolve(process.cwd(), 'data', 'gym.sqlite');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    // Phase 2: Automatic backup before upgrading an existing single-gym database
    if (fs.existsSync(resolvedPath)) {
      const probe = new DatabaseSync(resolvedPath);
      const hasLegacyMembers = tableExists(probe, 'members');
      const hasSaasGyms = tableExists(probe, 'gyms');
      probe.close();
      if (hasLegacyMembers && !hasSaasGyms) {
        const backupPath = `${resolvedPath}.pre_saas_backup`;
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(resolvedPath, backupPath);
        }
      }
    }
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Step 1: Ensure baseline tables exist (fresh installs or existing single-gym DBs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_initial_setup_complete INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS membership_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL DEFAULT 1,
      plan_name TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      price REAL NOT NULL,
      description TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER DEFAULT NULL,
      member_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      photo_path TEXT DEFAULT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT NULL,
      gender TEXT DEFAULT NULL,
      date_of_birth TEXT DEFAULT NULL,
      address TEXT DEFAULT NULL,
      emergency_contact TEXT DEFAULT NULL,
      joining_date TEXT NOT NULL,
      plan_id INTEGER DEFAULT NULL REFERENCES membership_plans(id) ON UPDATE CASCADE ON DELETE SET NULL,
      membership_start_date TEXT DEFAULT NULL,
      membership_expiry_date TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Inactive')),
      notes TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL DEFAULT 1,
      member_id INTEGER NOT NULL REFERENCES members(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      plan_id INTEGER NOT NULL REFERENCES membership_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      plan_name_snapshot TEXT NOT NULL,
      plan_price_snapshot REAL NOT NULL,
      start_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'Initial' CHECK (action_type IN ('Initial', 'Renewal', 'Extension', 'Plan Change')),
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Cancelled', 'Superseded')),
      notes TEXT DEFAULT NULL,
      created_by INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL DEFAULT 1,
      receipt_number TEXT NOT NULL UNIQUE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      membership_id INTEGER DEFAULT NULL REFERENCES memberships(id) ON UPDATE CASCADE ON DELETE SET NULL,
      plan_id INTEGER DEFAULT NULL REFERENCES membership_plans(id) ON UPDATE CASCADE ON DELETE SET NULL,
      amount REAL NOT NULL,
      plan_total_amount REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other')),
      transaction_ref TEXT DEFAULT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Paid' CHECK (payment_status IN ('Paid', 'Partial', 'Pending', 'Refunded')),
      payment_source TEXT NOT NULL DEFAULT 'manual',
      gateway_order_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      received_by INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL DEFAULT 1,
      member_id INTEGER NOT NULL REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_time TEXT DEFAULT NULL,
      check_in_method TEXT NOT NULL DEFAULT 'Manual',
      qr_credential_id INTEGER DEFAULT NULL,
      remarks TEXT DEFAULT NULL,
      recorded_by INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(member_id, attendance_date)
    );
  `);

  // Step 2: Migrate legacy gym_settings table (remove single-row CHECK (id=1) safely)
  if (!tableExists(db, 'gym_settings')) {
    db.exec(`
      CREATE TABLE gym_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gym_id INTEGER NOT NULL UNIQUE DEFAULT 1,
        gym_name TEXT NOT NULL DEFAULT 'GYM',
        logo_path TEXT DEFAULT NULL,
        address TEXT DEFAULT NULL,
        contact_number TEXT DEFAULT NULL,
        email TEXT DEFAULT NULL,
        currency_code TEXT NOT NULL DEFAULT 'INR',
        currency_symbol TEXT NOT NULL DEFAULT '₹',
        receipt_footer TEXT NOT NULL DEFAULT 'Thank you for training with GYM. Membership fees once paid are non-refundable and non-transferable.',
        operating_hours TEXT DEFAULT '05:30 AM - 10:00 PM (Mon-Sat)',
        qr_attendance_enabled INTEGER NOT NULL DEFAULT 1,
        require_photo_verify INTEGER NOT NULL DEFAULT 1,
        duplicate_checkin_rule TEXT NOT NULL DEFAULT 'daily',
        checkin_cooldown_hours INTEGER NOT NULL DEFAULT 12,
        id_card_accent_color TEXT NOT NULL DEFAULT '#ea580c',
        id_card_show_expiry INTEGER NOT NULL DEFAULT 1,
        id_card_template TEXT NOT NULL DEFAULT 'obsidian-split',
        notification_whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
        notification_email_enabled INTEGER NOT NULL DEFAULT 1,
        staff_permissions_json TEXT DEFAULT '{"frontdesk_checkin":true,"frontdesk_payments":true}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } else {
    const schemaRow = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gym_settings'")
      .get() as { sql?: string } | undefined;
    if (schemaRow?.sql && /CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(schemaRow.sql)) {
      db.exec(`
        BEGIN;
        CREATE TABLE gym_settings_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          gym_id INTEGER NOT NULL UNIQUE DEFAULT 1,
          gym_name TEXT NOT NULL DEFAULT 'GYM',
          logo_path TEXT DEFAULT NULL,
          address TEXT DEFAULT NULL,
          contact_number TEXT DEFAULT NULL,
          email TEXT DEFAULT NULL,
          currency_code TEXT NOT NULL DEFAULT 'INR',
          currency_symbol TEXT NOT NULL DEFAULT '₹',
          receipt_footer TEXT NOT NULL DEFAULT 'Thank you for training with GYM. Membership fees once paid are non-refundable and non-transferable.',
          operating_hours TEXT DEFAULT '05:30 AM - 10:00 PM (Mon-Sat)',
          qr_attendance_enabled INTEGER NOT NULL DEFAULT 1,
          require_photo_verify INTEGER NOT NULL DEFAULT 1,
          duplicate_checkin_rule TEXT NOT NULL DEFAULT 'daily',
          checkin_cooldown_hours INTEGER NOT NULL DEFAULT 12,
          id_card_accent_color TEXT NOT NULL DEFAULT '#ea580c',
          id_card_show_expiry INTEGER NOT NULL DEFAULT 1,
          id_card_template TEXT NOT NULL DEFAULT 'obsidian-split',
          notification_whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
          notification_email_enabled INTEGER NOT NULL DEFAULT 1,
          staff_permissions_json TEXT DEFAULT '{"frontdesk_checkin":true,"frontdesk_payments":true}',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO gym_settings_v2 (
          id, gym_id, gym_name, logo_path, address, contact_number, email,
          currency_code, currency_symbol, receipt_footer, updated_at
        )
        SELECT id, 1, gym_name, logo_path, address, contact_number, email,
               currency_code, currency_symbol, receipt_footer, updated_at
        FROM gym_settings;
        DROP TABLE gym_settings;
        ALTER TABLE gym_settings_v2 RENAME TO gym_settings;
        COMMIT;
      `);
    }
  }

  // Step 3: Non-destructive column upgrades on pre-existing single-gym tables
  const addColumnIfMissing = (table: string, col: string, ddl: string) => {
    if (!tableHasColumn(db, table, col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
    }
  };
  addColumnIfMissing('membership_plans', 'gym_id', 'gym_id INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('members', 'gym_id', 'gym_id INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('members', 'user_id', 'user_id INTEGER DEFAULT NULL');
  addColumnIfMissing('memberships', 'gym_id', 'gym_id INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('payments', 'gym_id', 'gym_id INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('payments', 'refund_amount', 'refund_amount REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('payments', 'payment_source', "payment_source TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing('payments', 'gateway_order_id', 'gateway_order_id INTEGER DEFAULT NULL');
  addColumnIfMissing('attendance', 'gym_id', 'gym_id INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('attendance', 'check_in_method', "check_in_method TEXT NOT NULL DEFAULT 'Manual'");
  addColumnIfMissing('attendance', 'qr_credential_id', 'qr_credential_id INTEGER DEFAULT NULL');

  addColumnIfMissing('gym_settings', 'gym_id', 'gym_id INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('gym_settings', 'operating_hours', "operating_hours TEXT DEFAULT '05:30 AM - 10:00 PM (Mon-Sat)'");
  addColumnIfMissing('gym_settings', 'qr_attendance_enabled', 'qr_attendance_enabled INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('gym_settings', 'require_photo_verify', 'require_photo_verify INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('gym_settings', 'duplicate_checkin_rule', "duplicate_checkin_rule TEXT NOT NULL DEFAULT 'daily'");
  addColumnIfMissing('gym_settings', 'checkin_cooldown_hours', 'checkin_cooldown_hours INTEGER NOT NULL DEFAULT 12');
  addColumnIfMissing('gym_settings', 'id_card_accent_color', "id_card_accent_color TEXT NOT NULL DEFAULT '#ea580c'");
  addColumnIfMissing('gym_settings', 'id_card_show_expiry', 'id_card_show_expiry INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('gym_settings', 'id_card_template', "id_card_template TEXT NOT NULL DEFAULT 'obsidian-split'");
  addColumnIfMissing('gym_settings', 'notification_whatsapp_enabled', 'notification_whatsapp_enabled INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('gym_settings', 'notification_email_enabled', 'notification_email_enabled INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('gym_settings', 'staff_permissions_json', 'staff_permissions_json TEXT DEFAULT NULL');

  // Step 4: Create all SaaS multi-tenant tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'gym_owner', 'gym_member')),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT NULL,
      password_hash TEXT NOT NULL,
      google_sub TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_initial_setup_complete INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saas_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      plan_name TEXT NOT NULL,
      tagline TEXT DEFAULT NULL,
      monthly_price REAL NOT NULL DEFAULT 0,
      quarterly_price REAL NOT NULL DEFAULT 0,
      yearly_price REAL NOT NULL DEFAULT 0,
      trial_days INTEGER NOT NULL DEFAULT 14,
      max_members INTEGER NOT NULL DEFAULT 150,
      max_branches INTEGER NOT NULL DEFAULT 1,
      discount_percent REAL NOT NULL DEFAULT 0,
      enabled_features_json TEXT NOT NULL,
      description TEXT DEFAULT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gyms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_code TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      owner_user_id INTEGER DEFAULT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      email TEXT DEFAULT NULL,
      phone TEXT DEFAULT NULL,
      address TEXT DEFAULT NULL,
      city TEXT DEFAULT NULL,
      logo_path TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Trial', 'Suspended', 'Pending')),
      operating_hours TEXT DEFAULT '05:30 AM - 10:00 PM',
      branch_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gym_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      role_label TEXT NOT NULL DEFAULT 'Owner',
      is_primary INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(gym_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS gym_saas_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL UNIQUE REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      saas_plan_id INTEGER NOT NULL REFERENCES saas_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Trial', 'Active', 'Grace', 'Expired', 'Suspended')),
      trial_ends_at TEXT DEFAULT NULL,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      grace_period_days INTEGER NOT NULL DEFAULT 7,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saas_subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      gym_id INTEGER NOT NULL REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      subscription_id INTEGER DEFAULT NULL REFERENCES gym_saas_subscriptions(id) ON UPDATE CASCADE ON DELETE SET NULL,
      saas_plan_id INTEGER DEFAULT NULL REFERENCES saas_plans(id) ON UPDATE CASCADE ON DELETE SET NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      payment_method TEXT NOT NULL DEFAULT 'Online',
      transaction_ref TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'Paid' CHECK (status IN ('Paid', 'Pending', 'Failed', 'Refunded')),
      paid_at TEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gym_payment_gateways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL UNIQUE REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'razorpay', 'cashfree', 'stripe')),
      merchant_key_id TEXT DEFAULT '',
      secret_encrypted TEXT DEFAULT '',
      webhook_secret_encrypted TEXT DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
      is_enabled INTEGER NOT NULL DEFAULT 0,
      auto_activate_membership INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT NOT NULL UNIQUE,
      gym_id INTEGER NOT NULL REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE,
      plan_id INTEGER DEFAULT NULL REFERENCES membership_plans(id) ON UPDATE CASCADE ON DELETE SET NULL,
      gateway_provider TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'Created' CHECK (status IN ('Created', 'Paid', 'Failed')),
      webhook_event_id TEXT DEFAULT NULL UNIQUE,
      payment_id INTEGER DEFAULT NULL REFERENCES payments(id) ON UPDATE CASCADE ON DELETE SET NULL,
      verified_signature TEXT DEFAULT NULL,
      raw_verified_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS qr_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE,
      credential_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Revoked')),
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT DEFAULT NULL,
      revoke_reason TEXT DEFAULT NULL,
      issued_by INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      brand_name TEXT NOT NULL DEFAULT 'Hemnity',
      software_name TEXT NOT NULL DEFAULT 'Hemnity Gym Management Software',
      base_url TEXT NOT NULL DEFAULT 'https://gym.hemnity.in',
      hero_badge TEXT NOT NULL DEFAULT 'Multi-Tenant SaaS Platform for Fitness Clubs',
      hero_title TEXT NOT NULL DEFAULT 'Run every gym branch, QR check-in desk, and member billing portal from one platform.',
      hero_subtitle TEXT NOT NULL DEFAULT 'Hemnity Gym Management Software gives gym owners independent white-label operations, verifiable QR ID card check-ins, per-gym payment gateways, and a dedicated member portal—hosted cleanly under your domain.',
      hero_cta_primary TEXT NOT NULL DEFAULT 'Start Free Trial',
      hero_cta_secondary TEXT NOT NULL DEFAULT 'Explore Owner Demo',
      intro_title TEXT NOT NULL DEFAULT 'Built for single clubs ready to scale into multi-gym fitness brands.',
      intro_body TEXT NOT NULL DEFAULT 'Each registered gym operates in an isolated tenant workspace with its own plans, member directory, printed QR ID cards, GST-ready receipts, and independent Razorpay or Cashfree credentials.',
      announcement_banner TEXT DEFAULT NULL,
      support_email TEXT NOT NULL DEFAULT 'support@hemnity.in',
      support_phone TEXT NOT NULL DEFAULT '+91 80 4123 8900',
      support_address TEXT NOT NULL DEFAULT 'Hemnity Technologies, Indiranagar 100ft Rd, Bengaluru 560038',
      seo_title TEXT NOT NULL DEFAULT 'Hemnity Gym Management Software — Multi-Tenant Gym SaaS',
      seo_description TEXT NOT NULL DEFAULT 'Manage gym memberships, QR attendance, printable ID cards, payments, and member portals with strict multi-tenant isolation.',
      maintenance_mode INTEGER NOT NULL DEFAULT 0,
      platform_gateway_provider TEXT NOT NULL DEFAULT 'razorpay',
      platform_gateway_key TEXT DEFAULT '',
      platform_gateway_secret_encrypted TEXT DEFAULT '',
      platform_gateway_mode TEXT NOT NULL DEFAULT 'test',
      smtp_host TEXT DEFAULT 'smtp.gmail.com',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      smtp_user TEXT DEFAULT '',
      smtp_password_encrypted TEXT DEFAULT '',
      smtp_from_email TEXT DEFAULT 'noreply@hemnity.in',
      smtp_from_name TEXT DEFAULT 'Hemnity Gym Platform',
      smtp_encryption TEXT NOT NULL DEFAULT 'tls',
      whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
      google_oauth_enabled INTEGER NOT NULL DEFAULT 0,
      google_client_id TEXT DEFAULT '',
      google_client_secret_encrypted TEXT DEFAULT '',
      default_grace_period_days INTEGER NOT NULL DEFAULT 7,
      email_template_welcome TEXT NOT NULL DEFAULT 'Welcome to Hemnity Gym Management Software! Your workspace {{gym_name}} is active.',
      email_template_expiry TEXT NOT NULL DEFAULT 'Reminder: Your {{gym_name}} subscription expires on {{expiry_date}}. Renew to retain full access.',
      legal_privacy_summary TEXT NOT NULL DEFAULT 'Hemnity isolates each gym tenant in strict logical partitions. Member biometrics or Aadhaar numbers are never stored in QR codes; QR credentials carry only revocable cryptographic tokens.',
      legal_terms_summary TEXT NOT NULL DEFAULT 'Subscriptions renew per selected billing cycle. Expired accounts enter a configurable grace window before write restrictions apply; historical member, attendance, and payment records are never deleted upon expiry.',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER NOT NULL REFERENCES gyms(id) ON UPDATE CASCADE ON DELETE CASCADE,
      user_id INTEGER DEFAULT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      sender_name TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
      admin_reply TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gym_id INTEGER DEFAULT NULL,
      user_id INTEGER DEFAULT NULL,
      channel TEXT NOT NULL DEFAULT 'in_app',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER DEFAULT NULL,
      actor_role TEXT NOT NULL,
      gym_id INTEGER DEFAULT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT DEFAULT NULL,
      details_json TEXT DEFAULT NULL,
      ip_address TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      gym_id INTEGER DEFAULT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT 'Mobile App Token',
      last_used_at TEXT DEFAULT NULL,
      expires_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_members_gym ON members(gym_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    CREATE INDEX IF NOT EXISTS idx_members_expiry ON members(membership_expiry_date);
    CREATE INDEX IF NOT EXISTS idx_plans_gym ON membership_plans(gym_id);
    CREATE INDEX IF NOT EXISTS idx_payments_gym_date ON payments(gym_id, payment_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_gym_date ON attendance(gym_id, attendance_date);
    CREATE INDEX IF NOT EXISTS idx_qr_gym_member ON qr_credentials(gym_id, member_id);
    CREATE INDEX IF NOT EXISTS idx_audit_gym ON audit_logs(gym_id, created_at);
  `);

  seedSingleGymBaselineIfEmpty(db);
  migrateAndSeedSaasLayer(db);
  syncExpiredMemberships(db);
  return db;
}

function seedSingleGymBaselineIfEmpty(db: DatabaseSync): void {
  const settingsRow = db.prepare('SELECT id FROM gym_settings WHERE gym_id = 1 LIMIT 1').get();
  if (!settingsRow) {
    db.prepare(`
      INSERT INTO gym_settings (
        gym_id, gym_name, logo_path, address, contact_number, email,
        currency_code, currency_symbol, receipt_footer
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Ironworks Fitness Club',
      null,
      '2nd Floor, Ironworks Plaza, MG Road, Bengaluru, Karnataka 560001',
      '+91 98765 43210',
      'desk@gymfitness.in',
      'INR',
      '₹',
      'Thank you for training with Ironworks Fitness Club. Membership fees once paid are non-refundable and non-transferable.'
    );
  }

  const planCount = Number((db.prepare('SELECT COUNT(*) AS c FROM membership_plans').get() as { c: number }).c);
  if (planCount === 0) {
    const insPlan = db.prepare(`
      INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active)
      VALUES (1, ?, ?, ?, ?, 1)
    `);
    insPlan.run('Monthly', 30, 1000.0, 'Full gym floor, strength & cardio equipment access for 30 days.');
    insPlan.run('Quarterly', 90, 2700.0, '90-day strength, cardio & functional training access with quarterly body composition check.');
    insPlan.run('Half-Yearly', 180, 5000.0, '180-day unrestricted gym floor access with 2 complimentary trainer orientation sessions.');
    insPlan.run('Yearly', 365, 9000.0, '365-day all-access annual membership with best value savings and priority locker access.');
  }

  const adminCount = Number((db.prepare('SELECT COUNT(*) AS c FROM admins').get() as { c: number }).c);
  let adminId = 1;
  if (adminCount === 0) {
    const randomBootstrapSecret = crypto.randomBytes(24).toString('hex');
    const info = db.prepare(`
      INSERT INTO admins (full_name, email, password_hash, is_initial_setup_complete, last_login_at)
      VALUES (?, ?, ?, 0, datetime('now'))
    `).run('Arjun Mehta', 'admin@gymfitness.in', hashPassword(randomBootstrapSecret));
    adminId = Number(info.lastInsertRowid);
  } else {
    const existingAdmin = db.prepare('SELECT id FROM admins ORDER BY id ASC LIMIT 1').get() as { id: number };
    adminId = existingAdmin.id;
  }

  const memberCount = Number((db.prepare('SELECT COUNT(*) AS c FROM members').get() as { c: number }).c);
  if (memberCount > 0) {
    return;
  }

  const today = getLocalIsoDate(0);
  const year = Number(today.slice(0, 4));
  const sampleMembers: Array<{
    name: string;
    phone: string;
    email: string;
    gender: string;
    dob: string;
    address: string;
    emergency: string;
    joinOffset: number;
    planId: number;
    planName: string;
    planPrice: number;
    startOffset: number;
    expiryOffset: number;
    status: StoredMemberStatus;
    notes: string;
  }> = [
    {
      name: 'Vikramaditya Rao',
      phone: '+91 98450 11204',
      email: 'vikram.rao@example.com',
      gender: 'Male',
      dob: '1993-04-14',
      address: '42 Indiranagar 100 Feet Rd, Bengaluru',
      emergency: 'Kavita Rao (+91 98450 11205)',
      joinOffset: -150,
      planId: 4,
      planName: 'Yearly',
      planPrice: 9000,
      startOffset: -150,
      expiryOffset: 215,
      status: 'Active',
      notes: 'Morning strength training cohort (6:30 AM).',
    },
    {
      name: 'Ananya Deshmukh',
      phone: '+91 98201 44812',
      email: 'ananya.d@example.com',
      gender: 'Female',
      dob: '1996-08-22',
      address: '18 Koramangala 4th Block, Bengaluru',
      emergency: 'Suresh Deshmukh (+91 98201 44800)',
      joinOffset: -45,
      planId: 3,
      planName: 'Half-Yearly',
      planPrice: 5000,
      startOffset: -45,
      expiryOffset: 135,
      status: 'Active',
      notes: 'Focused on olympic lifting & mobility.',
    },
    {
      name: 'Siddharth Verma',
      phone: '9886123490',
      email: 'siddharth.v@example.com',
      gender: 'Male',
      dob: '1998-11-05',
      address: '77 HSR Layout Sector 2, Bengaluru',
      emergency: 'Rekha Verma (+91 98861 23491)',
      joinOffset: -87,
      planId: 2,
      planName: 'Quarterly',
      planPrice: 2700,
      startOffset: -87,
      expiryOffset: 3,
      status: 'Active',
      notes: 'Prefers evening workouts.',
    },
    {
      name: 'Meera Joshi',
      phone: '9740088123',
      email: 'meera.joshi@example.com',
      gender: 'Female',
      dob: '1995-02-19',
      address: '12 Jayanagar 3rd Block, Bengaluru',
      emergency: 'Prakash Joshi (+91 97400 88100)',
      joinOffset: -25,
      planId: 1,
      planName: 'Monthly',
      planPrice: 1000,
      startOffset: -25,
      expiryOffset: 5,
      status: 'Active',
      notes: 'Cardio and core conditioning.',
    },
    {
      name: 'Rajeev Malhotra',
      phone: '9900155234',
      email: 'rajeev.m@example.com',
      gender: 'Male',
      dob: '1989-07-30',
      address: '305 Brigade Metropolis, Whitefield, Bengaluru',
      emergency: 'Nidhi Malhotra (+91 99001 55235)',
      joinOffset: -94,
      planId: 2,
      planName: 'Quarterly',
      planPrice: 2700,
      startOffset: -94,
      expiryOffset: -4,
      status: 'Expired',
      notes: 'Requested callback for Half-Yearly upgrade.',
    },
    {
      name: 'Pooja Iyer',
      phone: '9844277109',
      email: 'pooja.iyer@example.com',
      gender: 'Female',
      dob: '1999-12-11',
      address: '9 Malleshwaram 8th Cross, Bengaluru',
      emergency: 'Ramesh Iyer (+91 98442 77100)',
      joinOffset: -41,
      planId: 1,
      planName: 'Monthly',
      planPrice: 1000,
      startOffset: -41,
      expiryOffset: -11,
      status: 'Expired',
      notes: 'Travelling out of town; due back this week.',
    },
    {
      name: 'Karthik Menon',
      phone: '+91 96114 33920',
      email: 'karthik.menon@example.com',
      gender: 'Male',
      dob: '1994-05-03',
      address: '64 Ulsoor Lake Rd, Bengaluru',
      emergency: 'Lakshmi Menon (+91 96114 33921)',
      joinOffset: -10,
      planId: 2,
      planName: 'Quarterly',
      planPrice: 2700,
      startOffset: -10,
      expiryOffset: 80,
      status: 'Active',
      notes: 'Partial fee paid on joining; balance due end of week.',
    },
    {
      name: 'Neha Kapoor',
      phone: '+91 98112 60944',
      email: 'neha.kapoor@example.com',
      gender: 'Female',
      dob: '1997-09-17',
      address: '21 Richmond Town, Bengaluru',
      emergency: 'Vivek Kapoor (+91 98112 60945)',
      joinOffset: -3,
      planId: 3,
      planName: 'Half-Yearly',
      planPrice: 5000,
      startOffset: -3,
      expiryOffset: 177,
      status: 'Active',
      notes: 'Personal locker #14 assigned.',
    },
    {
      name: 'Devendra Kulkarni',
      phone: '+91 94480 71230',
      email: 'dev.kulkarni@example.com',
      gender: 'Male',
      dob: '1991-01-25',
      address: '51 Banashankari 2nd Stage, Bengaluru',
      emergency: 'Sunita Kulkarni (+91 94480 71231)',
      joinOffset: -210,
      planId: 1,
      planName: 'Monthly',
      planPrice: 1000,
      startOffset: -210,
      expiryOffset: -180,
      status: 'Inactive',
      notes: 'Relocated temporarily; account paused.',
    },
  ];

  const insMember = db.prepare(`
    INSERT INTO members (
      gym_id, member_code, full_name, phone, email, gender, date_of_birth,
      address, emergency_contact, joining_date, plan_id,
      membership_start_date, membership_expiry_date, status, notes
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insMembership = db.prepare(`
    INSERT INTO memberships (
      gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
      start_date, expiry_date, action_type, status, notes, created_by, created_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insPayment = db.prepare(`
    INSERT INTO payments (
      gym_id, receipt_number, member_id, membership_id, plan_id,
      amount, plan_total_amount, balance_due, payment_date,
      payment_method, transaction_ref, payment_status, notes, received_by
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insAttendance = db.prepare(`
    INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_out_time, check_in_method, remarks, recorded_by)
    VALUES (1, ?, ?, ?, ?, 'Manual', ?, ?)
  `);

  db.exec('BEGIN');
  try {
    const memberIds: number[] = [];
    const membershipIds: number[] = [];

    sampleMembers.forEach((m, idx) => {
      const code = `GYM-${year}-${String(idx + 1).padStart(4, '0')}`;
      const joinDate = getLocalIsoDate(m.joinOffset);
      const startDate = getLocalIsoDate(m.startOffset);
      const expDate = getLocalIsoDate(m.expiryOffset);

      const res = insMember.run(
        code,
        m.name,
        m.phone,
        m.email,
        m.gender,
        m.dob,
        m.address,
        m.emergency,
        joinDate,
        m.planId,
        startDate,
        expDate,
        m.status,
        m.notes
      );
      const mid = Number(res.lastInsertRowid);
      memberIds.push(mid);

      const mhStatus = m.status === 'Expired' ? 'Expired' : m.status === 'Inactive' ? 'Cancelled' : 'Active';
      const mhRes = insMembership.run(
        mid,
        m.planId,
        m.planName,
        m.planPrice,
        startDate,
        expDate,
        idx % 3 === 0 ? 'Renewal' : 'Initial',
        mhStatus,
        'Membership enrollment record.',
        adminId,
        `${startDate} 10:00:00`
      );
      membershipIds.push(Number(mhRes.lastInsertRowid));
    });

    const seedPayments: Array<{
      rcp: string;
      mIdx: number;
      planId: number;
      amount: number;
      total: number;
      balance: number;
      date: string;
      method: PaymentMethod;
      ref: string | null;
      status: PaymentStatus;
      note: string;
    }> = [
      { rcp: 'RCP-SEED-1001', mIdx: 0, planId: 4, amount: 9000, total: 9000, balance: 0, date: getMonthOffsetIsoDate(5, 10), method: 'Card', ref: 'POS-882410', status: 'Paid', note: 'Annual membership settlement.' },
      { rcp: 'RCP-SEED-1002', mIdx: 8, planId: 1, amount: 1000, total: 1000, balance: 0, date: getMonthOffsetIsoDate(4, 14), method: 'Cash', ref: null, status: 'Paid', note: 'Monthly fee.' },
      { rcp: 'RCP-SEED-1003', mIdx: 4, planId: 2, amount: 2700, total: 2700, balance: 0, date: getMonthOffsetIsoDate(3, 8), method: 'UPI', ref: 'UPI-339104829', status: 'Paid', note: 'Quarterly plan payment.' },
      { rcp: 'RCP-SEED-1004', mIdx: 2, planId: 2, amount: 2700, total: 2700, balance: 0, date: getMonthOffsetIsoDate(2, 18), method: 'UPI', ref: 'UPI-618204911', status: 'Paid', note: 'Quarterly plan payment.' },
      { rcp: 'RCP-SEED-1005', mIdx: 1, planId: 3, amount: 5000, total: 5000, balance: 0, date: getMonthOffsetIsoDate(1, 11), method: 'Bank Transfer', ref: 'NEFT-9041221', status: 'Paid', note: 'Half-yearly membership fee.' },
      { rcp: 'RCP-SEED-1006', mIdx: 3, planId: 1, amount: 1000, total: 1000, balance: 0, date: getLocalIsoDate(-12), method: 'UPI', ref: 'UPI-774190231', status: 'Paid', note: 'Monthly plan collection.' },
      { rcp: 'RCP-SEED-1007', mIdx: 6, planId: 2, amount: 1500, total: 2700, balance: 1200, date: getLocalIsoDate(-8), method: 'Cash', ref: null, status: 'Partial', note: 'First installment paid; ₹1,200 balance due.' },
      { rcp: 'RCP-SEED-1008', mIdx: 7, planId: 3, amount: 5000, total: 5000, balance: 0, date: getLocalIsoDate(-2), method: 'UPI', ref: 'UPI-994012873', status: 'Paid', note: 'Half-Yearly full payment.' },
      { rcp: 'RCP-SEED-1009', mIdx: 0, planId: 1, amount: 1000, total: 1000, balance: 0, date: today, method: 'Card', ref: 'POS-991042', status: 'Paid', note: 'Personal locker & assessment add-on.' },
    ];

    for (const p of seedPayments) {
      insPayment.run(
        p.rcp,
        memberIds[p.mIdx],
        membershipIds[p.mIdx],
        p.planId,
        p.amount,
        p.total,
        p.balance,
        p.date,
        p.method,
        p.ref,
        p.status,
        p.note,
        adminId
      );
    }

    insAttendance.run(memberIds[0], today, '06:35:00', '07:50:00', 'Strength & barbell compound session', adminId);
    insAttendance.run(memberIds[1], today, '07:15:00', '08:30:00', 'Olympic lifting platform', adminId);
    insAttendance.run(memberIds[6], today, '08:40:00', null, 'Upper body hypertrophy', adminId);
    insAttendance.run(memberIds[7], today, '09:10:00', null, 'Orientation session #1', adminId);

    const yesterday = getLocalIsoDate(-1);
    insAttendance.run(memberIds[0], yesterday, '06:40:00', '07:55:00', 'Conditioning', adminId);
    insAttendance.run(memberIds[2], yesterday, '18:20:00', '19:35:00', 'Evening cardio & weights', adminId);
    insAttendance.run(memberIds[3], yesterday, '19:05:00', '20:00:00', 'Core circuit', adminId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function migrateAndSeedSaasLayer(db: DatabaseSync): void {
  const today = getLocalIsoDate(0);

  // 1. Ensure Platform Settings (singleton id=1)
  const platExists = db.prepare('SELECT id FROM platform_settings WHERE id = 1').get();
  if (!platExists) {
    db.prepare(`
      INSERT INTO platform_settings (id) VALUES (1)
    `).run();
  }

  // 2. Ensure Platform FAQs
  const faqCount = Number((db.prepare('SELECT COUNT(*) AS c FROM platform_faqs').get() as { c: number }).c);
  if (faqCount === 0) {
    const insFaq = db.prepare('INSERT INTO platform_faqs (question, answer, sort_order, is_active) VALUES (?, ?, ?, 1)');
    insFaq.run(
      'Can we upgrade our existing single-gym database without losing members or payment receipts?',
      'Yes. Our idempotent migration script assigns all existing members, plans, memberships, payments, and attendance logs to your default primary gym tenant while preserving every ID, receipt number, and timestamp.',
      1
    );
    insFaq.run(
      'How does QR attendance prevent copied or shared static ID cards?',
      'Each member receives a non-sequential, revocable cryptographic QR token instead of sequential IDs or personal data. Front-desk scanners display the member photograph on check-in for staff visual confirmation, enforce duplicate check-in rules, log every scan, and let owners revoke/reissue lost cards in one click.',
      2
    );
    insFaq.run(
      'Are gym membership payments separated from Hemnity SaaS subscription billing?',
      'Completely. Each gym owner configures their own Razorpay or Cashfree credentials encrypted server-side to collect member fees directly. Hemnity platform billing invoices gym owners separately in the SaaS subscription ledger.',
      3
    );
    insFaq.run(
      'What happens to our gym data if our Hemnity subscription expires?',
      'Nothing is ever deleted. Expired accounts enter a configurable grace period first, then restrict new member creations or check-ins until renewed while keeping full historical reports and billing access intact.',
      4
    );
    insFaq.run(
      'Does Hemnity work on shared cPanel hosting and install as an app?',
      'Yes. The downloadable cPanel deployment bundle runs on standard PHP 8.1+ and MySQL/MariaDB with Apache .htaccess routing, and the frontend installs as a Progressive Web App (Add to Home Screen) on Android, iOS, and desktop.',
      5
    );
  }

  // 3. Ensure SaaS Pricing Plans (database-driven)
  const saasPlanCount = Number((db.prepare('SELECT COUNT(*) AS c FROM saas_plans').get() as { c: number }).c);
  if (saasPlanCount === 0) {
    const insSaasPlan = db.prepare(`
      INSERT INTO saas_plans (
        slug, plan_name, tagline, monthly_price, quarterly_price, yearly_price,
        trial_days, max_members, max_branches, discount_percent, enabled_features_json,
        description, is_featured, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    insSaasPlan.run(
      'starter',
      'Starter Club',
      'For independent single-floor gyms',
      999,
      2699,
      9590,
      14,
      150,
      1,
      0,
      JSON.stringify({ qr_attendance: true, payment_gateway: false, reports_export: true, id_cards: true, member_portal: true }),
      'Up to 150 active members, QR & keyboard check-ins, printable member ID cards, WhatsApp expiry alerts, and CSV exports.',
      0,
      1
    );
    insSaasPlan.run(
      'growth',
      'Growth Pro',
      'For scaling strength & fitness studios',
      1999,
      5499,
      19190,
      14,
      600,
      3,
      10,
      JSON.stringify({ qr_attendance: true, payment_gateway: true, reports_export: true, id_cards: true, member_portal: true }),
      'Up to 600 members across 3 branches, per-gym Razorpay/Cashfree online renewals, bulk ID card printing, and member portal.',
      1,
      2
    );
    insSaasPlan.run(
      'enterprise',
      'Enterprise Chain',
      'For multi-branch fitness franchises',
      3999,
      10999,
      38390,
      21,
      5000,
      15,
      15,
      JSON.stringify({ qr_attendance: true, payment_gateway: true, reports_export: true, id_cards: true, member_portal: true }),
      'Up to 5,000 members and 15 branches, full REST API access for mobile apps, priority support, and custom branding.',
      0,
      3
    );
  }

  // 4. Ensure Super Admin account exists (random bootstrap password, never hardcoded)
  let superAdmin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!superAdmin) {
    const info = db
      .prepare(`
        INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete)
        VALUES ('super_admin', 'Hemnity Platform Admin', 'superadmin@hemnity.in', '+91 80 4123 8900', ?, 1, 0)
      `)
      .run(hashPassword(crypto.randomBytes(24).toString('hex')));
    superAdmin = { id: Number(info.lastInsertRowid) };
  }

  // 5. Migrate existing `admins` into `users` as Gym Owner of Default Tenant Gym #1
  const existingAdmins = db.prepare('SELECT * FROM admins ORDER BY id ASC').all() as Array<{
    id: number;
    full_name: string;
    email: string;
    password_hash: string;
    is_initial_setup_complete: number;
    last_login_at: string | null;
  }>;

  let primaryOwnerUserId: number;
  const firstAdmin = existingAdmins[0];
  if (firstAdmin) {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(firstAdmin.email) as
      | { id: number }
      | undefined;
    if (existingUser) {
      primaryOwnerUserId = existingUser.id;
    } else {
      const info = db
        .prepare(`
          INSERT INTO users (role, full_name, email, password_hash, is_active, is_initial_setup_complete, last_login_at)
          VALUES ('gym_owner', ?, ?, ?, 1, ?, ?)
        `)
        .run(
          firstAdmin.full_name,
          firstAdmin.email,
          firstAdmin.password_hash,
          firstAdmin.is_initial_setup_complete,
          firstAdmin.last_login_at
        );
      primaryOwnerUserId = Number(info.lastInsertRowid);
    }
  } else {
    const info = db
      .prepare(`
        INSERT INTO users (role, full_name, email, password_hash, is_active, is_initial_setup_complete)
        VALUES ('gym_owner', 'Arjun Mehta', 'admin@gymfitness.in', ?, 1, 0)
      `)
      .run(hashPassword(crypto.randomBytes(24).toString('hex')));
    primaryOwnerUserId = Number(info.lastInsertRowid);
  }

  // 6. Ensure Default Tenant Gym #1 exists and preserves existing gym_settings
  const gym1 = db.prepare('SELECT id FROM gyms WHERE id = 1 LIMIT 1').get();
  const gs1 = db.prepare('SELECT * FROM gym_settings WHERE gym_id = 1 LIMIT 1').get() as
    | { gym_name: string; email: string | null; contact_number: string | null; address: string | null; logo_path: string | null }
    | undefined;

  if (!gym1) {
    const g1Name = gs1?.gym_name || 'Ironworks Fitness Club';
    db.prepare(`
      INSERT INTO gyms (
        id, gym_code, slug, name, owner_user_id, email, phone, address, city, logo_path, status, operating_hours, branch_count
      ) VALUES (1, 'HMN-GYM-0001', ?, ?, ?, ?, ?, ?, 'Bengaluru', ?, 'Active', '05:30 AM - 10:00 PM (Mon-Sat)', 1)
    `).run(
      slugifyGymName(g1Name),
      g1Name,
      primaryOwnerUserId,
      gs1?.email || 'desk@gymfitness.in',
      gs1?.contact_number || '+91 98765 43210',
      gs1?.address || '2nd Floor, Ironworks Plaza, MG Road, Bengaluru',
      gs1?.logo_path || null
    );
  }

  db.prepare(`
    INSERT OR IGNORE INTO gym_owners (gym_id, user_id, role_label, is_primary)
    VALUES (1, ?, 'Primary Owner', 1)
  `).run(primaryOwnerUserId);

  // Ensure Gym #1 has SaaS Subscription & Payment Gateway row
  const growthPlan = db.prepare("SELECT id, trial_days FROM saas_plans WHERE slug = 'growth' LIMIT 1").get() as
    | { id: number; trial_days: number }
    | undefined;
  const fallbackPlan = db.prepare('SELECT id, trial_days FROM saas_plans ORDER BY id ASC LIMIT 1').get() as {
    id: number;
    trial_days: number;
  };
  const g1PlanId = growthPlan?.id ?? fallbackPlan.id;

  const sub1 = db.prepare('SELECT id FROM gym_saas_subscriptions WHERE gym_id = 1 LIMIT 1').get();
  if (!sub1) {
    const start = getLocalIsoDate(-15);
    const end = getLocalIsoDate(350);
    const subRes = db
      .prepare(`
        INSERT INTO gym_saas_subscriptions (
          gym_id, saas_plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, grace_period_days
        ) VALUES (1, ?, 'yearly', 'Active', ?, ?, ?, 7)
      `)
      .run(g1PlanId, getLocalIsoDate(-1), start, end);

    db.prepare(`
      INSERT OR IGNORE INTO saas_subscription_payments (
        invoice_number, gym_id, subscription_id, saas_plan_id, billing_cycle, amount, currency, payment_method, transaction_ref, status, paid_at, notes
      ) VALUES ('HMN-INV-2026-0001', 1, ?, ?, 'yearly', 17271.00, 'INR', 'Razorpay', 'pay_HMN91028371', 'Paid', ?, 'Annual Growth Pro SaaS subscription')
    `).run(Number(subRes.lastInsertRowid), g1PlanId, `${start} 11:20:00`);
  }

  const gw1 = db.prepare('SELECT id FROM gym_payment_gateways WHERE gym_id = 1 LIMIT 1').get();
  if (!gw1) {
    db.prepare(`
      INSERT INTO gym_payment_gateways (
        gym_id, provider, merchant_key_id, secret_encrypted, webhook_secret_encrypted, mode, is_enabled, auto_activate_membership
      ) VALUES (1, 'razorpay', 'rzp_test_ironworks_001', ?, ?, 'test', 1, 1)
    `).run(
      encryptSecret('rzp_secret_demo_ironworks_991'),
      encryptSecret('whsec_ironworks_demo_2026')
    );
  }

  // 7. Ensure all existing Gym 1 members have QR credentials and member portal accounts where emails exist
  const gym1Members = db.prepare('SELECT id, full_name, email, phone, user_id FROM members WHERE gym_id = 1').all() as Array<{
    id: number;
    full_name: string;
    email: string | null;
    phone: string;
    user_id: number | null;
  }>;

  const findQr = db.prepare("SELECT id FROM qr_credentials WHERE member_id = ? AND status = 'Active' LIMIT 1");
  const insQr = db.prepare(`
    INSERT INTO qr_credentials (gym_id, member_id, credential_token, status, issued_by)
    VALUES (?, ?, ?, 'Active', ?)
  `);

  for (const m of gym1Members) {
    if (!findQr.get(m.id)) {
      insQr.run(1, m.id, generateQrCredentialToken(), primaryOwnerUserId);
    }
    if (!m.user_id && m.email) {
      let memberUser = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(m.email) as
        | { id: number }
        | undefined;
      if (!memberUser) {
        const uRes = db
          .prepare(`
            INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete)
            VALUES ('gym_member', ?, ?, ?, ?, 1, 1)
          `)
          .run(m.full_name, m.email, m.phone, hashPassword(crypto.randomBytes(24).toString('hex')));
        memberUser = { id: Number(uRes.lastInsertRowid) };
      }
      db.prepare('UPDATE members SET user_id = ? WHERE id = ?').run(memberUser.id, m.id);
    }
  }

  // 8. Seed a second independent Gym Tenant (#2: IronPulse Performance Studio) for multi-tenant isolation & multi-gym member demo
  const gym2 = db.prepare('SELECT id FROM gyms WHERE id = 2 LIMIT 1').get();
  if (!gym2) {
    const owner2Res = db
      .prepare(`
        INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete)
        VALUES ('gym_owner', 'Kavya Nair', 'kavya@ironpulse.in', '+91 99002 77881', ?, 1, 1)
      `)
      .run(hashPassword(crypto.randomBytes(24).toString('hex')));
    const owner2Id = Number(owner2Res.lastInsertRowid);

    db.prepare(`
      INSERT INTO gyms (
        id, gym_code, slug, name, owner_user_id, email, phone, address, city, logo_path, status, operating_hours, branch_count
      ) VALUES (2, 'HMN-GYM-0002', 'ironpulse-studio', 'IronPulse Performance Studio', ?, 'hello@ironpulse.in', '+91 99002 77881', '3rd Cross, 12th Main Indiranagar, Bengaluru', 'Bengaluru', NULL, 'Trial', '06:00 AM - 10:30 PM', 1)
    `).run(owner2Id);

    db.prepare('INSERT INTO gym_owners (gym_id, user_id, role_label, is_primary) VALUES (2, ?, ?, 1)').run(
      owner2Id,
      'Primary Owner'
    );

    db.prepare(`
      INSERT INTO gym_settings (
        gym_id, gym_name, address, contact_number, email, currency_code, currency_symbol, receipt_footer, operating_hours, id_card_accent_color
      ) VALUES (2, 'IronPulse Performance Studio', '3rd Cross, 12th Main Indiranagar, Bengaluru', '+91 99002 77881', 'hello@ironpulse.in', 'INR', '₹', 'IronPulse Performance Studio — Strength & Conditioning.', '06:00 AM - 10:30 PM', '#0f172a')
    `).run();

    const starterPlan = db.prepare("SELECT id FROM saas_plans WHERE slug = 'starter' LIMIT 1").get() as { id: number };
    const sub2Res = db
      .prepare(`
        INSERT INTO gym_saas_subscriptions (
          gym_id, saas_plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, grace_period_days
        ) VALUES (2, ?, 'monthly', 'Trial', ?, ?, ?, 7)
      `)
      .run(starterPlan.id, getLocalIsoDate(11), getLocalIsoDate(-3), getLocalIsoDate(11));

    db.prepare(`
      INSERT INTO saas_subscription_payments (
        invoice_number, gym_id, subscription_id, saas_plan_id, billing_cycle, amount, currency, payment_method, transaction_ref, status, paid_at, notes
      ) VALUES ('HMN-INV-2026-0002', 2, ?, ?, 'monthly', 999.00, 'INR', 'Cashfree', 'cf_pending_002', 'Pending', NULL, 'Upcoming trial conversion invoice')
    `).run(Number(sub2Res.lastInsertRowid), starterPlan.id);

    db.prepare(`
      INSERT INTO gym_payment_gateways (
        gym_id, provider, merchant_key_id, secret_encrypted, webhook_secret_encrypted, mode, is_enabled, auto_activate_membership
      ) VALUES (2, 'cashfree', 'cf_test_ironpulse_02', ?, ?, 'test', 1, 1)
    `).run(encryptSecret('cf_secret_demo_ironpulse_882'), encryptSecret('whsec_ironpulse_demo_2026'));

    // Seed Gym 2's own membership plans
    const insP2 = db.prepare(
      'INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active) VALUES (2, ?, ?, ?, ?, 1)'
    );
    const g2Monthly = Number(insP2.run('Strength Monthly', 30, 1800, 'Full barbell & turf studio access for 30 days.').lastInsertRowid);
    const g2Quarterly = Number(insP2.run('Athletic Quarterly', 90, 4800, '90-day S&C coaching and metabolic conditioning.').lastInsertRowid);

    // Link Ananya Deshmukh (ananya.d@example.com) to Gym 2 as well so multi-gym member switching works natively!
    const ananyaUser = db.prepare("SELECT id FROM users WHERE email = 'ananya.d@example.com' LIMIT 1").get() as
      | { id: number }
      | undefined;

    const year = Number(today.slice(0, 4));
    const g2Members = [
      {
        code: `IP-${year}-0001`,
        userId: ananyaUser?.id ?? null,
        name: 'Ananya Deshmukh',
        phone: '+91 98201 44812',
        email: 'ananya.d@example.com',
        planId: g2Quarterly,
        planName: 'Athletic Quarterly',
        price: 4800,
        startOffset: -18,
        expOffset: 72,
        status: 'Active' as StoredMemberStatus,
      },
      {
        code: `IP-${year}-0002`,
        userId: null,
        name: 'Rohan Deshpande',
        phone: '+91 98455 22190',
        email: 'rohan.deshpande@example.com',
        planId: g2Monthly,
        planName: 'Strength Monthly',
        price: 1800,
        startOffset: -26,
        expOffset: 4,
        status: 'Active' as StoredMemberStatus,
      },
      {
        code: `IP-${year}-0003`,
        userId: null,
        name: 'Tanvi Shetty',
        phone: '+91 97390 88412',
        email: 'tanvi.shetty@example.com',
        planId: g2Monthly,
        planName: 'Strength Monthly',
        price: 1800,
        startOffset: -36,
        expOffset: -6,
        status: 'Expired' as StoredMemberStatus,
      },
    ];

    for (const gm of g2Members) {
      let uid = gm.userId;
      if (!uid && gm.email) {
        const uRes = db
          .prepare(`
            INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete)
            VALUES ('gym_member', ?, ?, ?, ?, 1, 1)
          `)
          .run(gm.name, gm.email, gm.phone, hashPassword(crypto.randomBytes(24).toString('hex')));
        uid = Number(uRes.lastInsertRowid);
      }

      const start = getLocalIsoDate(gm.startOffset);
      const exp = getLocalIsoDate(gm.expOffset);
      const mRes = db
        .prepare(`
          INSERT INTO members (
            gym_id, user_id, member_code, full_name, phone, email, joining_date,
            plan_id, membership_start_date, membership_expiry_date, status, notes
          ) VALUES (2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IronPulse tenant member')
        `)
        .run(uid, gm.code, gm.name, gm.phone, gm.email, start, gm.planId, start, exp, gm.status);
      const newMid = Number(mRes.lastInsertRowid);

      const mhRes = db
        .prepare(`
          INSERT INTO memberships (
            gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
            start_date, expiry_date, action_type, status, notes, created_by
          ) VALUES (2, ?, ?, ?, ?, ?, ?, 'Initial', ?, 'Enrolled at IronPulse', ?)
        `)
        .run(newMid, gm.planId, gm.planName, gm.price, start, exp, gm.status === 'Expired' ? 'Expired' : 'Active', owner2Id);

      db.prepare(`
        INSERT INTO payments (
          gym_id, receipt_number, member_id, membership_id, plan_id, amount, plan_total_amount,
          balance_due, payment_date, payment_method, transaction_ref, payment_status, notes, received_by
        ) VALUES (2, ?, ?, ?, ?, ?, ?, 0, ?, 'UPI', ?, 'Paid', 'Initial IronPulse membership fee', ?)
      `).run(
        `RCP-IP-${newMid}01`,
        newMid,
        Number(mhRes.lastInsertRowid),
        gm.planId,
        gm.price,
        gm.price,
        start,
        `UPI-IP-${newMid}91`,
        owner2Id
      );

      db.prepare(`
        INSERT INTO qr_credentials (gym_id, member_id, credential_token, status, issued_by)
        VALUES (2, ?, ?, 'Active', ?)
      `).run(newMid, generateQrCredentialToken(), owner2Id);

      if (gm.status === 'Active') {
        db.prepare(`
          INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_in_method, remarks, recorded_by)
          VALUES (2, ?, ?, '07:45:00', 'QR', 'Morning S&C check-in', ?)
        `).run(newMid, today, owner2Id);
      }
    }

    // Seed Support Ticket + Audit Log
    db.prepare(`
      INSERT INTO support_tickets (gym_id, user_id, sender_name, sender_email, subject, message, status)
      VALUES (2, ?, 'Kavya Nair', 'kavya@ironpulse.in', 'Enable live Cashfree webhook endpoint', 'Please review our IronPulse Cashfree live onboarding checklist.', 'Open')
    `).run(owner2Id);

    writeAuditLog(db, {
      actorUserId: superAdmin.id,
      actorRole: 'super_admin',
      gymId: 1,
      action: 'SAAS_MIGRATION_COMPLETED',
      targetType: 'platform',
      targetId: 'v2.0',
      details: { migratedDefaultGymId: 1, seededSecondGymId: 2 },
    });
  }
}

export function writeAuditLog(
  db: DatabaseSync,
  params: {
    actorUserId: number | null;
    actorRole: string;
    gymId?: number | null;
    action: string;
    targetType: string;
    targetId?: string | number | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  }
): void {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_role, gym_id, action, target_type, target_id, details_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId ?? null,
    params.actorRole,
    params.gymId ?? null,
    params.action,
    params.targetType,
    params.targetId !== undefined && params.targetId !== null ? String(params.targetId) : null,
    params.details ? JSON.stringify(params.details) : null,
    params.ipAddress ?? null
  );
}

export function syncExpiredMemberships(db: DatabaseSync): void {
  const today = getLocalIsoDate(0);
  db.prepare(`
    UPDATE members
    SET status = 'Expired', updated_at = datetime('now')
    WHERE status = 'Active'
      AND membership_expiry_date IS NOT NULL
      AND membership_expiry_date < ?
  `).run(today);

  db.prepare(`
    UPDATE memberships
    SET status = 'Expired'
    WHERE status = 'Active'
      AND expiry_date < ?
  `).run(today);
}

export function getGymSubscriptionInfo(db: DatabaseSync, gymId: number) {
  const today = getLocalIsoDate(0);
  const gym = db.prepare('SELECT id, status FROM gyms WHERE id = ? LIMIT 1').get(gymId) as
    | { id: number; status: string }
    | undefined;
  const sub = db
    .prepare(`
      SELECT s.*, p.plan_name, p.max_members, p.max_branches, p.enabled_features_json
      FROM gym_saas_subscriptions s
      JOIN saas_plans p ON p.id = s.saas_plan_id
      WHERE s.gym_id = ?
      LIMIT 1
    `)
    .get(gymId) as
    | {
        id: number;
        gym_id: number;
        saas_plan_id: number;
        plan_name: string;
        billing_cycle: BillingCycle;
        status: SubscriptionStatus;
        trial_ends_at: string | null;
        current_period_start: string;
        current_period_end: string;
        grace_period_days: number;
        max_members: number;
        max_branches: number;
        enabled_features_json: string;
      }
    | undefined;

  const currentMembers = Number(
    (db.prepare('SELECT COUNT(*) AS c FROM members WHERE gym_id = ?').get(gymId) as { c: number }).c
  );

  if (!gym || !sub) {
    return null;
  }

  const enabledFeatures = parseFeaturesJson(sub.enabled_features_json);
  const evalResult = evaluateSubscriptionAccess({
    gymStatus: gym.status,
    subscriptionStatus: sub.status,
    trialEndsAt: sub.trial_ends_at,
    currentPeriodEnd: sub.current_period_end,
    gracePeriodDays: sub.grace_period_days,
    maxMembers: sub.max_members,
    maxBranches: sub.max_branches,
    currentMemberCount: currentMembers,
    enabledFeatures,
    todayStr: today,
  });

  return {
    id: sub.id,
    gym_id: sub.gym_id,
    saas_plan_id: sub.saas_plan_id,
    plan_name: sub.plan_name,
    billing_cycle: sub.billing_cycle,
    status: sub.status,
    effective_status: evalResult.effectiveStatus,
    trial_ends_at: sub.trial_ends_at,
    current_period_start: sub.current_period_start,
    current_period_end: sub.current_period_end,
    grace_period_days: sub.grace_period_days,
    max_members: sub.max_members,
    max_branches: sub.max_branches,
    current_members: currentMembers,
    can_write_operations: evalResult.canWriteOperations,
    can_add_more_members: evalResult.canAddMoreMembers,
    in_grace_period: evalResult.inGracePeriod,
    days_remaining: evalResult.daysRemaining,
    grace_days_remaining: evalResult.graceDaysRemaining,
    restriction_reason: evalResult.restrictionReason,
    enabled_features: evalResult.enabledFeatures,
  };
}

export function generateNextMemberCode(db: DatabaseSync, gymId = 1): string {
  const year = Number(getLocalIsoDate(0).slice(0, 4));
  const prefix = gymId === 1 ? `GYM-${year}-` : `G${gymId}-${year}-`;
  const row = db
    .prepare('SELECT member_code FROM members WHERE gym_id = ? AND member_code LIKE ? ORDER BY id DESC LIMIT 1')
    .get(gymId, `${prefix}%`) as { member_code?: string } | undefined;

  let seq = 1;
  if (row?.member_code) {
    const match = /-(\d+)$/.exec(row.member_code);
    if (match) {
      seq = Number(match[1]) + 1;
    }
  }

  const checkStmt = db.prepare('SELECT 1 FROM members WHERE member_code = ? LIMIT 1');
  while (true) {
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    if (!checkStmt.get(candidate)) {
      return candidate;
    }
    seq += 1;
  }
}

export function generateNextReceiptNumber(db: DatabaseSync): string {
  const datePart = getLocalIsoDate(0).replace(/-/g, '');
  const checkStmt = db.prepare('SELECT 1 FROM payments WHERE receipt_number = ? LIMIT 1');
  for (let i = 0; i < 40; i += 1) {
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
    const candidate = `RCP-${datePart}-${rand}`;
    if (!checkStmt.get(candidate)) {
      return candidate;
    }
  }
  return `RCP-${datePart}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export function enrichMemberRow<T extends { status: StoredMemberStatus; membership_expiry_date: string | null }>(
  row: T,
  today = getLocalIsoDate(0)
): T & { display_status: ReturnType<typeof computeEffectiveMemberStatus>; days_until_expiry: number | null } {
  const days = calculateDaysUntilExpiry(row.membership_expiry_date, today);
  const displayStatus = computeEffectiveMemberStatus(row.status, row.membership_expiry_date, today);
  return {
    ...row,
    display_status: displayStatus,
    days_until_expiry: days,
  };
}

export function issueOrReissueQrCredential(
  db: DatabaseSync,
  params: {
    gymId: number;
    memberId: number;
    issuedBy: number | null;
    revokeReason?: string;
  }
): { ok: true; token: string; credentialId: number } | { ok: false; error: string } {
  const member = db
    .prepare('SELECT id, gym_id FROM members WHERE id = ? AND gym_id = ? LIMIT 1')
    .get(params.memberId, params.gymId) as { id: number; gym_id: number } | undefined;

  if (!member) {
    return { ok: false, error: 'Member not found in this gym workspace.' };
  }

  const token = generateQrCredentialToken();
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE qr_credentials
      SET status = 'Revoked', revoked_at = datetime('now'), revoke_reason = ?
      WHERE gym_id = ? AND member_id = ? AND status = 'Active'
    `).run(params.revokeReason || 'Reissued by gym administrator', params.gymId, params.memberId);

    const res = db
      .prepare(`
        INSERT INTO qr_credentials (gym_id, member_id, credential_token, status, issued_by)
        VALUES (?, ?, ?, 'Active', ?)
      `)
      .run(params.gymId, params.memberId, token, params.issuedBy);

    db.exec('COMMIT');
    return { ok: true, token, credentialId: Number(res.lastInsertRowid) };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function recordMemberCheckIn(
  db: DatabaseSync,
  params: {
    gymId?: number;
    memberId: number;
    attendanceDate: string;
    checkInTime: string;
    checkInMethod?: 'Manual' | 'QR' | 'Keyboard';
    qrCredentialId?: number | null;
    remarks?: string;
    adminId: number;
  }
): { ok: true; id: number; memberName: string; memberCode: string } | { ok: false; error: string; duplicate?: boolean } {
  const gymId = params.gymId ?? 1;
  if (!isValidIsoDate(params.attendanceDate)) {
    return { ok: false, error: 'Please provide a valid check-in date.' };
  }
  const normalizedTime = normalizeTimeHms(params.checkInTime);
  if (!normalizedTime) {
    return { ok: false, error: 'Please provide a valid check-in time (HH:MM).' };
  }

  const member = db
    .prepare('SELECT id, gym_id, full_name, member_code, status FROM members WHERE id = ? AND gym_id = ? LIMIT 1')
    .get(params.memberId, gymId) as
    | { id: number; gym_id: number; full_name: string; member_code: string; status: StoredMemberStatus }
    | undefined;

  if (!member) {
    return { ok: false, error: 'Member not found in your authorized gym tenant.' };
  }

  const existing = db
    .prepare('SELECT check_in_time FROM attendance WHERE member_id = ? AND gym_id = ? AND attendance_date = ? LIMIT 1')
    .get(params.memberId, gymId, params.attendanceDate) as { check_in_time: string } | undefined;

  if (existing) {
    return {
      ok: false,
      duplicate: true,
      error: `Duplicate prevented: ${member.full_name} (${member.member_code}) is already checked in on ${params.attendanceDate} at ${existing.check_in_time.slice(0, 5)}.`,
    };
  }

  const info = db
    .prepare(`
      INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_in_method, qr_credential_id, remarks, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      gymId,
      params.memberId,
      params.attendanceDate,
      normalizedTime,
      params.checkInMethod ?? 'Manual',
      params.qrCredentialId ?? null,
      params.remarks?.trim() || null,
      params.adminId
    );

  return { ok: true, id: Number(info.lastInsertRowid), memberName: member.full_name, memberCode: member.member_code };
}

export function recordQrCheckIn(
  db: DatabaseSync,
  params: {
    gymId: number;
    token: string;
    adminId: number;
    attendanceDate?: string;
    checkInTime?: string;
  }
):
  | {
      ok: true;
      id: number;
      member: {
        id: number;
        full_name: string;
        member_code: string;
        photo_path: string | null;
        status: StoredMemberStatus;
        membership_expiry_date: string | null;
        plan_name: string | null;
      };
      warning?: string;
    }
  | { ok: false; error: string; duplicate?: boolean; revoked?: boolean; crossTenant?: boolean } {
  const cleanToken = params.token.trim();
  const cred = db
    .prepare(`
      SELECT q.*, m.full_name, m.member_code, m.photo_path, m.status AS member_status,
             m.membership_expiry_date, p.plan_name
      FROM qr_credentials q
      JOIN members m ON m.id = q.member_id
      LEFT JOIN membership_plans p ON p.id = m.plan_id
      WHERE q.credential_token = ?
      LIMIT 1
    `)
    .get(cleanToken) as
    | {
        id: number;
        gym_id: number;
        member_id: number;
        status: 'Active' | 'Revoked';
        full_name: string;
        member_code: string;
        photo_path: string | null;
        member_status: StoredMemberStatus;
        membership_expiry_date: string | null;
        plan_name: string | null;
      }
    | undefined;

  if (!cred) {
    return { ok: false, error: 'Unrecognized QR credential. Please ask front desk to verify or reissue card.' };
  }
  if (cred.gym_id !== params.gymId) {
    return {
      ok: false,
      crossTenant: true,
      error: 'Tenant isolation check failed: this QR credential belongs to a different gym.',
    };
  }
  if (cred.status !== 'Active') {
    return {
      ok: false,
      revoked: true,
      error: `Revoked QR card: ${cred.full_name} (${cred.member_code}) must use their newly reissued card.`,
    };
  }
  if (cred.member_status === 'Inactive') {
    return { ok: false, error: `Member account ${cred.full_name} is Inactive/Suspended.` };
  }

  const today = params.attendanceDate ?? getLocalIsoDate(0);
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const checkIn = recordMemberCheckIn(db, {
    gymId: params.gymId,
    memberId: cred.member_id,
    attendanceDate: today,
    checkInTime: params.checkInTime ?? hhmm,
    checkInMethod: 'QR',
    qrCredentialId: cred.id,
    remarks: 'QR Scanner Check-In',
    adminId: params.adminId,
  });

  if (!checkIn.ok) {
    return checkIn;
  }

  return {
    ok: true,
    id: checkIn.id,
    member: {
      id: cred.member_id,
      full_name: cred.full_name,
      member_code: cred.member_code,
      photo_path: cred.photo_path,
      status: cred.member_status,
      membership_expiry_date: cred.membership_expiry_date,
      plan_name: cred.plan_name,
    },
    warning:
      cred.member_status === 'Expired'
        ? `Check-in recorded, note: ${cred.full_name}'s membership expired on ${cred.membership_expiry_date || 'N/A'}.`
        : undefined,
  };
}

export function createPaymentTransaction(
  db: DatabaseSync,
  params: {
    gymId?: number;
    memberId: number;
    planId: number | null;
    amount: number;
    planTotalAmount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    transactionRef?: string;
    paymentStatus: PaymentStatus;
    extendMembership: boolean;
    paymentSource?: 'manual' | 'online_gateway';
    gatewayOrderId?: number | null;
    notes?: string;
    adminId: number | null;
  }
): { ok: true; paymentId: number; receiptNumber: string } | { ok: false; error: string } {
  const gymId = params.gymId ?? 1;

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return { ok: false, error: 'Payment amount must be greater than zero.' };
  }
  if (!isValidIsoDate(params.paymentDate)) {
    return { ok: false, error: 'Please enter a valid payment date.' };
  }

  const member = db
    .prepare('SELECT id, gym_id, membership_expiry_date FROM members WHERE id = ? AND gym_id = ? LIMIT 1')
    .get(params.memberId, gymId) as
    | { id: number; gym_id: number; membership_expiry_date: string | null }
    | undefined;
  if (!member) {
    return { ok: false, error: 'Selected member does not exist in this gym workspace.' };
  }

  const plan = params.planId
    ? (db.prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE id = ? AND gym_id = ? LIMIT 1').get(
        params.planId,
        gymId
      ) as { id: number; plan_name: string; duration_days: number; price: number } | undefined)
    : undefined;

  if (params.planId && !plan) {
    return { ok: false, error: 'Selected membership plan is invalid for this gym.' };
  }

  const planTotal =
    Number.isFinite(params.planTotalAmount) && params.planTotalAmount >= 0
      ? params.planTotalAmount
      : plan?.price ?? params.amount;
  const balanceDue = calculatePaymentBalance(params.amount, planTotal, params.paymentStatus);
  const receiptNumber = generateNextReceiptNumber(db);

  db.exec('BEGIN');
  try {
    let linkedMembershipId: number | null = null;

    if (params.extendMembership && plan) {
      const today = getLocalIsoDate(0);
      const startBase =
        member.membership_expiry_date && member.membership_expiry_date >= today
          ? calculatePlanExpiryDate(member.membership_expiry_date, 1)
          : today;
      const newExpiry = calculatePlanExpiryDate(startBase, plan.duration_days);

      db.prepare("UPDATE memberships SET status = 'Superseded' WHERE member_id = ? AND gym_id = ? AND status = 'Active'").run(
        member.id,
        gymId
      );

      const mhInfo = db
        .prepare(`
          INSERT INTO memberships (
            gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
            start_date, expiry_date, action_type, status, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Renewal', 'Active', ?, ?)
        `)
        .run(
          gymId,
          member.id,
          plan.id,
          plan.plan_name,
          plan.price,
          startBase,
          newExpiry,
          params.paymentSource === 'online_gateway' ? 'Activated via verified gateway webhook.' : 'Renewed during payment entry.',
          params.adminId
        );
      linkedMembershipId = Number(mhInfo.lastInsertRowid);

      db.prepare(`
        UPDATE members
        SET plan_id = ?, membership_start_date = ?, membership_expiry_date = ?, status = 'Active', updated_at = datetime('now')
        WHERE id = ? AND gym_id = ?
      `).run(plan.id, startBase, newExpiry, member.id, gymId);
    } else {
      const latest = db
        .prepare('SELECT id FROM memberships WHERE member_id = ? AND gym_id = ? ORDER BY id DESC LIMIT 1')
        .get(member.id, gymId) as { id: number } | undefined;
      linkedMembershipId = latest?.id ?? null;
    }

    const payInfo = db
      .prepare(`
        INSERT INTO payments (
          gym_id, receipt_number, member_id, membership_id, plan_id,
          amount, plan_total_amount, balance_due, payment_date,
          payment_method, transaction_ref, payment_status, payment_source, gateway_order_id, notes, received_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        gymId,
        receiptNumber,
        member.id,
        linkedMembershipId,
        plan?.id ?? null,
        Math.round(params.amount * 100) / 100,
        Math.round(planTotal * 100) / 100,
        balanceDue,
        params.paymentDate,
        params.paymentMethod,
        params.transactionRef?.trim() || null,
        params.paymentStatus,
        params.paymentSource ?? 'manual',
        params.gatewayOrderId ?? null,
        params.notes?.trim() || null,
        params.adminId
      );

    db.exec('COMMIT');
    return {
      ok: true,
      paymentId: Number(payInfo.lastInsertRowid),
      receiptNumber,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function applyMembershipRenewalOrExtension(
  db: DatabaseSync,
  params: {
    gymId?: number;
    memberId: number;
    planId: number;
    actionType: MembershipActionType;
    startDate: string;
    expiryDate: string;
    notes?: string;
    adminId: number;
  }
): { ok: true } | { ok: false; error: string } {
  const gymId = params.gymId ?? 1;
  if (!isValidIsoDate(params.startDate) || !isValidIsoDate(params.expiryDate) || params.expiryDate < params.startDate) {
    return { ok: false, error: 'Please provide valid start and expiry dates.' };
  }

  const member = db
    .prepare('SELECT id FROM members WHERE id = ? AND gym_id = ? LIMIT 1')
    .get(params.memberId, gymId);
  if (!member) {
    return { ok: false, error: 'Member does not belong to this gym.' };
  }

  const plan = db
    .prepare('SELECT id, plan_name, price FROM membership_plans WHERE id = ? AND gym_id = ? LIMIT 1')
    .get(params.planId, gymId) as { id: number; plan_name: string; price: number } | undefined;
  if (!plan) {
    return { ok: false, error: 'Please select a valid membership plan for this gym.' };
  }

  const today = getLocalIsoDate(0);
  const newStatus: StoredMemberStatus = params.expiryDate < today ? 'Expired' : 'Active';

  db.exec('BEGIN');
  try {
    db.prepare("UPDATE memberships SET status = 'Superseded' WHERE member_id = ? AND gym_id = ? AND status = 'Active'").run(
      params.memberId,
      gymId
    );

    db.prepare(`
      INSERT INTO memberships (
        gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
        start_date, expiry_date, action_type, status, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      gymId,
      params.memberId,
      plan.id,
      plan.plan_name,
      plan.price,
      params.startDate,
      params.expiryDate,
      params.actionType,
      newStatus,
      params.notes?.trim() || null,
      params.adminId
    );

    db.prepare(`
      UPDATE members
      SET plan_id = ?, membership_start_date = ?, membership_expiry_date = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND gym_id = ?
    `).run(plan.id, params.startDate, params.expiryDate, newStatus, params.memberId, gymId);

    db.exec('COMMIT');
    return { ok: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function processVerifiedGatewayWebhook(
  db: DatabaseSync,
  params: {
    orderRef: string;
    webhookEventId: string;
    signature: string;
    rawPayload: string;
    amount: number;
    currency: string;
    transactionRef: string;
  }
): { ok: true; paymentId: number; receiptNumber: string; alreadyProcessed?: boolean } | { ok: false; error: string } {
  const order = db
    .prepare('SELECT * FROM payment_orders WHERE order_ref = ? LIMIT 1')
    .get(params.orderRef) as
    | {
        id: number;
        order_ref: string;
        gym_id: number;
        member_id: number;
        plan_id: number | null;
        gateway_provider: string;
        amount: number;
        currency: string;
        status: string;
        webhook_event_id: string | null;
        payment_id: number | null;
      }
    | undefined;

  if (!order) {
    return { ok: false, error: 'Payment order not found.' };
  }

  // Idempotency guard: prevent duplicate webhook processing
  const dupEvent = db
    .prepare('SELECT id, payment_id FROM payment_orders WHERE webhook_event_id = ? LIMIT 1')
    .get(params.webhookEventId) as { id: number; payment_id: number | null } | undefined;

  if (dupEvent || order.status === 'Paid') {
    const existingPay = order.payment_id
      ? (db.prepare('SELECT id, receipt_number FROM payments WHERE id = ? LIMIT 1').get(order.payment_id) as
          | { id: number; receipt_number: string }
          | undefined)
      : undefined;
    return {
      ok: true,
      alreadyProcessed: true,
      paymentId: existingPay?.id ?? 0,
      receiptNumber: existingPay?.receipt_number ?? '',
    };
  }

  const gw = db
    .prepare('SELECT * FROM gym_payment_gateways WHERE gym_id = ? LIMIT 1')
    .get(order.gym_id) as
    | {
        provider: string;
        webhook_secret_encrypted: string;
        is_enabled: number;
        auto_activate_membership: number;
      }
    | undefined;

  if (!gw || !gw.is_enabled) {
    return { ok: false, error: 'Payment gateway is not enabled for this gym.' };
  }

  const webhookSecret = decryptSecret(gw.webhook_secret_encrypted);
  if (!webhookSecret) {
    return { ok: false, error: 'Webhook secret is not configured for this gym.' };
  }

  if (!verifyHmacSignature(params.rawPayload, params.signature, webhookSecret)) {
    return { ok: false, error: 'Webhook HMAC signature verification failed.' };
  }

  if (Math.abs(Number(params.amount) - Number(order.amount)) > 0.01) {
    return { ok: false, error: 'Webhook payment amount does not match order amount.' };
  }

  if (params.currency.toUpperCase() !== order.currency.toUpperCase()) {
    return { ok: false, error: 'Webhook currency mismatch.' };
  }

  const paymentMethod: PaymentMethod =
    gw.provider === 'razorpay' || gw.provider === 'cashfree' ? 'UPI' : 'Card';

  const result = createPaymentTransaction(db, {
    gymId: order.gym_id,
    memberId: order.member_id,
    planId: order.plan_id,
    amount: order.amount,
    planTotalAmount: order.amount,
    paymentDate: getLocalIsoDate(0),
    paymentMethod,
    transactionRef: params.transactionRef,
    paymentStatus: 'Paid',
    extendMembership: Boolean(gw.auto_activate_membership && order.plan_id),
    paymentSource: 'online_gateway',
    gatewayOrderId: order.id,
    notes: `Verified online payment via ${gw.provider.toUpperCase()} (${order.order_ref})`,
    adminId: null,
  });

  if (!result.ok) {
    return result;
  }

  db.prepare(`
    UPDATE payment_orders
    SET status = 'Paid', webhook_event_id = ?, payment_id = ?, verified_signature = ?, raw_verified_at = datetime('now')
    WHERE id = ?
  `).run(params.webhookEventId, result.paymentId, params.signature, order.id);

  return {
    ok: true,
    paymentId: result.paymentId,
    receiptNumber: result.receiptNumber,
  };
}

export { addSubscriptionDays };

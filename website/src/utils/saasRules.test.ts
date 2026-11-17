import test from 'node:test';
import assert from 'node:assert/strict';
import fsMod from 'node:fs';
import osMod from 'node:os';
import pathMod from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  calculateSaasPlanAmount,
  computeHmacSignature,
  decryptSecret,
  encryptSecret,
  evaluateSubscriptionAccess,
  generateQrCredentialToken,
  isValidQrCredentialToken,
  maskSecret,
  verifyHmacSignature,
  DEFAULT_SAAS_FEATURES,
} from './saasRules.ts';
import {
  createGymDatabase,
  issueOrReissueQrCredential,
  processVerifiedGatewayWebhook,
  recordQrCheckIn,
} from '../db/gymDatabase.ts';

test('AES-256-GCM encryption encrypts, decrypts, and masks gateway secrets without exposing plaintext', () => {
  const secret = 'rzp_live_secret_89123791283';
  const encrypted = encryptSecret(secret);
  assert.ok(encrypted.startsWith('encv1$'));
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
  const masked = maskSecret(encrypted);
  assert.ok(masked.endsWith('1283'));
  assert.ok(!masked.includes('rzp_live'));
});

test('Webhook HMAC-SHA256 verification approves valid signatures and rejects tampered payloads', () => {
  const webhookSecret = 'whsec_test_hemnity_991';
  const payload = JSON.stringify({ order_ref: 'ORD-1001', amount: 2700, currency: 'INR' });
  const sig = computeHmacSignature(payload, webhookSecret);
  assert.equal(verifyHmacSignature(payload, sig, webhookSecret), true);
  assert.equal(verifyHmacSignature(payload, `${sig.slice(0, -2)}00`, webhookSecret), false);
  assert.equal(verifyHmacSignature('{"order_ref":"ORD-1001","amount":1,"currency":"INR"}', sig, webhookSecret), false);
});

test('SaaS subscription & grace period evaluation preserves access during grace and restricts writes after expiry', () => {
  const active = evaluateSubscriptionAccess({
    gymStatus: 'Active',
    subscriptionStatus: 'Active',
    trialEndsAt: null,
    currentPeriodEnd: '2026-12-30',
    gracePeriodDays: 7,
    maxMembers: 150,
    maxBranches: 1,
    currentMemberCount: 40,
    enabledFeatures: DEFAULT_SAAS_FEATURES,
    todayStr: '2026-11-17',
  });
  assert.equal(active.effectiveStatus, 'Active');
  assert.equal(active.canWriteOperations, true);
  assert.equal(active.canAddMoreMembers, true);

  const grace = evaluateSubscriptionAccess({
    gymStatus: 'Active',
    subscriptionStatus: 'Active',
    trialEndsAt: null,
    currentPeriodEnd: '2026-11-14',
    gracePeriodDays: 7,
    maxMembers: 150,
    maxBranches: 1,
    currentMemberCount: 40,
    enabledFeatures: DEFAULT_SAAS_FEATURES,
    todayStr: '2026-11-17',
  });
  assert.equal(grace.effectiveStatus, 'Grace');
  assert.equal(grace.inGracePeriod, true);
  assert.equal(grace.graceDaysRemaining, 4);
  assert.equal(grace.canWriteOperations, true);

  const expired = evaluateSubscriptionAccess({
    gymStatus: 'Active',
    subscriptionStatus: 'Active',
    trialEndsAt: null,
    currentPeriodEnd: '2026-11-01',
    gracePeriodDays: 7,
    maxMembers: 150,
    maxBranches: 1,
    currentMemberCount: 40,
    enabledFeatures: DEFAULT_SAAS_FEATURES,
    todayStr: '2026-11-17',
  });
  assert.equal(expired.effectiveStatus, 'Expired');
  assert.equal(expired.canWriteOperations, false);
  assert.equal(expired.canAddMoreMembers, false);
});

test('Billing cycle price calculation applies discounts accurately', () => {
  const net = calculateSaasPlanAmount({
    monthlyPrice: 1999,
    quarterlyPrice: 5499,
    yearlyPrice: 19190,
    billingCycle: 'yearly',
    discountPercent: 10,
  });
  assert.equal(net, 17271);
});

test('QR tokens are unpredictable, revocable, and strictly tenant-isolated across Gym 1 and Gym 2', () => {
  const token = generateQrCredentialToken();
  assert.equal(isValidQrCredentialToken(token), true);
  assert.equal(isValidQrCredentialToken('GYM-2026-0001'), false);

  const db = createGymDatabase(':memory:');
  try {
    const g1Member = db.prepare("SELECT id FROM members WHERE gym_id = 1 AND status = 'Active' LIMIT 1").get() as {
      id: number;
    };
    const g2Member = db.prepare("SELECT id FROM members WHERE gym_id = 2 AND status = 'Active' LIMIT 1").get() as {
      id: number;
    };

    const issued = issueOrReissueQrCredential(db, {
      gymId: 1,
      memberId: g1Member.id,
      issuedBy: 1,
      revokeReason: 'Lost card test',
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    // Cross-tenant scan attempt: Gym 2 scanner scanning Gym 1 member token MUST fail!
    const crossTenant = recordQrCheckIn(db, {
      gymId: 2,
      token: issued.token,
      adminId: 2,
      attendanceDate: '2026-11-25',
      checkInTime: '08:00',
    });
    assert.equal(crossTenant.ok, false);
    if (!crossTenant.ok) {
      assert.equal(crossTenant.crossTenant, true);
    }

    // Valid Gym 1 scan succeeds
    const okScan = recordQrCheckIn(db, {
      gymId: 1,
      token: issued.token,
      adminId: 1,
      attendanceDate: '2026-11-25',
      checkInTime: '08:15',
    });
    assert.equal(okScan.ok, true);

    // Reissue revokes old token immediately
    const reissued = issueOrReissueQrCredential(db, {
      gymId: 1,
      memberId: g1Member.id,
      issuedBy: 1,
      revokeReason: 'Compromised card',
    });
    assert.equal(reissued.ok, true);
    const oldTokenAttempt = recordQrCheckIn(db, {
      gymId: 1,
      token: issued.token,
      adminId: 1,
      attendanceDate: '2026-11-26',
      checkInTime: '08:15',
    });
    assert.equal(oldTokenAttempt.ok, false);
    if (!oldTokenAttempt.ok) {
      assert.equal(oldTokenAttempt.revoked, true);
    }

    // Verified payment webhook creates payment once and prevents duplicate webhook replay
    const plan = db.prepare('SELECT id, price FROM membership_plans WHERE gym_id = 2 LIMIT 1').get() as {
      id: number;
      price: number;
    };
    const orderRef = 'ORD-TEST-2001';
    db.prepare(`
      INSERT INTO payment_orders (order_ref, gym_id, member_id, plan_id, gateway_provider, amount, currency, status)
      VALUES (?, 2, ?, ?, 'cashfree', ?, 'INR', 'Created')
    `).run(orderRef, g2Member.id, plan.id, plan.price);

    const rawPayload = JSON.stringify({ order_ref: orderRef, amount: plan.price, currency: 'INR' });
    const sig = computeHmacSignature(rawPayload, 'whsec_ironpulse_demo_2026');

    const firstWebhook = processVerifiedGatewayWebhook(db, {
      orderRef,
      webhookEventId: 'evt_unique_9001',
      signature: sig,
      rawPayload,
      amount: plan.price,
      currency: 'INR',
      transactionRef: 'cf_pay_99123',
    });
    assert.equal(firstWebhook.ok, true);

    const replayWebhook = processVerifiedGatewayWebhook(db, {
      orderRef,
      webhookEventId: 'evt_unique_9001',
      signature: sig,
      rawPayload,
      amount: plan.price,
      currency: 'INR',
      transactionRef: 'cf_pay_99123',
    });
    assert.equal(replayWebhook.ok, true);
    if (replayWebhook.ok) {
      assert.equal(replayWebhook.alreadyProcessed, true);
    }
  } finally {
    db.close();
  }
});

test('Non-destructive migration preserves existing single-gym records into tenant gym_id = 1', () => {
  // Simulate legacy pre-upgrade database
  const rawDb = new DatabaseSync(':memory:');
  rawDb.exec(`
    CREATE TABLE admins (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_initial_setup_complete INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE gym_settings (id INTEGER PRIMARY KEY CHECK (id = 1), gym_name TEXT NOT NULL, logo_path TEXT, address TEXT, contact_number TEXT, email TEXT, currency_code TEXT NOT NULL DEFAULT 'INR', currency_symbol TEXT NOT NULL DEFAULT '₹', receipt_footer TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE membership_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_name TEXT NOT NULL, duration_days INTEGER NOT NULL, price REAL NOT NULL, description TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, member_code TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, photo_path TEXT, phone TEXT NOT NULL, email TEXT, gender TEXT, date_of_birth TEXT, address TEXT, emergency_contact TEXT, joining_date TEXT NOT NULL, plan_id INTEGER, membership_start_date TEXT, membership_expiry_date TEXT, status TEXT NOT NULL DEFAULT 'Active', notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE memberships (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, plan_id INTEGER NOT NULL, plan_name_snapshot TEXT NOT NULL, plan_price_snapshot REAL NOT NULL, start_date TEXT NOT NULL, expiry_date TEXT NOT NULL, action_type TEXT NOT NULL DEFAULT 'Initial', status TEXT NOT NULL DEFAULT 'Active', notes TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE, member_id INTEGER NOT NULL, membership_id INTEGER, plan_id INTEGER, amount REAL NOT NULL, plan_total_amount REAL NOT NULL DEFAULT 0, balance_due REAL NOT NULL DEFAULT 0, payment_date TEXT NOT NULL, payment_method TEXT NOT NULL DEFAULT 'Cash', transaction_ref TEXT, payment_status TEXT NOT NULL DEFAULT 'Paid', notes TEXT, received_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, attendance_date TEXT NOT NULL, check_in_time TEXT NOT NULL, check_out_time TEXT, remarks TEXT, recorded_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(member_id, attendance_date));

    INSERT INTO admins (full_name, email, password_hash) VALUES ('Legacy Owner', 'legacy@gym.in', 'scrypt$aa$bb');
    INSERT INTO gym_settings (id, gym_name, receipt_footer) VALUES (1, 'Legacy Barbell Club', 'Legacy Footer');
    INSERT INTO membership_plans (plan_name, duration_days, price) VALUES ('Legacy Monthly', 30, 1200);
    INSERT INTO members (member_code, full_name, phone, email, joining_date, plan_id, membership_start_date, membership_expiry_date, status) VALUES ('GYM-2026-0099', 'Legacy Member', '9998887776', 'legacy.member@gym.in', '2026-10-01', 1, '2026-10-01', '2026-12-30', 'Active');
    INSERT INTO payments (receipt_number, member_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, payment_status) VALUES ('RCP-LEGACY-1', 1, 1, 1200, 1200, 0, '2026-10-01', 'Cash', 'Paid');
  `);
  rawDb.close();
  // Verify createGymDatabase handles full multi-tenant init cleanly without losing data on an existing file
  const tmpFile = pathMod.join(osMod.tmpdir(), `hemnity-mig-test-${Date.now()}.sqlite`);
  const legacyFileDb = new DatabaseSync(tmpFile);
  legacyFileDb.exec(`
    CREATE TABLE admins (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_initial_setup_complete INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE gym_settings (id INTEGER PRIMARY KEY CHECK (id = 1), gym_name TEXT NOT NULL, logo_path TEXT, address TEXT, contact_number TEXT, email TEXT, currency_code TEXT NOT NULL DEFAULT 'INR', currency_symbol TEXT NOT NULL DEFAULT '₹', receipt_footer TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE membership_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_name TEXT NOT NULL, duration_days INTEGER NOT NULL, price REAL NOT NULL, description TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, member_code TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, photo_path TEXT, phone TEXT NOT NULL, email TEXT, gender TEXT, date_of_birth TEXT, address TEXT, emergency_contact TEXT, joining_date TEXT NOT NULL, plan_id INTEGER, membership_start_date TEXT, membership_expiry_date TEXT, status TEXT NOT NULL DEFAULT 'Active', notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE memberships (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, plan_id INTEGER NOT NULL, plan_name_snapshot TEXT NOT NULL, plan_price_snapshot REAL NOT NULL, start_date TEXT NOT NULL, expiry_date TEXT NOT NULL, action_type TEXT NOT NULL DEFAULT 'Initial', status TEXT NOT NULL DEFAULT 'Active', notes TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE, member_id INTEGER NOT NULL, membership_id INTEGER, plan_id INTEGER, amount REAL NOT NULL, plan_total_amount REAL NOT NULL DEFAULT 0, balance_due REAL NOT NULL DEFAULT 0, payment_date TEXT NOT NULL, payment_method TEXT NOT NULL DEFAULT 'Cash', transaction_ref TEXT, payment_status TEXT NOT NULL DEFAULT 'Paid', notes TEXT, received_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, attendance_date TEXT NOT NULL, check_in_time TEXT NOT NULL, check_out_time TEXT, remarks TEXT, recorded_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(member_id, attendance_date));

    INSERT INTO admins (full_name, email, password_hash) VALUES ('Legacy Owner', 'legacy@gym.in', 'scrypt$aa$bb');
    INSERT INTO gym_settings (id, gym_name, receipt_footer) VALUES (1, 'Legacy Barbell Club', 'Legacy Footer');
    INSERT INTO membership_plans (plan_name, duration_days, price) VALUES ('Legacy Monthly', 30, 1200);
    INSERT INTO members (member_code, full_name, phone, email, joining_date, plan_id, membership_start_date, membership_expiry_date, status) VALUES ('GYM-2026-0099', 'Legacy Member', '9998887776', 'legacy.member@gym.in', '2026-10-01', 1, '2026-10-01', '2026-12-30', 'Active');
    INSERT INTO payments (receipt_number, member_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, payment_status) VALUES ('RCP-LEGACY-1', 1, 1, 1200, 1200, 0, '2026-10-01', 'Cash', 'Paid');
  `);
  legacyFileDb.close();

  const upgraded = createGymDatabase(tmpFile);
  try {
    assert.equal(fsMod.existsSync(`${tmpFile}.pre_saas_backup`), true);
    const preservedMember = upgraded.prepare("SELECT gym_id, full_name FROM members WHERE member_code = 'GYM-2026-0099'").get() as {
      gym_id: number;
      full_name: string;
    };
    assert.equal(preservedMember.gym_id, 1);
    assert.equal(preservedMember.full_name, 'Legacy Member');
    const preservedPayment = upgraded.prepare("SELECT gym_id, amount FROM payments WHERE receipt_number = 'RCP-LEGACY-1'").get() as {
      gym_id: number;
      amount: number;
    };
    assert.equal(preservedPayment.gym_id, 1);
    assert.equal(preservedPayment.amount, 1200);
    const defaultGym = upgraded.prepare('SELECT name FROM gyms WHERE id = 1').get() as { name: string };
    assert.equal(defaultGym.name, 'Legacy Barbell Club');
  } finally {
    upgraded.close();
    fsMod.rmSync(tmpFile, { force: true });
    fsMod.rmSync(`${tmpFile}.pre_saas_backup`, { force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from 'php-parser';
import { CPANEL_WHITELIST } from '../server/saasHelpers';
import {
  buildCsvDocument,
  buildWhatsAppReminderUrl,
  calculateDaysUntilExpiry,
  calculatePaymentBalance,
  calculatePlanExpiryDate,
  computeEffectiveMemberStatus,
  escapeCsvCell,
  formatCurrency,
  formatMemberCode,
  validateMemberInput,
  validatePasswordStrength,
} from './gymRules';

test('expiry calculation & 7-day orange / expired red status transitions', () => {
  const today = '2026-10-26';
  assert.equal(calculateDaysUntilExpiry('2026-10-26', today), 0);
  assert.equal(calculateDaysUntilExpiry('2026-11-02', today), 7);
  assert.equal(calculateDaysUntilExpiry('2026-11-03', today), 8);
  assert.equal(calculateDaysUntilExpiry('2026-10-20', today), -6);

  assert.equal(computeEffectiveMemberStatus('Active', '2026-11-15', today), 'Active');
  assert.equal(computeEffectiveMemberStatus('Active', '2026-11-02', today), 'ExpiringSoon');
  assert.equal(computeEffectiveMemberStatus('Active', '2026-10-26', today), 'ExpiringSoon');
  assert.equal(computeEffectiveMemberStatus('Active', '2026-10-25', today), 'Expired');
  assert.equal(computeEffectiveMemberStatus('Inactive', '2026-10-20', today), 'Inactive');
});

test('plan expiry date calculation handles month and leap boundaries', () => {
  assert.equal(calculatePlanExpiryDate('2026-10-26', 30), '2026-11-25');
  assert.equal(calculatePlanExpiryDate('2026-10-26', 90), '2027-01-24');
  assert.equal(calculatePlanExpiryDate('2026-10-26', 180), '2027-04-24');
  assert.equal(calculatePlanExpiryDate('2026-10-26', 365), '2027-10-26');
});

test('payment balance math handles Paid, Partial, and Pending accurately', () => {
  assert.equal(calculatePaymentBalance(2700, 2700, 'Paid'), 0);
  assert.equal(calculatePaymentBalance(1500, 2700, 'Partial'), 1200);
  assert.equal(calculatePaymentBalance(3000, 2700, 'Partial'), 0);
  assert.equal(calculatePaymentBalance(1000, 1000, 'Pending'), 1000);
});

test('WhatsApp reminder URL normalizes 10-digit Indian phone numbers and prefills text', () => {
  const url = buildWhatsAppReminderUrl({
    phone: '98765 43210',
    memberName: 'Rohan Kulkarni',
    gymName: 'GYM',
    expiryDate: '2026-10-30',
    isExpired: false,
  });
  assert.ok(url?.startsWith('https://wa.me/919876543210?text='));
  assert.ok(decodeURIComponent(url!).includes('Rohan Kulkarni'));
  assert.ok(decodeURIComponent(url!).includes('30 Oct 2026'));
});

test('member input validation rejects empty fields and invalid date ranges', () => {
  const emptyErrors = validateMemberInput({});
  assert.ok(emptyErrors.length >= 3);

  const invertedDates = validateMemberInput({
    full_name: 'Aarav Sharma',
    phone: '9876543210',
    joining_date: '2026-10-26',
    plan_id: 1,
    membership_start_date: '2026-10-26',
    membership_expiry_date: '2026-10-10',
  });
  assert.ok(invertedDates.some((e) => e.includes('earlier than start date')));

  const valid = validateMemberInput({
    full_name: 'Aarav Sharma',
    phone: '+91 9876543210',
    email: 'aarav@example.com',
    joining_date: '2026-10-26',
    plan_id: 2,
    membership_start_date: '2026-10-26',
    membership_expiry_date: '2027-01-24',
  });
  assert.deepEqual(valid, []);
});

test('CSV export neutralizes spreadsheet formula injection and formats currency/IDs', () => {
  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  assert.equal(escapeCsvCell('Monthly, Gold'), '"Monthly, Gold"');
  const csv = buildCsvDocument(['ID', 'Amount'], [[formatMemberCode(2026, 7), formatCurrency(2700)]]);
  assert.ok(csv.includes('GYM-2026-0007'));
  assert.ok(csv.includes('₹2,700.00'));
});

test('password strength validation enforces length, alphanumeric mix, and match', () => {
  assert.ok(validatePasswordStrength('short1', 'short1').length > 0);
  assert.ok(validatePasswordStrength('onlyletters', 'onlyletters').length > 0);
  assert.ok(validatePasswordStrength('StrongPass8', 'Mismatch8').length > 0);
  assert.deepEqual(validatePasswordStrength('StrongPass8', 'StrongPass8'), []);
});

test('all 42 CPANEL_WHITELIST files exist and every PHP 8.1+ file parses with zero syntax errors', () => {
  assert.equal(CPANEL_WHITELIST.length, 42);

  const parser = new Engine({
    parser: { version: '8.2', extractDoc: false, suppressErrors: false },
    ast: { withPositions: true },
  });

  for (const relFile of CPANEL_WHITELIST) {
    const absPath = path.resolve(process.cwd(), relFile);
    assert.ok(fs.existsSync(absPath), `Expected cPanel file to exist: ${relFile}`);

    if (relFile.endsWith('.php')) {
      const source = fs.readFileSync(absPath, 'utf8');
      assert.doesNotThrow(() => {
        const ast = parser.parseCode(source, relFile);
        assert.equal(ast.kind, 'program');
      }, `PHP syntax error in ${relFile}`);
    }
  }
});

test('database.sql defines gym database, all 7 required tables, default INR plans, and zero plaintext admin passwords', () => {
  const sqlPath = path.resolve(process.cwd(), 'database.sql');
  assert.ok(fs.existsSync(sqlPath), 'database.sql must exist');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  assert.match(sql, /CREATE DATABASE IF NOT EXISTS `gym`/);
  assert.match(sql, /USE `gym`;/);

  const requiredTables = [
    'admins',
    'gym_settings',
    'membership_plans',
    'members',
    'memberships',
    'payments',
    'attendance',
  ];
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS \`${table}\``), `Missing table ${table}`);
  }

  assert.match(sql, /DECIMAL\(10,2\)/);
  assert.match(sql, /UNIQUE KEY `uq_admins_email`/);
  assert.match(sql, /UNIQUE KEY `uq_members_code`/);
  assert.match(sql, /UNIQUE KEY `uq_member_attendance_date`/);
  assert.match(sql, /'Monthly',\s*30,\s*1000\.00/);
  assert.match(sql, /'Quarterly',\s*90,\s*2700\.00/);
  assert.match(sql, /'Half-Yearly',\s*180,\s*5000\.00/);
  assert.match(sql, /'Yearly',\s*365,\s*9000\.00/);

  assert.doesNotMatch(sql, /INSERT\s+INTO\s+`?admins`?/i);
});

test('database_saas.sql and database_migration.sql define all 21 multi-tenant tables, composite keys, and zero plaintext passwords', () => {
  const saasSqlPath = path.resolve(process.cwd(), 'database_saas.sql');
  const migSqlPath = path.resolve(process.cwd(), 'database_migration.sql');
  assert.ok(fs.existsSync(saasSqlPath), 'database_saas.sql must exist');
  assert.ok(fs.existsSync(migSqlPath), 'database_migration.sql must exist');

  const saasSql = fs.readFileSync(saasSqlPath, 'utf8');
  const migSql = fs.readFileSync(migSqlPath, 'utf8');

  const saasTables = [
    'admins',
    'users',
    'saas_plans',
    'gyms',
    'gym_owners',
    'gym_saas_subscriptions',
    'saas_subscription_payments',
    'gym_settings',
    'membership_plans',
    'members',
    'memberships',
    'gym_payment_gateways',
    'payments',
    'payment_orders',
    'qr_credentials',
    'attendance',
    'platform_settings',
    'platform_faqs',
    'support_tickets',
    'notifications',
    'audit_logs',
    'api_tokens',
  ];

  for (const table of saasTables) {
    assert.match(saasSql, new RegExp(`CREATE TABLE IF NOT EXISTS \`${table}\``), `Missing table ${table} in database_saas.sql`);
  }

  // Composite tenant uniqueness & zero hardcoded users/admins
  assert.match(saasSql, /UNIQUE KEY `uq_gym_member_code` \(`gym_id`, `member_code`\)/);
  assert.match(saasSql, /UNIQUE KEY `uq_gym_receipt` \(`gym_id`, `receipt_number`\)/);
  assert.match(saasSql, /UNIQUE KEY `uq_gym_member_att_date` \(`gym_id`, `member_id`, `attendance_date`\)/);
  assert.doesNotMatch(saasSql, /INSERT\s+INTO\s+`?(?:admins|users)`?/i);

  // Migration preserves existing admins and backfills QR tokens safely without DELIMITER statements
  assert.doesNotMatch(migSql, /^\s*DELIMITER\b/im);
  assert.match(migSql, /INSERT IGNORE INTO `users`/);
  assert.match(migSql, /INSERT INTO `qr_credentials`/);
});

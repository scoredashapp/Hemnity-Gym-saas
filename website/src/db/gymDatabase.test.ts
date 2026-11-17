import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMembershipRenewalOrExtension,
  createGymDatabase,
  createPaymentTransaction,
  generateNextMemberCode,
  getLocalIsoDate,
  hashPassword,
  recordMemberCheckIn,
  verifyPassword,
} from './gymDatabase';

test('scrypt password hashing verifies valid passwords and rejects wrong passwords', () => {
  const hash = hashPassword('IronGym2026');
  assert.equal(verifyPassword('IronGym2026', hash), true);
  assert.equal(verifyPassword('WrongPass99', hash), false);
});

test('in-memory gym database seeds default 4 INR plans, prevents duplicate same-day check-in, and records payments', () => {
  const db = createGymDatabase(':memory:');

  const plans = db.prepare('SELECT plan_name, duration_days, price FROM membership_plans WHERE gym_id = 1 ORDER BY id ASC').all() as Array<{
    plan_name: string;
    duration_days: number;
    price: number;
  }>;
  assert.equal(plans.length, 4);
  assert.equal(plans[0].plan_name, 'Monthly');
  assert.equal(plans[0].price, 1000);
  assert.equal(plans[3].plan_name, 'Yearly');
  assert.equal(plans[3].price, 9000);
  const g2Plans = db.prepare('SELECT COUNT(*) AS c FROM membership_plans WHERE gym_id = 2').get() as { c: number };
  assert.equal(g2Plans.c, 2);

  const nextCode = generateNextMemberCode(db);
  assert.match(nextCode, /^GYM-\d{4}-0010$/);

  // Pick member 3 (Siddharth Verma, not checked in today) and test duplicate check-in protection
  const today = getLocalIsoDate(0);
  const firstCheckIn = recordMemberCheckIn(db, {
    memberId: 3,
    attendanceDate: today,
    checkInTime: '17:45',
    remarks: 'Evening session',
    adminId: 1,
  });
  assert.equal(firstCheckIn.ok, true);

  const duplicateCheckIn = recordMemberCheckIn(db, {
    memberId: 3,
    attendanceDate: today,
    checkInTime: '18:05',
    adminId: 1,
  });
  assert.equal(duplicateCheckIn.ok, false);
  if (!duplicateCheckIn.ok) {
    assert.equal(duplicateCheckIn.duplicate, true);
  }

  // Record explicit partial payment and verify balance_due
  const payRes = createPaymentTransaction(db, {
    memberId: 5,
    planId: 2,
    amount: 1700,
    planTotalAmount: 2700,
    paymentDate: today,
    paymentMethod: 'UPI',
    transactionRef: 'UPI-TEST-1',
    paymentStatus: 'Partial',
    extendMembership: true,
    adminId: 1,
  });
  assert.equal(payRes.ok, true);
  if (payRes.ok) {
    const stored = db
      .prepare('SELECT amount, balance_due, payment_status FROM payments WHERE id = ?')
      .get(payRes.paymentId) as { amount: number; balance_due: number; payment_status: string };
    assert.equal(stored.amount, 1700);
    assert.equal(stored.balance_due, 1000);
    assert.equal(stored.payment_status, 'Partial');
  }

  // Test membership extension
  const extRes = applyMembershipRenewalOrExtension(db, {
    memberId: 5,
    planId: 2,
    actionType: 'Extension',
    startDate: today,
    expiryDate: getLocalIsoDate(120),
    adminId: 1,
  });
  assert.equal(extRes.ok, true);

  db.close();
});

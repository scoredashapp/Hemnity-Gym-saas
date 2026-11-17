import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyMembershipRenewalOrExtension,
  createGymDatabase,
  createPaymentTransaction,
  enrichMemberRow,
  generateNextMemberCode,
  getLocalIsoDate,
  hashPassword,
  issueOrReissueQrCredential,
  recordMemberCheckIn,
  verifyPassword,
} from './src/db/gymDatabase.ts';
import {
  buildCsvDocument,
  isValidIsoDate,
  normalizeTimeHms,
  validateMemberInput,
  validatePasswordStrength,
  type MembershipActionType,
  type PaymentMethod,
  type PaymentStatus,
  type StoredMemberStatus,
} from './src/utils/gymRules.ts';
import {
  CPANEL_WHITELIST,
  logTenantEvent,
  parseCookies,
  requireOwnerTenant,
  resolveRequestUser,
  saveBase64Image,
  type SessionData,
} from './src/server/saasHelpers.ts';
import { registerSaasRoutes } from './src/server/saasRoutes.ts';

const PORT =
  process.env.NODE_ENV === 'production' && process.env.PORT && process.env.PORT !== process.env.NGINX_PORT
    ? Number(process.env.PORT)
    : Number(process.env.DEFAULT_APP_PORT || 3000);
const db = createGymDatabase();
const sessions = new Map<string, SessionData>();

function getOrCreateSession(req: Request, res: Response): SessionData {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies.gym_sid;
  if (sid && sessions.has(sid)) {
    return sessions.get(sid)!;
  }

  sid = crypto.randomBytes(24).toString('hex');
  const session: SessionData = {
    userId: null,
    role: null,
    activeGymId: null,
    activeMemberRecordId: null,
    csrfToken: crypto.randomBytes(24).toString('hex'),
    loginAttempts: [],
  };
  sessions.set(sid, session);
  res.append('Set-Cookie', `gym_sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  return session;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '4mb' }));

  // Serve safe uploaded member photos and gym logos
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), 'uploads'), {
      fallthrough: false,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  // Attach session & enforce CSRF on browser state-changing API calls (Bearer API & HMAC webhooks bypass cookie CSRF)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const session = getOrCreateSession(req, res);
    (req as Request & { gymSession: SessionData }).gymSession = session;

    const isWebhook = req.path.startsWith('/v1/webhooks/');
    const hasBearer = String(req.headers.authorization || '').startsWith('Bearer ');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !isWebhook && !hasBearer) {
      const provided = String(req.headers['x-csrf-token'] || '');
      const expected = session.csrfToken;
      if (
        !provided ||
        provided.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      ) {
        res.status(419).json({ error: 'Invalid or expired CSRF security token. Please reload the page.' });
        return;
      }
    }
    next();
  });

  // Register multi-tenant v1 SaaS endpoints (Landing, Member Portal, Super Admin, QR, Gateways, Webhooks, API Docs)
  registerSaasRoutes(app, db);

  // --------------------------------------------------------------------------
  // Compatibility Auth Endpoints (mapped strictly to users + gym_owners)
  // --------------------------------------------------------------------------
  app.get('/api/auth/session', (req: Request, res: Response) => {
    const session = (req as Request & { gymSession: SessionData }).gymSession;
    const user = resolveRequestUser(db, req, session);
    const firstOwner = db
      .prepare("SELECT id, full_name, email, is_initial_setup_complete FROM users WHERE role = 'gym_owner' ORDER BY id ASC LIMIT 1")
      .get() as { id: number; full_name: string; email: string; is_initial_setup_complete: number } | undefined;

    if (!user || user.role !== 'gym_owner') {
      const defaultSettings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = 1 LIMIT 1').get();
      res.json({
        authenticated: false,
        csrfToken: session.csrfToken,
        initialSetupAvailable: (firstOwner?.is_initial_setup_complete ?? 0) === 0,
        settings: defaultSettings,
      });
      return;
    }

    const owned = db
      .prepare('SELECT gym_id FROM gym_owners WHERE user_id = ? ORDER BY is_primary DESC, gym_id ASC LIMIT 1')
      .get(user.id) as { gym_id: number } | undefined;
    const gymId = owned?.gym_id ?? 1;
    session.activeGymId = gymId;
    const settings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(gymId);

    res.json({
      authenticated: true,
      admin: user,
      csrfToken: session.csrfToken,
      initialSetupAvailable: (firstOwner?.is_initial_setup_complete ?? 0) === 0,
      settings,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const session = (req as Request & { gymSession: SessionData }).gymSession;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const userRow = db
      .prepare("SELECT id, role, full_name, email, password_hash, is_active, is_initial_setup_complete FROM users WHERE email = ? AND role = 'gym_owner' LIMIT 1")
      .get(email) as
      | {
          id: number;
          role: 'gym_owner';
          full_name: string;
          email: string;
          password_hash: string;
          is_active: number;
          is_initial_setup_complete: number;
        }
      | undefined;

    if (!userRow || !verifyPassword(password, userRow.password_hash) || !userRow.is_active) {
      res.status(401).json({ error: 'Invalid gym owner email or password.' });
      return;
    }

    const owned = db
      .prepare('SELECT gym_id FROM gym_owners WHERE user_id = ? ORDER BY is_primary DESC, gym_id ASC LIMIT 1')
      .get(userRow.id) as { gym_id: number } | undefined;

    session.userId = userRow.id;
    session.role = 'gym_owner';
    session.activeGymId = owned?.gym_id ?? null;
    session.csrfToken = crypto.randomBytes(24).toString('hex');
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userRow.id);

    res.json({
      ok: true,
      csrfToken: session.csrfToken,
      admin: {
        id: userRow.id,
        full_name: userRow.full_name,
        email: userRow.email,
        is_initial_setup_complete: userRow.is_initial_setup_complete,
      },
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const session = (req as Request & { gymSession: SessionData }).gymSession;
    session.userId = null;
    session.role = null;
    session.activeGymId = null;
    session.activeMemberRecordId = null;
    session.csrfToken = crypto.randomBytes(24).toString('hex');
    res.append('Set-Cookie', 'gym_logged_out=1; Path=/; HttpOnly; SameSite=Lax');
    res.json({ ok: true, csrfToken: session.csrfToken });
  });

  app.post('/api/auth/change-password', (req: Request, res: Response) => {
    const session = (req as Request & { gymSession: SessionData }).gymSession;
    const ctx = requireOwnerTenant(db, req, res, session);
    if (!ctx) return;

    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    const confirmPassword = String(req.body?.confirm_password || '');

    const row = db.prepare('SELECT password_hash, is_initial_setup_complete FROM users WHERE id = ?').get(ctx.user.id) as {
      password_hash: string;
      is_initial_setup_complete: number;
    };

    if (row.is_initial_setup_complete === 1 && !verifyPassword(currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Your current password is incorrect.' });
      return;
    }

    const errors = validatePasswordStrength(newPassword, confirmPassword);
    if (errors.length > 0) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    db.prepare("UPDATE users SET password_hash = ?, is_initial_setup_complete = 1, updated_at = datetime('now') WHERE id = ?").run(
      hashPassword(newPassword),
      ctx.user.id
    );
    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Gym Owner Dashboard
  // --------------------------------------------------------------------------
  app.get('/api/dashboard', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const today = getLocalIsoDate(0);
    const inSevenDays = getLocalIsoDate(7);
    const monthPrefix = today.slice(0, 7);

    const stats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_members,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_members,
          SUM(CASE WHEN status = 'Expired' THEN 1 ELSE 0 END) AS expired_members,
          SUM(CASE WHEN status = 'Active' AND membership_expiry_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS expiring_soon
        FROM members
        WHERE gym_id = ?
      `)
      .get(today, inSevenDays, ctx.gymId) as Record<string, number>;

    const todayAtt = db
      .prepare('SELECT COUNT(*) AS cnt FROM attendance WHERE gym_id = ? AND attendance_date = ?')
      .get(ctx.gymId, today) as { cnt: number };

    const monthRev = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM payments
        WHERE gym_id = ?
          AND payment_status IN ('Paid', 'Partial')
          AND substr(payment_date, 1, 7) = ?
      `)
      .get(ctx.gymId, monthPrefix) as { total: number };

    const pendingRow = db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE balance_due END), 0) AS pending_amount,
          COUNT(*) AS pending_count
        FROM payments
        WHERE gym_id = ?
          AND payment_status IN ('Pending', 'Partial')
          AND (payment_status = 'Pending' OR balance_due > 0)
      `)
      .get(ctx.gymId) as { pending_amount: number; pending_count: number };

    const now = new Date();
    const monthlySeries: Array<{ ym: string; label: string; total: number }> = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const row = db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM payments
          WHERE gym_id = ?
            AND payment_status IN ('Paid', 'Partial')
            AND substr(payment_date, 1, 7) = ?
        `)
        .get(ctx.gymId, ym) as { total: number };
      monthlySeries.push({
        ym,
        label: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        total: Number(row.total || 0),
      });
    }

    const rawAlerts = db
      .prepare(`
        SELECT m.id, m.member_code, m.full_name, m.phone, m.membership_expiry_date, m.status,
               p.plan_name
        FROM members m
        LEFT JOIN membership_plans p ON p.id = m.plan_id
        WHERE m.gym_id = ?
          AND m.status != 'Inactive'
          AND m.membership_expiry_date IS NOT NULL
          AND m.membership_expiry_date <= ?
        ORDER BY m.membership_expiry_date ASC
        LIMIT 10
      `)
      .all(ctx.gymId, inSevenDays) as Array<{
      id: number;
      member_code: string;
      full_name: string;
      phone: string;
      membership_expiry_date: string | null;
      status: StoredMemberStatus;
      plan_name: string | null;
    }>;

    const recentMembers = (
      db
        .prepare(`
          SELECT m.id, m.member_code, m.full_name, m.phone, m.joining_date, m.status,
                 m.membership_expiry_date, p.plan_name
          FROM members m
          LEFT JOIN membership_plans p ON p.id = m.plan_id
          WHERE m.gym_id = ?
          ORDER BY m.id DESC
          LIMIT 6
        `)
        .all(ctx.gymId) as Array<{
        id: number;
        member_code: string;
        full_name: string;
        phone: string;
        joining_date: string;
        status: StoredMemberStatus;
        membership_expiry_date: string | null;
        plan_name: string | null;
      }>
    ).map((r) => enrichMemberRow(r, today));

    const recentPayments = db
      .prepare(`
        SELECT py.id, py.receipt_number, py.amount, py.payment_date, py.payment_method, py.payment_status,
               m.id AS member_id, m.full_name, m.member_code
        FROM payments py
        INNER JOIN members m ON m.id = py.member_id
        WHERE py.gym_id = ?
        ORDER BY py.payment_date DESC, py.id DESC
        LIMIT 6
      `)
      .all(ctx.gymId);

    const settings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId);
    const gym = db.prepare('SELECT * FROM gyms WHERE id = ? LIMIT 1').get(ctx.gymId);

    res.json({
      today,
      settings,
      gym,
      subscription: ctx.subscription,
      kpis: {
        totalMembers: Number(stats.total_members || 0),
        activeMembers: Number(stats.active_members || 0),
        expiredMembers: Number(stats.expired_members || 0),
        expiringSoon: Number(stats.expiring_soon || 0),
        todayAttendance: Number(todayAtt.cnt || 0),
        monthlyRevenue: Number(monthRev.total || 0),
        pendingAmount: Number(pendingRow.pending_amount || 0),
        pendingCount: Number(pendingRow.pending_count || 0),
      },
      monthlySeries,
      expiryAlerts: rawAlerts.map((r) => enrichMemberRow(r, today)),
      recentMembers,
      recentPayments,
    });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Members CRUD Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/members', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const search = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const sort = String(req.query.sort || 'newest').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage || 12)));

    const today = getLocalIsoDate(0);
    const inSevenDays = getLocalIsoDate(7);

    const where: string[] = ['m.gym_id = ?'];
    const params: Array<string | number> = [ctx.gymId];

    if (search) {
      where.push('(m.full_name LIKE ? OR m.phone LIKE ? OR m.member_code LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (['Active', 'Expired', 'Inactive'].includes(status)) {
      where.push('m.status = ?');
      params.push(status);
    } else if (status === 'ExpiringSoon') {
      where.push("m.status = 'Active' AND m.membership_expiry_date BETWEEN ? AND ?");
      params.push(today, inSevenDays);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const orderMap: Record<string, string> = {
      newest: 'm.id DESC',
      name_asc: 'm.full_name ASC',
      expiry_asc: 'CASE WHEN m.membership_expiry_date IS NULL THEN 1 ELSE 0 END ASC, m.membership_expiry_date ASC',
      expiry_desc: 'm.membership_expiry_date DESC',
    };
    const orderBy = orderMap[sort] || orderMap.newest;

    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM members m ${whereSql}`)
      .get(...params) as { cnt: number };
    const totalRows = Number(countRow.cnt || 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * perPage;

    const rows = db
      .prepare(`
        SELECT m.*, p.plan_name,
               q.credential_token AS qr_token, q.status AS qr_status,
               CASE WHEN m.user_id IS NOT NULL THEN 1 ELSE 0 END AS has_portal_login
        FROM members m
        LEFT JOIN membership_plans p ON p.id = m.plan_id
        LEFT JOIN qr_credentials q ON q.member_id = m.id AND q.gym_id = m.gym_id AND q.status = 'Active'
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `)
      .all(...params, perPage, offset) as Array<{
      id: number;
      status: StoredMemberStatus;
      membership_expiry_date: string | null;
      [k: string]: unknown;
    }>;

    res.json({
      members: rows.map((r) => enrichMemberRow(r, today)),
      totalRows,
      totalPages,
      page: safePage,
      nextMemberCode: generateNextMemberCode(db, ctx.gymId),
    });
  });

  app.get('/api/members/:id', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const memberId = Number(req.params.id);
    const member = db
      .prepare(`
        SELECT m.*, p.plan_name, p.price AS current_plan_price, p.duration_days,
               q.credential_token AS qr_token, q.status AS qr_status,
               CASE WHEN m.user_id IS NOT NULL THEN 1 ELSE 0 END AS has_portal_login
        FROM members m
        LEFT JOIN membership_plans p ON p.id = m.plan_id
        LEFT JOIN qr_credentials q ON q.member_id = m.id AND q.gym_id = m.gym_id AND q.status = 'Active'
        WHERE m.id = ? AND m.gym_id = ?
        LIMIT 1
      `)
      .get(memberId, ctx.gymId) as
      | {
          id: number;
          status: StoredMemberStatus;
          membership_expiry_date: string | null;
          [k: string]: unknown;
        }
      | undefined;

    if (!member) {
      res.status(404).json({ error: 'Member not found in your gym workspace.' });
      return;
    }

    const membershipHistory = db
      .prepare(`
        SELECT mh.*, u.full_name AS admin_name
        FROM memberships mh
        LEFT JOIN users u ON u.id = mh.created_by
        WHERE mh.member_id = ? AND mh.gym_id = ?
        ORDER BY mh.id DESC
      `)
      .all(memberId, ctx.gymId);

    const payments = db
      .prepare(`
        SELECT py.*, mp.plan_name
        FROM payments py
        LEFT JOIN membership_plans mp ON mp.id = py.plan_id
        WHERE py.member_id = ? AND py.gym_id = ?
        ORDER BY py.payment_date DESC, py.id DESC
      `)
      .all(memberId, ctx.gymId) as Array<{
      amount: number;
      balance_due: number;
      payment_status: PaymentStatus | 'Refunded';
      [k: string]: unknown;
    }>;

    let totalPaid = 0;
    let balanceDue = 0;
    for (const py of payments) {
      if (py.payment_status === 'Paid' || py.payment_status === 'Partial') {
        totalPaid += Number(py.amount || 0);
      }
      if (py.payment_status === 'Pending') {
        balanceDue += Number(py.amount || 0);
      } else if (py.payment_status === 'Partial') {
        balanceDue += Number(py.balance_due || 0);
      }
    }

    const totalAttendance = Number(
      (
        db
          .prepare('SELECT COUNT(*) AS cnt FROM attendance WHERE member_id = ? AND gym_id = ?')
          .get(memberId, ctx.gymId) as { cnt: number }
      ).cnt
    );
    const attendanceRows = db
      .prepare(`
        SELECT * FROM attendance
        WHERE member_id = ? AND gym_id = ?
        ORDER BY attendance_date DESC, check_in_time DESC
        LIMIT 25
      `)
      .all(memberId, ctx.gymId);

    res.json({
      member: enrichMemberRow(member, getLocalIsoDate(0)),
      membershipHistory,
      payments,
      totalPaid,
      balanceDue,
      totalAttendance,
      attendanceRows,
    });
  });

  app.post('/api/members', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
      requireAddMemberQuota: true,
    });
    if (!ctx) return;

    const payload = req.body || {};
    const errors = validateMemberInput(payload);
    if (errors.length > 0) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    let photoPath: string | null = null;
    if (payload.photo_data_url) {
      const up = saveBase64Image(String(payload.photo_data_url), 'members');
      if (!up.ok) {
        res.status(400).json({ error: up.error });
        return;
      }
      photoPath = up.path;
    }

    const planId = payload.plan_id ? Number(payload.plan_id) : null;
    const selectedPlan = planId
      ? (db
          .prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE id = ? AND gym_id = ?')
          .get(planId, ctx.gymId) as
          | { id: number; plan_name: string; duration_days: number; price: number }
          | undefined)
      : undefined;

    if (planId && !selectedPlan) {
      res.status(400).json({ error: 'Selected membership plan does not belong to your gym.' });
      return;
    }

    const today = getLocalIsoDate(0);
    let statusToSave: StoredMemberStatus = ['Active', 'Expired', 'Inactive'].includes(payload.status)
      ? payload.status
      : 'Active';

    if (
      statusToSave === 'Active' &&
      selectedPlan &&
      payload.membership_expiry_date &&
      payload.membership_expiry_date < today
    ) {
      statusToSave = 'Expired';
    }

    db.exec('BEGIN');
    try {
      const memberCode = generateNextMemberCode(db, ctx.gymId);
      const info = db
        .prepare(`
          INSERT INTO members (
            gym_id, member_code, full_name, photo_path, phone, email, gender, date_of_birth,
            address, emergency_contact, joining_date, plan_id,
            membership_start_date, membership_expiry_date, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          ctx.gymId,
          memberCode,
          String(payload.full_name).trim(),
          photoPath,
          String(payload.phone).trim(),
          payload.email ? String(payload.email).trim() : null,
          payload.gender ? String(payload.gender).trim() : null,
          payload.date_of_birth ? String(payload.date_of_birth).trim() : null,
          payload.address ? String(payload.address).trim() : null,
          payload.emergency_contact ? String(payload.emergency_contact).trim() : null,
          String(payload.joining_date).trim(),
          selectedPlan ? selectedPlan.id : null,
          selectedPlan ? String(payload.membership_start_date).trim() : null,
          selectedPlan ? String(payload.membership_expiry_date).trim() : null,
          statusToSave,
          payload.notes ? String(payload.notes).trim() : null
        );

      const newMemberId = Number(info.lastInsertRowid);

      if (selectedPlan) {
        const histStatus = String(payload.membership_expiry_date) < today ? 'Expired' : 'Active';
        db.prepare(`
          INSERT INTO memberships (
            gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
            start_date, expiry_date, action_type, status, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Initial', ?, ?, ?)
        `).run(
          ctx.gymId,
          newMemberId,
          selectedPlan.id,
          selectedPlan.plan_name,
          selectedPlan.price,
          String(payload.membership_start_date).trim(),
          String(payload.membership_expiry_date).trim(),
          histStatus,
          'Initial plan assignment on member registration.',
          ctx.user.id
        );
      }

      db.exec('COMMIT');
      const qrIssued = issueOrReissueQrCredential(db, {
        gymId: ctx.gymId,
        memberId: newMemberId,
        issuedBy: ctx.user.id,
      });

      logTenantEvent(
        db,
        req,
        { id: ctx.user.id, role: ctx.user.role },
        'MEMBER_CREATED',
        'member',
        newMemberId,
        ctx.gymId,
        { memberCode }
      );
      res.status(201).json({
        ok: true,
        id: newMemberId,
        member_code: memberCode,
        qr_token: qrIssued.ok ? qrIssued.token : null,
      });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Failed to create member record.' });
    }
  });

  app.put('/api/members/:id', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const memberId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM members WHERE id = ? AND gym_id = ? LIMIT 1').get(memberId, ctx.gymId) as
      | {
          id: number;
          photo_path: string | null;
          plan_id: number | null;
          membership_expiry_date: string | null;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Member not found in your gym workspace.' });
      return;
    }

    const payload = req.body || {};
    const errors = validateMemberInput(payload);
    if (errors.length > 0) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    let photoPath = existing.photo_path;
    if (payload.remove_photo) photoPath = null;
    if (payload.photo_data_url) {
      const up = saveBase64Image(String(payload.photo_data_url), 'members');
      if (!up.ok) {
        res.status(400).json({ error: up.error });
        return;
      }
      photoPath = up.path;
    }

    const planId = payload.plan_id ? Number(payload.plan_id) : null;
    const selectedPlan = planId
      ? (db
          .prepare('SELECT id, plan_name, price FROM membership_plans WHERE id = ? AND gym_id = ?')
          .get(planId, ctx.gymId) as { id: number; plan_name: string; price: number } | undefined)
      : undefined;

    if (planId && !selectedPlan) {
      res.status(400).json({ error: 'Selected plan does not belong to your gym.' });
      return;
    }

    const today = getLocalIsoDate(0);
    let statusToSave: StoredMemberStatus = ['Active', 'Expired', 'Inactive'].includes(payload.status)
      ? payload.status
      : 'Active';
    if (
      statusToSave === 'Active' &&
      selectedPlan &&
      payload.membership_expiry_date &&
      payload.membership_expiry_date < today
    ) {
      statusToSave = 'Expired';
    }

    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE members SET
          full_name = ?, photo_path = ?, phone = ?, email = ?, gender = ?, date_of_birth = ?,
          address = ?, emergency_contact = ?, joining_date = ?, plan_id = ?,
          membership_start_date = ?, membership_expiry_date = ?, status = ?, notes = ?,
          updated_at = datetime('now')
        WHERE id = ? AND gym_id = ?
      `).run(
        String(payload.full_name).trim(),
        photoPath,
        String(payload.phone).trim(),
        payload.email ? String(payload.email).trim() : null,
        payload.gender ? String(payload.gender).trim() : null,
        payload.date_of_birth ? String(payload.date_of_birth).trim() : null,
        payload.address ? String(payload.address).trim() : null,
        payload.emergency_contact ? String(payload.emergency_contact).trim() : null,
        String(payload.joining_date).trim(),
        selectedPlan ? selectedPlan.id : null,
        selectedPlan ? String(payload.membership_start_date).trim() : null,
        selectedPlan ? String(payload.membership_expiry_date).trim() : null,
        statusToSave,
        payload.notes ? String(payload.notes).trim() : null,
        memberId,
        ctx.gymId
      );

      const planChanged = (existing.plan_id ?? null) !== (selectedPlan?.id ?? null);
      const expChanged = (existing.membership_expiry_date ?? '') !== String(payload.membership_expiry_date || '');

      if (selectedPlan && (planChanged || expChanged)) {
        const actionType: MembershipActionType = planChanged ? 'Plan Change' : 'Extension';
        const histStatus = String(payload.membership_expiry_date) < today ? 'Expired' : 'Active';
        db.prepare(`
          INSERT INTO memberships (
            gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
            start_date, expiry_date, action_type, status, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ctx.gymId,
          memberId,
          selectedPlan.id,
          selectedPlan.plan_name,
          selectedPlan.price,
          String(payload.membership_start_date).trim(),
          String(payload.membership_expiry_date).trim(),
          actionType,
          histStatus,
          'Updated via Member Edit form.',
          ctx.user.id
        );
      }

      db.exec('COMMIT');
      res.json({ ok: true });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to update member details.' });
    }
  });

  app.post('/api/members/:id/renew', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const memberId = Number(req.params.id);
    const actionType: MembershipActionType = ['Renewal', 'Extension', 'Plan Change'].includes(req.body?.action_type)
      ? req.body.action_type
      : 'Renewal';

    const result = applyMembershipRenewalOrExtension(db, {
      gymId: ctx.gymId,
      memberId,
      planId: Number(req.body?.plan_id || 0),
      actionType,
      startDate: String(req.body?.start_date || ''),
      expiryDate: String(req.body?.expiry_date || ''),
      notes: req.body?.notes ? String(req.body.notes) : undefined,
      adminId: ctx.user.id,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/members/:id/status', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const memberId = Number(req.params.id);
    const action = String(req.body?.action || '');
    const target = db
      .prepare('SELECT id, full_name, member_code, membership_expiry_date FROM members WHERE id = ? AND gym_id = ? LIMIT 1')
      .get(memberId, ctx.gymId) as
      | { id: number; full_name: string; member_code: string; membership_expiry_date: string | null }
      | undefined;

    if (!target) {
      res.status(404).json({ error: 'Member not found in your gym workspace.' });
      return;
    }

    if (action === 'deactivate') {
      db.prepare("UPDATE members SET status = 'Inactive', updated_at = datetime('now') WHERE id = ? AND gym_id = ?").run(
        memberId,
        ctx.gymId
      );
      res.json({ ok: true, message: `${target.full_name} deactivated. Historical records preserved.` });
      return;
    }

    if (action === 'reactivate') {
      const today = getLocalIsoDate(0);
      const newStatus =
        target.membership_expiry_date && target.membership_expiry_date < today ? 'Expired' : 'Active';
      db.prepare("UPDATE members SET status = ?, updated_at = datetime('now') WHERE id = ? AND gym_id = ?").run(
        newStatus,
        memberId,
        ctx.gymId
      );
      res.json({ ok: true, message: `${target.full_name} reactivated (${newStatus}).` });
      return;
    }

    if (action === 'delete') {
      const payCount = Number(
        (
          db
            .prepare('SELECT COUNT(*) AS cnt FROM payments WHERE member_id = ? AND gym_id = ?')
            .get(memberId, ctx.gymId) as { cnt: number }
        ).cnt
      );
      if (payCount > 0) {
        res.status(400).json({
          error: `Cannot permanently delete ${target.full_name} because ${payCount} payment record(s) exist. Deactivate the member instead to keep financial history consistent.`,
        });
        return;
      }

      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM qr_credentials WHERE member_id = ? AND gym_id = ?').run(memberId, ctx.gymId);
        db.prepare('DELETE FROM memberships WHERE member_id = ? AND gym_id = ?').run(memberId, ctx.gymId);
        db.prepare('DELETE FROM members WHERE id = ? AND gym_id = ?').run(memberId, ctx.gymId);
        db.exec('COMMIT');
        res.json({ ok: true, message: `${target.full_name} permanently deleted.` });
      } catch {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'Unable to delete member due to linked records.' });
      }
      return;
    }

    res.status(400).json({ error: 'Invalid status action.' });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Membership Plans Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/plans', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const plans = db
      .prepare(`
        SELECT p.*,
               COUNT(CASE WHEN m.status = 'Active' THEN 1 END) AS active_member_count,
               COUNT(m.id) AS total_member_count
        FROM membership_plans p
        LEFT JOIN members m ON m.plan_id = p.id AND m.gym_id = p.gym_id
        WHERE p.gym_id = ?
        GROUP BY p.id
        ORDER BY p.is_active DESC, p.duration_days ASC, p.id ASC
      `)
      .all(ctx.gymId);

    const recentHistory = db
      .prepare(`
        SELECT mh.*, m.full_name, m.member_code
        FROM memberships mh
        INNER JOIN members m ON m.id = mh.member_id
        WHERE mh.gym_id = ?
        ORDER BY mh.id DESC
        LIMIT 12
      `)
      .all(ctx.gymId);

    res.json({ plans, recentHistory });
  });

  app.post('/api/plans', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const planName = String(req.body?.plan_name || '').trim();
    const durationDays = Number(req.body?.duration_days);
    const price = Number(req.body?.price);
    const description = String(req.body?.description || '').trim();
    const isActive = req.body?.is_active === false ? 0 : 1;

    if (!planName || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650 || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'Please provide a valid plan name, whole duration days, and non-negative price.' });
      return;
    }

    const info = db
      .prepare(`
        INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(ctx.gymId, planName, durationDays, Math.round(price * 100) / 100, description || null, isActive);

    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.put('/api/plans/:id', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const planId = Number(req.params.id);
    const planName = String(req.body?.plan_name || '').trim();
    const durationDays = Number(req.body?.duration_days);
    const price = Number(req.body?.price);
    const description = String(req.body?.description || '').trim();
    const isActive = req.body?.is_active ? 1 : 0;

    if (!planName || !Number.isInteger(durationDays) || durationDays < 1 || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'Please enter valid plan name, duration, and price.' });
      return;
    }

    const info = db
      .prepare(`
        UPDATE membership_plans
        SET plan_name = ?, duration_days = ?, price = ?, description = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ? AND gym_id = ?
      `)
      .run(planName, durationDays, Math.round(price * 100) / 100, description || null, isActive, planId, ctx.gymId);

    if (info.changes === 0) {
      res.status(404).json({ error: 'Plan not found in your gym.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/plans/:id/toggle', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const planId = Number(req.params.id);
    const isActive = req.body?.is_active ? 1 : 0;
    const info = db
      .prepare("UPDATE membership_plans SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND gym_id = ?")
      .run(isActive, planId, ctx.gymId);

    if (info.changes === 0) {
      res.status(404).json({ error: 'Plan not found in your gym.' });
      return;
    }
    res.json({ ok: true });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Payments & Receipts Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/payments', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const search = String(req.query.q || '').trim();
    const method = String(req.query.method || '').trim();
    const status = String(req.query.status || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = 15;

    const today = getLocalIsoDate(0);
    const monthPrefix = today.slice(0, 7);

    const dailyRevenue = Number(
      (
        db
          .prepare(
            "SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE gym_id = ? AND payment_status IN ('Paid', 'Partial') AND payment_date = ?"
          )
          .get(ctx.gymId, today) as { s: number }
      ).s
    );
    const monthlyRevenue = Number(
      (
        db
          .prepare(
            "SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE gym_id = ? AND payment_status IN ('Paid', 'Partial') AND substr(payment_date, 1, 7) = ?"
          )
          .get(ctx.gymId, monthPrefix) as { s: number }
      ).s
    );
    const outstandingDues = Number(
      (
        db
          .prepare(`
            SELECT COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE balance_due END), 0) AS s
            FROM payments
            WHERE gym_id = ?
              AND payment_status IN ('Pending', 'Partial')
              AND (payment_status = 'Pending' OR balance_due > 0)
          `)
          .get(ctx.gymId) as { s: number }
      ).s
    );

    const where: string[] = ['py.gym_id = ?'];
    const params: Array<string | number> = [ctx.gymId];

    if (search) {
      where.push('(m.full_name LIKE ? OR m.member_code LIKE ? OR py.receipt_number LIKE ? OR py.transaction_ref LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].includes(method)) {
      where.push('py.payment_method = ?');
      params.push(method);
    }
    if (['Paid', 'Partial', 'Pending', 'Refunded'].includes(status)) {
      where.push('py.payment_status = ?');
      params.push(status);
    }
    if (isValidIsoDate(from)) {
      where.push('py.payment_date >= ?');
      params.push(from);
    }
    if (isValidIsoDate(to)) {
      where.push('py.payment_date <= ?');
      params.push(to);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const aggRow = db
      .prepare(`
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(CASE WHEN py.payment_status IN ('Paid', 'Partial') THEN py.amount ELSE 0 END), 0) AS total
        FROM payments py
        INNER JOIN members m ON m.id = py.member_id
        ${whereSql}
      `)
      .get(...params) as { cnt: number; total: number };

    const totalRows = Number(aggRow.cnt || 0);
    const filteredTotal = Number(aggRow.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * perPage;

    const payments = db
      .prepare(`
        SELECT py.*, m.full_name, m.member_code, m.phone, p.plan_name
        FROM payments py
        INNER JOIN members m ON m.id = py.member_id
        LEFT JOIN membership_plans p ON p.id = py.plan_id
        ${whereSql}
        ORDER BY py.payment_date DESC, py.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, perPage, offset);

    res.json({
      dailyRevenue,
      monthlyRevenue,
      outstandingDues,
      filteredTotal,
      payments,
      totalRows,
      totalPages,
      page: safePage,
      today,
    });
  });

  app.post('/api/payments', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const method = String(req.body?.payment_method || 'Cash') as PaymentMethod;
    const status = String(req.body?.payment_status || 'Paid') as PaymentStatus;

    if (!['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].includes(method)) {
      res.status(400).json({ error: 'Invalid payment method.' });
      return;
    }
    if (!['Paid', 'Partial', 'Pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid payment status.' });
      return;
    }

    const result = createPaymentTransaction(db, {
      gymId: ctx.gymId,
      memberId: Number(req.body?.member_id || 0),
      planId: req.body?.plan_id ? Number(req.body.plan_id) : null,
      amount: Number(req.body?.amount),
      planTotalAmount: Number(req.body?.plan_total_amount),
      paymentDate: String(req.body?.payment_date || ''),
      paymentMethod: method,
      transactionRef: req.body?.transaction_ref ? String(req.body.transaction_ref) : undefined,
      paymentStatus: status,
      extendMembership: Boolean(req.body?.extend_membership),
      notes: req.body?.notes ? String(req.body.notes) : undefined,
      adminId: ctx.user.id,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    logTenantEvent(
      db,
      req,
      { id: ctx.user.id, role: ctx.user.role },
      'PAYMENT_RECORDED',
      'payment',
      result.paymentId,
      ctx.gymId,
      { receiptNumber: result.receiptNumber }
    );
    res.status(201).json(result);
  });

  app.get('/api/payments/:id/receipt', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const paymentId = Number(req.params.id);
    const receipt = db
      .prepare(`
        SELECT py.*,
               m.member_code, m.full_name, m.phone, m.email, m.address AS member_address,
               m.membership_start_date, m.membership_expiry_date,
               p.plan_name, p.duration_days,
               u.full_name AS received_by_name
        FROM payments py
        INNER JOIN members m ON m.id = py.member_id
        LEFT JOIN membership_plans p ON p.id = py.plan_id
        LEFT JOIN users u ON u.id = py.received_by
        WHERE py.id = ? AND py.gym_id = ?
        LIMIT 1
      `)
      .get(paymentId, ctx.gymId);

    if (!receipt) {
      res.status(404).json({ error: 'Payment receipt not found in your gym workspace.' });
      return;
    }

    const settings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId);
    res.json({ receipt, settings });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Attendance Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/attendance', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const today = getLocalIsoDate(0);
    const search = String(req.query.q || '').trim();
    const from = req.query.from !== undefined ? String(req.query.from).trim() : today;
    const to = req.query.to !== undefined ? String(req.query.to).trim() : today;

    const todayCount = Number(
      (
        db
          .prepare('SELECT COUNT(*) AS cnt FROM attendance WHERE gym_id = ? AND attendance_date = ?')
          .get(ctx.gymId, today) as { cnt: number }
      ).cnt
    );

    const where: string[] = ['a.gym_id = ?'];
    const params: Array<string | number> = [ctx.gymId];

    if (search) {
      where.push('(m.full_name LIKE ? OR m.member_code LIKE ? OR m.phone LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (isValidIsoDate(from)) {
      where.push('a.attendance_date >= ?');
      params.push(from);
    }
    if (isValidIsoDate(to)) {
      where.push('a.attendance_date <= ?');
      params.push(to);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const rows = db
      .prepare(`
        SELECT a.*, m.full_name, m.member_code, m.phone, m.photo_path, m.status AS member_status
        FROM attendance a
        INNER JOIN members m ON m.id = a.member_id
        ${whereSql}
        ORDER BY a.attendance_date DESC, a.check_in_time DESC, a.id DESC
        LIMIT 100
      `)
      .all(...params);

    const membersList = db
      .prepare("SELECT id, member_code, full_name, status, photo_path FROM members WHERE gym_id = ? AND status != 'Inactive' ORDER BY full_name ASC")
      .all(ctx.gymId);

    res.json({ today, todayCount, rows, membersList });
  });

  app.post('/api/attendance', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const result = recordMemberCheckIn(db, {
      gymId: ctx.gymId,
      memberId: Number(req.body?.member_id || 0),
      attendanceDate: String(req.body?.attendance_date || getLocalIsoDate(0)),
      checkInTime: String(req.body?.check_in_time || ''),
      checkInMethod: 'Manual',
      remarks: req.body?.remarks ? String(req.body.remarks) : undefined,
      adminId: ctx.user.id,
    });

    if (!result.ok) {
      res.status(result.duplicate ? 409 : 400).json({ error: result.error, duplicate: result.duplicate });
      return;
    }

    res.status(201).json({ ok: true, id: result.id });
  });

  app.put('/api/attendance/:id', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const attId = Number(req.params.id);
    const attDate = String(req.body?.attendance_date || '');
    const checkInTime = normalizeTimeHms(String(req.body?.check_in_time || ''));
    const rawOut = String(req.body?.check_out_time || '').trim();
    const checkOutTime = rawOut ? normalizeTimeHms(rawOut) : null;
    const remarks = String(req.body?.remarks || '').trim();

    if (!isValidIsoDate(attDate) || !checkInTime || (rawOut && !checkOutTime)) {
      res.status(400).json({ error: 'Please enter valid attendance date and times.' });
      return;
    }

    try {
      const info = db
        .prepare(`
          UPDATE attendance
          SET attendance_date = ?, check_in_time = ?, check_out_time = ?, remarks = ?, updated_at = datetime('now')
          WHERE id = ? AND gym_id = ?
        `)
        .run(attDate, checkInTime, checkOutTime, remarks || null, attId, ctx.gymId);
      if (info.changes === 0) {
        res.status(404).json({ error: 'Attendance record not found in your gym.' });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(409).json({
        error: 'Cannot move check-in to a date where this member already has an attendance entry.',
      });
    }
  });

  app.delete('/api/attendance/:id', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession, {
      requireWriteAccess: true,
    });
    if (!ctx) return;

    const info = db.prepare('DELETE FROM attendance WHERE id = ? AND gym_id = ?').run(Number(req.params.id), ctx.gymId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Attendance entry not found in your gym.' });
      return;
    }
    res.json({ ok: true });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Reports & Authenticated CSV Export Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/reports', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const tab = String(req.query.tab || 'summary');
    const granularity = String(req.query.granularity || 'monthly');
    const defaultFrom = getLocalIsoDate(-90);
    const defaultTo = getLocalIsoDate(0);
    const from = isValidIsoDate(String(req.query.from || '')) ? String(req.query.from) : defaultFrom;
    const to = isValidIsoDate(String(req.query.to || '')) ? String(req.query.to) : defaultTo;

    const settings = db.prepare('SELECT currency_code FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId) as {
      currency_code: string;
    };

    let headers: string[] = [];
    let rows: Array<Array<string | number>> = [];

    if (tab === 'summary') {
      headers = ['Status / Metric', 'Member Count', 'Share (%)'];
      const rawTotal = Number(
        (db.prepare('SELECT COUNT(*) AS c FROM members WHERE gym_id = ?').get(ctx.gymId) as { c: number }).c
      );
      const denom = Math.max(1, rawTotal);
      rows.push(['Total Registered Members', rawTotal, '100.0%']);
      for (const st of ['Active', 'Expired', 'Inactive']) {
        const cnt = Number(
          (
            db
              .prepare('SELECT COUNT(*) AS c FROM members WHERE gym_id = ? AND status = ?')
              .get(ctx.gymId, st) as { c: number }
          ).c
        );
        rows.push([`${st} Memberships`, cnt, `${((cnt / denom) * 100).toFixed(1)}%`]);
      }
    } else if (tab === 'registrations') {
      headers = ['Member ID', 'Full Name', 'Phone', 'Plan', 'Joining Date', 'Expiry Date', 'Status'];
      const list = db
        .prepare(`
          SELECT m.member_code, m.full_name, m.phone, COALESCE(p.plan_name, 'Unassigned') AS plan_name,
                 m.joining_date, COALESCE(m.membership_expiry_date, '—') AS expiry_date, m.status
          FROM members m
          LEFT JOIN membership_plans p ON p.id = m.plan_id
          WHERE m.gym_id = ? AND m.joining_date BETWEEN ? AND ?
          ORDER BY m.joining_date DESC, m.id DESC
        `)
        .all(ctx.gymId, from, to) as Array<Record<string, string>>;
      rows = list.map((r) => [r.member_code, r.full_name, r.phone, r.plan_name, r.joining_date, r.expiry_date, r.status]);
    } else if (tab === 'revenue') {
      const substrLen = granularity === 'daily' ? 10 : granularity === 'yearly' ? 4 : 7;
      headers = [
        `${granularity.charAt(0).toUpperCase() + granularity.slice(1)} Period`,
        'Transactions',
        `Collected Amount (${settings?.currency_code || 'INR'})`,
      ];
      const list = db
        .prepare(`
          SELECT substr(payment_date, 1, ${substrLen}) AS period_label,
                 COUNT(*) AS tx_count,
                 COALESCE(SUM(amount), 0) AS total_collected
          FROM payments
          WHERE gym_id = ?
            AND payment_status IN ('Paid', 'Partial')
            AND payment_date BETWEEN ? AND ?
          GROUP BY period_label
          ORDER BY period_label DESC
        `)
        .all(ctx.gymId, from, to) as Array<{ period_label: string; tx_count: number; total_collected: number }>;
      rows = list.map((r) => [r.period_label, r.tx_count, Number(r.total_collected).toFixed(2)]);
    } else if (tab === 'payments') {
      headers = ['Receipt #', 'Payment Date', 'Member ID', 'Member Name', 'Plan', 'Method', 'Reference', 'Status', 'Amount', 'Balance Due'];
      const list = db
        .prepare(`
          SELECT py.receipt_number, py.payment_date, m.member_code, m.full_name,
                 COALESCE(p.plan_name, '—') AS plan_name, py.payment_method,
                 COALESCE(py.transaction_ref, '—') AS ref, py.payment_status,
                 py.amount, py.balance_due
          FROM payments py
          INNER JOIN members m ON m.id = py.member_id
          LEFT JOIN membership_plans p ON p.id = py.plan_id
          WHERE py.gym_id = ? AND py.payment_date BETWEEN ? AND ?
          ORDER BY py.payment_date DESC, py.id DESC
        `)
        .all(ctx.gymId, from, to) as Array<Record<string, string | number>>;
      rows = list.map((r) => [
        r.receipt_number,
        r.payment_date,
        r.member_code,
        r.full_name,
        r.plan_name,
        r.payment_method,
        r.ref,
        r.payment_status,
        Number(r.amount).toFixed(2),
        Number(r.balance_due).toFixed(2),
      ]);
    } else if (tab === 'attendance') {
      headers = ['Date', 'Check-In Time', 'Check-Out Time', 'Method', 'Member ID', 'Member Name', 'Phone', 'Remarks'];
      const list = db
        .prepare(`
          SELECT a.attendance_date, substr(a.check_in_time, 1, 5) AS cin,
                 COALESCE(substr(a.check_out_time, 1, 5), '—') AS cout,
                 a.check_in_method, m.member_code, m.full_name, m.phone, COALESCE(a.remarks, '—') AS remarks
          FROM attendance a
          INNER JOIN members m ON m.id = a.member_id
          WHERE a.gym_id = ? AND a.attendance_date BETWEEN ? AND ?
          ORDER BY a.attendance_date DESC, a.check_in_time DESC
        `)
        .all(ctx.gymId, from, to) as Array<Record<string, string>>;
      rows = list.map((r) => [r.attendance_date, r.cin, r.cout, r.check_in_method, r.member_code, r.full_name, r.phone, r.remarks]);
    } else if (tab === 'renewals') {
      headers = ['Recorded Date', 'Member ID', 'Member Name', 'Plan', 'Action Type', 'Start Date', 'Expiry Date', 'Plan Price'];
      const list = db
        .prepare(`
          SELECT substr(mh.created_at, 1, 10) AS rec_date, m.member_code, m.full_name,
                 mh.plan_name_snapshot, mh.action_type, mh.start_date, mh.expiry_date, mh.plan_price_snapshot
          FROM memberships mh
          INNER JOIN members m ON m.id = mh.member_id
          WHERE mh.gym_id = ? AND mh.action_type IN ('Renewal', 'Extension', 'Plan Change')
            AND substr(mh.created_at, 1, 10) BETWEEN ? AND ?
          ORDER BY mh.id DESC
        `)
        .all(ctx.gymId, from, to) as Array<Record<string, string | number>>;
      rows = list.map((r) => [
        r.rec_date,
        r.member_code,
        r.full_name,
        r.plan_name_snapshot,
        r.action_type,
        r.start_date,
        r.expiry_date,
        Number(r.plan_price_snapshot).toFixed(2),
      ]);
    } else if (tab === 'dues') {
      headers = ['Receipt #', 'Payment Date', 'Member ID', 'Member Name', 'Phone', 'Status', 'Paid So Far', 'Outstanding Due'];
      const list = db
        .prepare(`
          SELECT py.receipt_number, py.payment_date, m.member_code, m.full_name, m.phone,
                 py.payment_status,
                 CASE WHEN py.payment_status = 'Pending' THEN 0 ELSE py.amount END AS paid_amt,
                 CASE WHEN py.payment_status = 'Pending' THEN py.amount ELSE py.balance_due END AS due_amt
          FROM payments py
          INNER JOIN members m ON m.id = py.member_id
          WHERE py.gym_id = ?
            AND py.payment_status IN ('Pending', 'Partial')
            AND (py.payment_status = 'Pending' OR py.balance_due > 0)
            AND py.payment_date BETWEEN ? AND ?
          ORDER BY due_amt DESC, py.payment_date DESC
        `)
        .all(ctx.gymId, from, to) as Array<Record<string, string | number>>;
      rows = list.map((r) => [
        r.receipt_number,
        r.payment_date,
        r.member_code,
        r.full_name,
        r.phone,
        r.payment_status,
        Number(r.paid_amt).toFixed(2),
        Number(r.due_amt).toFixed(2),
      ]);
    }

    if (req.query.export === 'csv') {
      const csv = buildCsvDocument(headers, rows);
      const filename = `gym_${ctx.gymId}_report_${tab}_${from}_to_${to}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
      return;
    }

    res.json({ tab, granularity, from, to, headers, rows });
  });

  // --------------------------------------------------------------------------
  // Tenant-Scoped Gym Settings Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/settings', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const settings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId);
    res.json({ settings, admin: ctx.user });
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const current = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId) as {
      logo_path: string | null;
    };
    const gymName = String(req.body?.gym_name || '').trim();
    const currencyCode = String(req.body?.currency_code || 'INR').trim().toUpperCase();
    const currencySymbol = String(req.body?.currency_symbol || '₹').trim();

    if (!gymName || !currencyCode || !currencySymbol) {
      res.status(400).json({ error: 'Gym name, currency code, and currency symbol are required.' });
      return;
    }

    let logoPath = current?.logo_path ?? null;
    if (req.body?.remove_logo) logoPath = null;
    if (req.body?.logo_data_url) {
      const up = saveBase64Image(String(req.body.logo_data_url), 'logos');
      if (!up.ok) {
        res.status(400).json({ error: up.error });
        return;
      }
      logoPath = up.path;
    }

    db.prepare(`
      UPDATE gym_settings
      SET gym_name = ?, logo_path = ?, address = ?, contact_number = ?, email = ?,
          currency_code = ?, currency_symbol = ?, receipt_footer = ?,
          operating_hours = ?, qr_attendance_enabled = ?, require_photo_verify = ?,
          duplicate_checkin_rule = ?, checkin_cooldown_hours = ?,
          id_card_accent_color = ?, id_card_show_expiry = ?,
          notification_whatsapp_enabled = ?, notification_email_enabled = ?,
          updated_at = datetime('now')
      WHERE gym_id = ?
    `).run(
      gymName,
      logoPath,
      req.body?.address ? String(req.body.address).trim() : null,
      req.body?.contact_number ? String(req.body.contact_number).trim() : null,
      req.body?.email ? String(req.body.email).trim() : null,
      currencyCode,
      currencySymbol,
      String(req.body?.receipt_footer || '').trim(),
      req.body?.operating_hours ? String(req.body.operating_hours).trim() : '05:30 AM - 10:00 PM',
      req.body?.qr_attendance_enabled === 0 ? 0 : 1,
      req.body?.require_photo_verify === 0 ? 0 : 1,
      req.body?.duplicate_checkin_rule === 'cooldown_hours' ? 'cooldown_hours' : 'daily',
      Math.max(1, Number(req.body?.checkin_cooldown_hours || 12)),
      String(req.body?.id_card_accent_color || '#ea580c').slice(0, 20),
      req.body?.id_card_show_expiry === 0 ? 0 : 1,
      req.body?.notification_whatsapp_enabled === 0 ? 0 : 1,
      req.body?.notification_email_enabled === 0 ? 0 : 1,
      ctx.gymId
    );

    db.prepare('UPDATE gyms SET name = ?, logo_path = ?, address = ?, phone = ?, email = ? WHERE id = ?').run(
      gymName,
      logoPath,
      req.body?.address ? String(req.body.address).trim() : null,
      req.body?.contact_number ? String(req.body.contact_number).trim() : null,
      req.body?.email ? String(req.body.email).trim() : null,
      ctx.gymId
    );

    const updated = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId);
    res.json({ ok: true, settings: updated });
  });

  app.put('/api/settings/profile', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, (req as Request & { gymSession: SessionData }).gymSession);
    if (!ctx) return;

    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid full name and email address.' });
      return;
    }

    const dup = db
      .prepare('SELECT 1 FROM users WHERE email = ? AND id != ? LIMIT 1')
      .get(email, ctx.user.id);
    if (dup) {
      res.status(400).json({ error: 'Another account already uses that email address.' });
      return;
    }

    db.prepare("UPDATE users SET full_name = ?, email = ?, updated_at = datetime('now') WHERE id = ?").run(
      fullName,
      email,
      ctx.user.id
    );
    res.json({ ok: true, admin: { ...ctx.user, full_name: fullName, email } });
  });

  // --------------------------------------------------------------------------
  // cPanel PHP + MySQL Source Inspector & Downloadable ZIP Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/cpanel/files', (req: Request, res: Response) => {
    const session = (req as Request & { gymSession: SessionData }).gymSession;
    const user = resolveRequestUser(db, req, session);
    if (!user || !['gym_owner', 'super_admin'].includes(user.role)) {
      res.status(401).json({ error: 'Owner or Super Admin authentication required.' });
      return;
    }

    const requestedFile = String(req.query.file || 'README.md');
    const safeFile = CPANEL_WHITELIST.includes(requestedFile) ? requestedFile : 'README.md';

    const manifest = CPANEL_WHITELIST.map((relPath) => {
      const abs = path.resolve(process.cwd(), relPath);
      const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
      return {
        path: relPath,
        bytes: stat ? stat.size : 0,
      };
    });

    const absTarget = path.resolve(process.cwd(), safeFile);
    const content = fs.existsSync(absTarget) ? fs.readFileSync(absTarget, 'utf8') : '';
    res.json({ files: manifest, selectedFile: safeFile, content });
  });

  app.get('/api/cpanel/download-zip', (req: Request, res: Response) => {
    const session = (req as Request & { gymSession: SessionData }).gymSession;
    const user = resolveRequestUser(db, req, session);
    if (!user || !['gym_owner', 'super_admin'].includes(user.role)) {
      res.status(401).json({ error: 'Owner or Super Admin authentication required.' });
      return;
    }

    const zipPath = path.resolve(process.cwd(), 'public', 'gym-cpanel.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({ error: 'cPanel archive not found.' });
      return;
    }
    res.download(zipPath, 'hemnity-gym-saas-cpanel.zip');
  });

  // --------------------------------------------------------------------------
  // Vite Middleware (Dev) or Static Production Bundle (Prod)
  // --------------------------------------------------------------------------
  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Hemnity Gym SaaS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Hemnity Gym SaaS server:', err);
  process.exit(1);
});

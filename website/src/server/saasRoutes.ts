import type { DatabaseSync } from 'node:sqlite';
import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  addSubscriptionDays,
  enrichMemberRow,
  getGymSubscriptionInfo,
  getLocalIsoDate,
  hashPassword,
  issueOrReissueQrCredential,
  processVerifiedGatewayWebhook,
  recordMemberCheckIn,
  recordQrCheckIn,
  verifyPassword,
} from '../db/gymDatabase.ts';
import { validatePasswordStrength } from '../utils/gymRules.ts';
import {
  calculateSaasPlanAmount,
  computeHmacSignature,
  decryptSecret,
  encryptSecret,
  maskSecret,
  parseFeaturesJson,
  slugifyGymName,
  type BillingCycle,
  type GatewayProvider,
  type UserRole,
} from '../utils/saasRules.ts';
import {
  getClientIp,
  logTenantEvent,
  requireMemberUser,
  requireOwnerTenant,
  requireSuperAdmin,
  resolveRequestUser,
  type SessionData,
} from './saasHelpers.ts';

function getSession(req: Request): SessionData {
  return (req as Request & { gymSession: SessionData }).gymSession;
}

function sanitizePlatformSettings(row: Record<string, unknown>) {
  return {
    id: row.id,
    brand_name: row.brand_name,
    software_name: row.software_name,
    base_url: row.base_url,
    hero_badge: row.hero_badge,
    hero_title: row.hero_title,
    hero_subtitle: row.hero_subtitle,
    hero_cta_primary: row.hero_cta_primary,
    hero_cta_secondary: row.hero_cta_secondary,
    intro_title: row.intro_title,
    intro_body: row.intro_body,
    announcement_banner: row.announcement_banner,
    support_email: row.support_email,
    support_phone: row.support_phone,
    support_address: row.support_address,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    maintenance_mode: Number(row.maintenance_mode || 0),
    platform_gateway_provider: row.platform_gateway_provider,
    platform_gateway_key: row.platform_gateway_key || '',
    has_platform_gateway_secret: Boolean(row.platform_gateway_secret_encrypted),
    platform_gateway_mode: row.platform_gateway_mode || 'test',
    smtp_host: row.smtp_host || '',
    smtp_port: Number(row.smtp_port || 587),
    smtp_user: row.smtp_user || '',
    smtp_from_email: row.smtp_from_email || '',
    smtp_from_name: row.smtp_from_name || 'Hemnity Gym SaaS',
    smtp_encryption: row.smtp_encryption || 'tls',
    has_smtp_password: Boolean(row.smtp_password_encrypted),
    whatsapp_enabled: Number(row.whatsapp_enabled || 0),
    google_oauth_enabled: Number(row.google_oauth_enabled || 0),
    google_client_id: row.google_client_id || '',
    has_google_client_secret: Boolean(row.google_client_secret_encrypted),
    default_grace_period_days: Number(row.default_grace_period_days || 7),
    email_template_welcome: row.email_template_welcome || '',
    email_template_expiry: row.email_template_expiry || '',
    legal_privacy_summary: row.legal_privacy_summary || '',
    legal_terms_summary: row.legal_terms_summary || '',
  };
}

function mapSaasPlanRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    plan_name: String(row.plan_name),
    tagline: row.tagline ? String(row.tagline) : null,
    monthly_price: Number(row.monthly_price),
    quarterly_price: Number(row.quarterly_price),
    yearly_price: Number(row.yearly_price),
    trial_days: Number(row.trial_days),
    max_members: Number(row.max_members),
    max_branches: Number(row.max_branches),
    discount_percent: Number(row.discount_percent || 0),
    enabled_features: parseFeaturesJson(String(row.enabled_features_json || '{}')),
    description: row.description ? String(row.description) : null,
    is_featured: Number(row.is_featured || 0),
    is_active: Number(row.is_active || 0),
    sort_order: Number(row.sort_order || 0),
    active_gyms_count: row.active_gyms_count !== undefined ? Number(row.active_gyms_count) : undefined,
  };
}

export function registerSaasRoutes(app: Express, db: DatabaseSync): void {
  // --------------------------------------------------------------------------
  // 1. Public Landing Page & Self-Service Gym Tenant Registration
  // --------------------------------------------------------------------------
  app.get('/api/v1/public/landing', (_req: Request, res: Response) => {
    const platRaw = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as Record<string, unknown>;
    const plansRaw = db
      .prepare('SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC, monthly_price ASC')
      .all() as Array<Record<string, unknown>>;
    const faqs = db
      .prepare('SELECT id, question, answer, sort_order, is_active FROM platform_faqs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
      .all();

    const stats = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM gyms WHERE status IN ('Active', 'Trial')) AS active_gyms,
          (SELECT COUNT(*) FROM members) AS total_members,
          (SELECT COUNT(*) FROM attendance) AS total_checkins
      `)
      .get() as { active_gyms: number; total_members: number; total_checkins: number };

    res.json({
      platform: sanitizePlatformSettings(platRaw),
      plans: plansRaw.map(mapSaasPlanRow),
      faqs,
      stats,
    });
  });

  app.post('/api/v1/public/register-gym', (req: Request, res: Response) => {
    const session = getSession(req);
    const gymName = String(req.body?.gym_name || '').trim();
    const ownerName = String(req.body?.owner_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const city = String(req.body?.city || '').trim();
    const address = String(req.body?.address || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirm_password || password);
    const saasPlanId = Number(req.body?.saas_plan_id || 0);
    const billingCycle: BillingCycle = ['monthly', 'quarterly', 'yearly'].includes(req.body?.billing_cycle)
      ? req.body.billing_cycle
      : 'monthly';
    const startTrial = req.body?.start_trial !== false;

    const errors: string[] = [];
    if (gymName.length < 2) errors.push('Gym business name must be at least 2 characters.');
    if (ownerName.length < 2) errors.push('Owner full name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid owner email address.');
    if (phone.length < 7) errors.push('Please enter a valid contact phone number.');
    errors.push(...validatePasswordStrength(password, confirmPassword));

    if (errors.length > 0) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    const dupEmail = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
    if (dupEmail) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      return;
    }

    const plan = (saasPlanId
      ? db.prepare('SELECT * FROM saas_plans WHERE id = ? AND is_active = 1 LIMIT 1').get(saasPlanId)
      : db.prepare('SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 1').get()) as
      | Record<string, unknown>
      | undefined;

    if (!plan) {
      res.status(400).json({ error: 'Selected SaaS subscription plan is unavailable.' });
      return;
    }

    const plat = db.prepare('SELECT default_grace_period_days FROM platform_settings WHERE id = 1').get() as
      | { default_grace_period_days: number }
      | undefined;
    const defaultGrace = plat?.default_grace_period_days ?? 7;

    let baseSlug = slugifyGymName(gymName);
    let candidateSlug = baseSlug;
    let suffix = 2;
    while (db.prepare('SELECT 1 FROM gyms WHERE slug = ? LIMIT 1').get(candidateSlug)) {
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const today = getLocalIsoDate(0);
    const trialDays = Math.max(7, Number(plan.trial_days || 14));
    const periodDays = startTrial ? trialDays : billingCycle === 'yearly' ? 365 : billingCycle === 'quarterly' ? 90 : 30;
    const periodEnd = addSubscriptionDays(today, periodDays);
    const gymStatus = startTrial ? 'Trial' : 'Active';

    db.exec('BEGIN');
    try {
      const userRes = db
        .prepare(`
          INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete, last_login_at)
          VALUES ('gym_owner', ?, ?, ?, ?, 1, 1, datetime('now'))
        `)
        .run(ownerName, email, phone, hashPassword(password));
      const userId = Number(userRes.lastInsertRowid);

      const gymCode = `HMN-GYM-${String(Math.floor(1000 + Math.random() * 8999))}`;
      const gymRes = db
        .prepare(`
          INSERT INTO gyms (gym_code, slug, name, owner_user_id, email, phone, address, city, status, operating_hours, branch_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '05:30 AM - 10:00 PM', 1)
        `)
        .run(gymCode, candidateSlug, gymName, userId, email, phone, address || null, city || null, gymStatus);
      const gymId = Number(gymRes.lastInsertRowid);

      db.prepare("INSERT INTO gym_owners (gym_id, user_id, role_label, is_primary) VALUES (?, ?, 'Primary Owner', 1)").run(
        gymId,
        userId
      );

      db.prepare(`
        INSERT INTO gym_settings (gym_id, gym_name, address, contact_number, email, currency_code, currency_symbol, receipt_footer)
        VALUES (?, ?, ?, ?, ?, 'INR', '₹', ?)
      `).run(gymId, gymName, address || null, phone, email, `Thank you for training with ${gymName}.`);

      // Seed default membership plans for the newly created gym workspace
      const insPlan = db.prepare(
        'INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active) VALUES (?, ?, ?, ?, ?, 1)'
      );
      insPlan.run(gymId, 'Monthly', 30, 1000, 'Standard 30-day gym floor access.');
      insPlan.run(gymId, 'Quarterly', 90, 2700, '90-day strength and cardio access.');
      insPlan.run(gymId, 'Half-Yearly', 180, 5000, '180-day full facility access.');
      insPlan.run(gymId, 'Yearly', 365, 9000, '365-day annual membership.');

      const subRes = db
        .prepare(`
          INSERT INTO gym_saas_subscriptions (
            gym_id, saas_plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, grace_period_days
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          gymId,
          Number(plan.id),
          billingCycle,
          gymStatus,
          startTrial ? periodEnd : null,
          today,
          periodEnd,
          defaultGrace
        );
      const subId = Number(subRes.lastInsertRowid);

      const amountDue = startTrial
        ? 0
        : calculateSaasPlanAmount(
            {
              monthly_price: Number(plan.monthly_price),
              quarterly_price: Number(plan.quarterly_price),
              yearly_price: Number(plan.yearly_price),
              discount_percent: Number(plan.discount_percent || 0),
            },
            billingCycle
          );

      db.prepare(`
        INSERT INTO saas_subscription_payments (
          invoice_number, gym_id, subscription_id, saas_plan_id, billing_cycle, amount, currency, payment_method, status, paid_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?)
      `).run(
        `HMN-INV-${today.slice(0, 4)}-${String(gymId).padStart(4, '0')}`,
        gymId,
        subId,
        Number(plan.id),
        billingCycle,
        amountDue,
        startTrial ? 'Free Trial' : 'Pending Checkout',
        startTrial ? 'Paid' : 'Pending',
        startTrial ? `${today} 00:00:00` : null,
        startTrial ? `${trialDays}-day free trial workspace created` : `Initial ${billingCycle} plan onboarding`
      );

      db.prepare(`
        INSERT INTO gym_payment_gateways (gym_id, provider, merchant_key_id, secret_encrypted, webhook_secret_encrypted, mode, is_enabled, auto_activate_membership)
        VALUES (?, 'razorpay', '', '', '', 'test', 0, 1)
      `).run(gymId);

      logTenantEvent(
        db,
        req,
        { id: userId, role: 'gym_owner' },
        'GYM_WORKSPACE_REGISTERED',
        'gym',
        gymId,
        gymId,
        { gymName, saasPlanId: Number(plan.id), startTrial }
      );

      db.exec('COMMIT');

      session.userId = userId;
      session.role = 'gym_owner';
      session.activeGymId = gymId;
      session.activeMemberRecordId = null;
      session.csrfToken = crypto.randomBytes(24).toString('hex');
      res.append('Set-Cookie', 'gym_logged_out=0; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');

      res.status(201).json({
        ok: true,
        csrfToken: session.csrfToken,
        gym: { id: gymId, gym_code: gymCode, slug: candidateSlug, name: gymName, status: gymStatus },
        user: { id: userId, role: 'gym_owner', full_name: ownerName, email, is_initial_setup_complete: 1 },
      });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to provision gym workspace. Please retry.' });
    }
  });

  app.post('/api/v1/public/contact', (req: Request, res: Response) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const subject = String(req.body?.subject || 'Sales & Demo Inquiry').trim();
    const message = String(req.body?.message || '').trim();

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
      res.status(400).json({ error: 'Please provide your name, valid email, and inquiry message (at least 10 characters).' });
      return;
    }

    db.prepare(`
      INSERT INTO support_tickets (gym_id, user_id, sender_name, sender_email, subject, message, status)
      VALUES (1, NULL, ?, ?, ?, ?, 'Open')
    `).run(name, email, `[Public Inquiry] ${subject}`, message);

    res.status(201).json({ ok: true, message: 'Thank you. Hemnity onboarding team has received your inquiry.' });
  });

  // --------------------------------------------------------------------------
  // 2. Unified Role-Aware Authentication Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/v1/auth/session', (req: Request, res: Response) => {
    const session = getSession(req);
    const user = resolveRequestUser(db, req, session);
    const platRaw = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as Record<string, unknown>;

    const ownerPendingSetup = db
      .prepare("SELECT is_initial_setup_complete FROM users WHERE role = 'gym_owner' ORDER BY id ASC LIMIT 1")
      .get() as { is_initial_setup_complete: number } | undefined;
    const superAdminPendingSetup = db
      .prepare("SELECT is_initial_setup_complete FROM users WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1")
      .get() as { is_initial_setup_complete: number } | undefined;

    let gymSettings = null;
    let subscription = null;
    let gym = null;
    if (user?.role === 'gym_owner') {
      const owned = db
        .prepare(`
          SELECT g.* FROM gym_owners go
          JOIN gyms g ON g.id = go.gym_id
          WHERE go.user_id = ?
          ORDER BY go.is_primary DESC, g.id ASC
          LIMIT 1
        `)
        .get(user.id) as { id: number } | undefined;
      if (owned) {
        session.activeGymId = owned.id;
        gym = owned;
        gymSettings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(owned.id);
        subscription = getGymSubscriptionInfo(db, owned.id);
      }
    }

    res.json({
      authenticated: Boolean(user),
      user: user || null,
      csrfToken: session.csrfToken,
      previewSwitchEnabled: process.env.NODE_ENV !== 'production' && process.env.HEMNITY_DISABLE_PREVIEW_SWITCH !== '1',
      setupAvailable: {
        gym_owner: (ownerPendingSetup?.is_initial_setup_complete ?? 0) === 0,
        super_admin: (superAdminPendingSetup?.is_initial_setup_complete ?? 0) === 0,
      },
      platform: sanitizePlatformSettings(platRaw),
      gym,
      settings: gymSettings,
      subscription,
    });
  });

  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    const session = getSession(req);
    const nowSec = Math.floor(Date.now() / 1000);
    session.loginAttempts = session.loginAttempts.filter((t) => t > nowSec - 900);
    if (session.loginAttempts.length >= 10) {
      res.status(429).json({ error: 'Too many failed login attempts. Please wait 15 minutes.' });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const expectedRole = String(req.body?.role || '').trim() as UserRole | '';

    if (!email || !password) {
      res.status(400).json({ error: 'Please enter both email address and password.' });
      return;
    }

    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .get(email) as
      | {
          id: number;
          role: UserRole;
          full_name: string;
          email: string;
          phone: string | null;
          password_hash: string;
          is_active: number;
          is_initial_setup_complete: number;
        }
      | undefined;

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      session.loginAttempts.push(nowSec);
      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }

    if (!userRow.is_active) {
      res.status(403).json({ error: 'This account is inactive or suspended.' });
      return;
    }

    if (expectedRole && userRow.role !== expectedRole) {
      res.status(403).json({
        error: `Please sign in via the matching portal for your role (${userRow.role.replace('_', ' ')}).`,
      });
      return;
    }

    session.userId = userRow.id;
    session.role = userRow.role;
    session.activeGymId = null;
    session.activeMemberRecordId = null;
    session.loginAttempts = [];
    session.csrfToken = crypto.randomBytes(24).toString('hex');

    if (userRow.role === 'gym_owner') {
      const g = db
        .prepare('SELECT gym_id FROM gym_owners WHERE user_id = ? ORDER BY is_primary DESC, gym_id ASC LIMIT 1')
        .get(userRow.id) as { gym_id: number } | undefined;
      session.activeGymId = g?.gym_id ?? null;
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userRow.id);
    logTenantEvent(db, req, { id: userRow.id, role: userRow.role }, 'USER_LOGIN', 'user', userRow.id, session.activeGymId);
    res.append('Set-Cookie', 'gym_logged_out=0; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');

    res.json({
      ok: true,
      csrfToken: session.csrfToken,
      user: {
        id: userRow.id,
        role: userRow.role,
        full_name: userRow.full_name,
        email: userRow.email,
        phone: userRow.phone,
        is_initial_setup_complete: userRow.is_initial_setup_complete,
      },
    });
  });

  app.post('/api/v1/auth/setup', (req: Request, res: Response) => {
    const session = getSession(req);
    const role: UserRole = req.body?.role === 'super_admin' ? 'super_admin' : 'gym_owner';

    const target = db
      .prepare('SELECT id, is_initial_setup_complete FROM users WHERE role = ? ORDER BY id ASC LIMIT 1')
      .get(role) as { id: number; is_initial_setup_complete: number } | undefined;

    if (target && target.is_initial_setup_complete === 1) {
      res.status(403).json({ error: `Initial setup for ${role.replace('_', ' ')} is already completed and locked.` });
      return;
    }

    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirm_password || '');

    const errors: string[] = [];
    if (fullName.length < 2) errors.push('Full name must be at least 2 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid email address.');
    errors.push(...validatePasswordStrength(password, confirmPassword));
    if (errors.length > 0) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    const dup = target
      ? db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ? LIMIT 1').get(email, target.id)
      : db.prepare('SELECT 1 FROM users WHERE email = ? LIMIT 1').get(email);
    if (dup) {
      res.status(409).json({ error: 'Another user already uses that email address.' });
      return;
    }

    const hash = hashPassword(password);
    let userId: number;
    if (target) {
      db.prepare(`
        UPDATE users
        SET full_name = ?, email = ?, password_hash = ?, is_initial_setup_complete = 1, last_login_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(fullName, email, hash, target.id);
      userId = target.id;
    } else {
      const info = db
        .prepare(`
          INSERT INTO users (role, full_name, email, password_hash, is_active, is_initial_setup_complete, last_login_at)
          VALUES (?, ?, ?, ?, 1, 1, datetime('now'))
        `)
        .run(role, fullName, email, hash);
      userId = Number(info.lastInsertRowid);
    }

    session.userId = userId;
    session.role = role;
    session.activeGymId = role === 'gym_owner' ? 1 : null;
    session.csrfToken = crypto.randomBytes(24).toString('hex');
    res.append('Set-Cookie', 'gym_logged_out=0; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');

    res.json({
      ok: true,
      csrfToken: session.csrfToken,
      user: { id: userId, role, full_name: fullName, email, is_initial_setup_complete: 1 },
    });
  });

  app.post('/api/v1/auth/preview-switch', (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production' || process.env.HEMNITY_DISABLE_PREVIEW_SWITCH === '1') {
      res.status(403).json({ error: 'Preview switcher is disabled in production. Use standard login.' });
      return;
    }

    const session = getSession(req);
    const target = String(req.body?.target || '');
    let user:
      | {
          id: number;
          role: UserRole;
          full_name: string;
          email: string;
          is_initial_setup_complete: number;
        }
      | undefined;

    if (target === 'super_admin') {
      user = db
        .prepare("SELECT id, role, full_name, email, is_initial_setup_complete FROM users WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1")
        .get() as typeof user;
    } else if (target === 'owner_gym1') {
      user = db
        .prepare(`
          SELECT u.id, u.role, u.full_name, u.email, u.is_initial_setup_complete
          FROM gym_owners go
          JOIN users u ON u.id = go.user_id
          WHERE go.gym_id = 1
          ORDER BY go.is_primary DESC LIMIT 1
        `)
        .get() as typeof user;
    } else if (target === 'owner_gym2') {
      user = db
        .prepare(`
          SELECT u.id, u.role, u.full_name, u.email, u.is_initial_setup_complete
          FROM gym_owners go
          JOIN users u ON u.id = go.user_id
          WHERE go.gym_id = 2
          ORDER BY go.is_primary DESC LIMIT 1
        `)
        .get() as typeof user;
    } else if (target === 'member_multi') {
      user = db
        .prepare("SELECT id, role, full_name, email, is_initial_setup_complete FROM users WHERE email = 'ananya.d@example.com' LIMIT 1")
        .get() as typeof user;
    }

    if (!user) {
      res.status(404).json({ error: 'Requested preview workspace account was not found.' });
      return;
    }

    session.userId = user.id;
    session.role = user.role;
    session.activeMemberRecordId = null;
    if (user.role === 'gym_owner') {
      session.activeGymId = target === 'owner_gym2' ? 2 : 1;
    } else {
      session.activeGymId = null;
    }
    session.csrfToken = crypto.randomBytes(24).toString('hex');
    res.append('Set-Cookie', 'gym_logged_out=0; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');

    res.json({ ok: true, csrfToken: session.csrfToken, user });
  });

  app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
    const session = getSession(req);
    session.userId = null;
    session.role = null;
    session.activeGymId = null;
    session.activeMemberRecordId = null;
    session.csrfToken = crypto.randomBytes(24).toString('hex');
    res.append('Set-Cookie', 'gym_logged_out=1; Path=/; HttpOnly; SameSite=Lax');
    res.json({ ok: true, csrfToken: session.csrfToken });
  });

  app.post('/api/v1/auth/change-password', (req: Request, res: Response) => {
    const session = getSession(req);
    const user = resolveRequestUser(db, req, session);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    const confirmPassword = String(req.body?.confirm_password || '');

    const row = db.prepare('SELECT password_hash, is_initial_setup_complete FROM users WHERE id = ?').get(user.id) as {
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
      user.id
    );
    logTenantEvent(db, req, { id: user.id, role: user.role }, 'PASSWORD_CHANGED', 'user', user.id, session.activeGymId);
    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  // Bearer token generation for Android Owner / Member mobile clients
  app.post('/api/v1/auth/token', (req: Request, res: Response) => {
    const session = getSession(req);
    const actor = resolveRequestUser(db, req, session);
    if (!actor) {
      res.status(401).json({ error: 'Sign in first to issue a mobile API token.' });
      return;
    }

    const deviceName = String(req.body?.device_name || 'Android Mobile Client').trim().slice(0, 80);
    const plainToken = `hmn_api_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

    db.prepare(`
      INSERT INTO api_tokens (user_id, gym_id, token_hash, device_name, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', '+90 days'))
    `).run(actor.id, session.activeGymId, tokenHash, deviceName);

    logTenantEvent(db, req, { id: actor.id, role: actor.role }, 'API_TOKEN_ISSUED', 'api_token', deviceName, session.activeGymId);
    res.status(201).json({
      ok: true,
      token_type: 'Bearer',
      access_token: plainToken,
      device_name: deviceName,
      expires_in_days: 90,
    });
  });

  // --------------------------------------------------------------------------
  // 3. Gym Owner SaaS Extensions (QR Scan, ID Cards, Refunds, Gateway, SaaS Billing)
  // --------------------------------------------------------------------------
  app.post('/api/v1/owner/attendance/qr-scan', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req), { requireWriteAccess: true });
    if (!ctx) return;
    if (!ctx.subscription.enabled_features.qr_attendance) {
      res.status(403).json({ error: 'QR attendance is not enabled in your current SaaS plan.' });
      return;
    }

    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'QR credential token is required.' });
      return;
    }

    const result = recordQrCheckIn(db, {
      gymId: ctx.gymId,
      token,
      adminId: ctx.user.id,
      attendanceDate: req.body?.attendance_date ? String(req.body.attendance_date) : undefined,
      checkInTime: req.body?.check_in_time ? String(req.body.check_in_time) : undefined,
    });

    if (!result.ok) {
      logTenantEvent(
        db,
        req,
        { id: ctx.user.id, role: ctx.user.role },
        result.crossTenant ? 'QR_CROSS_TENANT_BLOCKED' : 'QR_CHECKIN_REJECTED',
        'qr_credential',
        token.slice(0, 14),
        ctx.gymId,
        { reason: result.error }
      );
      res.status(result.crossTenant ? 403 : result.duplicate ? 409 : 400).json({
        error: result.error,
        duplicate: result.duplicate,
        revoked: result.revoked,
        crossTenant: result.crossTenant,
      });
      return;
    }

    logTenantEvent(
      db,
      req,
      { id: ctx.user.id, role: ctx.user.role },
      'QR_CHECKIN_RECORDED',
      'attendance',
      result.id,
      ctx.gymId,
      { memberId: result.member.id, memberCode: result.member.member_code }
    );
    res.status(201).json(result);
  });

  app.post('/api/v1/owner/attendance/keyboard', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req), { requireWriteAccess: true });
    if (!ctx) return;

    const queryCode = String(req.body?.member_code || '').trim();
    if (!queryCode) {
      res.status(400).json({ error: 'Enter a member ID code or phone number.' });
      return;
    }

    const member = db
      .prepare(`
        SELECT m.id, m.full_name, m.member_code, m.photo_path, m.status, m.membership_expiry_date, p.plan_name
        FROM members m
        LEFT JOIN membership_plans p ON p.id = m.plan_id
        WHERE m.gym_id = ?
          AND (LOWER(m.member_code) = LOWER(?) OR m.phone = ?)
        LIMIT 1
      `)
      .get(ctx.gymId, queryCode, queryCode) as
      | {
          id: number;
          full_name: string;
          member_code: string;
          photo_path: string | null;
          status: string;
          membership_expiry_date: string | null;
          plan_name: string | null;
        }
      | undefined;

    if (!member) {
      res.status(404).json({ error: `No member matching "${queryCode}" found in ${ctx.gymName}.` });
      return;
    }
    if (member.status === 'Inactive') {
      res.status(400).json({ error: `${member.full_name} is marked Inactive.` });
      return;
    }

    const today = getLocalIsoDate(0);
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const checkIn = recordMemberCheckIn(db, {
      gymId: ctx.gymId,
      memberId: member.id,
      attendanceDate: today,
      checkInTime: hhmm,
      checkInMethod: 'Keyboard',
      remarks: 'Front-desk keyboard code check-in',
      adminId: ctx.user.id,
    });

    if (!checkIn.ok) {
      res.status(checkIn.duplicate ? 409 : 400).json({ error: checkIn.error, duplicate: checkIn.duplicate });
      return;
    }

    logTenantEvent(
      db,
      req,
      { id: ctx.user.id, role: ctx.user.role },
      'KEYBOARD_CHECKIN_RECORDED',
      'attendance',
      checkIn.id,
      ctx.gymId,
      { memberCode: member.member_code }
    );
    res.status(201).json({ ok: true, id: checkIn.id, member });
  });

  app.get('/api/v1/owner/id-cards', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req));
    if (!ctx) return;

    const settings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(ctx.gymId);
    const members = db
      .prepare(`
        SELECT m.id, m.member_code, m.full_name, m.photo_path, m.phone, m.email, m.joining_date,
               m.membership_expiry_date, m.status, p.plan_name,
               q.credential_token AS qr_token, q.status AS qr_status
        FROM members m
        LEFT JOIN membership_plans p ON p.id = m.plan_id
        LEFT JOIN qr_credentials q ON q.member_id = m.id AND q.gym_id = m.gym_id AND q.status = 'Active'
        WHERE m.gym_id = ?
        ORDER BY m.id DESC
      `)
      .all(ctx.gymId) as Array<Record<string, unknown>>;

    res.json({
      settings,
      gym: { id: ctx.gymId, name: ctx.gymName },
      cards: members.map((m) => enrichMemberRow(m as never, getLocalIsoDate(0))),
    });
  });

  app.post('/api/v1/owner/members/:id/qr-reissue', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req), { requireWriteAccess: true });
    if (!ctx) return;

    const memberId = Number(req.params.id);
    const reason = String(req.body?.reason || 'Card lost / reissued by gym owner').trim();
    const issued = issueOrReissueQrCredential(db, {
      gymId: ctx.gymId,
      memberId,
      issuedBy: ctx.user.id,
      revokeReason: reason,
    });

    if (!issued.ok) {
      res.status(404).json({ error: issued.error });
      return;
    }

    logTenantEvent(
      db,
      req,
      { id: ctx.user.id, role: ctx.user.role },
      'QR_CARD_REISSUED',
      'member',
      memberId,
      ctx.gymId,
      { reason }
    );
    res.json({ ok: true, token: issued.token, credentialId: issued.credentialId });
  });

  app.post('/api/v1/owner/members/:id/credentials', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req), { requireWriteAccess: true });
    if (!ctx) return;

    const memberId = Number(req.params.id);
    const member = db
      .prepare('SELECT id, user_id, full_name, email, phone FROM members WHERE id = ? AND gym_id = ? LIMIT 1')
      .get(memberId, ctx.gymId) as
      | { id: number; user_id: number | null; full_name: string; email: string | null; phone: string }
      | undefined;

    if (!member) {
      res.status(404).json({ error: 'Member not found in your gym workspace.' });
      return;
    }

    const email = String(req.body?.email || member.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'A valid member email address is required for Member Portal login.' });
      return;
    }
    const pwErrors = validatePasswordStrength(password, password);
    if (pwErrors.length > 0) {
      res.status(400).json({ error: pwErrors[0] });
      return;
    }

    let userRow = db.prepare('SELECT id, role FROM users WHERE email = ? LIMIT 1').get(email) as
      | { id: number; role: UserRole }
      | undefined;

    if (userRow && userRow.role !== 'gym_member') {
      res.status(409).json({ error: 'This email is already registered under a staff or admin role.' });
      return;
    }

    const hash = hashPassword(password);
    if (userRow) {
      db.prepare("UPDATE users SET password_hash = ?, full_name = ?, updated_at = datetime('now') WHERE id = ?").run(
        hash,
        member.full_name,
        userRow.id
      );
    } else {
      const ins = db
        .prepare(`
          INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete)
          VALUES ('gym_member', ?, ?, ?, ?, 1, 1)
        `)
        .run(member.full_name, email, member.phone, hash);
      userRow = { id: Number(ins.lastInsertRowid), role: 'gym_member' };
    }

    db.prepare('UPDATE members SET user_id = ?, email = ? WHERE id = ? AND gym_id = ?').run(
      userRow.id,
      email,
      memberId,
      ctx.gymId
    );
    logTenantEvent(db, req, { id: ctx.user.id, role: ctx.user.role }, 'MEMBER_LOGIN_SET', 'member', memberId, ctx.gymId);
    res.json({ ok: true, email, message: `Member portal credentials saved for ${member.full_name}.` });
  });

  app.post('/api/v1/owner/payments/:id/refund', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req), { requireWriteAccess: true });
    if (!ctx) return;

    const paymentId = Number(req.params.id);
    const payment = db
      .prepare('SELECT id, amount, payment_status FROM payments WHERE id = ? AND gym_id = ? LIMIT 1')
      .get(paymentId, ctx.gymId) as { id: number; amount: number; payment_status: string } | undefined;

    if (!payment) {
      res.status(404).json({ error: 'Payment record not found in your gym.' });
      return;
    }
    if (payment.payment_status === 'Refunded') {
      res.status(400).json({ error: 'This payment has already been marked as Refunded.' });
      return;
    }

    const refundAmount = Number(req.body?.refund_amount ?? payment.amount);
    const reason = String(req.body?.reason || 'Refund processed by gym owner').trim();
    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > payment.amount) {
      res.status(400).json({ error: 'Refund amount must be between ₹1 and the original paid amount.' });
      return;
    }

    db.prepare(`
      UPDATE payments
      SET payment_status = 'Refunded', refund_amount = ?, balance_due = 0,
          notes = TRIM(COALESCE(notes, '') || ' | Refunded: ' || ?), updated_at = datetime('now')
      WHERE id = ? AND gym_id = ?
    `).run(refundAmount, reason, paymentId, ctx.gymId);

    logTenantEvent(
      db,
      req,
      { id: ctx.user.id, role: ctx.user.role },
      'PAYMENT_REFUNDED',
      'payment',
      paymentId,
      ctx.gymId,
      { refundAmount, reason }
    );
    res.json({ ok: true, message: 'Payment marked as Refunded.' });
  });

  app.get('/api/v1/owner/gateway', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req));
    if (!ctx) return;

    const gw = db.prepare('SELECT * FROM gym_payment_gateways WHERE gym_id = ? LIMIT 1').get(ctx.gymId) as
      | {
          id: number;
          gym_id: number;
          provider: GatewayProvider;
          merchant_key_id: string;
          secret_encrypted: string;
          webhook_secret_encrypted: string;
          mode: 'test' | 'live';
          is_enabled: number;
          auto_activate_membership: number;
          updated_at: string;
        }
      | undefined;

    const secretPlain = gw ? decryptSecret(gw.secret_encrypted) : '';
    const webhookPlain = gw ? decryptSecret(gw.webhook_secret_encrypted) : '';

    res.json({
      gateway: gw
        ? {
            id: gw.id,
            gym_id: gw.gym_id,
            provider: gw.provider,
            merchant_key_id: gw.merchant_key_id,
            has_secret: Boolean(secretPlain),
            secret_masked: maskSecret(secretPlain),
            has_webhook_secret: Boolean(webhookPlain),
            webhook_secret_masked: maskSecret(webhookPlain),
            mode: gw.mode,
            is_enabled: gw.is_enabled,
            auto_activate_membership: gw.auto_activate_membership,
            updated_at: gw.updated_at,
          }
        : null,
      webhookUrl: `/api/v1/webhooks/gateway/${gw?.provider || 'razorpay'}`,
    });
  });

  app.put('/api/v1/owner/gateway', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req));
    if (!ctx) return;

    const provider: GatewayProvider = ['razorpay', 'cashfree', 'stripe'].includes(req.body?.provider)
      ? req.body.provider
      : 'razorpay';
    const merchantKeyId = String(req.body?.merchant_key_id || '').trim();
    const newSecret = String(req.body?.secret || '').trim();
    const newWebhookSecret = String(req.body?.webhook_secret || '').trim();
    const mode = req.body?.mode === 'live' ? 'live' : 'test';
    const isEnabled = req.body?.is_enabled ? 1 : 0;
    const autoActivate = req.body?.auto_activate_membership !== false ? 1 : 0;

    if (isEnabled && !merchantKeyId) {
      res.status(400).json({ error: 'Merchant / Publishable Key ID is required to enable online payments.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM gym_payment_gateways WHERE gym_id = ? LIMIT 1').get(ctx.gymId) as
      | { secret_encrypted: string; webhook_secret_encrypted: string }
      | undefined;

    const secretEnc = newSecret ? encryptSecret(newSecret) : existing?.secret_encrypted || '';
    const webhookEnc = newWebhookSecret ? encryptSecret(newWebhookSecret) : existing?.webhook_secret_encrypted || '';

    if (existing) {
      db.prepare(`
        UPDATE gym_payment_gateways
        SET provider = ?, merchant_key_id = ?, secret_encrypted = ?, webhook_secret_encrypted = ?,
            mode = ?, is_enabled = ?, auto_activate_membership = ?, updated_at = datetime('now')
        WHERE gym_id = ?
      `).run(provider, merchantKeyId, secretEnc, webhookEnc, mode, isEnabled, autoActivate, ctx.gymId);
    } else {
      db.prepare(`
        INSERT INTO gym_payment_gateways (
          gym_id, provider, merchant_key_id, secret_encrypted, webhook_secret_encrypted, mode, is_enabled, auto_activate_membership
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.gymId, provider, merchantKeyId, secretEnc, webhookEnc, mode, isEnabled, autoActivate);
    }

    logTenantEvent(
      db,
      req,
      { id: ctx.user.id, role: ctx.user.role },
      'GATEWAY_CONFIG_UPDATED',
      'gym_payment_gateways',
      ctx.gymId,
      ctx.gymId,
      { provider, mode, isEnabled }
    );
    res.json({ ok: true, message: 'Per-gym payment gateway settings encrypted and saved.' });
  });

  app.get('/api/v1/owner/subscription', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req));
    if (!ctx) return;

    const availablePlans = (
      db.prepare('SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(mapSaasPlanRow);

    const invoices = db
      .prepare(`
        SELECT sp.*, p.plan_name
        FROM saas_subscription_payments sp
        LEFT JOIN saas_plans p ON p.id = sp.saas_plan_id
        WHERE sp.gym_id = ?
        ORDER BY sp.id DESC
      `)
      .all(ctx.gymId);

    const tickets = db
      .prepare('SELECT * FROM support_tickets WHERE gym_id = ? ORDER BY id DESC LIMIT 20')
      .all(ctx.gymId);

    res.json({
      subscription: ctx.subscription,
      availablePlans,
      invoices,
      tickets,
    });
  });

  app.post('/api/v1/owner/subscription/change', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req));
    if (!ctx) return;

    const planId = Number(req.body?.saas_plan_id || 0);
    const cycle: BillingCycle = ['monthly', 'quarterly', 'yearly'].includes(req.body?.billing_cycle)
      ? req.body.billing_cycle
      : 'monthly';

    const plan = db.prepare('SELECT * FROM saas_plans WHERE id = ? AND is_active = 1 LIMIT 1').get(planId) as
      | Record<string, unknown>
      | undefined;
    if (!plan) {
      res.status(400).json({ error: 'Please select a valid SaaS plan.' });
      return;
    }

    const amount = calculateSaasPlanAmount(
      {
        monthly_price: Number(plan.monthly_price),
        quarterly_price: Number(plan.quarterly_price),
        yearly_price: Number(plan.yearly_price),
        discount_percent: Number(plan.discount_percent || 0),
      },
      cycle
    );

    const today = getLocalIsoDate(0);
    const days = cycle === 'yearly' ? 365 : cycle === 'quarterly' ? 90 : 30;
    const newEnd = addSubscriptionDays(today, days);
    const invNum = `HMN-INV-${today.replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE gym_saas_subscriptions
        SET saas_plan_id = ?, billing_cycle = ?, status = 'Active', current_period_start = ?, current_period_end = ?, updated_at = datetime('now')
        WHERE gym_id = ?
      `).run(planId, cycle, today, newEnd, ctx.gymId);

      db.prepare("UPDATE gyms SET status = 'Active', updated_at = datetime('now') WHERE id = ? AND status IN ('Trial', 'Pending')").run(
        ctx.gymId
      );

      db.prepare(`
        INSERT INTO saas_subscription_payments (
          invoice_number, gym_id, subscription_id, saas_plan_id, billing_cycle, amount, currency, payment_method, transaction_ref, status, paid_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'INR', 'Online Checkout', ?, 'Paid', datetime('now'), ?)
      `).run(
        invNum,
        ctx.gymId,
        ctx.subscription.id,
        planId,
        cycle,
        amount,
        `HMN-TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        `Upgraded/renewed to ${plan.plan_name} (${cycle})`
      );

      db.exec('COMMIT');
      logTenantEvent(
        db,
        req,
        { id: ctx.user.id, role: ctx.user.role },
        'SAAS_PLAN_RENEWED',
        'gym_saas_subscriptions',
        ctx.subscription.id,
        ctx.gymId,
        { planId, cycle, amount, invoice: invNum }
      );
      res.json({ ok: true, invoiceNumber: invNum, subscription: getGymSubscriptionInfo(db, ctx.gymId) });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to update subscription.' });
    }
  });

  app.post('/api/v1/owner/support-tickets', (req: Request, res: Response) => {
    const ctx = requireOwnerTenant(db, req, res, getSession(req));
    if (!ctx) return;

    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    if (subject.length < 3 || message.length < 10) {
      res.status(400).json({ error: 'Please provide a clear subject and support message (min 10 characters).' });
      return;
    }

    const info = db
      .prepare(`
        INSERT INTO support_tickets (gym_id, user_id, sender_name, sender_email, subject, message, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Open')
      `)
      .run(ctx.gymId, ctx.user.id, ctx.user.full_name, ctx.user.email, subject, message);

    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // --------------------------------------------------------------------------
  // 4. Gym Member Self-Service Portal (Multi-Gym Support + Digital ID + Verified Checkout)
  // --------------------------------------------------------------------------
  app.get('/api/v1/member/context', (req: Request, res: Response) => {
    const session = getSession(req);
    const user = requireMemberUser(db, req, res, session);
    if (!user) return;

    const today = getLocalIsoDate(0);
    const records = db
      .prepare(`
        SELECT m.id AS member_id, m.gym_id, m.member_code, m.full_name, m.photo_path, m.joining_date,
               m.membership_start_date, m.membership_expiry_date, m.status,
               g.name AS gym_name, g.logo_path AS gym_logo, g.phone AS gym_phone, g.address AS gym_address,
               COALESCE(gs.currency_symbol, '₹') AS currency_symbol,
               p.plan_name,
               q.credential_token AS qr_token, q.status AS qr_status,
               gw.provider AS gateway_provider, gw.is_enabled AS gateway_enabled,
               (
                 SELECT COALESCE(SUM(CASE WHEN py.payment_status = 'Pending' THEN py.amount ELSE py.balance_due END), 0)
                 FROM payments py
                 WHERE py.member_id = m.id AND py.gym_id = m.gym_id AND py.payment_status IN ('Pending', 'Partial')
               ) AS pending_fees
        FROM members m
        JOIN gyms g ON g.id = m.gym_id
        LEFT JOIN gym_settings gs ON gs.gym_id = m.gym_id
        LEFT JOIN membership_plans p ON p.id = m.plan_id
        LEFT JOIN qr_credentials q ON q.member_id = m.id AND q.gym_id = m.gym_id AND q.status = 'Active'
        LEFT JOIN gym_payment_gateways gw ON gw.gym_id = m.gym_id
        WHERE m.user_id = ?
        ORDER BY m.id ASC
      `)
      .all(user.id) as Array<Record<string, unknown>>;

    const gyms = records.map((r) => {
      const enriched = enrichMemberRow(
        {
          status: r.status as never,
          membership_expiry_date: (r.membership_expiry_date as string | null) ?? null,
        },
        today
      );
      return {
        member_id: Number(r.member_id),
        gym_id: Number(r.gym_id),
        gym_name: String(r.gym_name),
        gym_logo: r.gym_logo ? String(r.gym_logo) : null,
        gym_phone: r.gym_phone ? String(r.gym_phone) : null,
        gym_address: r.gym_address ? String(r.gym_address) : null,
        currency_symbol: String(r.currency_symbol || '₹'),
        member_code: String(r.member_code),
        full_name: String(r.full_name),
        photo_path: r.photo_path ? String(r.photo_path) : null,
        plan_name: r.plan_name ? String(r.plan_name) : null,
        joining_date: String(r.joining_date),
        membership_start_date: r.membership_start_date ? String(r.membership_start_date) : null,
        membership_expiry_date: r.membership_expiry_date ? String(r.membership_expiry_date) : null,
        status: r.status,
        display_status: enriched.display_status,
        days_until_expiry: enriched.days_until_expiry,
        pending_fees: Number(r.pending_fees || 0),
        qr_token: r.qr_token ? String(r.qr_token) : null,
        qr_status: r.qr_status ? String(r.qr_status) : null,
        online_payment_enabled: Boolean(r.gateway_enabled),
        gateway_provider: (r.gateway_provider as GatewayProvider) || 'razorpay',
      };
    });

    const reqMemberId = Number(req.query.member_id || session.activeMemberRecordId || 0);
    const active = gyms.find((g) => g.member_id === reqMemberId) || gyms[0] || null;
    if (active) {
      session.activeMemberRecordId = active.member_id;
    }

    res.json({
      user,
      gyms,
      activeMemberRecordId: active?.member_id ?? 0,
    });
  });

  app.get('/api/v1/member/dashboard', (req: Request, res: Response) => {
    const session = getSession(req);
    const user = requireMemberUser(db, req, res, session);
    if (!user) return;

    const reqMemberId = Number(req.query.member_id || session.activeMemberRecordId || 0);
    const member = (reqMemberId
      ? db.prepare('SELECT * FROM members WHERE id = ? AND user_id = ? LIMIT 1').get(reqMemberId, user.id)
      : db.prepare('SELECT * FROM members WHERE user_id = ? ORDER BY id ASC LIMIT 1').get(user.id)) as
      | Record<string, unknown>
      | undefined;

    if (!member) {
      res.status(404).json({ error: 'No gym membership record linked to your account.' });
      return;
    }

    const memberId = Number(member.id);
    const gymId = Number(member.gym_id);
    session.activeMemberRecordId = memberId;

    const settings = db.prepare('SELECT * FROM gym_settings WHERE gym_id = ? LIMIT 1').get(gymId);
    const plans = db
      .prepare('SELECT * FROM membership_plans WHERE gym_id = ? AND is_active = 1 ORDER BY duration_days ASC')
      .all(gymId);
    const membershipHistory = db
      .prepare('SELECT * FROM memberships WHERE member_id = ? AND gym_id = ? ORDER BY id DESC')
      .all(memberId, gymId);
    const payments = db
      .prepare(`
        SELECT py.*, p.plan_name
        FROM payments py
        LEFT JOIN membership_plans p ON p.id = py.plan_id
        WHERE py.member_id = ? AND py.gym_id = ?
        ORDER BY py.payment_date DESC, py.id DESC
      `)
      .all(memberId, gymId);
    const attendance = db
      .prepare(`
        SELECT * FROM attendance
        WHERE member_id = ? AND gym_id = ?
        ORDER BY attendance_date DESC, check_in_time DESC
        LIMIT 60
      `)
      .all(memberId, gymId);
    const qr = db
      .prepare("SELECT credential_token, status, issued_at FROM qr_credentials WHERE member_id = ? AND gym_id = ? AND status = 'Active' LIMIT 1")
      .get(memberId, gymId);
    const gateway = db
      .prepare('SELECT provider, merchant_key_id, mode, is_enabled FROM gym_payment_gateways WHERE gym_id = ? LIMIT 1')
      .get(gymId);
    const orders = db
      .prepare(`
        SELECT po.order_ref, po.amount, po.currency, po.status, po.created_at, p.plan_name
        FROM payment_orders po
        LEFT JOIN membership_plans p ON p.id = po.plan_id
        WHERE po.member_id = ? AND po.gym_id = ?
        ORDER BY po.id DESC
        LIMIT 10
      `)
      .all(memberId, gymId);

    res.json({
      member: enrichMemberRow(member as never, getLocalIsoDate(0)),
      settings,
      plans,
      membershipHistory,
      payments,
      attendance,
      qr,
      gateway,
      orders,
    });
  });

  app.post('/api/v1/member/orders', (req: Request, res: Response) => {
    const session = getSession(req);
    const user = requireMemberUser(db, req, res, session);
    if (!user) return;

    const memberId = Number(req.body?.member_id || session.activeMemberRecordId || 0);
    const planId = Number(req.body?.plan_id || 0);

    const member = db
      .prepare('SELECT id, gym_id, full_name FROM members WHERE id = ? AND user_id = ? LIMIT 1')
      .get(memberId, user.id) as { id: number; gym_id: number; full_name: string } | undefined;

    if (!member) {
      res.status(403).json({ error: 'Unauthorized: you can only create checkout orders for your own membership.' });
      return;
    }

    const plan = db
      .prepare('SELECT id, plan_name, price, duration_days FROM membership_plans WHERE id = ? AND gym_id = ? AND is_active = 1 LIMIT 1')
      .get(planId, member.gym_id) as { id: number; plan_name: string; price: number; duration_days: number } | undefined;

    if (!plan) {
      res.status(400).json({ error: 'Selected plan is invalid for this gym.' });
      return;
    }

    const gw = db
      .prepare('SELECT provider, merchant_key_id, mode, is_enabled FROM gym_payment_gateways WHERE gym_id = ? LIMIT 1')
      .get(member.gym_id) as
      | { provider: GatewayProvider; merchant_key_id: string; mode: 'test' | 'live'; is_enabled: number }
      | undefined;

    if (!gw || !gw.is_enabled) {
      res.status(400).json({ error: 'Online gateway payments are not currently enabled for this gym. Please pay at front desk.' });
      return;
    }

    const settings = db
      .prepare('SELECT currency_code FROM gym_settings WHERE gym_id = ? LIMIT 1')
      .get(member.gym_id) as { currency_code?: string } | undefined;

    const orderRef = `ORD-${member.gym_id}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    db.prepare(`
      INSERT INTO payment_orders (order_ref, gym_id, member_id, plan_id, gateway_provider, amount, currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
    `).run(orderRef, member.gym_id, member.id, plan.id, gw.provider, plan.price, settings?.currency_code || 'INR');

    logTenantEvent(
      db,
      req,
      { id: user.id, role: user.role },
      'MEMBER_PAYMENT_ORDER_CREATED',
      'payment_orders',
      orderRef,
      member.gym_id,
      { planId: plan.id, amount: plan.price }
    );

    res.status(201).json({
      ok: true,
      order: {
        order_ref: orderRef,
        provider: gw.provider,
        mode: gw.mode,
        merchant_key_id: gw.merchant_key_id,
        amount: plan.price,
        currency: settings?.currency_code || 'INR',
        plan_name: plan.plan_name,
        status: 'Pending',
      },
    });
  });

  // In gateway 'test' mode only, allow the preview UI to dispatch a genuine HMAC-SHA256 signed webhook verification
  app.post('/api/v1/member/orders/:orderRef/simulate-signed-webhook', (req: Request, res: Response) => {
    const session = getSession(req);
    const user = requireMemberUser(db, req, res, session);
    if (!user) return;

    const orderRef = String(req.params.orderRef || '').trim();
    const order = db
      .prepare(`
        SELECT po.*, m.user_id
        FROM payment_orders po
        JOIN members m ON m.id = po.member_id
        WHERE po.order_ref = ? AND m.user_id = ?
        LIMIT 1
      `)
      .get(orderRef, user.id) as
      | { id: number; order_ref: string; gym_id: number; amount: number; currency: string; gateway_provider: string }
      | undefined;

    if (!order) {
      res.status(404).json({ error: 'Order not found for your member account.' });
      return;
    }

    const gw = db
      .prepare('SELECT mode, webhook_secret_encrypted FROM gym_payment_gateways WHERE gym_id = ? LIMIT 1')
      .get(order.gym_id) as { mode: string; webhook_secret_encrypted: string } | undefined;

    if (!gw || gw.mode !== 'test') {
      res.status(403).json({ error: 'Signed webhook simulation is only permitted when gym gateway mode is set to test.' });
      return;
    }

    const webhookSecret = decryptSecret(gw.webhook_secret_encrypted);
    if (!webhookSecret) {
      res.status(400).json({ error: 'Gym webhook secret is not configured.' });
      return;
    }

    const eventId = `evt_test_${crypto.randomBytes(6).toString('hex')}`;
    const txnRef = `pay_${order.gateway_provider}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const payload = JSON.stringify({
      event_id: eventId,
      order_ref: order.order_ref,
      amount: order.amount,
      currency: order.currency,
      transaction_ref: txnRef,
    });
    const signature = computeHmacSignature(payload, webhookSecret);

    const verified = processVerifiedGatewayWebhook(db, {
      orderRef: order.order_ref,
      webhookEventId: eventId,
      signature,
      rawPayload: payload,
      amount: order.amount,
      currency: order.currency,
      transactionRef: txnRef,
    });

    if (!verified.ok) {
      res.status(400).json({ error: verified.error });
      return;
    }

    logTenantEvent(
      db,
      req,
      { id: user.id, role: user.role },
      'GATEWAY_WEBHOOK_VERIFIED',
      'payment',
      verified.paymentId,
      order.gym_id,
      { orderRef: order.order_ref, eventId }
    );
    res.json({ ...verified, eventId, transactionRef: txnRef });
  });

  // --------------------------------------------------------------------------
  // 5. Gateway Webhook Receiver (CSRF-exempt; HMAC-SHA256 verified)
  // --------------------------------------------------------------------------
  app.post('/api/v1/webhooks/gateway/:provider', (req: Request, res: Response) => {
    const sig = String(
      req.headers['x-hemnity-signature'] ||
        req.headers['x-razorpay-signature'] ||
        req.headers['x-webhook-signature'] ||
        ''
    ).trim();
    const rawPayload = JSON.stringify(req.body || {});
    const orderRef = String(req.body?.order_ref || '');
    const eventId = String(req.body?.event_id || '');
    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || 'INR');
    const transactionRef = String(req.body?.transaction_ref || '');

    if (!orderRef || !eventId || !sig) {
      res.status(400).json({ error: 'Missing order_ref, event_id, or signature header.' });
      return;
    }

    const result = processVerifiedGatewayWebhook(db, {
      orderRef,
      webhookEventId: eventId,
      signature: sig,
      rawPayload,
      amount,
      currency,
      transactionRef,
    });

    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ ...result });
  });

  // --------------------------------------------------------------------------
  // 6. Hemnity Super Admin Panel Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/v1/superadmin/dashboard', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const summary = db
      .prepare(`
        SELECT
          COUNT(*) AS total_gyms,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_gyms,
          SUM(CASE WHEN status = 'Suspended' THEN 1 ELSE 0 END) AS suspended_gyms,
          SUM(CASE WHEN status = 'Trial' THEN 1 ELSE 0 END) AS trial_gyms,
          (SELECT COUNT(*) FROM users WHERE role = 'gym_owner') AS total_owners,
          (SELECT COUNT(*) FROM members) AS total_members_across_gyms,
          (SELECT COALESCE(SUM(amount), 0) FROM saas_subscription_payments WHERE status = 'Paid') AS total_saas_revenue,
          (SELECT COUNT(*) FROM support_tickets WHERE status != 'Resolved') AS open_tickets
        FROM gyms
      `)
      .get() as Record<string, number>;

    const monthPrefix = getLocalIsoDate(0).slice(0, 7);
    const mrr = Number(
      (
        db
          .prepare(`
            SELECT COALESCE(SUM(
              CASE s.billing_cycle
                WHEN 'yearly' THEN p.yearly_price / 12.0
                WHEN 'quarterly' THEN p.quarterly_price / 3.0
                ELSE p.monthly_price
              END
            ), 0) AS mrr
            FROM gym_saas_subscriptions s
            JOIN saas_plans p ON p.id = s.saas_plan_id
            WHERE s.status = 'Active'
          `)
          .get() as { mrr: number }
      ).mrr
    );
    const arr = mrr * 12;
    const monthRevenue = Number(
      (
        db
          .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM saas_subscription_payments WHERE status = 'Paid' AND substr(COALESCE(paid_at, created_at), 1, 7) = ?")
          .get(monthPrefix) as { s: number }
      ).s
    );

    const recentGyms = db
      .prepare(`
        SELECT g.id, g.gym_code, g.slug, g.name, g.city, g.status, g.created_at,
               u.full_name AS owner_name, u.email AS owner_email,
               p.plan_name, s.status AS subscription_status, s.current_period_end,
               (SELECT COUNT(*) FROM members m WHERE m.gym_id = g.id) AS member_count
        FROM gyms g
        LEFT JOIN users u ON u.id = g.owner_user_id
        LEFT JOIN gym_saas_subscriptions s ON s.gym_id = g.id
        LEFT JOIN saas_plans p ON p.id = s.saas_plan_id
        ORDER BY g.id DESC
        LIMIT 8
      `)
      .all();

    const expiringSubscriptions = db
      .prepare(`
        SELECT g.id AS gym_id, g.name AS gym_name, g.gym_code, s.status, s.current_period_end, p.plan_name
        FROM gym_saas_subscriptions s
        JOIN gyms g ON g.id = s.gym_id
        JOIN saas_plans p ON p.id = s.saas_plan_id
        WHERE s.current_period_end <= date('now', '+14 days')
        ORDER BY s.current_period_end ASC
        LIMIT 8
      `)
      .all();

    res.json({
      kpis: {
        totalGyms: Number(summary.total_gyms || 0),
        activeGyms: Number(summary.active_gyms || 0),
        suspendedGyms: Number(summary.suspended_gyms || 0),
        trialGyms: Number(summary.trial_gyms || 0),
        totalOwners: Number(summary.total_owners || 0),
        totalMembersAcrossGyms: Number(summary.total_members_across_gyms || 0),
        totalSaasRevenue: Number(summary.total_saas_revenue || 0),
        monthRevenue,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        openTickets: Number(summary.open_tickets || 0),
      },
      recentGyms,
      expiringSubscriptions,
    });
  });

  app.get('/api/v1/superadmin/gyms', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const search = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (search) {
      where.push('(g.name LIKE ? OR g.gym_code LIKE ? OR u.email LIKE ? OR g.city LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (['Active', 'Trial', 'Suspended', 'Pending'].includes(status)) {
      where.push('g.status = ?');
      params.push(status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const today = getLocalIsoDate(0);

    // Note: strictly excludes tenant payment gateway secrets and owner password hashes
    const gyms = db
      .prepare(`
        SELECT g.id, g.gym_code, g.slug, g.name, g.owner_user_id, g.email, g.phone, g.address, g.city,
               g.logo_path, g.status, g.operating_hours, g.branch_count, g.created_at,
               u.full_name AS owner_name, u.email AS owner_email,
               p.plan_name, s.status AS subscription_status, s.billing_cycle,
               s.current_period_end, s.trial_ends_at, s.grace_period_days,
               (SELECT COUNT(*) FROM members m WHERE m.gym_id = g.id) AS member_count,
               (SELECT COUNT(*) FROM members m WHERE m.gym_id = g.id AND m.status = 'Active') AS active_member_count,
               (SELECT COALESCE(SUM(py.amount), 0) FROM payments py WHERE py.gym_id = g.id AND py.payment_status IN ('Paid','Partial')) AS total_revenue,
               (SELECT COUNT(*) FROM attendance a WHERE a.gym_id = g.id AND a.attendance_date = ?) AS today_attendance
        FROM gyms g
        LEFT JOIN users u ON u.id = g.owner_user_id
        LEFT JOIN gym_saas_subscriptions s ON s.gym_id = g.id
        LEFT JOIN saas_plans p ON p.id = s.saas_plan_id
        ${whereSql}
        ORDER BY g.id DESC
      `)
      .all(today, ...params);

    res.json({ gyms });
  });

  app.post('/api/v1/superadmin/gyms/:id/status', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const gymId = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!['Active', 'Trial', 'Suspended', 'Pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid gym status.' });
      return;
    }

    const gym = db.prepare('SELECT id, name FROM gyms WHERE id = ? LIMIT 1').get(gymId) as
      | { id: number; name: string }
      | undefined;
    if (!gym) {
      res.status(404).json({ error: 'Gym workspace not found.' });
      return;
    }

    db.prepare("UPDATE gyms SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, gymId);
    if (status === 'Suspended') {
      db.prepare("UPDATE gym_saas_subscriptions SET status = 'Suspended', updated_at = datetime('now') WHERE gym_id = ?").run(
        gymId
      );
    } else if (status === 'Active') {
      db.prepare("UPDATE gym_saas_subscriptions SET status = 'Active', updated_at = datetime('now') WHERE gym_id = ?").run(
        gymId
      );
    }

    logTenantEvent(
      db,
      req,
      { id: admin.id, role: 'super_admin' },
      'SUPERADMIN_GYM_STATUS_CHANGED',
      'gym',
      gymId,
      gymId,
      { gymName: gym.name, newStatus: status }
    );
    res.json({ ok: true, message: `${gym.name} status updated to ${status}.` });
  });

  app.get('/api/v1/superadmin/saas-plans', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const rows = db
      .prepare(`
        SELECT p.*,
               (SELECT COUNT(*) FROM gym_saas_subscriptions s WHERE s.saas_plan_id = p.id) AS active_gyms_count
        FROM saas_plans p
        ORDER BY p.sort_order ASC, p.id ASC
      `)
      .all() as Array<Record<string, unknown>>;
    res.json({ plans: rows.map(mapSaasPlanRow) });
  });

  app.post('/api/v1/superadmin/saas-plans', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const planName = String(req.body?.plan_name || '').trim();
    const monthly = Number(req.body?.monthly_price);
    const quarterly = Number(req.body?.quarterly_price);
    const yearly = Number(req.body?.yearly_price);
    const trialDays = Math.max(0, Number(req.body?.trial_days ?? 14));
    const maxMembers = Math.max(1, Number(req.body?.max_members ?? 200));
    const maxBranches = Math.max(1, Number(req.body?.max_branches ?? 1));
    const discountPercent = Math.min(80, Math.max(0, Number(req.body?.discount_percent ?? 0)));

    if (!planName || !Number.isFinite(monthly) || monthly < 0) {
      res.status(400).json({ error: 'Valid plan name and monthly price are required.' });
      return;
    }

    const slug = `${slugifyGymName(planName)}-${crypto.randomBytes(2).toString('hex')}`;
    const info = db
      .prepare(`
        INSERT INTO saas_plans (
          slug, plan_name, tagline, monthly_price, quarterly_price, yearly_price,
          trial_days, max_members, max_branches, discount_percent, enabled_features_json,
          description, is_featured, is_active, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        slug,
        planName,
        String(req.body?.tagline || '').trim() || null,
        monthly,
        Number.isFinite(quarterly) ? quarterly : monthly * 2.7,
        Number.isFinite(yearly) ? yearly : monthly * 9.5,
        trialDays,
        maxMembers,
        maxBranches,
        discountPercent,
        JSON.stringify(req.body?.enabled_features || {}),
        String(req.body?.description || '').trim() || null,
        req.body?.is_featured ? 1 : 0,
        req.body?.is_active === false ? 0 : 1,
        Number(req.body?.sort_order ?? 10)
      );

    const newPlanId = Number(info.lastInsertRowid);
    logTenantEvent(db, req, { id: admin.id, role: 'super_admin' }, 'SAAS_PLAN_CREATED', 'saas_plan', newPlanId);
    res.status(201).json({ ok: true, id: newPlanId });
  });

  app.put('/api/v1/superadmin/saas-plans/:id', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const id = Number(req.params.id);
    const planName = String(req.body?.plan_name || '').trim();
    const monthly = Number(req.body?.monthly_price);
    const quarterly = Number(req.body?.quarterly_price);
    const yearly = Number(req.body?.yearly_price);
    if (!planName || !Number.isFinite(monthly) || monthly < 0) {
      res.status(400).json({ error: 'Plan name and valid prices are required.' });
      return;
    }

    db.prepare(`
      UPDATE saas_plans
      SET plan_name = ?, tagline = ?, monthly_price = ?, quarterly_price = ?, yearly_price = ?,
          trial_days = ?, max_members = ?, max_branches = ?, discount_percent = ?,
          enabled_features_json = ?, description = ?, is_featured = ?, is_active = ?, sort_order = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      planName,
      String(req.body?.tagline || '').trim() || null,
      monthly,
      Number.isFinite(quarterly) ? quarterly : monthly * 2.7,
      Number.isFinite(yearly) ? yearly : monthly * 9.5,
      Math.max(0, Number(req.body?.trial_days ?? 14)),
      Math.max(1, Number(req.body?.max_members ?? 200)),
      Math.max(1, Number(req.body?.max_branches ?? 1)),
      Math.min(80, Math.max(0, Number(req.body?.discount_percent ?? 0))),
      JSON.stringify(req.body?.enabled_features || {}),
      String(req.body?.description || '').trim() || null,
      req.body?.is_featured ? 1 : 0,
      req.body?.is_active ? 1 : 0,
      Number(req.body?.sort_order ?? 1),
      id
    );

    logTenantEvent(db, req, { id: admin.id, role: 'super_admin' }, 'SAAS_PLAN_UPDATED', 'saas_plan', id, null, { planName, monthly });
    res.json({ ok: true });
  });

  app.get('/api/v1/superadmin/subscriptions', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const subscriptions = db
      .prepare(`
        SELECT s.*, g.name AS gym_name, g.gym_code, g.status AS gym_status, p.plan_name
        FROM gym_saas_subscriptions s
        JOIN gyms g ON g.id = s.gym_id
        JOIN saas_plans p ON p.id = s.saas_plan_id
        ORDER BY s.id ASC
      `)
      .all();

    const invoices = db
      .prepare(`
        SELECT sp.*, g.name AS gym_name, g.gym_code, p.plan_name
        FROM saas_subscription_payments sp
        JOIN gyms g ON g.id = sp.gym_id
        LEFT JOIN saas_plans p ON p.id = sp.saas_plan_id
        ORDER BY sp.id DESC
      `)
      .all();

    res.json({ subscriptions, invoices });
  });

  app.post('/api/v1/superadmin/subscriptions/:gymId/manage', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const gymId = Number(req.params.gymId);
    const sub = db.prepare('SELECT * FROM gym_saas_subscriptions WHERE gym_id = ? LIMIT 1').get(gymId) as
      | { id: number; saas_plan_id: number; billing_cycle: BillingCycle; current_period_end: string }
      | undefined;
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found for this gym.' });
      return;
    }

    const planId = Number(req.body?.saas_plan_id || sub.saas_plan_id);
    const status = String(req.body?.status || 'Active');
    const cycle: BillingCycle = ['monthly', 'quarterly', 'yearly'].includes(req.body?.billing_cycle)
      ? req.body.billing_cycle
      : sub.billing_cycle;
    const graceDays = Math.max(0, Math.min(60, Number(req.body?.grace_period_days ?? 7)));
    const extendDays = Number(req.body?.extend_days || 0);
    const newPeriodEnd =
      req.body?.current_period_end ||
      (extendDays > 0 ? addSubscriptionDays(sub.current_period_end, extendDays) : sub.current_period_end);

    db.prepare(`
      UPDATE gym_saas_subscriptions
      SET saas_plan_id = ?, billing_cycle = ?, status = ?, current_period_end = ?, grace_period_days = ?, updated_at = datetime('now')
      WHERE gym_id = ?
    `).run(planId, cycle, status, newPeriodEnd, graceDays, gymId);

    const gymStatus = status === 'Suspended' ? 'Suspended' : status === 'Trial' ? 'Trial' : 'Active';
    db.prepare("UPDATE gyms SET status = ?, updated_at = datetime('now') WHERE id = ?").run(gymStatus, gymId);

    if (req.body?.record_payment_amount && Number(req.body.record_payment_amount) > 0) {
      const amt = Number(req.body.record_payment_amount);
      const today = getLocalIsoDate(0);
      db.prepare(`
        INSERT INTO saas_subscription_payments (
          invoice_number, gym_id, subscription_id, saas_plan_id, billing_cycle, amount, currency, payment_method, status, paid_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'INR', 'Super Admin Manual', 'Paid', datetime('now'), ?)
      `).run(
        `HMN-INV-${today.replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        gymId,
        sub.id,
        planId,
        cycle,
        amt,
        String(req.body?.notes || 'Manual subscription renewal recorded by Hemnity Super Admin')
      );
    }

    logTenantEvent(
      db,
      req,
      { id: admin.id, role: 'super_admin' },
      'SUPERADMIN_SUBSCRIPTION_UPDATED',
      'gym_saas_subscriptions',
      sub.id,
      gymId,
      { status, newPeriodEnd, graceDays }
    );
    res.json({ ok: true, message: 'Tenant subscription updated.' });
  });

  app.get('/api/v1/superadmin/platform-settings', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const platRaw = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as Record<string, unknown>;
    const faqs = db.prepare('SELECT * FROM platform_faqs ORDER BY sort_order ASC, id ASC').all();
    res.json({ settings: sanitizePlatformSettings(platRaw), faqs });
  });

  app.put('/api/v1/superadmin/platform-settings', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const b = req.body || {};
    const existing = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as Record<string, unknown>;

    const smtpPassEnc = b.smtp_password
      ? encryptSecret(String(b.smtp_password))
      : String(existing.smtp_password_encrypted || '');
    const platSecretEnc = b.platform_gateway_secret
      ? encryptSecret(String(b.platform_gateway_secret))
      : String(existing.platform_gateway_secret_encrypted || '');
    const googleSecretEnc = b.google_client_secret
      ? encryptSecret(String(b.google_client_secret))
      : String(existing.google_client_secret_encrypted || '');

    db.prepare(`
      UPDATE platform_settings SET
        brand_name = ?, software_name = ?, base_url = ?,
        hero_badge = ?, hero_title = ?, hero_subtitle = ?, hero_cta_primary = ?, hero_cta_secondary = ?,
        intro_title = ?, intro_body = ?, announcement_banner = ?,
        support_email = ?, support_phone = ?, support_address = ?,
        seo_title = ?, seo_description = ?, maintenance_mode = ?,
        platform_gateway_provider = ?, platform_gateway_key = ?, platform_gateway_secret_encrypted = ?, platform_gateway_mode = ?,
        smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password_encrypted = ?,
        smtp_from_email = ?, smtp_from_name = ?, smtp_encryption = ?,
        whatsapp_enabled = ?, google_oauth_enabled = ?, google_client_id = ?, google_client_secret_encrypted = ?,
        default_grace_period_days = ?, email_template_welcome = ?, email_template_expiry = ?,
        legal_privacy_summary = ?, legal_terms_summary = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      String(b.brand_name || existing.brand_name),
      String(b.software_name || existing.software_name),
      String(b.base_url || existing.base_url),
      String(b.hero_badge || existing.hero_badge),
      String(b.hero_title || existing.hero_title),
      String(b.hero_subtitle || existing.hero_subtitle),
      String(b.hero_cta_primary || existing.hero_cta_primary),
      String(b.hero_cta_secondary || existing.hero_cta_secondary),
      String(b.intro_title || existing.intro_title),
      String(b.intro_body || existing.intro_body),
      b.announcement_banner ? String(b.announcement_banner) : null,
      String(b.support_email || existing.support_email),
      String(b.support_phone || existing.support_phone),
      String(b.support_address || existing.support_address),
      String(b.seo_title || existing.seo_title),
      String(b.seo_description || existing.seo_description),
      b.maintenance_mode ? 1 : 0,
      String(b.platform_gateway_provider || existing.platform_gateway_provider),
      String(b.platform_gateway_key || ''),
      platSecretEnc,
      b.platform_gateway_mode === 'live' ? 'live' : 'test',
      String(b.smtp_host || ''),
      Number(b.smtp_port || 587),
      String(b.smtp_user || ''),
      smtpPassEnc,
      String(b.smtp_from_email || ''),
      String(b.smtp_from_name || 'Hemnity Gym SaaS'),
      ['tls', 'ssl', 'none'].includes(b.smtp_encryption) ? b.smtp_encryption : 'tls',
      b.whatsapp_enabled ? 1 : 0,
      b.google_oauth_enabled ? 1 : 0,
      String(b.google_client_id || ''),
      googleSecretEnc,
      Math.max(0, Number(b.default_grace_period_days ?? 7)),
      String(b.email_template_welcome || existing.email_template_welcome),
      String(b.email_template_expiry || existing.email_template_expiry),
      String(b.legal_privacy_summary || existing.legal_privacy_summary),
      String(b.legal_terms_summary || existing.legal_terms_summary)
    );

    logTenantEvent(db, req, { id: admin.id, role: 'super_admin' }, 'PLATFORM_SETTINGS_UPDATED', 'platform_settings', 1);
    const updated = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as Record<string, unknown>;
    res.json({ ok: true, settings: sanitizePlatformSettings(updated) });
  });

  app.post('/api/v1/superadmin/faqs', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const question = String(req.body?.question || '').trim();
    const answer = String(req.body?.answer || '').trim();
    if (!question || !answer) {
      res.status(400).json({ error: 'Question and answer are required.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO platform_faqs (question, answer, sort_order, is_active) VALUES (?, ?, ?, ?)')
      .run(question, answer, Number(req.body?.sort_order ?? 10), req.body?.is_active === false ? 0 : 1);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.put('/api/v1/superadmin/faqs/:id', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;
    const id = Number(req.params.id);
    db.prepare('UPDATE platform_faqs SET question = ?, answer = ?, sort_order = ?, is_active = ? WHERE id = ?').run(
      String(req.body?.question || '').trim(),
      String(req.body?.answer || '').trim(),
      Number(req.body?.sort_order ?? 1),
      req.body?.is_active ? 1 : 0,
      id
    );
    res.json({ ok: true });
  });

  app.delete('/api/v1/superadmin/faqs/:id', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;
    db.prepare('DELETE FROM platform_faqs WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/v1/superadmin/support-tickets', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const tickets = db
      .prepare(`
        SELECT t.*, g.name AS gym_name
        FROM support_tickets t
        LEFT JOIN gyms g ON g.id = t.gym_id
        ORDER BY CASE t.status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END, t.id DESC
      `)
      .all();
    res.json({ tickets });
  });

  app.put('/api/v1/superadmin/support-tickets/:id', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const status = ['Open', 'In Progress', 'Resolved'].includes(req.body?.status) ? req.body.status : 'Resolved';
    db.prepare("UPDATE support_tickets SET status = ?, admin_reply = ?, updated_at = datetime('now') WHERE id = ?").run(
      status,
      req.body?.admin_reply ? String(req.body.admin_reply).trim() : null,
      Number(req.params.id)
    );
    res.json({ ok: true });
  });

  app.get('/api/v1/superadmin/audit-logs', (req: Request, res: Response) => {
    const admin = requireSuperAdmin(db, req, res, getSession(req));
    if (!admin) return;

    const logs = db
      .prepare(`
        SELECT l.*, u.full_name AS actor_name, g.name AS gym_name
        FROM audit_logs l
        LEFT JOIN users u ON u.id = l.actor_user_id
        LEFT JOIN gyms g ON g.id = l.gym_id
        ORDER BY l.id DESC
        LIMIT 120
      `)
      .all();
    res.json({ logs });
  });

  // --------------------------------------------------------------------------
  // 7. Protected API Documentation (/api/docs)
  // --------------------------------------------------------------------------
  app.get('/api/v1/docs/spec', (req: Request, res: Response) => {
    const user = resolveRequestUser(db, req, getSession(req));
    if (!user) {
      res.status(401).json({ error: 'Authentication required to access Hemnity API documentation.' });
      return;
    }
    if (!['super_admin', 'gym_owner'].includes(user.role)) {
      res.status(403).json({ error: 'Forbidden: API documentation is restricted to Super Admin and Gym Owners.' });
      return;
    }

    res.json({
      openapi: '3.1.0',
      info: {
        title: 'Hemnity Gym Management Software — Multi-Tenant SaaS API',
        version: '2.0.0',
        baseUrl: 'https://gym.hemnity.in/api/v1',
        authSchemes: ['HttpOnly Cookie Session + X-CSRF-Token', 'Bearer API Token (Android Owner & Member Apps)'],
      },
      endpoints: [
        { method: 'GET', path: '/api/v1/public/landing', auth: 'Public', summary: 'Fetch active SaaS pricing plans, FAQs, and CMS settings' },
        { method: 'POST', path: '/api/v1/public/register-gym', auth: 'Public (CSRF)', summary: 'Create new independent gym tenant, owner user, default plans, and trial subscription' },
        { method: 'POST', path: '/api/v1/auth/login', auth: 'Public (CSRF)', summary: 'Role-scoped login returning session cookie' },
        { method: 'POST', path: '/api/v1/auth/token', auth: 'Session (Any Role)', summary: 'Issue 90-day Bearer token for Android Owner or Member mobile clients' },
        { method: 'GET', path: '/api/dashboard', auth: 'Gym Owner (Bearer or Session)', summary: 'Tenant-scoped KPIs, 6-month revenue series, expiry alerts' },
        { method: 'GET/POST/PUT', path: '/api/members', auth: 'Gym Owner', summary: 'Tenant-isolated member CRUD with subscription quota enforcement' },
        { method: 'POST', path: '/api/v1/owner/attendance/qr-scan', auth: 'Gym Owner', summary: 'Verify non-sequential revocable QR token within tenant and record attendance' },
        { method: 'POST', path: '/api/v1/owner/attendance/keyboard', auth: 'Gym Owner', summary: 'Keyboard check-in by member code or phone within tenant' },
        { method: 'GET', path: '/api/v1/owner/id-cards', auth: 'Gym Owner', summary: 'Printable CR80/A4 member ID cards with active revocable QR credentials' },
        { method: 'POST', path: '/api/v1/owner/members/:id/qr-reissue', auth: 'Gym Owner', summary: 'Revoke old QR token and issue a fresh token' },
        { method: 'GET/PUT', path: '/api/v1/owner/gateway', auth: 'Gym Owner', summary: 'Manage per-gym AES-256 encrypted Razorpay/Cashfree/Stripe credentials' },
        { method: 'GET', path: '/api/v1/member/context', auth: 'Gym Member', summary: 'List all independent gym memberships owned by this member user' },
        { method: 'POST', path: '/api/v1/member/orders', auth: 'Gym Member', summary: 'Create member fee checkout order on gym gateway' },
        { method: 'POST', path: '/api/v1/webhooks/gateway/:provider', auth: 'HMAC-SHA256 Signature', summary: 'Verify gateway webhook signature and activate membership + issue receipt' },
        { method: 'GET/POST/PUT', path: '/api/v1/superadmin/*', auth: 'Super Admin Only', summary: 'Manage gyms directory, SaaS plans, billing invoices, CMS, SMTP, and audit logs' },
      ],
    });
  });
}

import type { DatabaseSync } from 'node:sqlite';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getGymSubscriptionInfo, syncExpiredMemberships, writeAuditLog } from '../db/gymDatabase.ts';
import type { UserRole } from '../utils/saasRules.ts';

export interface SessionData {
  userId: number | null;
  role: UserRole | null;
  activeGymId: number | null;
  activeMemberRecordId: number | null;
  csrfToken: string;
  loginAttempts: number[];
}

export interface AuthenticatedUser {
  id: number;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: number;
  is_initial_setup_complete: number;
  last_login_at: string | null;
}

export interface OwnerTenantContext {
  user: AuthenticatedUser;
  gymId: number;
  gymName: string;
  gymStatus: string;
  subscription: NonNullable<ReturnType<typeof getGymSubscriptionInfo>>;
}

export const CPANEL_WHITELIST = [
  '.htaccess',
  'README.md',
  'database.sql',
  'database_saas.sql',
  'database_migration.sql',
  'config.php',
  'manifest.webmanifest',
  'sw.js',
  'offline.html',
  'setup_admin.php',
  'index.php',
  'login.php',
  'logout.php',
  'change_password.php',
  'members.php',
  'member_add.php',
  'member_edit.php',
  'member_view.php',
  'membership_plans.php',
  'plan_add.php',
  'plan_edit.php',
  'payments.php',
  'payment_add.php',
  'receipt.php',
  'attendance.php',
  'id_cards.php',
  'reports.php',
  'settings.php',
  'owner_register.php',
  'owner_subscription.php',
  'member/login.php',
  'member/index.php',
  'superadmin/login.php',
  'superadmin/index.php',
  'api/v1/index.php',
  'api/docs/index.php',
  'includes/header.php',
  'includes/sidebar.php',
  'includes/footer.php',
  'assets/css/style.css',
  'assets/js/app.js',
  'uploads/.htaccess',
];

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return String(req.socket?.remoteAddress || '127.0.0.1').slice(0, 64);
}

export function saveBase64Image(
  dataUrl: string,
  subDir: 'members' | 'logos'
): { ok: true; path: string } | { ok: false; error: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    return { ok: false, error: 'Only JPG, PNG, and WEBP images are permitted.' };
  }
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    return { ok: false, error: 'Image file must be smaller than 2 MB.' };
  }
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extMap[mime] || 'jpg';
  const targetDir = path.resolve(process.cwd(), 'uploads', subDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const fileName = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(targetDir, fileName), buffer);
  return { ok: true, path: `/uploads/${subDir}/${fileName}` };
}

export function resolveRequestUser(
  db: DatabaseSync,
  req: Request,
  session: SessionData
): AuthenticatedUser | null {
  // Check Bearer token first (Android Owner / Member apps & API clients)
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7).trim();
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const tokenRow = db
        .prepare(`
          SELECT t.id AS token_id, t.user_id, t.gym_id, u.id, u.role, u.full_name, u.email, u.phone,
                 u.is_active, u.is_initial_setup_complete, u.last_login_at
          FROM api_tokens t
          JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = ?
            AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))
            AND u.is_active = 1
          LIMIT 1
        `)
        .get(tokenHash) as (AuthenticatedUser & { token_id: number; gym_id: number | null }) | undefined;

      if (tokenRow) {
        db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(tokenRow.token_id);
        return {
          id: tokenRow.id,
          role: tokenRow.role,
          full_name: tokenRow.full_name,
          email: tokenRow.email,
          phone: tokenRow.phone,
          is_active: tokenRow.is_active,
          is_initial_setup_complete: tokenRow.is_initial_setup_complete,
          last_login_at: tokenRow.last_login_at,
        };
      }
      return null;
    }
  }

  if (!session.userId) return null;
  const user = db
    .prepare(`
      SELECT id, role, full_name, email, phone, is_active, is_initial_setup_complete, last_login_at
      FROM users
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `)
    .get(session.userId) as AuthenticatedUser | undefined;

  if (!user) {
    session.userId = null;
    session.role = null;
    session.activeGymId = null;
    session.activeMemberRecordId = null;
    return null;
  }
  return user;
}

/**
 * Centralized multi-tenant authorization for Gym Owners.
 * Never trusts client-supplied gym_id; derives gym_id strictly from authenticated user's gym_owners link.
 */
export function requireOwnerTenant(
  db: DatabaseSync,
  req: Request,
  res: Response,
  session: SessionData,
  options?: { requireWriteAccess?: boolean; requireAddMemberQuota?: boolean }
): OwnerTenantContext | null {
  const user = resolveRequestUser(db, req, session);
  if (!user) {
    res.status(401).json({ error: 'Gym Owner authentication required.' });
    return null;
  }
  if (user.role !== 'gym_owner') {
    res.status(403).json({ error: 'Forbidden: Gym Owner role required for this workspace.' });
    return null;
  }

  // Strictly lookup gym owned by this authenticated user (never trust request gym_id)
  const ownedGyms = db
    .prepare(`
      SELECT g.id, g.name, g.status
      FROM gym_owners go
      JOIN gyms g ON g.id = go.gym_id
      WHERE go.user_id = ?
      ORDER BY go.is_primary DESC, g.id ASC
    `)
    .all(user.id) as Array<{ id: number; name: string; status: string }>;

  if (ownedGyms.length === 0) {
    res.status(403).json({ error: 'No gym workspace is associated with this owner account.' });
    return null;
  }

  // Only allow selecting among gyms actually owned by this user
  const matchedGym =
    (session.activeGymId && ownedGyms.find((g) => g.id === session.activeGymId)) || ownedGyms[0];

  session.activeGymId = matchedGym.id;
  syncExpiredMemberships(db);

  const sub = getGymSubscriptionInfo(db, matchedGym.id);
  if (!sub) {
    res.status(403).json({ error: 'Gym subscription configuration missing. Contact Hemnity Support.' });
    return null;
  }

  if (options?.requireWriteAccess && !sub.can_write_operations) {
    res.status(402).json({
      error: sub.restriction_reason || 'Subscription inactive or suspended. Please renew your Hemnity SaaS plan.',
      code: 'SUBSCRIPTION_RESTRICTED',
      subscription: sub,
    });
    return null;
  }

  if (options?.requireAddMemberQuota && !sub.can_add_more_members) {
    res.status(402).json({
      error: `Member limit reached (${sub.current_members}/${sub.max_members}). Upgrade your Hemnity SaaS plan to add more members.`,
      code: 'PLAN_LIMIT_REACHED',
      subscription: sub,
    });
    return null;
  }

  return {
    user,
    gymId: matchedGym.id,
    gymName: matchedGym.name,
    gymStatus: matchedGym.status,
    subscription: sub,
  };
}

export function requireSuperAdmin(
  db: DatabaseSync,
  req: Request,
  res: Response,
  session: SessionData
): AuthenticatedUser | null {
  const user = resolveRequestUser(db, req, session);
  if (!user) {
    res.status(401).json({ error: 'Super Admin authentication required.' });
    return null;
  }
  if (user.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: Hemnity Super Admin role required.' });
    return null;
  }
  return user;
}

export function requireMemberUser(
  db: DatabaseSync,
  req: Request,
  res: Response,
  session: SessionData
): AuthenticatedUser | null {
  const user = resolveRequestUser(db, req, session);
  if (!user) {
    res.status(401).json({ error: 'Gym Member sign-in required.' });
    return null;
  }
  if (user.role !== 'gym_member') {
    res.status(403).json({ error: 'Forbidden: Gym Member portal requires a member account.' });
    return null;
  }
  syncExpiredMemberships(db);
  return user;
}

export function logTenantEvent(
  db: DatabaseSync,
  req: Request,
  actor: { id: number | null; role: string },
  action: string,
  targetType: string,
  targetId?: string | number | null,
  gymId?: number | null,
  details?: Record<string, unknown>
): void {
  writeAuditLog(db, {
    actorUserId: actor.id,
    actorRole: actor.role,
    gymId: gymId ?? null,
    action,
    targetType,
    targetId,
    details,
    ipAddress: getClientIp(req),
  });
}

import crypto from 'node:crypto';
import { calculateDaysUntilExpiry, isValidIsoDate } from './gymRules.ts';

export type UserRole = 'super_admin' | 'gym_owner' | 'gym_member';
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'Trial' | 'Active' | 'Grace' | 'Expired' | 'Suspended';
export type GatewayProvider = 'manual' | 'razorpay' | 'cashfree' | 'stripe';

export interface SaasFeaturesMap {
  qr_attendance: boolean;
  payment_gateway: boolean;
  reports_export: boolean;
  id_cards: boolean;
  member_portal: boolean;
}

export const DEFAULT_SAAS_FEATURES: SaasFeaturesMap = {
  qr_attendance: true,
  payment_gateway: true,
  reports_export: true,
  id_cards: true,
  member_portal: true,
};

export function parseFeaturesJson(raw: string | null | undefined): SaasFeaturesMap {
  if (!raw) return { ...DEFAULT_SAAS_FEATURES };
  try {
    const parsed = JSON.parse(raw) as Partial<SaasFeaturesMap>;
    return {
      qr_attendance: Boolean(parsed.qr_attendance ?? true),
      payment_gateway: Boolean(parsed.payment_gateway ?? true),
      reports_export: Boolean(parsed.reports_export ?? true),
      id_cards: Boolean(parsed.id_cards ?? true),
      member_portal: Boolean(parsed.member_portal ?? true),
    };
  } catch {
    return { ...DEFAULT_SAAS_FEATURES };
  }
}

export function getEncryptionKey(secretSeed?: string): Buffer {
  const source =
    secretSeed ||
    process.env.HEMNITY_APP_KEY ||
    process.env.APP_SECRET ||
    'hemnity-gym-saas-local-key-material-v1';
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptSecret(plaintext: string, secretSeed?: string): string {
  const clean = plaintext.trim();
  if (!clean) return '';
  const key = getEncryptionKey(secretSeed);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `encv1$${iv.toString('hex')}$${tag.toString('hex')}$${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string | null | undefined, secretSeed?: string): string {
  if (!ciphertext || !ciphertext.startsWith('encv1$')) return '';
  const parts = ciphertext.split('$');
  if (parts.length !== 4) return '';
  try {
    const [, ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey(secretSeed);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(plaintextOrEncrypted: string | null | undefined): string {
  if (!plaintextOrEncrypted) return '';
  const plain = plaintextOrEncrypted.startsWith('encv1$')
    ? decryptSecret(plaintextOrEncrypted)
    : plaintextOrEncrypted;
  if (!plain) return 'Configured';
  if (plain.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(10, plain.length - 4))}${plain.slice(-4)}`;
}

export function generateQrCredentialToken(): string {
  return `HMN-QR-${crypto.randomBytes(18).toString('base64url')}`;
}

export function isValidQrCredentialToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return /^HMN-QR-[A-Za-z0-9_-]{16,64}$/.test(token.trim());
}

export function maskQrToken(token: string | null | undefined): string {
  if (!token || token.length < 12) return '—';
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

export function computeHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyHmacSignature(
  payload: string,
  providedSignature: string,
  secret: string
): boolean {
  if (!providedSignature || !secret) return false;
  const expected = computeHmacSignature(payload, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSignature.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function calculateSaasPlanAmount(
  paramsOrPlan:
    | {
        monthlyPrice: number;
        quarterlyPrice: number;
        yearlyPrice: number;
        billingCycle: BillingCycle;
        discountPercent?: number;
      }
    | {
        monthly_price: number;
        quarterly_price: number;
        yearly_price: number;
        discount_percent?: number;
      },
  cycleArg?: BillingCycle
): number {
  let monthlyPrice: number;
  let quarterlyPrice: number;
  let yearlyPrice: number;
  let billingCycle: BillingCycle;
  let discountPercent: number;

  if ('monthlyPrice' in paramsOrPlan) {
    monthlyPrice = paramsOrPlan.monthlyPrice;
    quarterlyPrice = paramsOrPlan.quarterlyPrice;
    yearlyPrice = paramsOrPlan.yearlyPrice;
    billingCycle = paramsOrPlan.billingCycle;
    discountPercent = Number(paramsOrPlan.discountPercent ?? 0);
  } else {
    monthlyPrice = paramsOrPlan.monthly_price;
    quarterlyPrice = paramsOrPlan.quarterly_price;
    yearlyPrice = paramsOrPlan.yearly_price;
    billingCycle = cycleArg ?? 'monthly';
    discountPercent = Number(paramsOrPlan.discount_percent ?? 0);
  }

  const base =
    billingCycle === 'yearly'
      ? yearlyPrice
      : billingCycle === 'quarterly'
        ? quarterlyPrice
        : monthlyPrice;
  const pct = Math.min(90, Math.max(0, discountPercent));
  const net = base * (1 - pct / 100);
  return Math.round(net * 100) / 100;
}

export function addSubscriptionDays(startDateStr: string, cycleOrDays: BillingCycle | number): string {
  const days =
    typeof cycleOrDays === 'number'
      ? Math.max(0, Math.trunc(cycleOrDays))
      : cycleOrDays === 'yearly'
        ? 365
        : cycleOrDays === 'quarterly'
          ? 90
          : 30;
  if (!isValidIsoDate(startDateStr)) return startDateStr;
  const [y, m, d] = startDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

export interface SubscriptionEvaluationInput {
  gymStatus: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  gracePeriodDays: number;
  maxMembers: number;
  maxBranches: number;
  currentMemberCount: number;
  enabledFeatures: SaasFeaturesMap;
  todayStr: string;
}

export interface SubscriptionEvaluationResult {
  effectiveStatus: SubscriptionStatus;
  canWriteOperations: boolean;
  canAddMoreMembers: boolean;
  inGracePeriod: boolean;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  restrictionReason: string | null;
  enabledFeatures: SaasFeaturesMap;
}

export function evaluateSubscriptionAccess(
  input: SubscriptionEvaluationInput
): SubscriptionEvaluationResult {
  if (input.gymStatus === 'Suspended' || input.subscriptionStatus === 'Suspended') {
    return {
      effectiveStatus: 'Suspended',
      canWriteOperations: false,
      canAddMoreMembers: false,
      inGracePeriod: false,
      daysRemaining: 0,
      graceDaysRemaining: 0,
      restrictionReason: 'Gym account is suspended by Hemnity Super Admin. Contact support or settle billing.',
      enabledFeatures: input.enabledFeatures,
    };
  }

  const anchorDate =
    input.subscriptionStatus === 'Trial' && input.trialEndsAt
      ? input.trialEndsAt
      : input.currentPeriodEnd;

  const daysRemaining = calculateDaysUntilExpiry(anchorDate, input.todayStr);

  if (daysRemaining === null || daysRemaining >= 0) {
    const canAddMore = input.maxMembers <= 0 || input.currentMemberCount < input.maxMembers;
    return {
      effectiveStatus: input.subscriptionStatus === 'Trial' ? 'Trial' : 'Active',
      canWriteOperations: true,
      canAddMoreMembers: canAddMore,
      inGracePeriod: false,
      daysRemaining,
      graceDaysRemaining: null,
      restrictionReason: canAddMore
        ? null
        : `Plan limit reached (${input.currentMemberCount}/${input.maxMembers} members). Upgrade your Hemnity SaaS plan to add more members.`,
      enabledFeatures: input.enabledFeatures,
    };
  }

  const overdueDays = Math.abs(daysRemaining);
  const graceWindow = Math.max(0, Number(input.gracePeriodDays || 0));

  if (overdueDays <= graceWindow) {
    const canAddMore = input.maxMembers <= 0 || input.currentMemberCount < input.maxMembers;
    return {
      effectiveStatus: 'Grace',
      canWriteOperations: true,
      canAddMoreMembers: canAddMore,
      inGracePeriod: true,
      daysRemaining,
      graceDaysRemaining: graceWindow - overdueDays,
      restrictionReason: `Subscription expired ${overdueDays} day(s) ago. Grace period ends in ${
        graceWindow - overdueDays
      } day(s). Renew now to avoid service restriction.`,
      enabledFeatures: input.enabledFeatures,
    };
  }

  return {
    effectiveStatus: 'Expired',
    canWriteOperations: false,
    canAddMoreMembers: false,
    inGracePeriod: false,
    daysRemaining,
    graceDaysRemaining: 0,
    restrictionReason:
      'Hemnity SaaS subscription and grace period have expired. Existing gym records are safely preserved; renew your subscription in Billing to unlock member writes and QR check-ins.',
    enabledFeatures: input.enabledFeatures,
  };
}

export function slugifyGymName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'gym';
}

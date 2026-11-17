export type StoredMemberStatus = 'Active' | 'Expired' | 'Inactive';
export type DisplayMemberStatus = 'Active' | 'ExpiringSoon' | 'Expired' | 'Inactive';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other';
export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';
export type MembershipActionType = 'Initial' | 'Renewal' | 'Extension' | 'Plan Change';

export function isValidIsoDate(dateStr: string | null | undefined): dateStr is string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidTimeHm(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  return /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.test(timeStr.trim());
}

export function normalizeTimeHms(timeStr: string): string | null {
  const trimmed = timeStr.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

export function calculateDaysUntilExpiry(
  expiryDateStr: string | null | undefined,
  todayStr: string
): number | null {
  if (!isValidIsoDate(expiryDateStr) || !isValidIsoDate(todayStr)) {
    return null;
  }
  const [ey, em, ed] = expiryDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const expUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((expUtc - todayUtc) / 86_400_000);
}

export function computeEffectiveMemberStatus(
  storedStatus: StoredMemberStatus,
  expiryDateStr: string | null | undefined,
  todayStr: string
): DisplayMemberStatus {
  if (storedStatus === 'Inactive') {
    return 'Inactive';
  }
  if (storedStatus === 'Expired') {
    return 'Expired';
  }
  const days = calculateDaysUntilExpiry(expiryDateStr, todayStr);
  if (days !== null && days < 0) {
    return 'Expired';
  }
  if (days !== null && days >= 0 && days <= 7) {
    return 'ExpiringSoon';
  }
  return 'Active';
}

export function calculatePlanExpiryDate(startDateStr: string, durationDays: number): string {
  if (!isValidIsoDate(startDateStr) || !Number.isFinite(durationDays) || durationDays < 1) {
    return startDateStr;
  }
  const [y, m, d] = startDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.floor(durationDays));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function calculatePaymentBalance(
  amount: number,
  planTotal: number,
  paymentStatus: PaymentStatus
): number {
  const safeAmount = Math.max(0, Math.round(amount * 100) / 100);
  const safeTotal = Math.max(0, Math.round(planTotal * 100) / 100);

  if (paymentStatus === 'Paid') {
    return 0;
  }
  if (paymentStatus === 'Pending') {
    return safeAmount;
  }
  return Math.max(0, Math.round((safeTotal - safeAmount) * 100) / 100);
}

export function formatMemberCode(year: number, sequence: number): string {
  return `GYM-${year}-${String(Math.max(1, Math.floor(sequence))).padStart(4, '0')}`;
}

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!isValidIsoDate(dateStr)) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

export function formatCurrency(amount: number | string, symbol = '₹'): string {
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const safe = Number.isFinite(num) ? num : 0;
  return `${symbol}${safe.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildWhatsAppReminderUrl(params: {
  phone: string;
  memberName: string;
  gymName: string;
  expiryDate: string | null | undefined;
  isExpired: boolean;
}): string | null {
  let digits = (params.phone || '').replace(/\D+/g, '');
  if (!digits) return null;

  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.slice(1)}`;
  }

  const formattedDate = formatDisplayDate(params.expiryDate);
  const message = params.isExpired
    ? `Hello ${params.memberName}, this is a friendly reminder from ${params.gymName}. Your gym membership expired on ${formattedDate}. Please visit the front desk at your convenience to renew your plan and continue your workouts!`
    : `Hello ${params.memberName}, greetings from ${params.gymName}! Your gym membership is scheduled to expire on ${formattedDate}. Let us know when you would like to renew so your training continues uninterrupted.`;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function escapeCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (str.length > 0 && ['=', '+', '-', '@'].includes(str[0]) && Number.isNaN(Number(str))) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvDocument(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export interface MemberInputValidationPayload {
  full_name?: string;
  phone?: string;
  email?: string;
  joining_date?: string;
  plan_id?: number | string | null;
  membership_start_date?: string | null;
  membership_expiry_date?: string | null;
  date_of_birth?: string | null;
}

export function validateMemberInput(input: MemberInputValidationPayload): string[] {
  const errors: string[] = [];
  const name = (input.full_name ?? '').trim();
  if (name.length < 2) {
    errors.push('Full name is required (minimum 2 characters).');
  }

  const phoneDigits = (input.phone ?? '').replace(/\D+/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.push('Please enter a valid phone number (7 to 15 digits).');
  }

  const email = (input.email ?? '').trim();
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address or leave it blank.');
  }

  if (!isValidIsoDate(input.joining_date)) {
    errors.push('Joining date is required and must be a valid YYYY-MM-DD date.');
  }

  if (input.date_of_birth && input.date_of_birth.trim() !== '' && !isValidIsoDate(input.date_of_birth)) {
    errors.push('Date of birth must be a valid YYYY-MM-DD date.');
  }

  const hasPlan =
    input.plan_id !== null &&
    input.plan_id !== undefined &&
    String(input.plan_id).trim() !== '' &&
    Number(input.plan_id) > 0;

  if (hasPlan) {
    if (!isValidIsoDate(input.membership_start_date)) {
      errors.push('Membership start date is required when assigning a plan.');
    }
    if (!isValidIsoDate(input.membership_expiry_date)) {
      errors.push('Membership expiry date is required when assigning a plan.');
    } else if (
      isValidIsoDate(input.membership_start_date) &&
      input.membership_expiry_date < input.membership_start_date
    ) {
      errors.push('Membership expiry date cannot be earlier than start date.');
    }
  }

  return errors;
}

export function validatePasswordStrength(password: string, confirmPassword: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.push('Password must include both letters and numbers.');
  }
  if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }
  return errors;
}

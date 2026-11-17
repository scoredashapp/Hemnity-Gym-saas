import type {
  DisplayMemberStatus,
  MembershipActionType,
  PaymentMethod,
  PaymentStatus,
  StoredMemberStatus,
} from '../utils/gymRules';
import type {
  BillingCycle,
  GatewayProvider,
  SaasFeaturesMap,
  SubscriptionStatus,
  UserRole,
} from '../utils/saasRules';

export interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  role?: UserRole;
  phone?: string | null;
  is_initial_setup_complete: number;
  last_login_at?: string | null;
}

export interface GymTenant {
  id: number;
  gym_code: string;
  slug: string;
  name: string;
  owner_user_id: number | null;
  owner_name?: string;
  owner_email?: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  logo_path: string | null;
  status: 'Active' | 'Trial' | 'Suspended' | 'Pending';
  operating_hours: string | null;
  branch_count: number;
  member_count?: number;
  active_member_count?: number;
  total_revenue?: number;
  today_attendance?: number;
  plan_name?: string | null;
  subscription_status?: SubscriptionStatus;
  billing_cycle?: BillingCycle;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  grace_period_days?: number;
  created_at?: string;
}

export interface GymSettings {
  id: number;
  gym_id?: number;
  gym_name: string;
  logo_path: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  currency_code: string;
  currency_symbol: string;
  receipt_footer: string;
  operating_hours?: string | null;
  qr_attendance_enabled?: number;
  require_photo_verify?: number;
  duplicate_checkin_rule?: 'daily' | 'cooldown_hours';
  checkin_cooldown_hours?: number;
  id_card_accent_color?: string;
  id_card_show_expiry?: number;
  id_card_template?: string;
  notification_whatsapp_enabled?: number;
  notification_email_enabled?: number;
  staff_permissions_json?: string | null;
}

export interface MemberRow {
  id: number;
  gym_id?: number;
  user_id?: number | null;
  member_code: string;
  full_name: string;
  photo_path: string | null;
  phone: string;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact: string | null;
  joining_date: string;
  plan_id: number | null;
  plan_name?: string | null;
  current_plan_price?: number | null;
  duration_days?: number | null;
  membership_start_date: string | null;
  membership_expiry_date: string | null;
  status: StoredMemberStatus;
  display_status: DisplayMemberStatus;
  days_until_expiry: number | null;
  notes: string | null;
  qr_token?: string | null;
  qr_status?: 'Active' | 'Revoked' | null;
  has_portal_login?: boolean;
  gym_name?: string;
}

export interface MembershipPlan {
  id: number;
  gym_id?: number;
  plan_name: string;
  duration_days: number;
  price: number;
  description: string | null;
  is_active: number;
  active_member_count?: number;
  total_member_count?: number;
}

export interface MembershipHistoryRow {
  id: number;
  gym_id?: number;
  member_id: number;
  plan_id: number;
  plan_name_snapshot: string;
  plan_price_snapshot: number;
  start_date: string;
  expiry_date: string;
  action_type: MembershipActionType;
  status: string;
  notes: string | null;
  admin_name?: string | null;
  full_name?: string;
  member_code?: string;
  gym_name?: string;
  created_at: string;
}

export interface PaymentRow {
  id: number;
  gym_id?: number;
  receipt_number: string;
  member_id: number;
  membership_id: number | null;
  plan_id: number | null;
  plan_name?: string | null;
  full_name: string;
  member_code: string;
  phone?: string;
  email?: string | null;
  member_address?: string | null;
  membership_start_date?: string | null;
  membership_expiry_date?: string | null;
  amount: number;
  plan_total_amount: number;
  balance_due: number;
  refund_amount?: number;
  payment_date: string;
  payment_method: PaymentMethod;
  transaction_ref: string | null;
  payment_status: PaymentStatus | 'Refunded';
  payment_source?: 'manual' | 'online_gateway';
  notes: string | null;
  received_by_name?: string | null;
  gym_name?: string;
}

export interface AttendanceRow {
  id: number;
  gym_id?: number;
  member_id: number;
  full_name?: string;
  member_code?: string;
  phone?: string;
  photo_path?: string | null;
  member_status?: StoredMemberStatus;
  attendance_date: string;
  check_in_time: string;
  check_out_time: string | null;
  check_in_method?: 'Manual' | 'QR' | 'Keyboard';
  remarks: string | null;
}

export interface QrCredentialRow {
  id: number;
  gym_id: number;
  member_id: number;
  credential_token: string;
  status: 'Active' | 'Revoked';
  issued_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  full_name?: string;
  member_code?: string;
  photo_path?: string | null;
}

export interface GymPaymentGatewayPublic {
  id: number;
  gym_id: number;
  provider: GatewayProvider;
  merchant_key_id: string;
  has_secret: boolean;
  secret_masked: string;
  has_webhook_secret: boolean;
  webhook_secret_masked: string;
  mode: 'test' | 'live';
  is_enabled: number;
  auto_activate_membership: number;
  updated_at?: string;
}

export interface SaasPlan {
  id: number;
  slug: string;
  plan_name: string;
  tagline: string | null;
  monthly_price: number;
  quarterly_price: number;
  yearly_price: number;
  trial_days: number;
  max_members: number;
  max_branches: number;
  discount_percent: number;
  enabled_features: SaasFeaturesMap;
  description: string | null;
  is_featured: number;
  is_active: number;
  sort_order: number;
  active_gyms_count?: number;
}

export interface GymSubscriptionInfo {
  id: number;
  gym_id: number;
  saas_plan_id: number;
  plan_name: string;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  grace_period_days: number;
  max_members: number;
  max_branches: number;
  current_members: number;
  can_write_operations: boolean;
  can_add_more_members: boolean;
  in_grace_period: boolean;
  days_remaining: number | null;
  grace_days_remaining: number | null;
  restriction_reason: string | null;
  enabled_features: SaasFeaturesMap;
}

export interface SaasSubscriptionPayment {
  id: number;
  invoice_number: string;
  gym_id: number;
  gym_name?: string;
  gym_code?: string;
  subscription_id: number | null;
  saas_plan_id: number | null;
  plan_name?: string | null;
  billing_cycle: BillingCycle;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_ref: string | null;
  status: 'Paid' | 'Pending' | 'Failed' | 'Refunded';
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PlatformSettings {
  id: number;
  brand_name: string;
  software_name: string;
  base_url: string;
  hero_badge: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  intro_title: string;
  intro_body: string;
  announcement_banner: string | null;
  support_email: string;
  support_phone: string;
  support_address: string;
  seo_title: string;
  seo_description: string;
  maintenance_mode: number;
  platform_gateway_provider: string;
  platform_gateway_key: string;
  has_platform_gateway_secret: boolean;
  platform_gateway_mode: 'test' | 'live';
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_encryption: 'tls' | 'ssl' | 'none';
  has_smtp_password: boolean;
  whatsapp_enabled: number;
  google_oauth_enabled: number;
  google_client_id: string;
  has_google_client_secret: boolean;
  default_grace_period_days: number;
  email_template_welcome: string;
  email_template_expiry: string;
  legal_privacy_summary: string;
  legal_terms_summary: string;
}

export interface PlatformFaq {
  id: number;
  question: string;
  answer: string;
  sort_order: number;
  is_active: number;
}

export interface SupportTicketRow {
  id: number;
  gym_id: number;
  gym_name?: string;
  user_id: number | null;
  sender_name: string;
  sender_email: string;
  subject: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  admin_reply: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_user_id: number | null;
  actor_name?: string | null;
  actor_role: string;
  gym_id: number | null;
  gym_name?: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface DashboardData {
  today: string;
  settings: GymSettings;
  gym: GymTenant;
  subscription: GymSubscriptionInfo;
  kpis: {
    totalMembers: number;
    activeMembers: number;
    expiredMembers: number;
    expiringSoon: number;
    todayAttendance: number;
    monthlyRevenue: number;
    pendingAmount: number;
    pendingCount: number;
  };
  monthlySeries: Array<{ ym: string; label: string; total: number }>;
  expiryAlerts: MemberRow[];
  recentMembers: MemberRow[];
  recentPayments: PaymentRow[];
}

export interface MemberPortalContext {
  user: AdminUser;
  gyms: Array<{
    member_id: number;
    gym_id: number;
    gym_name: string;
    gym_logo: string | null;
    gym_phone: string | null;
    gym_address: string | null;
    currency_symbol: string;
    member_code: string;
    full_name: string;
    photo_path: string | null;
    plan_name: string | null;
    joining_date: string;
    membership_start_date: string | null;
    membership_expiry_date: string | null;
    status: StoredMemberStatus;
    display_status: DisplayMemberStatus;
    days_until_expiry: number | null;
    pending_fees: number;
    qr_token: string | null;
    qr_status: 'Active' | 'Revoked' | null;
    online_payment_enabled: boolean;
    gateway_provider: GatewayProvider;
  }>;
  activeMemberRecordId: number;
}

export type PortalSection = 'landing' | 'owner' | 'member' | 'superadmin' | 'api_docs';

export type ActiveScreen =
  | { view: 'dashboard' }
  | { view: 'members'; initialStatus?: string }
  | { view: 'member_add' }
  | { view: 'member_edit'; memberId: number }
  | { view: 'member_view'; memberId: number; focusRenew?: boolean }
  | { view: 'plans' }
  | { view: 'payments' }
  | { view: 'payment_add'; preselectedMemberId?: number }
  | { view: 'receipt'; paymentId: number }
  | { view: 'attendance'; preselectedMemberId?: number; searchQuery?: string }
  | { view: 'id_cards'; preselectedMemberId?: number }
  | { view: 'reports'; initialTab?: string }
  | { view: 'settings' }
  | { view: 'subscription' }
  | { view: 'change_password' }
  | { view: 'cpanel' };

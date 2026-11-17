import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  CreditCard,
  IdCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Printer,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type {
  AdminUser,
  AttendanceRow,
  GymSettings,
  MemberPortalContext,
  MemberRow,
  MembershipHistoryRow,
  MembershipPlan,
  PaymentRow,
} from '../types/gym';
import { StatusIndicator } from './StatusIndicator';
import { QrCodeImg } from './QrCodeImg';
import { PWAInstallButton } from './PwaHelpers';

type MemberTab = 'dashboard' | 'gyms' | 'memberships' | 'attendance' | 'payments' | 'id_card';

interface MemberPortalViewProps {
  user: AdminUser;
  onLogout: () => void;
  onNavigatePath: (path: string) => void;
}

export function MemberPortalView({ user, onLogout, onNavigatePath }: MemberPortalViewProps) {
  const [tab, setTab] = useState<MemberTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [context, setContext] = useState<MemberPortalContext | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number>(0);

  const [member, setMember] = useState<MemberRow | null>(null);
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [history, setHistory] = useState<MembershipHistoryRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [qrToken, setQrToken] = useState<string>('');
  const [gateway, setGateway] = useState<{ provider: string; merchant_key_id: string; mode: string; is_enabled: number } | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{
    order_ref: string;
    provider: string;
    mode: string;
    amount: number;
    currency: string;
    plan_name: string;
  } | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [processingOrder, setProcessingOrder] = useState(false);

  const loadContext = useCallback(async (preferredMemberId?: number) => {
    const q = preferredMemberId ? `?member_id=${preferredMemberId}` : '';
    const ctx = await apiRequest<MemberPortalContext>(`/api/v1/member/context${q}`);
    setContext(ctx);
    setSelectedMemberId(ctx.activeMemberRecordId);
    return ctx.activeMemberRecordId;
  }, []);

  const loadDashboard = useCallback(async (memberId: number) => {
    if (!memberId) return;
    const res = await apiRequest<{
      member: MemberRow;
      settings: GymSettings;
      plans: MembershipPlan[];
      membershipHistory: MembershipHistoryRow[];
      payments: PaymentRow[];
      attendance: AttendanceRow[];
      qr: { credential_token: string; status: string } | null;
      gateway: { provider: string; merchant_key_id: string; mode: string; is_enabled: number } | null;
    }>(`/api/v1/member/dashboard?member_id=${memberId}`);

    setMember(res.member);
    setSettings(res.settings);
    setPlans(res.plans);
    setHistory(res.membershipHistory);
    setPayments(res.payments);
    setAttendance(res.attendance);
    setQrToken(res.qr?.credential_token || '');
    setGateway(res.gateway);
  }, []);

  useEffect(() => {
    loadContext().then((id) => {
      if (id) void loadDashboard(id);
    });
  }, [loadContext, loadDashboard]);

  async function switchGym(memberId: number) {
    setPendingOrder(null);
    setBanner(null);
    await loadContext(memberId);
    await loadDashboard(memberId);
  }

  async function startOnlineRenewal(planId: number) {
    if (!selectedMemberId) return;
    setProcessingOrder(true);
    setBanner(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        order: NonNullable<typeof pendingOrder>;
      }>('/api/v1/member/orders', {
        method: 'POST',
        body: JSON.stringify({ member_id: selectedMemberId, plan_id: planId }),
      });
      setPendingOrder(res.order);
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Unable to start renewal order.' });
    } finally {
      setProcessingOrder(false);
    }
  }

  async function verifySignedTestWebhook() {
    if (!pendingOrder) return;
    setProcessingOrder(true);
    try {
      const res = await apiRequest<{ ok: boolean; receiptNumber: string }>(
        `/api/v1/member/orders/${pendingOrder.order_ref}/simulate-signed-webhook`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      setBanner({
        type: 'success',
        text: `Payment verified via HMAC-SHA256 webhook! Receipt ${res.receiptNumber} issued and membership extended.`,
      });
      setPendingOrder(null);
      await loadContext(selectedMemberId);
      await loadDashboard(selectedMemberId);
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Webhook verification failed.' });
    } finally {
      setProcessingOrder(false);
    }
  }

  const activeGym = context?.gyms.find((g) => g.member_id === selectedMemberId) || context?.gyms[0];
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthlyVisits = attendance.filter((a) => a.attendance_date.startsWith(monthPrefix)).length;

  // Build simple current-month attendance calendar days
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const checkedInDays = new Set(
    attendance
      .filter((a) => a.attendance_date.startsWith(monthPrefix))
      .map((a) => Number(a.attendance_date.slice(8, 10)))
  );

  const navItems: Array<{ key: MemberTab; label: string; icon: typeof LayoutDashboard }> = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'gyms', label: 'My Gyms', icon: Building2 },
    { key: 'memberships', label: 'My Memberships', icon: ShieldCheck },
    { key: 'attendance', label: 'My Attendance', icon: CalendarCheck },
    { key: 'payments', label: 'Payments & Renewals', icon: CreditCard },
    { key: 'id_card', label: 'Digital QR ID Card', icon: IdCard },
  ];

  return (
    <div className="min-h-screen flex bg-[#f8f9fb] text-neutral-900">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/55 lg:hidden no-print" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0c0e12] text-neutral-200 flex flex-col transition-transform duration-150 lg:translate-x-0 no-print ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
              H
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm text-white truncate">Member Portal</div>
              <div className="text-[11px] text-neutral-400 truncate">{activeGym?.gym_name || 'Hemnity Gym'}</div>
            </div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-neutral-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active ? 'bg-orange-600 text-white font-semibold' : 'text-neutral-400 hover:bg-[#181c24] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => onNavigatePath('/')}
            className="w-full py-2 px-3 rounded-lg bg-[#181c24] hover:bg-[#222834] text-neutral-300 text-xs font-medium"
          >
            Hemnity Home
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 px-3 rounded-lg border border-white/15 hover:bg-white/5 text-neutral-300 text-xs font-medium flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-neutral-200 px-4 sm:px-7 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg border border-neutral-200 text-neutral-700"
            >
              <Menu className="w-5 h-5" />
            </button>

            {context && context.gyms.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-500 hidden sm:inline">Active Gym:</span>
                <select
                  aria-label="Switch Gym Workspace"
                  value={selectedMemberId}
                  onChange={(e) => void switchGym(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-900"
                >
                  {context.gyms.map((g) => (
                    <option key={g.member_id} value={g.member_id}>
                      {g.gym_name} ({g.member_code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton compact />
            <span className="text-xs font-semibold text-neutral-800 hidden sm:inline">{user.full_name}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-7 max-w-[1200px] w-full mx-auto space-y-6">
          {banner && (
            <div
              className={`px-4 py-3 rounded-xl border text-sm flex items-center justify-between no-print ${
                banner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <span>{banner.text}</span>
              <button type="button" onClick={() => setBanner(null)} className="text-xs font-semibold">
                Dismiss
              </button>
            </div>
          )}

          {tab === 'dashboard' && member && activeGym && (
            <div className="space-y-6">
              <div className="bg-[#0c0e12] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-orange-400 font-semibold">
                    {activeGym.gym_name}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold mt-1">Welcome back, {member.full_name}</h1>
                  <p className="text-xs text-neutral-400 font-mono mt-1">
                    Member ID: {member.member_code} · Plan: {activeGym.plan_name || 'Unassigned'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTab('id_card')}
                    className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Show QR Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('payments')}
                    className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-white text-xs font-semibold"
                  >
                    Renew Membership
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="text-xs font-semibold text-neutral-500">Membership Status</div>
                  <div className="mt-2">
                    <StatusIndicator status={member.display_status} />
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1.5">{activeGym.plan_name || 'No active plan'}</div>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="text-xs font-semibold text-neutral-500">Expiry Date</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-neutral-900 mt-1">
                    {member.membership_expiry_date || '—'}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    {member.days_until_expiry !== null
                      ? member.days_until_expiry >= 0
                        ? `${member.days_until_expiry} days left`
                        : `${Math.abs(member.days_until_expiry)} days overdue`
                      : 'No expiry date'}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="text-xs font-semibold text-neutral-500">This Month Visits</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 mt-1">{monthlyVisits}</div>
                  <div className="text-[11px] text-neutral-500 mt-1">{attendance.length} recent check-ins</div>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="text-xs font-semibold text-neutral-500">Pending Dues</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 mt-1">
                    {activeGym.currency_symbol}
                    {activeGym.pending_fees.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">Gym-specific balance</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'gyms' && context && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Your Registered Gym Clubs</h2>
                <p className="text-xs text-neutral-500">
                  Each gym maintains isolated plans, payments, attendance logs, and QR passes. Select any gym to view its records.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {context.gyms.map((g) => {
                  const isSelected = g.member_id === selectedMemberId;
                  return (
                    <div
                      key={g.member_id}
                      className={`bg-white rounded-xl border p-5 space-y-3 ${
                        isSelected ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-neutral-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-bold text-neutral-900">{g.gym_name}</div>
                          <div className="text-xs font-mono text-neutral-500">{g.member_code}</div>
                        </div>
                        <StatusIndicator status={g.display_status} />
                      </div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>Plan: <strong>{g.plan_name || '—'}</strong> · Expires: <strong className="font-mono">{g.membership_expiry_date || '—'}</strong></div>
                        <div>Address: {g.gym_address || '—'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void switchGym(g.member_id)}
                        className={`w-full py-2 rounded-lg text-xs font-semibold ${
                          isSelected
                            ? 'bg-orange-600 text-white'
                            : 'border border-neutral-200 text-neutral-800 hover:bg-neutral-50'
                        }`}
                      >
                        {isSelected ? 'Currently Active Gym Workspace' : `Switch to ${g.gym_name}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'memberships' && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
              <div className="px-5 py-4 border-b border-neutral-200">
                <h2 className="text-sm font-bold text-neutral-900">Membership Enrollment &amp; Renewal History ({activeGym?.gym_name})</h2>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Start Date</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Fee Snapshot</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-3 px-4 font-semibold text-neutral-900">{h.plan_name_snapshot}</td>
                      <td className="py-3 px-4">{h.action_type}</td>
                      <td className="py-3 px-4 font-mono">{h.start_date}</td>
                      <td className="py-3 px-4 font-mono">{h.expiry_date}</td>
                      <td className="py-3 px-4 font-mono">₹{Number(h.plan_price_snapshot).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={h.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
                <h2 className="text-sm font-bold text-neutral-900">Monthly Check-In Calendar ({monthPrefix})</h2>
                <div className="grid grid-cols-7 gap-2 text-center text-xs">
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const visited = checkedInDays.has(day);
                    return (
                      <div
                        key={day}
                        className={`py-2 rounded-lg font-mono font-semibold border ${
                          visited
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-neutral-50 text-neutral-500 border-neutral-200'
                        }`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Check-In</th>
                      <th className="py-3 px-4">Check-Out</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {attendance.map((a) => (
                      <tr key={a.id}>
                        <td className="py-3 px-4 font-mono font-semibold">{a.attendance_date}</td>
                        <td className="py-3 px-4 font-mono">{a.check_in_time.slice(0, 5)}</td>
                        <td className="py-3 px-4 font-mono">{a.check_out_time ? a.check_out_time.slice(0, 5) : '—'}</td>
                        <td className="py-3 px-4">{a.check_in_method || 'Manual'}</td>
                        <td className="py-3 px-4 text-neutral-500">{a.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'payments' && (
            <div className="space-y-6">
              {/* Online Renewal Checkout */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900">
                      Renew Membership at {activeGym?.gym_name}
                    </h2>
                    <p className="text-xs text-neutral-500">
                      {gateway?.is_enabled
                        ? `Direct gym gateway enabled (${gateway.provider.toUpperCase()} · ${gateway.mode} mode). Membership activates only after signed webhook verification.`
                        : 'Online gateway is disabled for this gym. Visit the front desk to pay in person.'}
                    </p>
                  </div>
                </div>

                {gateway?.is_enabled ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {plans.map((p) => (
                      <div key={p.id} className="border border-neutral-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-neutral-900">{p.plan_name}</div>
                          <div className="text-lg font-bold font-mono tabular-nums mt-1">
                            ₹{Number(p.price).toLocaleString('en-IN')}
                          </div>
                          <div className="text-[11px] text-neutral-500">{p.duration_days} days</div>
                        </div>
                        <button
                          type="button"
                          disabled={processingOrder}
                          onClick={() => void startOnlineRenewal(p.id)}
                          className="w-full py-2 rounded-lg bg-[#0c0e12] hover:bg-neutral-800 text-white text-xs font-semibold disabled:opacity-60"
                        >
                          Select &amp; Checkout
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pendingOrder && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs">
                    <div className="font-bold text-amber-900">
                      Checkout Order Created: <span className="font-mono">{pendingOrder.order_ref}</span> —{' '}
                      {pendingOrder.plan_name} (₹{pendingOrder.amount.toLocaleString('en-IN')})
                    </div>
                    <p className="text-amber-800">
                      Order status is <strong>Pending</strong> until {pendingOrder.provider.toUpperCase()} sends a valid
                      HMAC-SHA256 signed webhook. Because this gym is in <strong>{pendingOrder.mode}</strong> mode, you
                      can dispatch a real HMAC-signed test webhook below to verify end-to-end activation:
                    </p>
                    <button
                      type="button"
                      disabled={processingOrder}
                      onClick={() => void verifySignedTestWebhook()}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      Verify Signed Test Webhook &amp; Activate
                    </button>
                  </div>
                )}
              </div>

              {/* Payment History */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
                <div className="px-5 py-4 border-b border-neutral-200">
                  <h2 className="text-sm font-bold text-neutral-900">Payment History &amp; Receipts</h2>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
                      <th className="py-3 px-4">Receipt #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Plan</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {payments.map((py) => (
                      <tr key={py.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-neutral-900">{py.receipt_number}</td>
                        <td className="py-3 px-4 font-mono">{py.payment_date}</td>
                        <td className="py-3 px-4">{py.plan_name || '—'}</td>
                        <td className="py-3 px-4">{py.payment_method}</td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold">
                          ₹{Number(py.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <StatusIndicator status={py.payment_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'id_card' && member && activeGym && (
            <div className="space-y-4">
              <div className="flex items-center justify-between no-print">
                <div>
                  <h2 className="text-base font-bold text-neutral-900">Digital Member QR Pass</h2>
                  <p className="text-xs text-neutral-500">
                    Present this QR pass at {activeGym.gym_name} front desk for instant attendance check-in.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-lg bg-[#0c0e12] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Pass</span>
                </button>
              </div>

              <div className="max-w-sm mx-auto bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden print-only-clean">
                <div
                  className="p-5 text-white flex items-center justify-between"
                  style={{ backgroundColor: settings?.id_card_accent_color || '#0c0e12' }}
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-wider opacity-80">Official Member Pass</div>
                    <div className="text-base font-bold">{activeGym.gym_name}</div>
                  </div>
                  <StatusIndicator status={member.display_status} />
                </div>
                <div className="p-6 flex flex-col items-center text-center space-y-4">
                  <div className="p-3 bg-white rounded-xl border border-neutral-200">
                    <QrCodeImg value={qrToken} size={180} alt={`${member.full_name} QR Pass`} />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-neutral-900">{member.full_name}</div>
                    <div className="text-xs font-mono text-neutral-500 mt-0.5">{member.member_code}</div>
                  </div>
                  <div className="w-full pt-3 border-t border-neutral-100 grid grid-cols-2 gap-3 text-xs text-left">
                    <div>
                      <div className="text-neutral-400">Plan</div>
                      <div className="font-semibold text-neutral-900">{activeGym.plan_name || '—'}</div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Valid Until</div>
                      <div className="font-semibold font-mono text-neutral-900">
                        {member.membership_expiry_date || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

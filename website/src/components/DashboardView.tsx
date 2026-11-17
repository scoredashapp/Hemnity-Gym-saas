import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CreditCard,
  MessageCircle,
  QrCode,
  UserPlus,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import {
  buildWhatsAppReminderUrl,
  formatCurrency,
  formatDisplayDate,
} from '../utils/gymRules';
import type { ActiveScreen, DashboardData } from '../types/gym';
import { MemberStatusLabel } from './StatusIndicator';

interface DashboardViewProps {
  onNavigate: (screen: ActiveScreen) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState<'bars' | 'table'>('bars');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<DashboardData>('/api/dashboard')
      .then((res) => {
        if (active) {
          setData(res);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-white border border-neutral-200 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-white border border-neutral-200 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-white border border-red-200 p-6 text-sm text-red-700" role="alert">
        {error || 'Dashboard data unavailable.'}
      </div>
    );
  }

  const symbol = data.settings.currency_symbol || '₹';
  const maxMonthRev = Math.max(1000, ...data.monthlySeries.map((s) => s.total));

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Operations Overview</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Live database metrics for {formatDisplayDate(data.today)} · {data.settings.gym_name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate({ view: 'member_add' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Add Member</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'payment_add' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            <span>Record Payment</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'attendance' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <QrCode className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <span>QR Check-In</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'id_cards' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarCheck className="w-4 h-4" aria-hidden="true" />
            <span>ID Cards</span>
          </button>
        </div>
      </div>

      {data.subscription && (data.subscription.effective_status === 'Suspended' || data.subscription.in_grace_period || data.subscription.effective_status === 'Trial') && (
        <div
          className={`rounded-xl border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            data.subscription.effective_status === 'Suspended'
              ? 'bg-red-50 border-red-200 text-red-900'
              : data.subscription.in_grace_period
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-neutral-50 border-neutral-200 text-neutral-800'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-orange-600" aria-hidden="true" />
            <span>
              <strong>{data.subscription.plan_name}</strong> ({data.subscription.effective_status}) ·{' '}
              {data.subscription.current_members} / {data.subscription.max_members} members used.
              {data.subscription.restriction_reason ? ` ${data.subscription.restriction_reason}` : ` Period ends ${formatDisplayDate(data.subscription.current_period_end)}.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'subscription' })}
            className="px-3 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-neutral-900 whitespace-nowrap shrink-0"
          >
            Manage Plan &amp; Billing
          </button>
        </div>
      )}

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Total Members</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-neutral-900">
            {data.kpis.totalMembers}
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'members' })}
            className="mt-2 text-xs font-medium text-neutral-500 hover:text-neutral-900 whitespace-nowrap"
          >
            View directory →
          </button>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Active Members</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-600">
            {data.kpis.activeMembers}
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'members', initialStatus: 'Active' })}
            className="mt-2 text-xs font-medium text-neutral-500 hover:text-neutral-900 whitespace-nowrap"
          >
            Active roster →
          </button>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Expired Memberships</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-red-600">
            {data.kpis.expiredMembers}
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'members', initialStatus: 'Expired' })}
            className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 whitespace-nowrap"
          >
            Needs renewal →
          </button>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Expiring in Next 7 Days</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-600">
            {data.kpis.expiringSoon}
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'members', initialStatus: 'ExpiringSoon' })}
            className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap"
          >
            Upcoming renewals →
          </button>
        </div>
      </div>

      {/* Second KPI Row: Attendance, Monthly Revenue, Pending Payments */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Today's Attendance</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-neutral-900">
            {data.kpis.todayAttendance}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500">
            Check-ins recorded on {formatDisplayDate(data.today)}
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Payments Collected This Month</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-neutral-900">
            {formatCurrency(data.kpis.monthlyRevenue, symbol)}
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'payments' })}
            className="mt-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 whitespace-nowrap"
          >
            Open payment ledger →
          </button>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Pending Payments / Balances</div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              data.kpis.pendingAmount > 0 ? 'text-red-600' : 'text-neutral-900'
            }`}
          >
            {formatCurrency(data.kpis.pendingAmount, symbol)}
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'reports', initialTab: 'dues' })}
            className="mt-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 whitespace-nowrap"
          >
            {data.kpis.pendingCount} open balance record(s) →
          </button>
        </div>
      </div>

      {/* Monthly Revenue Chart + Membership Expiry Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 bg-white border border-neutral-200 rounded-xl flex flex-col">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-neutral-900">Monthly Revenue (6 Months)</h2>
            <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setChartMode('bars')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartMode === 'bars' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Chart
              </button>
              <button
                type="button"
                onClick={() => setChartMode('table')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartMode === 'table' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Table
              </button>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between gap-4">
            <div className="grid grid-cols-2 gap-3 pb-3.5 border-b border-neutral-100">
              <div>
                <div className="text-[11px] font-medium text-neutral-500">6-Month Collected</div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-neutral-900">
                  {formatCurrency(
                    data.monthlySeries.reduce((sum, item) => sum + item.total, 0),
                    symbol
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-neutral-500">Monthly Average</div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-neutral-700">
                  {formatCurrency(
                    data.monthlySeries.reduce((sum, item) => sum + item.total, 0) /
                      Math.max(1, data.monthlySeries.length),
                    symbol
                  )}
                </div>
              </div>
            </div>

            {chartMode === 'bars' ? (
              <div className="w-full flex-1 flex items-center" role="img" aria-label="6-month revenue bar chart">
                <svg viewBox="0 0 460 215" className="w-full h-auto overflow-visible">
                  {[0, 0.5, 1].map((ratio, idx) => {
                    const y = 178 - ratio * 140;
                    const gridVal = Math.round(maxMonthRev * ratio);
                    return (
                      <g key={idx}>
                        <line
                          x1="48"
                          y1={y}
                          x2="452"
                          y2={y}
                          stroke="#e5e7eb"
                          strokeDasharray={ratio === 0 ? undefined : '3 3'}
                          strokeWidth="1"
                        />
                        <text
                          x="40"
                          y={y + 4}
                          textAnchor="end"
                          className="fill-neutral-400 text-[10px] font-mono tabular-nums"
                        >
                          {symbol}
                          {gridVal >= 1000 ? `${(gridVal / 1000).toFixed(gridVal % 1000 === 0 ? 0 : 1)}k` : gridVal}
                        </text>
                      </g>
                    );
                  })}

                  {data.monthlySeries.map((item, index) => {
                    const slotWidth = (452 - 56) / Math.max(1, data.monthlySeries.length);
                    const centerX = 56 + slotWidth * index + slotWidth / 2;
                    const barWidth = 34;
                    const rawHeight = (item.total / maxMonthRev) * 140;
                    const barHeight = item.total > 0 ? Math.max(8, rawHeight) : 4;
                    const barY = 178 - barHeight;
                    const shortMonth = item.label.split(' ')[0];

                    return (
                      <g key={item.ym}>
                        <title>{`${item.label}: ${formatCurrency(item.total, symbol)}`}</title>
                        <rect
                          x={centerX - barWidth / 2}
                          y={barY}
                          width={barWidth}
                          height={barHeight}
                          rx="5"
                          fill={item.total > 0 ? '#ea580c' : '#e5e7eb'}
                        />
                        <text
                          x={centerX}
                          y={barY - 7}
                          textAnchor="middle"
                          className="fill-neutral-700 text-[10px] font-semibold font-mono tabular-nums"
                        >
                          {item.total > 0 ? `${symbol}${item.total.toLocaleString('en-IN')}` : '—'}
                        </text>
                        <text
                          x={centerX}
                          y="198"
                          textAnchor="middle"
                          className="fill-neutral-500 text-[11px] font-medium"
                        >
                          {shortMonth}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                      <th className="py-2">Month</th>
                      <th className="py-2 text-right">Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.monthlySeries.map((item) => (
                      <tr key={item.ym}>
                        <td className="py-2.5 text-neutral-800">{item.label}</td>
                        <td className="py-2.5 text-right font-mono tabular-nums font-medium">
                          {formatCurrency(item.total, symbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Expiry Alerts Panel */}
        <div className="xl:col-span-7 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-neutral-900">Membership Expiry Alerts</h2>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'members', initialStatus: 'Expired' })}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0"
            >
              View All Expired
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.expiryAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                      No expired memberships or renewals due within the next 7 days.
                    </td>
                  </tr>
                ) : (
                  data.expiryAlerts.map((alert) => {
                    const isExpired = alert.display_status === 'Expired';
                    const rowHighlight = isExpired ? 'bg-red-50/70' : 'bg-amber-50/70';
                    const waUrl = buildWhatsAppReminderUrl({
                      phone: alert.phone,
                      memberName: alert.full_name,
                      gymName: data.settings.gym_name,
                      expiryDate: alert.membership_expiry_date,
                      isExpired,
                    });

                    return (
                      <tr key={alert.id} className={rowHighlight}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onNavigate({ view: 'member_view', memberId: alert.id })}
                            className="font-semibold text-neutral-900 hover:text-orange-600 text-left"
                          >
                            {alert.full_name}
                          </button>
                          <div className="text-xs text-neutral-500 font-mono tabular-nums">
                            {alert.member_code} · {alert.phone}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                          {alert.plan_name || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-700 whitespace-nowrap">
                          {formatDisplayDate(alert.membership_expiry_date)}
                        </td>
                        <td className="px-4 py-3">
                          <MemberStatusLabel
                            status={alert.display_status}
                            daysLeft={alert.days_until_expiry}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                                title="Open WhatsApp with prefilled reminder message"
                              >
                                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Remind</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate({ view: 'member_view', memberId: alert.id, focusRenew: true })
                              }
                              className="px-2.5 py-1.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                            >
                              Renew
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Member Registrations & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900">Recent Member Registrations</h2>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'members' })}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0"
            >
              All Members
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.recentMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: 'member_view', memberId: m.id })}
                        className="font-semibold text-neutral-900 hover:text-orange-600 text-left"
                      >
                        {m.full_name}
                      </button>
                      <div className="text-xs text-neutral-500 font-mono tabular-nums">{m.member_code}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">{m.plan_name || '—'}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-600 whitespace-nowrap">
                      {formatDisplayDate(m.joining_date)}
                    </td>
                    <td className="px-4 py-3">
                      <MemberStatusLabel status={m.display_status} daysLeft={m.days_until_expiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900">Recent Payments</h2>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'payments' })}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0"
            >
              All Payments
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: 'receipt', paymentId: p.id })}
                        className="font-mono tabular-nums text-xs font-semibold text-neutral-900 hover:text-orange-600"
                      >
                        {p.receipt_number}
                      </button>
                      <div className="text-xs text-neutral-500 font-mono tabular-nums">
                        {formatDisplayDate(p.payment_date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: 'member_view', memberId: p.member_id })}
                        className="text-neutral-800 hover:text-orange-600 font-medium text-left"
                      >
                        {p.full_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{p.payment_method}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-neutral-900 whitespace-nowrap">
                      {formatCurrency(p.amount, symbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Printer, RotateCcw } from 'lucide-react';
import { apiRequest } from '../utils/api';
import {
  formatCurrency,
  formatDisplayDate,
  type PaymentMethod,
  type PaymentStatus,
} from '../utils/gymRules';
import type {
  ActiveScreen,
  GymSettings,
  MemberRow,
  MembershipPlan,
  PaymentRow,
} from '../types/gym';
import { ConfirmDialog } from './ConfirmDialog';
import { PaymentStatusLabel } from './StatusIndicator';

// ----------------------------------------------------------------------------
// 1. Payments Ledger View (payments.php)
// ----------------------------------------------------------------------------
export function PaymentsLedgerView({
  settings,
  onNavigate,
  onNotify,
}: {
  settings: GymSettings;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [dailyRevenue, setDailyRevenue] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [outstandingDues, setOutstandingDues] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);

  const loadPayments = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      q: search,
      method,
      status,
      from,
      to,
      page: String(page),
    });
    apiRequest<{
      dailyRevenue: number;
      monthlyRevenue: number;
      outstandingDues: number;
      filteredTotal: number;
      payments: PaymentRow[];
      totalPages: number;
      today: string;
    }>(`/api/payments?${qs.toString()}`)
      .then((res) => {
        setDailyRevenue(res.dailyRevenue);
        setMonthlyRevenue(res.monthlyRevenue);
        setOutstandingDues(res.outstandingDues);
        setFilteredTotal(res.filteredTotal);
        setPayments(res.payments);
        setTotalPages(res.totalPages);
        setToday(res.today);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load payment records.');
      })
      .finally(() => setLoading(false));
  }, [search, method, status, from, to, page, onNotify]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  async function handleConfirmRefund() {
    if (!refundTarget) return;
    setRefundBusy(true);
    try {
      await apiRequest(`/api/v1/owner/payments/${refundTarget.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          refund_amount: refundTarget.amount,
          reason: 'Refunded from owner payments ledger',
        }),
      });
      onNotify('success', `Payment ${refundTarget.receipt_number} marked as Refunded.`);
      setRefundTarget(null);
      loadPayments();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to refund payment.');
    } finally {
      setRefundBusy(false);
    }
  }

  const symbol = settings.currency_symbol || '₹';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Payments &amp; Receipts</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Explicit administrator payment ledger, outstanding balance tracking, and printable receipts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate({ view: 'payment_add' })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <CreditCard className="w-4 h-4" aria-hidden="true" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Revenue Summaries */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">
            Today's Collections ({formatDisplayDate(today)})
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-neutral-900">
            {formatCurrency(dailyRevenue, symbol)}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Monthly Revenue</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-neutral-900">
            {formatCurrency(monthlyRevenue, symbol)}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Filtered Collected Total</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-neutral-900">
            {formatCurrency(filteredTotal, symbol)}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Outstanding Balances / Dues</div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              outstandingDues > 0 ? 'text-red-600' : 'text-neutral-900'
            }`}
          >
            {formatCurrency(outstandingDues, symbol)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label htmlFor="py_q" className="block text-xs font-medium text-neutral-500 mb-1">
              Member, Receipt #, or Reference
            </label>
            <input
              id="py_q"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name, RCP-..., UPI ref..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-orange-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="py_method" className="block text-xs font-medium text-neutral-500 mb-1">
              Method
            </label>
            <select
              id="py_method"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="py_status" className="block text-xs font-medium text-neutral-500 mb-1">
              Status
            </label>
            <select
              id="py_status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Pending">Pending</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="py_from" className="block text-xs font-medium text-neutral-500 mb-1">
              From Date
            </label>
            <input
              id="py_from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="py_to" className="block text-xs font-medium text-neutral-500 mb-1">
              To Date
            </label>
            <input
              id="py_to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Method / Reference</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-neutral-500">
                    Loading payment records...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-neutral-500">
                    No payment records match your filter criteria.
                  </td>
                </tr>
              ) : (
                payments.map((py) => (
                  <tr key={py.id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3 font-mono tabular-nums text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: 'receipt', paymentId: py.id })}
                        className="text-neutral-900 hover:text-orange-600"
                      >
                        {py.receipt_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-600 whitespace-nowrap">
                      {formatDisplayDate(py.payment_date)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: 'member_view', memberId: py.member_id })}
                        className="font-semibold text-neutral-900 hover:text-orange-600 text-left"
                      >
                        {py.full_name}
                      </button>
                      <div className="text-xs font-mono tabular-nums text-neutral-500">{py.member_code}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">{py.plan_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-neutral-800 whitespace-nowrap">{py.payment_method}</div>
                      {py.transaction_ref && (
                        <div className="text-xs font-mono tabular-nums text-neutral-500">
                          {py.transaction_ref}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-neutral-900 whitespace-nowrap">
                      {formatCurrency(py.amount, symbol)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        py.balance_due > 0 ? 'text-red-600 font-semibold' : 'text-neutral-400'
                      }`}
                    >
                      {formatCurrency(py.balance_due, symbol)}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusLabel status={py.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onNavigate({ view: 'receipt', paymentId: py.id })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 whitespace-nowrap shrink-0"
                        >
                          <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Receipt</span>
                        </button>
                        {(py.payment_status === 'Paid' || py.payment_status === 'Partial') && py.amount > 0 && (
                          <button
                            type="button"
                            onClick={() => setRefundTarget(py)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700 text-xs font-medium text-neutral-700 whitespace-nowrap shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Refund</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600">
            <span>
              Page <strong className="font-mono tabular-nums">{page}</strong> of{' '}
              <strong className="font-mono tabular-nums">{totalPages}</strong>
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-neutral-300 bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-neutral-300 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(refundTarget)}
        title="Refund Member Payment"
        description={
          refundTarget
            ? `Mark receipt ${refundTarget.receipt_number} (${formatCurrency(refundTarget.amount, symbol)} for ${refundTarget.full_name}) as Refunded? This will update ledger totals.`
            : ''
        }
        confirmLabel={refundBusy ? 'Processing...' : 'Confirm Refund'}
        destructive={true}
        busy={refundBusy}
        onCancel={() => !refundBusy && setRefundTarget(null)}
        onConfirm={() => {
          void handleConfirmRefund();
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// 2. Record Payment Form View (payment_add.php)
// ----------------------------------------------------------------------------
export function PaymentAddView({
  preselectedMemberId,
  settings,
  onNavigate,
  onNotify,
}: {
  preselectedMemberId?: number;
  settings: GymSettings;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);

  const [memberId, setMemberId] = useState(preselectedMemberId ? String(preselectedMemberId) : '');
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [planTotal, setPlanTotal] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [extendMembership, setExtendMembership] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest<{ members: MemberRow[] }>('/api/members?perPage=100&sort=name_asc'),
      apiRequest<{ plans: MembershipPlan[] }>('/api/plans'),
    ])
      .then(([memRes, planRes]) => {
        setMembers(memRes.members);
        const active = planRes.plans.filter((p) => p.is_active === 1);
        setPlans(active);

        let defaultPlan = active[0];
        if (preselectedMemberId) {
          const foundMem = memRes.members.find((m) => m.id === preselectedMemberId);
          if (foundMem?.plan_id) {
            const matchPlan = active.find((p) => p.id === foundMem.plan_id);
            if (matchPlan) defaultPlan = matchPlan;
          }
        }
        if (defaultPlan) {
          setPlanId(String(defaultPlan.id));
          setAmount(String(defaultPlan.price));
          setPlanTotal(String(defaultPlan.price));
        }
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load payment options.');
      });
  }, [preselectedMemberId, onNotify]);

  function handleMemberChange(nextMemberId: string) {
    setMemberId(nextMemberId);
    const foundMem = members.find((m) => String(m.id) === nextMemberId);
    if (foundMem?.plan_id) {
      const matchPlan = plans.find((p) => p.id === foundMem.plan_id);
      if (matchPlan) {
        setPlanId(String(matchPlan.id));
        setAmount(String(matchPlan.price));
        setPlanTotal(String(matchPlan.price));
      }
    }
  }

  function handlePlanSelect(nextPlanId: string) {
    setPlanId(nextPlanId);
    const foundPlan = plans.find((p) => String(p.id) === nextPlanId);
    if (foundPlan) {
      setAmount(String(foundPlan.price));
      setPlanTotal(String(foundPlan.price));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        paymentId: number;
        receiptNumber: string;
      }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          member_id: Number(memberId),
          plan_id: planId ? Number(planId) : null,
          amount: Number(amount),
          plan_total_amount: Number(planTotal || amount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          transaction_ref: transactionRef,
          payment_status: paymentStatus,
          extend_membership: extendMembership,
          notes,
        }),
      });
      onNotify('success', `Payment ${res.receiptNumber} recorded.`);
      onNavigate({ view: 'receipt', paymentId: res.paymentId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save payment.');
    } finally {
      setSaving(false);
    }
  }

  const symbol = settings.currency_symbol || '₹';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Record Member Payment</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Log an explicit payment transaction and generate an official numbered receipt.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate({ view: 'payments' })}
          className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap shrink-0"
        >
          Back to Payments
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4"
        noValidate
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pay_member" className="block text-xs font-semibold text-neutral-700 mb-1">
              Select Member *
            </label>
            <select
              id="pay_member"
              required
              value={memberId}
              onChange={(e) => handleMemberChange(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
            >
              <option value="">-- Choose Member --</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.member_code} · {m.display_status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pay_plan" className="block text-xs font-semibold text-neutral-700 mb-1">
              Membership Plan
            </label>
            <select
              id="pay_plan"
              value={planId}
              onChange={(e) => handlePlanSelect(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
            >
              <option value="">-- Custom / Other Fee --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plan_name} — {formatCurrency(p.price, symbol)} ({p.duration_days}d)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pay_amount" className="block text-xs font-semibold text-neutral-700 mb-1">
              Amount Collected ({symbol}) *
            </label>
            <input
              id="pay_amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="pay_total" className="block text-xs font-semibold text-neutral-700 mb-1">
              Total Plan Fee ({symbol})
            </label>
            <input
              id="pay_total"
              type="number"
              step="0.01"
              min="0"
              value={planTotal}
              onChange={(e) => setPlanTotal(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="pay_date" className="block text-xs font-semibold text-neutral-700 mb-1">
              Payment Date *
            </label>
            <input
              id="pay_date"
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pay_method" className="block text-xs font-semibold text-neutral-700 mb-1">
              Payment Method *
            </label>
            <select
              id="pay_method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="pay_ref" className="block text-xs font-semibold text-neutral-700 mb-1">
              Transaction / Reference ID
            </label>
            <input
              id="pay_ref"
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="UTR / UPI / POS slip #"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="pay_status" className="block text-xs font-semibold text-neutral-700 mb-1">
              Payment Status *
            </label>
            <select
              id="pay_status"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="Paid">Paid (Full)</option>
              <option value="Partial">Partial (Balance Due)</option>
              <option value="Pending">Pending (Unpaid Invoice)</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2.5 p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-800 cursor-pointer">
          <input
            type="checkbox"
            checked={extendMembership}
            onChange={(e) => setExtendMembership(e.target.checked)}
          />
          <span>
            Also renew / extend this member’s active membership period by the selected plan duration
          </span>
        </label>

        <div>
          <label htmlFor="pay_notes" className="block text-xs font-semibold text-neutral-700 mb-1">
            Remarks (Optional)
          </label>
          <textarea
            id="pay_notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate({ view: 'payments' })}
            className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold whitespace-nowrap"
          >
            {saving ? 'Recording...' : 'Save Payment & Generate Receipt'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. Printable Receipt View (receipt.php)
// ----------------------------------------------------------------------------
export function ReceiptView({
  paymentId,
  onNavigate,
  onNotify,
}: {
  paymentId: number;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [receipt, setReceipt] = useState<PaymentRow | null>(null);
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest<{ receipt: PaymentRow; settings: GymSettings }>(`/api/payments/${paymentId}/receipt`)
      .then((res) => {
        setReceipt(res.receipt);
        setSettings(res.settings);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load payment receipt.');
      })
      .finally(() => setLoading(false));
  }, [paymentId, onNotify]);

  if (loading || !receipt || !settings) {
    return (
      <div className="max-w-3xl mx-auto p-8 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-500">
        Loading receipt...
      </div>
    );
  }

  const symbol = settings.currency_symbol || '₹';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          type="button"
          onClick={() => onNavigate({ view: 'payments' })}
          className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700"
        >
          ← Back to Payments
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate({ view: 'member_view', memberId: receipt.member_id })}
            className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700"
          >
            Member Profile
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-8 sm:p-10 print-only-clean">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-neutral-200">
          <div className="flex items-center gap-3.5">
            {settings.logo_path ? (
              <img
                src={settings.logo_path}
                alt={settings.gym_name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-neutral-200"
              />
            ) : (
              <span className="w-12 h-12 rounded-xl bg-orange-600 text-white text-lg font-bold flex items-center justify-center shrink-0">
                G
              </span>
            )}
            <div>
              <h1 className="text-xl font-bold text-neutral-900">{settings.gym_name}</h1>
              {settings.address && <p className="text-xs text-neutral-500 mt-0.5">{settings.address}</p>}
              <p className="text-xs text-neutral-500 mt-0.5">
                {settings.contact_number && <span>Tel: {settings.contact_number}</span>}
                {settings.contact_number && settings.email && <span className="mx-1.5">·</span>}
                {settings.email && <span>{settings.email}</span>}
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <div className="text-xs font-semibold text-neutral-500">Payment Receipt</div>
            <div className="mt-0.5 text-lg font-bold font-mono tabular-nums text-neutral-900">
              {receipt.receipt_number}
            </div>
            <div className="text-xs text-neutral-500 font-mono tabular-nums mt-0.5">
              Date: {formatDisplayDate(receipt.payment_date)}
            </div>
          </div>
        </div>

        {/* Member & Payment Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-medium text-neutral-500">Billed To</div>
            <div className="font-bold text-neutral-900">{receipt.full_name}</div>
            <div className="text-xs font-mono tabular-nums text-neutral-600">
              Member ID: {receipt.member_code}
            </div>
            {receipt.phone && (
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                Phone: {receipt.phone}
              </div>
            )}
            {receipt.email && <div className="text-xs text-neutral-600">{receipt.email}</div>}
          </div>

          <div className="sm:text-right space-y-1 text-sm">
            <div className="text-xs font-medium text-neutral-500">Transaction Info</div>
            <div className="text-xs text-neutral-800">
              Method: <strong>{receipt.payment_method}</strong>
            </div>
            {receipt.transaction_ref && (
              <div className="text-xs font-mono tabular-nums text-neutral-700">
                Reference: {receipt.transaction_ref}
              </div>
            )}
            <div className="text-xs text-neutral-800">
              Status: <strong>{receipt.payment_status}</strong>
            </div>
            {receipt.received_by_name && (
              <div className="text-xs text-neutral-500">
                Authorized by: {receipt.received_by_name}
              </div>
            )}
          </div>
        </div>

        {/* Line Item Breakdown */}
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-600">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Validity Window</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200">
                <td className="px-4 py-4">
                  <div className="font-semibold text-neutral-900">
                    {receipt.plan_name ? `${receipt.plan_name} Membership` : 'Gym Membership Fee'}
                  </div>
                  {receipt.notes && <div className="text-xs text-neutral-500 mt-0.5">{receipt.notes}</div>}
                </td>
                <td className="px-4 py-4 font-mono tabular-nums text-xs text-neutral-700">
                  {formatDisplayDate(receipt.membership_start_date)} –{' '}
                  {formatDisplayDate(receipt.membership_expiry_date)}
                </td>
                <td className="px-4 py-4 text-right font-mono tabular-nums font-semibold text-neutral-900">
                  {formatCurrency(receipt.amount, symbol)}
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-neutral-50/60">
              {receipt.plan_total_amount > 0 && receipt.plan_total_amount !== receipt.amount && (
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-right text-xs text-neutral-500">
                    Total Plan Fee
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-neutral-700">
                    {formatCurrency(receipt.plan_total_amount, symbol)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} className="px-4 py-3 text-right font-bold text-neutral-900">
                  Amount Paid
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-base font-bold text-neutral-900">
                  {formatCurrency(receipt.amount, symbol)}
                </td>
              </tr>
              {receipt.balance_due > 0 && (
                <tr className="border-t border-neutral-200">
                  <td colSpan={2} className="px-4 py-2.5 text-right text-xs font-semibold text-red-600">
                    Balance Due
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs font-bold text-red-600">
                    {formatCurrency(receipt.balance_due, symbol)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* Receipt Footer */}
        <div className="mt-8 pt-4 border-t border-neutral-200 text-center text-xs text-neutral-500">
          {settings.receipt_footer}
        </div>
      </div>
    </div>
  );
}

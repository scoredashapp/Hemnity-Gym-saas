import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CreditCard, MessageSquare } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { calculateSaasPlanAmount, type BillingCycle } from '../utils/saasRules';
import type {
  GymSubscriptionInfo,
  SaasPlan,
  SaasSubscriptionPayment,
  SupportTicketRow,
} from '../types/gym';
import { StatusIndicator } from './StatusIndicator';

interface OwnerSubscriptionViewProps {
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function OwnerSubscriptionView({ onNotify }: OwnerSubscriptionViewProps) {
  const [subscription, setSubscription] = useState<GymSubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [invoices, setInvoices] = useState<SaasSubscriptionPayment[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [upgrading, setUpgrading] = useState(false);

  const [ticketForm, setTicketForm] = useState({ subject: '', message: '' });
  const [sendingTicket, setSendingTicket] = useState(false);

  const loadData = useCallback(async () => {
    const res = await apiRequest<{
      subscription: GymSubscriptionInfo;
      availablePlans: SaasPlan[];
      invoices: SaasSubscriptionPayment[];
      tickets: SupportTicketRow[];
    }>('/api/v1/owner/subscription');
    setSubscription(res.subscription);
    setPlans(res.availablePlans);
    setInvoices(res.invoices);
    setTickets(res.tickets);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleChangePlan(planId: number) {
    setUpgrading(true);
    try {
      const res = await apiRequest<{ ok: boolean; invoiceNumber: string }>('/api/v1/owner/subscription/change', {
        method: 'POST',
        body: JSON.stringify({ saas_plan_id: planId, billing_cycle: cycle }),
      });
      onNotify('success', `SaaS subscription renewed/upgraded! Invoice ${res.invoiceNumber} generated.`);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to change plan.');
    } finally {
      setUpgrading(false);
    }
  }

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setSendingTicket(true);
    try {
      await apiRequest('/api/v1/owner/support-tickets', {
        method: 'POST',
        body: JSON.stringify(ticketForm),
      });
      setTicketForm({ subject: '', message: '' });
      onNotify('success', 'Support request submitted to Hemnity team.');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to send support ticket.');
    } finally {
      setSendingTicket(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-orange-600" />
          <span>Hemnity SaaS Subscription &amp; Support</span>
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Manage your gym&apos;s SaaS plan limits, renewal invoices, and priority support tickets (separate from member fee billing).
        </p>
      </div>

      {subscription && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Active SaaS Plan</div>
              <div className="text-xl font-bold text-neutral-900 mt-0.5">{subscription.plan_name}</div>
              <div className="text-xs text-neutral-500 mt-1 font-mono">
                Period End: {subscription.current_period_end} · Grace Period: {subscription.grace_period_days} days
              </div>
            </div>
            <StatusIndicator status={subscription.effective_status} />
          </div>

          {subscription.restriction_reason && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{subscription.restriction_reason}</span>
            </div>
          )}

          <div>
            <div className="flex justify-between text-xs font-semibold text-neutral-700 mb-1.5">
              <span>Member Quota Usage</span>
              <span className="font-mono tabular-nums">
                {subscription.current_members} / {subscription.max_members} members
              </span>
            </div>
            <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-600 rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((subscription.current_members / Math.max(1, subscription.max_members)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Upgrade / Renew SaaS Plan */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-neutral-900">Available Hemnity SaaS Plans</h2>
          <div className="inline-flex p-1 rounded-xl bg-white border border-neutral-200">
            {(['monthly', 'quarterly', 'yearly'] as BillingCycle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                  cycle === c ? 'bg-[#0c0e12] text-white' : 'text-neutral-600'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = subscription?.saas_plan_id === p.id;
            const amount = calculateSaasPlanAmount(p, cycle);
            return (
              <div
                key={p.id}
                className={`bg-white rounded-xl border p-5 flex flex-col justify-between gap-4 ${
                  isCurrent ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-neutral-200'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-bold text-neutral-900">{p.plan_name}</div>
                    {isCurrent && <span className="text-[11px] font-bold text-orange-600 uppercase">Current</span>}
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900">
                    ₹{amount.toLocaleString('en-IN')}
                    <span className="text-xs font-sans font-normal text-neutral-500"> /{cycle}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-neutral-600 pt-2">
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Up to {p.max_members} members</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{p.max_branches} branch(es)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{p.enabled_features.payment_gateway ? 'Per-gym gateway enabled' : 'Manual fee ledger'}</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={upgrading}
                  onClick={() => void handleChangePlan(p.id)}
                  className="w-full py-2 rounded-lg bg-[#0c0e12] hover:bg-neutral-800 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {isCurrent ? 'Renew This Plan' : `Switch to ${p.plan_name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SaaS Invoices */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="text-sm font-bold text-neutral-900">Hemnity SaaS Billing Invoices</h2>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
              <th className="py-3 px-4">Invoice #</th>
              <th className="py-3 px-4">Plan</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Method</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="py-3 px-4 font-mono font-semibold text-neutral-900">{inv.invoice_number}</td>
                <td className="py-3 px-4">{inv.plan_name} ({inv.billing_cycle})</td>
                <td className="py-3 px-4 font-mono tabular-nums font-semibold">₹{Number(inv.amount).toLocaleString('en-IN')}</td>
                <td className="py-3 px-4">{inv.payment_method}</td>
                <td className="py-3 px-4">
                  <StatusIndicator status={inv.status} />
                </td>
                <td className="py-3 px-4 font-mono text-neutral-500">{inv.paid_at || inv.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Support Request Form */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-bold text-neutral-900">Contact Hemnity Platform Support</h2>
        </div>
        <form onSubmit={submitTicket} className="space-y-3">
          <input
            type="text"
            required
            value={ticketForm.subject}
            onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
            placeholder="Subject (e.g., Custom domain SSL or gateway webhook help)"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
          />
          <textarea
            required
            rows={3}
            value={ticketForm.message}
            onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
            placeholder="Describe your request..."
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
          />
          <button
            type="submit"
            disabled={sendingTicket}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-60"
          >
            {sendingTicket ? 'Submitting...' : 'Submit Ticket to Hemnity'}
          </button>
        </form>

        {tickets.length > 0 && (
          <div className="pt-3 border-t border-neutral-100 space-y-2 text-xs">
            <div className="font-semibold text-neutral-700">Recent Tickets</div>
            {tickets.map((t) => (
              <div key={t.id} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-neutral-900">{t.subject}</div>
                  {t.admin_reply && <div className="text-emerald-700 mt-0.5">Reply: {t.admin_reply}</div>}
                </div>
                <StatusIndicator status={t.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

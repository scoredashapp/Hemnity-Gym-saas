import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type {
  AdminUser,
  AuditLogRow,
  GymTenant,
  PlatformFaq,
  PlatformSettings,
  SaasPlan,
  SaasSubscriptionPayment,
  SupportTicketRow,
} from '../types/gym';
import { StatusIndicator } from './StatusIndicator';

type SuperTab = 'dashboard' | 'gyms' | 'plans' | 'billing' | 'cms' | 'support' | 'audit';

interface SuperAdminViewProps {
  user: AdminUser;
  onLogout: () => void;
  onNavigatePath: (path: string) => void;
}

export function SuperAdminView({ user, onLogout, onNavigatePath }: SuperAdminViewProps) {
  const [tab, setTab] = useState<SuperTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dashboard
  const [kpis, setKpis] = useState({
    totalGyms: 0,
    activeGyms: 0,
    suspendedGyms: 0,
    trialGyms: 0,
    totalOwners: 0,
    totalMembersAcrossGyms: 0,
    totalSaasRevenue: 0,
    monthRevenue: 0,
    mrr: 0,
    arr: 0,
    openTickets: 0,
  });
  const [recentGyms, setRecentGyms] = useState<Array<Record<string, unknown>>>([]);
  const [expiringSubs, setExpiringSubs] = useState<Array<Record<string, unknown>>>([]);

  // Gyms directory
  const [gyms, setGyms] = useState<GymTenant[]>([]);
  const [gymSearch, setGymSearch] = useState('');
  const [gymFilter, setGymFilter] = useState('');

  // SaaS plans
  const [saasPlans, setSaasPlans] = useState<SaasPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<Partial<SaasPlan> | null>(null);

  // Subscriptions & Invoices
  const [subscriptions, setSubscriptions] = useState<Array<Record<string, unknown>>>([]);
  const [invoices, setInvoices] = useState<SaasSubscriptionPayment[]>([]);
  const [manageSubModal, setManageSubModal] = useState<{
    gym_id: number;
    gym_name: string;
    saas_plan_id: number;
    billing_cycle: string;
    status: string;
    grace_period_days: number;
    extend_days: number;
    record_payment_amount: string;
  } | null>(null);

  // Platform settings & FAQs
  const [platSettings, setPlatSettings] = useState<PlatformSettings | null>(null);
  const [platSecrets, setPlatSecrets] = useState({ smtp_password: '', platform_gateway_secret: '', google_client_secret: '' });
  const [faqs, setFaqs] = useState<PlatformFaq[]>([]);
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });

  // Support & Audit
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [ticketReply, setTicketReply] = useState<Record<number, string>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);

  const loadDashboard = useCallback(async () => {
    const res = await apiRequest<{
      kpis: typeof kpis;
      recentGyms: Array<Record<string, unknown>>;
      expiringSubscriptions: Array<Record<string, unknown>>;
    }>('/api/v1/superadmin/dashboard');
    setKpis(res.kpis);
    setRecentGyms(res.recentGyms);
    setExpiringSubs(res.expiringSubscriptions);
  }, []);

  const loadGyms = useCallback(async () => {
    const params = new URLSearchParams();
    if (gymSearch) params.set('q', gymSearch);
    if (gymFilter) params.set('status', gymFilter);
    const res = await apiRequest<{ gyms: GymTenant[] }>(`/api/v1/superadmin/gyms?${params.toString()}`);
    setGyms(res.gyms);
  }, [gymSearch, gymFilter]);

  const loadPlans = useCallback(async () => {
    const res = await apiRequest<{ plans: SaasPlan[] }>('/api/v1/superadmin/saas-plans');
    setSaasPlans(res.plans);
  }, []);

  const loadBilling = useCallback(async () => {
    const res = await apiRequest<{
      subscriptions: Array<Record<string, unknown>>;
      invoices: SaasSubscriptionPayment[];
    }>('/api/v1/superadmin/subscriptions');
    setSubscriptions(res.subscriptions);
    setInvoices(res.invoices);
  }, []);

  const loadCms = useCallback(async () => {
    const res = await apiRequest<{ settings: PlatformSettings; faqs: PlatformFaq[] }>('/api/v1/superadmin/platform-settings');
    setPlatSettings(res.settings);
    setFaqs(res.faqs);
  }, []);

  const loadTickets = useCallback(async () => {
    const res = await apiRequest<{ tickets: SupportTicketRow[] }>('/api/v1/superadmin/support-tickets');
    setTickets(res.tickets);
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await apiRequest<{ logs: AuditLogRow[] }>('/api/v1/superadmin/audit-logs');
    setAuditLogs(res.logs);
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') void loadDashboard();
    if (tab === 'gyms') void loadGyms();
    if (tab === 'plans') void loadPlans();
    if (tab === 'billing') {
      void loadBilling();
      void loadPlans();
    }
    if (tab === 'cms') void loadCms();
    if (tab === 'support') void loadTickets();
    if (tab === 'audit') void loadAudit();
  }, [tab, loadDashboard, loadGyms, loadPlans, loadBilling, loadCms, loadTickets, loadAudit]);

  async function toggleGymStatus(gymId: number, status: 'Active' | 'Suspended') {
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(`/api/v1/superadmin/gyms/${gymId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setBanner({ type: 'success', text: res.message });
      await loadGyms();
      await loadDashboard();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Status update failed.' });
    }
  }

  async function saveSaasPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      if (editingPlan.id) {
        await apiRequest(`/api/v1/superadmin/saas-plans/${editingPlan.id}`, {
          method: 'PUT',
          body: JSON.stringify(editingPlan),
        });
        setBanner({ type: 'success', text: 'SaaS plan updated and reflected on public landing page.' });
      } else {
        await apiRequest('/api/v1/superadmin/saas-plans', {
          method: 'POST',
          body: JSON.stringify(editingPlan),
        });
        setBanner({ type: 'success', text: 'New SaaS pricing plan published.' });
      }
      setEditingPlan(null);
      await loadPlans();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Could not save plan.' });
    }
  }

  async function saveManagedSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (!manageSubModal) return;
    try {
      await apiRequest(`/api/v1/superadmin/subscriptions/${manageSubModal.gym_id}/manage`, {
        method: 'POST',
        body: JSON.stringify({
          saas_plan_id: manageSubModal.saas_plan_id,
          billing_cycle: manageSubModal.billing_cycle,
          status: manageSubModal.status,
          grace_period_days: manageSubModal.grace_period_days,
          extend_days: manageSubModal.extend_days,
          record_payment_amount: manageSubModal.record_payment_amount ? Number(manageSubModal.record_payment_amount) : 0,
        }),
      });
      setBanner({ type: 'success', text: `Subscription updated for ${manageSubModal.gym_name}.` });
      setManageSubModal(null);
      await loadBilling();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update subscription.' });
    }
  }

  async function savePlatformCms(e: React.FormEvent) {
    e.preventDefault();
    if (!platSettings) return;
    try {
      const res = await apiRequest<{ ok: boolean; settings: PlatformSettings }>('/api/v1/superadmin/platform-settings', {
        method: 'PUT',
        body: JSON.stringify({ ...platSettings, ...platSecrets }),
      });
      setPlatSettings(res.settings);
      setPlatSecrets({ smtp_password: '', platform_gateway_secret: '', google_client_secret: '' });
      setBanner({ type: 'success', text: 'Platform settings and Landing Page CMS updated.' });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Could not save platform settings.' });
    }
  }

  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/api/v1/superadmin/faqs', {
        method: 'POST',
        body: JSON.stringify(newFaq),
      });
      setNewFaq({ question: '', answer: '' });
      await loadCms();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Could not add FAQ.' });
    }
  }

  async function deleteFaq(id: number) {
    await apiRequest(`/api/v1/superadmin/faqs/${id}`, { method: 'DELETE' });
    await loadCms();
  }

  async function updateTicket(ticketId: number, status: 'In Progress' | 'Resolved') {
    await apiRequest(`/api/v1/superadmin/support-tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, admin_reply: ticketReply[ticketId] || '' }),
    });
    setBanner({ type: 'success', text: `Support ticket #${ticketId} marked ${status}.` });
    await loadTickets();
  }

  const navItems: Array<{ key: SuperTab; label: string; icon: typeof LayoutDashboard }> = [
    { key: 'dashboard', label: 'Platform Overview', icon: LayoutDashboard },
    { key: 'gyms', label: 'Gyms Directory', icon: Building2 },
    { key: 'plans', label: 'SaaS Pricing Plans', icon: CreditCard },
    { key: 'billing', label: 'Subscriptions & Invoices', icon: FileText },
    { key: 'cms', label: 'CMS, SMTP & Settings', icon: Settings },
    { key: 'support', label: 'Support Requests', icon: MessageSquare },
    { key: 'audit', label: 'Security Audit Logs', icon: Activity },
  ];

  return (
    <div className="min-h-screen flex bg-[#f8f9fb] text-neutral-900">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/55 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0c0e12] text-neutral-200 flex flex-col transition-transform duration-150 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
              H
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm text-white truncate">Hemnity Admin</div>
              <div className="text-[11px] text-neutral-400 truncate">Super Admin Console</div>
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
            onClick={() => onNavigatePath('/api/docs')}
            className="w-full py-2 px-3 rounded-lg bg-[#181c24] hover:bg-[#222834] text-neutral-200 text-xs font-semibold"
          >
            API Documentation
          </button>
          <button
            type="button"
            onClick={() => onNavigatePath('/')}
            className="w-full py-2 px-3 rounded-lg bg-[#181c24] hover:bg-[#222834] text-neutral-300 text-xs font-medium"
          >
            View Public Landing
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
        <header className="h-16 bg-white border-b border-neutral-200 px-4 sm:px-7 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg border border-neutral-200 text-neutral-700"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span className="font-bold text-neutral-900">Hemnity Super Admin</span>
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            Signed in as <strong className="text-neutral-900">{user.full_name}</strong>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-7 max-w-[1360px] w-full mx-auto space-y-6">
          {banner && (
            <div
              className={`px-4 py-3 rounded-xl border text-sm flex items-center justify-between ${
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

          {tab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Gyms', value: kpis.totalGyms, sub: `${kpis.activeGyms} Active · ${kpis.trialGyms} Trial` },
                  { label: 'Suspended Gyms', value: kpis.suspendedGyms, sub: `${kpis.totalOwners} Gym Owners` },
                  { label: 'Members Across Gyms', value: kpis.totalMembersAcrossGyms, sub: 'Isolated per tenant' },
                  { label: 'Estimated MRR', value: `₹${kpis.mrr.toLocaleString('en-IN')}`, sub: `ARR ₹${kpis.arr.toLocaleString('en-IN')}` },
                ].map((c) => (
                  <div key={c.label} className="bg-white rounded-xl border border-neutral-200 p-5">
                    <div className="text-xs font-semibold text-neutral-500">{c.label}</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 mt-1">{c.value}</div>
                    <div className="text-[11px] text-neutral-500 mt-1">{c.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-neutral-900">Recently Registered Gyms</h2>
                    <button type="button" onClick={() => setTab('gyms')} className="text-xs font-semibold text-orange-600">
                      View All
                    </button>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {recentGyms.map((g) => (
                      <div key={String(g.id)} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-neutral-900">{String(g.name)}</div>
                          <div className="text-neutral-500">
                            {String(g.gym_code)} · {String(g.owner_name || '')} · {Number(g.member_count || 0)} members
                          </div>
                        </div>
                        <StatusIndicator status={String(g.status)} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-neutral-900">SaaS Renewals &amp; Trial Expiries</h2>
                    <button type="button" onClick={() => setTab('billing')} className="text-xs font-semibold text-orange-600">
                      Manage Billing
                    </button>
                  </div>
                  {expiringSubs.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-4">No gym subscriptions expiring within the next 14 days.</p>
                  ) : (
                    <div className="divide-y divide-neutral-100">
                      {expiringSubs.map((s) => (
                        <div key={String(s.gym_id)} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="font-semibold text-neutral-900">{String(s.gym_name)}</div>
                            <div className="text-neutral-500">
                              {String(s.plan_name)} · Ends {String(s.current_period_end)}
                            </div>
                          </div>
                          <StatusIndicator status={String(s.status)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'gyms' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={gymSearch}
                    onChange={(e) => setGymSearch(e.target.value)}
                    placeholder="Search gym name, code, owner email, or city..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <select
                  value={gymFilter}
                  onChange={(e) => setGymFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Trial">Trial</option>
                  <option value="Suspended">Suspended</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadGyms()}
                  className="px-4 py-2 rounded-lg bg-[#0c0e12] text-white text-xs font-semibold"
                >
                  Filter
                </button>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                      <th className="py-3 px-4">Gym Tenant</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">SaaS Plan</th>
                      <th className="py-3 px-4">Members</th>
                      <th className="py-3 px-4">Gym Revenue</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs">
                    {gyms.map((g) => (
                      <tr key={g.id} className="hover:bg-neutral-50/60">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-neutral-900">{g.name}</div>
                          <div className="text-neutral-500 font-mono">{g.gym_code} · {g.city || '—'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-neutral-800">{g.owner_name}</div>
                          <div className="text-neutral-500">{g.owner_email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-neutral-900">{g.plan_name || '—'}</div>
                          <div className="text-neutral-500">Ends {g.current_period_end || '—'}</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {g.active_member_count || 0} / {g.member_count || 0}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          ₹{Number(g.total_revenue || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <StatusIndicator status={g.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          {g.status === 'Suspended' ? (
                            <button
                              type="button"
                              onClick={() => void toggleGymStatus(g.id, 'Active')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                            >
                              Restore Active
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void toggleGymStatus(g.id, 'Suspended')}
                              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 font-semibold"
                            >
                              Suspend
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'plans' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-neutral-900">Database-Driven SaaS Pricing Plans</h2>
                  <p className="text-xs text-neutral-500">Changes published here immediately update the public landing page pricing cards.</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingPlan({
                      plan_name: '',
                      tagline: '',
                      monthly_price: 1499,
                      quarterly_price: 3999,
                      yearly_price: 14390,
                      trial_days: 14,
                      max_members: 300,
                      max_branches: 1,
                      discount_percent: 10,
                      description: '',
                      is_featured: 0,
                      is_active: 1,
                      sort_order: saasPlans.length + 1,
                      enabled_features: {
                        qr_attendance: true,
                        payment_gateway: true,
                        reports_export: true,
                        id_cards: true,
                        member_portal: true,
                      },
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add SaaS Plan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {saasPlans.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-neutral-200 p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-neutral-900">{p.plan_name}</h3>
                        <StatusIndicator status={p.is_active ? 'Active' : 'Inactive'} />
                      </div>
                      <div className="text-xl font-bold font-mono tabular-nums text-neutral-900">
                        ₹{p.monthly_price.toLocaleString('en-IN')}/mo
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">
                        Q: ₹{p.quarterly_price.toLocaleString('en-IN')} · Y: ₹{p.yearly_price.toLocaleString('en-IN')}
                      </div>
                      <p className="text-xs text-neutral-600">{p.description}</p>
                      <div className="text-xs text-neutral-500 pt-1">
                        Max {p.max_members} members · {p.max_branches} branch(es) · {p.trial_days}d trial · {p.active_gyms_count ?? 0} gym(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingPlan(p)}
                      className="w-full py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold text-neutral-800"
                    >
                      Edit Plan Pricing &amp; Quotas
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'billing' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
                <div className="px-5 py-4 border-b border-neutral-200">
                  <h2 className="text-sm font-bold text-neutral-900">Gym SaaS Subscriptions &amp; Grace Periods</h2>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
                      <th className="py-3 px-4">Gym</th>
                      <th className="py-3 px-4">Plan &amp; Cycle</th>
                      <th className="py-3 px-4">Period End</th>
                      <th className="py-3 px-4">Grace Days</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {subscriptions.map((s) => (
                      <tr key={String(s.id)}>
                        <td className="py-3 px-4 font-semibold text-neutral-900">
                          {String(s.gym_name)} <span className="font-mono text-neutral-400">({String(s.gym_code)})</span>
                        </td>
                        <td className="py-3 px-4">
                          {String(s.plan_name)} · <span className="capitalize">{String(s.billing_cycle)}</span>
                        </td>
                        <td className="py-3 px-4 font-mono">{String(s.current_period_end)}</td>
                        <td className="py-3 px-4 font-mono">{Number(s.grace_period_days)}d</td>
                        <td className="py-3 px-4">
                          <StatusIndicator status={String(s.status)} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setManageSubModal({
                                gym_id: Number(s.gym_id),
                                gym_name: String(s.gym_name),
                                saas_plan_id: Number(s.saas_plan_id),
                                billing_cycle: String(s.billing_cycle),
                                status: String(s.status),
                                grace_period_days: Number(s.grace_period_days),
                                extend_days: 30,
                                record_payment_amount: '',
                              })
                            }
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 font-semibold"
                          >
                            Renew / Override
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
                <div className="px-5 py-4 border-b border-neutral-200">
                  <h2 className="text-sm font-bold text-neutral-900">Hemnity SaaS Billing Invoices</h2>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Gym</th>
                      <th className="py-3 px-4">Plan</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-neutral-900">{inv.invoice_number}</td>
                        <td className="py-3 px-4">{inv.gym_name}</td>
                        <td className="py-3 px-4">{inv.plan_name} ({inv.billing_cycle})</td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold">
                          ₹{Number(inv.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">{inv.payment_method}</td>
                        <td className="py-3 px-4">
                          <StatusIndicator status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'cms' && platSettings && (
            <div className="space-y-6">
              <form onSubmit={savePlatformCms} className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5">
                <h2 className="text-base font-bold text-neutral-900">Landing Page CMS, SMTP, OAuth &amp; Global Settings</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Parent Brand</label>
                    <input
                      type="text"
                      value={platSettings.brand_name}
                      onChange={(e) => setPlatSettings({ ...platSettings, brand_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Software Title</label>
                    <input
                      type="text"
                      value={platSettings.software_name}
                      onChange={(e) => setPlatSettings({ ...platSettings, software_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Production Base URL</label>
                    <input
                      type="text"
                      value={platSettings.base_url}
                      onChange={(e) => setPlatSettings({ ...platSettings, base_url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Hero Headline</label>
                    <input
                      type="text"
                      value={platSettings.hero_title}
                      onChange={(e) => setPlatSettings({ ...platSettings, hero_title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Announcement Banner (Optional)</label>
                    <input
                      type="text"
                      value={platSettings.announcement_banner || ''}
                      onChange={(e) => setPlatSettings({ ...platSettings, announcement_banner: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Hero Subtitle</label>
                  <textarea
                    rows={2}
                    value={platSettings.hero_subtitle}
                    onChange={(e) => setPlatSettings({ ...platSettings, hero_subtitle: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-neutral-100">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={platSettings.smtp_host}
                      onChange={(e) => setPlatSettings({ ...platSettings, smtp_host: e.target.value })}
                      placeholder="smtp.hostinger.com"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">SMTP Port</label>
                    <input
                      type="number"
                      value={platSettings.smtp_port}
                      onChange={(e) => setPlatSettings({ ...platSettings, smtp_port: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">SMTP Username</label>
                    <input
                      type="text"
                      value={platSettings.smtp_user}
                      onChange={(e) => setPlatSettings({ ...platSettings, smtp_user: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      SMTP Password {platSettings.has_smtp_password ? '(Saved)' : ''}
                    </label>
                    <input
                      type="password"
                      value={platSecrets.smtp_password}
                      onChange={(e) => setPlatSecrets({ ...platSecrets, smtp_password: e.target.value })}
                      placeholder="Leave blank to keep existing"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-neutral-100">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Google OAuth Client ID</label>
                    <input
                      type="text"
                      value={platSettings.google_client_id}
                      onChange={(e) => setPlatSettings({ ...platSettings, google_client_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Default Grace Period (Days)</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={platSettings.default_grace_period_days}
                      onChange={(e) =>
                        setPlatSettings({ ...platSettings, default_grace_period_days: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                    />
                  </div>
                  <div className="flex items-end gap-4 pb-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                      <input
                        type="checkbox"
                        checked={Boolean(platSettings.google_oauth_enabled)}
                        onChange={(e) =>
                          setPlatSettings({ ...platSettings, google_oauth_enabled: e.target.checked ? 1 : 0 })
                        }
                      />
                      <span>Enable Google OAuth</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                      <input
                        type="checkbox"
                        checked={Boolean(platSettings.maintenance_mode)}
                        onChange={(e) => setPlatSettings({ ...platSettings, maintenance_mode: e.target.checked ? 1 : 0 })}
                      />
                      <span>Maintenance Mode</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
                  >
                    Save Platform Settings
                  </button>
                </div>
              </form>

              {/* Dynamic FAQs Editor */}
              <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-orange-600" />
                  <h3 className="text-sm font-bold text-neutral-900">Landing Page FAQs</h3>
                </div>
                <form onSubmit={addFaq} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <input
                    type="text"
                    required
                    value={newFaq.question}
                    onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                    placeholder="FAQ Question..."
                    className="md:col-span-4 px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={newFaq.answer}
                    onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                    placeholder="FAQ Answer..."
                    className="md:col-span-6 px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                  <button
                    type="submit"
                    className="md:col-span-2 px-4 py-2 rounded-lg bg-[#0c0e12] text-white text-xs font-semibold"
                  >
                    Add FAQ
                  </button>
                </form>

                <div className="divide-y divide-neutral-100">
                  {faqs.map((faq) => (
                    <div key={faq.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                      <div>
                        <div className="font-semibold text-neutral-900">{faq.question}</div>
                        <div className="text-neutral-600 mt-0.5">{faq.answer}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteFaq(faq.id)}
                        className="text-red-600 hover:underline shrink-0 font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'support' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-neutral-900">Gym Owner &amp; Landing Support Requests</h2>
              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-neutral-900">{t.subject}</div>
                        <div className="text-neutral-500">
                          {t.sender_name} ({t.sender_email}) · Gym: {t.gym_name || 'Public Inquiry'} · {t.created_at}
                        </div>
                      </div>
                      <StatusIndicator status={t.status} />
                    </div>
                    <p className="text-neutral-700 bg-neutral-50 p-3 rounded-lg border border-neutral-100">{t.message}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={ticketReply[t.id] ?? t.admin_reply ?? ''}
                        onChange={(e) => setTicketReply({ ...ticketReply, [t.id]: e.target.value })}
                        placeholder="Write resolution note..."
                        className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-neutral-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void updateTicket(t.id, 'In Progress')}
                        className="px-3 py-2 rounded-lg border border-neutral-200 font-semibold"
                      >
                        Mark In Progress
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateTicket(t.id, 'Resolved')}
                        className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'audit' && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
              <div className="px-5 py-4 border-b border-neutral-200">
                <h2 className="text-sm font-bold text-neutral-900">Cross-Platform Security &amp; Audit Logs</h2>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Gym Tenant</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {auditLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-4 font-mono text-neutral-500 whitespace-nowrap">{l.created_at}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-neutral-900">{l.actor_name || 'System / Webhook'}</div>
                        <div className="text-neutral-500">{l.actor_role}</div>
                      </td>
                      <td className="py-2.5 px-4">{l.gym_name || (l.gym_id ? `Gym #${l.gym_id}` : 'Platform')}</td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-neutral-800">{l.action}</td>
                      <td className="py-2.5 px-4 font-mono">{l.target_type} {l.target_id ? `#${l.target_id}` : ''}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-neutral-500 max-w-xs truncate">
                        {l.details_json || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Edit/Add SaaS Plan Modal */}
      {editingPlan && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={saveSaasPlan} className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900">
                {editingPlan.id ? `Edit ${editingPlan.plan_name}` : 'Create SaaS Subscription Plan'}
              </h3>
              <button type="button" onClick={() => setEditingPlan(null)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block font-semibold mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  value={editingPlan.plan_name || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, plan_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Monthly Price (₹)</label>
                <input
                  type="number"
                  required
                  value={editingPlan.monthly_price ?? 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, monthly_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Quarterly Price (₹)</label>
                <input
                  type="number"
                  required
                  value={editingPlan.quarterly_price ?? 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, quarterly_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Yearly Price (₹)</label>
                <input
                  type="number"
                  required
                  value={editingPlan.yearly_price ?? 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, yearly_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Trial Days</label>
                <input
                  type="number"
                  value={editingPlan.trial_days ?? 14}
                  onChange={(e) => setEditingPlan({ ...editingPlan, trial_days: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Max Members</label>
                <input
                  type="number"
                  value={editingPlan.max_members ?? 200}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_members: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Max Branches</label>
                <input
                  type="number"
                  value={editingPlan.max_branches ?? 1}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_branches: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingPlan.description || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={Boolean(editingPlan.is_featured)}
                  onChange={(e) => setEditingPlan({ ...editingPlan, is_featured: e.target.checked ? 1 : 0 })}
                />
                <span>Featured on Landing</span>
              </label>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={editingPlan.is_active !== 0}
                  onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked ? 1 : 0 })}
                />
                <span>Active Plan</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingPlan(null)} className="px-4 py-2 rounded-lg border border-neutral-200 text-xs font-semibold">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-semibold">
                Save Plan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {manageSubModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={saveManagedSubscription} className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900">Manage Subscription: {manageSubModal.gym_name}</h3>
              <button type="button" onClick={() => setManageSubModal(null)} className="text-neutral-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">SaaS Plan</label>
                <select
                  value={manageSubModal.saas_plan_id}
                  onChange={(e) => setManageSubModal({ ...manageSubModal, saas_plan_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white"
                >
                  {saasPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.plan_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Status</label>
                  <select
                    value={manageSubModal.status}
                    onChange={(e) => setManageSubModal({ ...manageSubModal, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Trial">Trial</option>
                    <option value="Grace">Grace</option>
                    <option value="Expired">Expired</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Grace Period Days</label>
                  <input
                    type="number"
                    value={manageSubModal.grace_period_days}
                    onChange={(e) => setManageSubModal({ ...manageSubModal, grace_period_days: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Extend Period (Days)</label>
                  <input
                    type="number"
                    value={manageSubModal.extend_days}
                    onChange={(e) => setManageSubModal({ ...manageSubModal, extend_days: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Record Payment (₹ Optional)</label>
                  <input
                    type="number"
                    value={manageSubModal.record_payment_amount}
                    onChange={(e) => setManageSubModal({ ...manageSubModal, record_payment_amount: e.target.value })}
                    placeholder="e.g. 1999"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setManageSubModal(null)} className="px-4 py-2 rounded-lg border border-neutral-200 text-xs font-semibold">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-semibold">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

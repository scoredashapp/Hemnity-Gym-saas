import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, PauseCircle, Plus } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { formatCurrency, formatDisplayDate } from '../utils/gymRules';
import type {
  ActiveScreen,
  GymSettings,
  MembershipHistoryRow,
  MembershipPlan,
} from '../types/gym';

export function PlansView({
  settings,
  onNavigate,
  onNotify,
}: {
  settings: GymSettings;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [recentHistory, setRecentHistory] = useState<MembershipHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planName, setPlanName] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('1000');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadPlans = useCallback(() => {
    setLoading(true);
    apiRequest<{ plans: MembershipPlan[]; recentHistory: MembershipHistoryRow[] }>('/api/plans')
      .then((res) => {
        setPlans(res.plans);
        setRecentHistory(res.recentHistory);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load plans.');
      })
      .finally(() => setLoading(false));
  }, [onNotify]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function openNewPlanForm() {
    setEditingPlanId(null);
    setPlanName('');
    setDurationDays('30');
    setPrice('');
    setDescription('');
    setIsActive(true);
    setFormError('');
    setFormOpen(true);
  }

  function openEditPlanForm(p: MembershipPlan) {
    setEditingPlanId(p.id);
    setPlanName(p.plan_name);
    setDurationDays(String(p.duration_days));
    setPrice(String(p.price));
    setDescription(p.description || '');
    setIsActive(p.is_active === 1);
    setFormError('');
    setFormOpen(true);
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        plan_name: planName,
        duration_days: Number(durationDays),
        price: Number(price),
        description,
        is_active: isActive,
      };
      if (editingPlanId) {
        await apiRequest(`/api/plans/${editingPlanId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify('success', `Plan "${planName}" updated.`);
      } else {
        await apiRequest('/api/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('success', `Plan "${planName}" created.`);
      }
      setFormOpen(false);
      loadPlans();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(p: MembershipPlan) {
    try {
      await apiRequest(`/api/plans/${p.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ is_active: p.is_active !== 1 }),
      });
      onNotify(
        'success',
        p.is_active === 1
          ? `Plan "${p.plan_name}" deactivated. Existing memberships remain unchanged.`
          : `Plan "${p.plan_name}" activated.`
      );
      loadPlans();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to update plan status.');
    }
  }

  const symbol = settings.currency_symbol || '₹';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Membership Plans</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Manage plan durations and fixed-precision pricing. Deactivating a plan preserves historical memberships.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewPlanForm}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Plan</span>
        </button>
      </div>

      {/* Inline Add / Edit Plan Form Panel */}
      {formOpen && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-200">
            <h2 className="text-base font-bold text-neutral-900">
              {editingPlanId ? 'Edit Membership Plan' : 'Create Membership Plan'}
            </h2>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
            >
              Close
            </button>
          </div>

          {formError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSavePlan} className="grid grid-cols-1 md:grid-cols-12 gap-4" noValidate>
            <div className="md:col-span-5">
              <label htmlFor="pl_name" className="block text-xs font-semibold text-neutral-700 mb-1">
                Plan Name *
              </label>
              <input
                id="pl_name"
                type="text"
                required
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="e.g. Monthly Strength"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="pl_days" className="block text-xs font-semibold text-neutral-700 mb-1">
                Duration (Days) *
              </label>
              <input
                id="pl_days"
                type="number"
                min={1}
                max={3650}
                required
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-4">
              <label htmlFor="pl_price" className="block text-xs font-semibold text-neutral-700 mb-1">
                Price ({symbol}) *
              </label>
              <input
                id="pl_price"
                type="number"
                step="0.01"
                min={0}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1000.00"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-12">
              <label htmlFor="pl_desc" className="block text-xs font-semibold text-neutral-700 mb-1">
                Description
              </label>
              <input
                id="pl_desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Included gym access, orientation sessions, locker priority..."
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Active and selectable for new member enrollments</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
                >
                  {saving ? 'Saving...' : editingPlanId ? 'Update Plan' : 'Save Plan'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Plans Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="px-4 py-3">Plan Name</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Active Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-500">
                    Loading membership plans...
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className={p.is_active === 1 ? 'hover:bg-neutral-50/80' : 'opacity-65'}>
                    <td className="px-4 py-3.5 font-semibold text-neutral-900 whitespace-nowrap">
                      {p.plan_name}
                    </td>
                    <td className="px-4 py-3.5 font-mono tabular-nums text-xs text-neutral-700 whitespace-nowrap">
                      {p.duration_days} days
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums font-bold text-neutral-900 whitespace-nowrap">
                      {formatCurrency(p.price, symbol)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-neutral-600 max-w-sm">
                      {p.description || '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-neutral-800">
                      {p.active_member_count ?? 0}
                    </td>
                    <td className="px-4 py-3.5">
                      {p.is_active === 1 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 whitespace-nowrap">
                          <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Deactivated</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditPlanForm(p)}
                          className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 whitespace-nowrap"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 whitespace-nowrap"
                        >
                          {p.is_active === 1 ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Membership Assignments & Renewals History */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900">
            Recent Plan Assignments, Renewals &amp; Extensions
          </h2>
          <button
            type="button"
            onClick={() => onNavigate({ view: 'reports', initialTab: 'renewals' })}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap"
          >
            Renewal Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Start Date</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3 text-right">Plan Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {recentHistory.map((mh) => (
                <tr key={mh.id} className="hover:bg-neutral-50/80">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onNavigate({ view: 'member_view', memberId: mh.member_id })}
                      className="font-semibold text-neutral-900 hover:text-orange-600 text-left"
                    >
                      {mh.full_name}
                    </button>
                    <span className="ml-1.5 text-xs font-mono tabular-nums text-neutral-500">
                      ({mh.member_code})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{mh.plan_name_snapshot}</td>
                  <td className="px-4 py-3 text-xs text-neutral-600">{mh.action_type}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-600">
                    {formatDisplayDate(mh.start_date)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-600">
                    {formatDisplayDate(mh.expiry_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(mh.plan_price_snapshot, symbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

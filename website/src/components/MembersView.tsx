import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck,
  CreditCard,
  IdCard,
  KeyRound,
  MessageCircle,
  Pencil,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { apiRequest, readImageFileAsDataUrl } from '../utils/api';
import {
  buildWhatsAppReminderUrl,
  calculatePlanExpiryDate,
  formatCurrency,
  formatDisplayDate,
  type MembershipActionType,
  type StoredMemberStatus,
} from '../utils/gymRules';
import type {
  ActiveScreen,
  AttendanceRow,
  GymSettings,
  MemberRow,
  MembershipHistoryRow,
  MembershipPlan,
  PaymentRow,
} from '../types/gym';
import { ConfirmDialog } from './ConfirmDialog';
import { MemberStatusLabel, PaymentStatusLabel } from './StatusIndicator';

// ----------------------------------------------------------------------------
// 1. Member Directory List View (members.php)
// ----------------------------------------------------------------------------
export function MembersDirectoryView({
  initialStatus = '',
  settings,
  onNavigate,
  onNotify,
}: {
  initialStatus?: string;
  settings: GymSettings;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [confirmTarget, setConfirmTarget] = useState<{
    member: MemberRow;
    action: 'deactivate' | 'delete';
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    setStatus(initialStatus);
    setPage(1);
  }, [initialStatus]);

  const loadMembers = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      q: search,
      status,
      sort,
      page: String(page),
      perPage: '10',
    });
    apiRequest<{
      members: MemberRow[];
      totalRows: number;
      totalPages: number;
      page: number;
    }>(`/api/members?${qs.toString()}`)
      .then((res) => {
        setMembers(res.members);
        setTotalRows(res.totalRows);
        setTotalPages(res.totalPages);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load members.');
      })
      .finally(() => setLoading(false));
  }, [search, status, sort, page, onNotify]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function executeStatusChange(memberId: number, action: 'deactivate' | 'reactivate' | 'delete') {
    setConfirmBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(`/api/members/${memberId}/status`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      onNotify('success', res.message);
      setConfirmTarget(null);
      loadMembers();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Operation failed.');
      setConfirmTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  const filterTabs = [
    { key: '', label: 'All Members' },
    { key: 'Active', label: 'Active' },
    { key: 'ExpiringSoon', label: 'Expiring in 7d' },
    { key: 'Expired', label: 'Expired' },
    { key: 'Inactive', label: 'Inactive' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Member Directory</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Search, filter, renew, or manage member records ({totalRows} total).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate({ view: 'member_add' })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          <span>Add New Member</span>
        </button>
      </div>

      {/* Search, Segmented Status Filter & Sort */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 bg-neutral-100 p-1 rounded-lg">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  status === tab.key
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search by name, phone, or member ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, phone, or GYM-2026-..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-neutral-300 focus:border-orange-600 focus:outline-none"
              />
            </div>
            <label htmlFor="member_sort" className="sr-only">
              Sort members
            </label>
            <select
              id="member_sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="py-1.5 px-3 text-sm rounded-lg border border-neutral-300 bg-white focus:border-orange-600 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="expiry_asc">Expiry (Soonest)</option>
              <option value="expiry_desc">Expiry (Latest)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Phone / Email</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                    Loading members...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <div className="text-sm text-neutral-500 mb-3">No members match your current filters.</div>
                    <button
                      type="button"
                      onClick={() => onNavigate({ view: 'member_add' })}
                      className="px-3.5 py-2 rounded-lg bg-orange-600 text-white text-xs font-semibold"
                    >
                      Register First Member
                    </button>
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const isExpired = m.display_status === 'Expired';
                  const isExpiring = m.display_status === 'ExpiringSoon';
                  const rowBg =
                    m.display_status === 'Inactive'
                      ? ''
                      : isExpired
                        ? 'bg-red-50/70'
                        : isExpiring
                          ? 'bg-amber-50/70'
                          : 'hover:bg-neutral-50/80';

                  const waUrl =
                    isExpired || isExpiring
                      ? buildWhatsAppReminderUrl({
                          phone: m.phone,
                          memberName: m.full_name,
                          gymName: settings.gym_name,
                          expiryDate: m.membership_expiry_date,
                          isExpired,
                        })
                      : null;

                  return (
                    <tr key={m.id} className={rowBg}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {m.photo_path ? (
                            <img
                              src={m.photo_path}
                              alt={m.full_name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-neutral-200 shrink-0"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="w-9 h-9 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-700 font-bold text-xs flex items-center justify-center shrink-0"
                            >
                              {m.full_name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div>
                            <button
                              type="button"
                              onClick={() => onNavigate({ view: 'member_view', memberId: m.id })}
                              className="font-semibold text-neutral-900 hover:text-orange-600 text-left"
                            >
                              {m.full_name}
                            </button>
                            <div className="text-xs font-mono tabular-nums text-neutral-500">
                              {m.member_code}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-mono tabular-nums text-xs text-neutral-800">{m.phone}</div>
                        {m.email && <div className="text-xs text-neutral-500">{m.email}</div>}
                      </td>

                      <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                        {m.plan_name || 'Unassigned'}
                      </td>

                      <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-700 whitespace-nowrap">
                        {formatDisplayDate(m.membership_expiry_date)}
                      </td>

                      <td className="px-4 py-3">
                        <MemberStatusLabel status={m.display_status} daysLeft={m.days_until_expiry} />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Send WhatsApp reminder to ${m.full_name}`}
                              title="Open WhatsApp reminder"
                              className="p-1.5 rounded-md border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onNavigate({ view: 'member_view', memberId: m.id })}
                            className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 whitespace-nowrap shrink-0"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate({ view: 'member_edit', memberId: m.id })}
                            className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 whitespace-nowrap shrink-0"
                          >
                            Edit
                          </button>
                          {m.status !== 'Inactive' ? (
                            <button
                              type="button"
                              onClick={() => setConfirmTarget({ member: m, action: 'deactivate' })}
                              className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-medium text-neutral-600 whitespace-nowrap shrink-0"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => executeStatusChange(m.id, 'reactivate')}
                                className="px-2.5 py-1.5 rounded-md border border-emerald-300 bg-white hover:bg-emerald-50 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0"
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${m.full_name}`}
                                onClick={() => setConfirmTarget({ member: m, action: 'delete' })}
                                className="p-1.5 rounded-md border border-red-200 bg-white hover:bg-red-50 text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-neutral-200 flex items-center justify-between gap-2 text-xs text-neutral-600">
            <span>
              Page <strong className="font-mono tabular-nums">{page}</strong> of{' '}
              <strong className="font-mono tabular-nums">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-md border border-neutral-300 bg-white disabled:opacity-40 font-medium whitespace-nowrap"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-md border border-neutral-300 bg-white disabled:opacity-40 font-medium whitespace-nowrap"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={
          confirmTarget?.action === 'delete'
            ? `Delete ${confirmTarget.member.full_name}?`
            : `Deactivate ${confirmTarget?.member.full_name}?`
        }
        description={
          confirmTarget?.action === 'delete'
            ? 'Members with existing payment records cannot be permanently deleted so your financial ledger stays intact. Only test records without payments will be removed.'
            : 'Deactivating pauses gym access while preserving 100% of this member’s payment receipts, attendance, and membership history.'
        }
        confirmLabel={confirmTarget?.action === 'delete' ? 'Delete Permanently' : 'Deactivate Member'}
        busy={confirmBusy}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) {
            executeStatusChange(confirmTarget.member.id, confirmTarget.action);
          }
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// 2. Add / Edit Member Form View (member_add.php & member_edit.php)
// ----------------------------------------------------------------------------
export function MemberFormView({
  editMemberId,
  settings,
  onNavigate,
  onNotify,
}: {
  editMemberId?: number;
  settings: GymSettings;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [memberCode, setMemberCode] = useState('GYM-...');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [joiningDate, setJoiningDate] = useState(today);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState<StoredMemberStatus>('Active');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest<{ plans: MembershipPlan[] }>('/api/plans'),
      editMemberId
        ? apiRequest<{ member: MemberRow }>(`/api/members/${editMemberId}`)
        : apiRequest<{ nextMemberCode: string }>('/api/members?perPage=1'),
    ])
      .then(([plansRes, memberOrNext]) => {
        const activeOrAll = editMemberId
          ? plansRes.plans
          : plansRes.plans.filter((p) => p.is_active === 1);
        setPlans(activeOrAll);

        if ('member' in memberOrNext) {
          const m = memberOrNext.member;
          setMemberCode(m.member_code);
          setFullName(m.full_name);
          setPhone(m.phone);
          setEmail(m.email || '');
          setGender(m.gender || '');
          setDob(m.date_of_birth || '');
          setJoiningDate(m.joining_date);
          setEmergencyContact(m.emergency_contact || '');
          setAddress(m.address || '');
          setNotes(m.notes || '');
          setPlanId(m.plan_id ? String(m.plan_id) : '');
          setStartDate(m.membership_start_date || today);
          setExpiryDate(m.membership_expiry_date || '');
          setStatus(m.status);
          setExistingPhoto(m.photo_path);
        } else {
          setMemberCode(memberOrNext.nextMemberCode);
          if (activeOrAll.length > 0) {
            const first = activeOrAll[0];
            setPlanId(String(first.id));
            setExpiryDate(calculatePlanExpiryDate(today, first.duration_days));
          }
        }
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load form options.');
      });
  }, [editMemberId, today, onNotify]);

  function handlePlanChange(newPlanId: string, baseStart = startDate) {
    setPlanId(newPlanId);
    const found = plans.find((p) => String(p.id) === newPlanId);
    if (found && baseStart) {
      setExpiryDate(calculatePlanExpiryDate(baseStart, found.duration_days));
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoDataUrl(null);
      return;
    }
    try {
      const url = await readImageFileAsDataUrl(file);
      setPhotoDataUrl(url);
      setErrors([]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Invalid image file.']);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSaving(true);
    try {
      const payload = {
        full_name: fullName,
        phone,
        email,
        gender,
        date_of_birth: dob,
        joining_date: joiningDate,
        emergency_contact: emergencyContact,
        address,
        notes,
        plan_id: planId ? Number(planId) : null,
        membership_start_date: planId ? startDate : null,
        membership_expiry_date: planId ? expiryDate : null,
        status,
        photo_data_url: photoDataUrl,
        remove_photo: removePhoto,
      };

      if (editMemberId) {
        await apiRequest(`/api/members/${editMemberId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify('success', 'Member profile updated.');
        onNavigate({ view: 'member_view', memberId: editMemberId });
      } else {
        const res = await apiRequest<{ id: number; member_code: string }>('/api/members', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify(
          'success',
          `Member ${fullName} (${res.member_code}) registered. Use Record Payment when collecting their fee.`
        );
        onNavigate({ view: 'member_view', memberId: res.id });
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Unable to save member.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {editMemberId ? `Edit Member — ${fullName || memberCode}` : 'Register New Member'}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {editMemberId
              ? 'Update contact details, plan validity, or status.'
              : 'Assign a unique Member ID and optional initial plan. Payments are recorded explicitly in Payments.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            editMemberId
              ? onNavigate({ view: 'member_view', memberId: editMemberId })
              : onNavigate({ view: 'members' })
          }
          className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
          <ul className="list-disc pl-5 space-y-1">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6" noValidate>
        <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-neutral-900 pb-3 border-b border-neutral-200">
            Personal &amp; Contact Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-4">
              <label htmlFor="m_code" className="block text-xs font-semibold text-neutral-600 mb-1">
                Member ID
              </label>
              <input
                id="m_code"
                type="text"
                readOnly
                value={memberCode}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-mono tabular-nums text-neutral-700"
              />
            </div>

            <div className="sm:col-span-8">
              <label htmlFor="m_name" className="block text-xs font-semibold text-neutral-700 mb-1">
                Full Name *
              </label>
              <input
                id="m_name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rohan Kulkarni"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="m_phone" className="block text-xs font-semibold text-neutral-700 mb-1">
                Phone Number *
              </label>
              <input
                id="m_phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="m_email" className="block text-xs font-semibold text-neutral-700 mb-1">
                Email Address
              </label>
              <input
                id="m_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="m_gender" className="block text-xs font-semibold text-neutral-700 mb-1">
                Gender
              </label>
              <select
                id="m_gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              >
                <option value="">Optional...</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="m_dob" className="block text-xs font-semibold text-neutral-700 mb-1">
                Date of Birth
              </label>
              <input
                id="m_dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="m_join" className="block text-xs font-semibold text-neutral-700 mb-1">
                Joining Date *
              </label>
              <input
                id="m_join"
                type="date"
                required
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="m_emergency" className="block text-xs font-semibold text-neutral-700 mb-1">
                Emergency Contact
              </label>
              <input
                id="m_emergency"
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Name & phone number"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="m_photo" className="block text-xs font-semibold text-neutral-700 mb-1">
                Profile Photo (JPG/PNG/WEBP, max 2 MB)
              </label>
              <input
                id="m_photo"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="w-full text-xs text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-neutral-300 file:bg-neutral-50 file:text-xs file:font-medium"
              />
              {existingPhoto && !photoDataUrl && (
                <label className="mt-1.5 inline-flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={removePhoto}
                    onChange={(e) => setRemovePhoto(e.target.checked)}
                  />
                  <span>Remove current photo</span>
                </label>
              )}
            </div>

            <div className="sm:col-span-12">
              <label htmlFor="m_address" className="block text-xs font-semibold text-neutral-700 mb-1">
                Residential Address
              </label>
              <textarea
                id="m_address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-12">
              <label htmlFor="m_notes" className="block text-xs font-semibold text-neutral-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                id="m_notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Fitness goals, medical considerations, locker number..."
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl p-6 space-y-4 h-fit">
          <h2 className="text-sm font-bold text-neutral-900 pb-3 border-b border-neutral-200">
            Membership Assignment
          </h2>

          <div>
            <label htmlFor="m_plan" className="block text-xs font-semibold text-neutral-700 mb-1">
              Membership Plan
            </label>
            <select
              id="m_plan"
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
            >
              <option value="">-- Unassigned --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plan_name} — {formatCurrency(p.price, settings.currency_symbol)} ({p.duration_days}d)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="m_start" className="block text-xs font-semibold text-neutral-700 mb-1">
              Membership Start Date
            </label>
            <input
              id="m_start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                handlePlanChange(planId, e.target.value);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="m_expiry" className="block text-xs font-semibold text-neutral-700 mb-1">
              Membership Expiry Date
            </label>
            <input
              id="m_expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="m_status" className="block text-xs font-semibold text-neutral-700 mb-1">
              Membership Status
            </label>
            <select
              id="m_status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StoredMemberStatus)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
            >
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            {saving ? 'Saving...' : editMemberId ? 'Save Changes' : 'Save Member Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. Member Profile Detail View (member_view.php)
// ----------------------------------------------------------------------------
export function MemberProfileView({
  memberId,
  settings,
  onNavigate,
  onNotify,
}: {
  memberId: number;
  settings: GymSettings;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [member, setMember] = useState<MemberRow | null>(null);
  const [membershipHistory, setMembershipHistory] = useState<MembershipHistoryRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [balanceDue, setBalanceDue] = useState(0);
  const [totalAttendance, setTotalAttendance] = useState(0);
  const [activePlans, setActivePlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Renew / Extend form state
  const [actionType, setActionType] = useState<MembershipActionType>('Renewal');
  const [renewPlanId, setRenewPlanId] = useState('');
  const [renewStart, setRenewStart] = useState('');
  const [renewExpiry, setRenewExpiry] = useState('');
  const [renewNotes, setRenewNotes] = useState('');
  const [renewBusy, setRenewBusy] = useState(false);

  // Member Portal Credentials modal state
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credBusy, setCredBusy] = useState(false);

  const loadProfile = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiRequest<{
        member: MemberRow;
        membershipHistory: MembershipHistoryRow[];
        payments: PaymentRow[];
        totalPaid: number;
        balanceDue: number;
        totalAttendance: number;
        attendanceRows: AttendanceRow[];
      }>(`/api/members/${memberId}`),
      apiRequest<{ plans: MembershipPlan[] }>('/api/plans'),
    ])
      .then(([prof, plansRes]) => {
        setMember(prof.member);
        setMembershipHistory(prof.membershipHistory);
        setPayments(prof.payments);
        setTotalPaid(prof.totalPaid);
        setBalanceDue(prof.balanceDue);
        setTotalAttendance(prof.totalAttendance);
        setAttendanceRows(prof.attendanceRows);

        const active = plansRes.plans.filter((p) => p.is_active === 1);
        setActivePlans(active);

        const today = new Date().toISOString().slice(0, 10);
        const smartStart =
          prof.member.membership_expiry_date && prof.member.membership_expiry_date >= today
            ? calculatePlanExpiryDate(prof.member.membership_expiry_date, 1)
            : today;
        setRenewStart(smartStart);

        const preferred =
          active.find((p) => p.id === prof.member.plan_id) || active[0];
        if (preferred) {
          setRenewPlanId(String(preferred.id));
          setRenewExpiry(calculatePlanExpiryDate(smartStart, preferred.duration_days));
        }
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load member profile.');
      })
      .finally(() => setLoading(false));
  }, [memberId, onNotify]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleRenewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRenewBusy(true);
    try {
      await apiRequest(`/api/members/${memberId}/renew`, {
        method: 'POST',
        body: JSON.stringify({
          action_type: actionType,
          plan_id: Number(renewPlanId),
          start_date: renewStart,
          expiry_date: renewExpiry,
          notes: renewNotes,
        }),
      });
      onNotify(
        'success',
        `${actionType} applied through ${formatDisplayDate(renewExpiry)}. Record payment in Payments if collected.`
      );
      setRenewNotes('');
      loadProfile();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to update membership.');
    } finally {
      setRenewBusy(false);
    }
  }

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(
        `/api/v1/owner/members/${memberId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify({ email: credEmail, password: credPassword }),
        }
      );
      onNotify('success', res.message);
      setCredModalOpen(false);
      setCredPassword('');
      loadProfile();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to save Member Portal credentials.');
    } finally {
      setCredBusy(false);
    }
  }

  if (loading || !member) {
    return (
      <div className="p-8 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-500">
        Loading member profile...
      </div>
    );
  }

  const symbol = settings.currency_symbol || '₹';
  const isExpired = member.display_status === 'Expired';
  const isExpiring = member.display_status === 'ExpiringSoon';
  const waUrl = buildWhatsAppReminderUrl({
    phone: member.phone,
    memberName: member.full_name,
    gymName: settings.gym_name,
    expiryDate: member.membership_expiry_date,
    isExpired,
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div
        className={`rounded-xl border p-6 ${
          member.display_status === 'Inactive'
            ? 'bg-white border-neutral-200'
            : isExpired
              ? 'bg-red-50/70 border-red-200'
              : isExpiring
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-white border-neutral-200'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            {member.photo_path ? (
              <img
                src={member.photo_path}
                alt={member.full_name}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border border-neutral-200 shrink-0"
              />
            ) : (
              <span className="w-16 h-16 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-800 text-xl font-bold flex items-center justify-center shrink-0">
                {member.full_name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="text-xl font-bold text-neutral-900">{member.full_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                <span className="font-mono tabular-nums font-semibold text-neutral-900">
                  {member.member_code}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{member.phone}</span>
                <span aria-hidden="true">·</span>
                <span>Joined {formatDisplayDate(member.joining_date)}</span>
                <span aria-hidden="true">·</span>
                <MemberStatusLabel status={member.display_status} daysLeft={member.days_until_expiry} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>WhatsApp Reminder</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => onNavigate({ view: 'payment_add', preselectedMemberId: member.id })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <CreditCard className="w-4 h-4" aria-hidden="true" />
              <span>Record Payment</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'attendance', preselectedMemberId: member.id })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <CalendarCheck className="w-4 h-4" aria-hidden="true" />
              <span>Mark Check-In</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'id_cards', preselectedMemberId: member.id })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <IdCard className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span>ID Card / QR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCredEmail(member.email || '');
                setCredPassword('');
                setCredModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-4 h-4 text-neutral-600" aria-hidden="true" />
              <span>{member.has_portal_login ? 'Reset Portal Login' : 'Enable Portal Login'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'member_edit', memberId: member.id })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Edit</span>
            </button>
          </div>
        </div>
      </div>

      {credModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="member_portal_cred_title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="member_portal_cred_title" className="text-base font-bold text-neutral-900">
                  Member Self-Service Portal Login
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Assign email &amp; password so {member.full_name} can view their QR pass, receipts, and renew online at{' '}
                  <span className="font-mono">/member/login</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCredModalOpen(false)}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSaveCredentials} className="space-y-3">
              <div>
                <label htmlFor="cred_email" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Member Login Email *
                </label>
                <input
                  id="cred_email"
                  type="email"
                  required
                  value={credEmail}
                  onChange={(e) => setCredEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="cred_pass" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Portal Password *
                </label>
                <input
                  id="cred_pass"
                  type="password"
                  required
                  minLength={8}
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  placeholder="Min 8 chars, letters & numbers"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCredModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={credBusy}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {credBusy ? 'Saving...' : 'Save Member Login'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Details + Renew/Extend Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 text-sm">
            <h2 className="text-sm font-bold text-neutral-900 pb-2.5 border-b border-neutral-200">
              Profile Details
            </h2>
            <div>
              <div className="text-xs text-neutral-500">Current Plan</div>
              <div className="font-semibold text-neutral-900">{member.plan_name || 'Unassigned'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Plan Validity</div>
              <div className="font-mono tabular-nums text-xs text-neutral-800">
                {formatDisplayDate(member.membership_start_date)} →{' '}
                {formatDisplayDate(member.membership_expiry_date)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Email</div>
              <div className="text-neutral-800">{member.email || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Gender · DOB</div>
              <div className="text-neutral-800">
                {member.gender || '—'} · {formatDisplayDate(member.date_of_birth)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Emergency Contact</div>
              <div className="text-neutral-800">{member.emergency_contact || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Address</div>
              <div className="text-neutral-800">{member.address || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Notes</div>
              <div className="text-neutral-800">{member.notes || '—'}</div>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-neutral-900 pb-3 border-b border-neutral-200">
              Renew or Extend Membership
            </h2>
            <form onSubmit={handleRenewSubmit} className="mt-3 space-y-3">
              <div>
                <label htmlFor="rn_action" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Action Type
                </label>
                <select
                  id="rn_action"
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as MembershipActionType)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="Renewal">Renew Membership</option>
                  <option value="Extension">Extend Expiry Date</option>
                  <option value="Plan Change">Switch Plan</option>
                </select>
              </div>

              <div>
                <label htmlFor="rn_plan" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Plan
                </label>
                <select
                  id="rn_plan"
                  value={renewPlanId}
                  onChange={(e) => {
                    setRenewPlanId(e.target.value);
                    const found = activePlans.find((p) => String(p.id) === e.target.value);
                    if (found && renewStart) {
                      setRenewExpiry(calculatePlanExpiryDate(renewStart, found.duration_days));
                    }
                  }}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
                >
                  {activePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plan_name} — {formatCurrency(p.price, symbol)} ({p.duration_days}d)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="rn_start" className="block text-xs font-semibold text-neutral-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="rn_start"
                    type="date"
                    required
                    value={renewStart}
                    onChange={(e) => {
                      setRenewStart(e.target.value);
                      const found = activePlans.find((p) => String(p.id) === renewPlanId);
                      if (found && e.target.value) {
                        setRenewExpiry(calculatePlanExpiryDate(e.target.value, found.duration_days));
                      }
                    }}
                    className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="rn_expiry" className="block text-xs font-semibold text-neutral-700 mb-1">
                    New Expiry
                  </label>
                  <input
                    id="rn_expiry"
                    type="date"
                    required
                    value={renewExpiry}
                    onChange={(e) => setRenewExpiry(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="rn_notes" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Notes
                </label>
                <input
                  id="rn_notes"
                  type="text"
                  value={renewNotes}
                  onChange={(e) => setRenewNotes(e.target.value)}
                  placeholder="Optional renewal note..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={renewBusy}
                className="w-full py-2 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {renewBusy ? 'Updating...' : 'Apply Membership Update'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Stats + Payment History + Membership History + Attendance */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="text-xs text-neutral-500">Total Paid</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-neutral-900">
                {formatCurrency(totalPaid, symbol)}
              </div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="text-xs text-neutral-500">Outstanding Balance</div>
              <div
                className={`mt-1 text-xl font-bold font-mono tabular-nums ${
                  balanceDue > 0 ? 'text-red-600' : 'text-neutral-900'
                }`}
              >
                {formatCurrency(balanceDue, symbol)}
              </div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="text-xs text-neutral-500">Total Check-Ins</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-neutral-900">
                {totalAttendance}
              </div>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900">Payment History</h2>
              <button
                type="button"
                onClick={() => onNavigate({ view: 'payment_add', preselectedMemberId: member.id })}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap"
              >
                + Record Payment
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                    <th className="px-4 py-2.5">Receipt</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-xs text-neutral-500">
                        No payments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    payments.map((py) => (
                      <tr key={py.id}>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-xs font-semibold">
                          {py.receipt_number}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-xs text-neutral-600">
                          {formatDisplayDate(py.payment_date)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-700">{py.payment_method}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs font-semibold">
                          {formatCurrency(py.amount, symbol)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono tabular-nums text-xs ${
                            py.balance_due > 0 ? 'text-red-600 font-semibold' : 'text-neutral-400'
                          }`}
                        >
                          {formatCurrency(py.balance_due, symbol)}
                        </td>
                        <td className="px-4 py-2.5">
                          <PaymentStatusLabel status={py.payment_status} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onNavigate({ view: 'receipt', paymentId: py.id })}
                            className="px-2.5 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium"
                          >
                            Receipt
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Membership History */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200">
              <h2 className="text-sm font-bold text-neutral-900">Membership History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                    <th className="px-4 py-2.5">Plan</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Start</th>
                    <th className="px-4 py-2.5">Expiry</th>
                    <th className="px-4 py-2.5 text-right">Plan Fee</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {membershipHistory.map((mh) => (
                    <tr key={mh.id}>
                      <td className="px-4 py-2.5 font-medium text-neutral-900">
                        {mh.plan_name_snapshot}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-600">{mh.action_type}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-xs text-neutral-600">
                        {formatDisplayDate(mh.start_date)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-xs text-neutral-600">
                        {formatDisplayDate(mh.expiry_date)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs">
                        {formatCurrency(mh.plan_price_snapshot, symbol)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-neutral-700">{mh.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Attendance */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900">Recent Check-Ins</h2>
              <button
                type="button"
                onClick={() => onNavigate({ view: 'attendance', searchQuery: member.member_code })}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap"
              >
                Full Attendance Log
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Check-In Time</th>
                    <th className="px-4 py-2.5">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {attendanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-xs text-neutral-500">
                        No check-ins recorded yet.
                      </td>
                    </tr>
                  ) : (
                    attendanceRows.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-xs">
                          {formatDisplayDate(a.attendance_date)}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-xs font-semibold">
                          {a.check_in_time.slice(0, 5)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-600">{a.remarks || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

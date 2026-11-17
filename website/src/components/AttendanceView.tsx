import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CalendarCheck, Camera, CameraOff, Keyboard, Pencil, QrCode, Trash2 } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { formatDisplayDate } from '../utils/gymRules';
import type { ActiveScreen, AttendanceRow } from '../types/gym';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusIndicator } from './StatusIndicator';

interface AttendanceMemberOption {
  id: number;
  member_code: string;
  full_name: string;
  status: string;
  photo_path?: string | null;
}

interface VerifiedMemberPreview {
  id: number;
  full_name: string;
  member_code: string;
  photo_path: string | null;
  status: string;
  membership_expiry_date?: string | null;
  plan_name?: string | null;
  warning?: string;
}

export function AttendanceView({
  preselectedMemberId,
  initialSearch = '',
  onNavigate,
  onNotify,
}: {
  preselectedMemberId?: number;
  initialSearch?: string;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const now = new Date();
  const defaultDate = now.toISOString().slice(0, 10);
  const defaultHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [todayCount, setTodayCount] = useState(0);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [membersList, setMembersList] = useState<AttendanceMemberOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Check-in mode: qr | keyboard | manual
  const [mode, setMode] = useState<'qr' | 'keyboard' | 'manual'>('qr');
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [keyboardCodeInput, setKeyboardCodeInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [lastVerified, setLastVerified] = useState<VerifiedMemberPreview | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  // Filter state
  const [search, setSearch] = useState(initialSearch);
  const [from, setFrom] = useState(initialSearch ? '' : defaultDate);
  const [to, setTo] = useState(initialSearch ? '' : defaultDate);

  // Manual Check-in form state
  const [memberId, setMemberId] = useState(preselectedMemberId ? String(preselectedMemberId) : '');
  const [attDate, setAttDate] = useState(defaultDate);
  const [checkInTime, setCheckInTime] = useState(defaultHm);
  const [remarks, setRemarks] = useState('');
  const [checkInError, setCheckInError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Admin correction state
  const [editingRow, setEditingRow] = useState<AttendanceRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRow | null>(null);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const loadAttendance = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      q: search,
      from,
      to,
    });
    apiRequest<{
      today: string;
      todayCount: number;
      rows: AttendanceRow[];
      membersList: AttendanceMemberOption[];
    }>(`/api/attendance?${qs.toString()}`)
      .then((res) => {
        setTodayCount(res.todayCount);
        setRows(res.rows);
        setMembersList(res.membersList);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load attendance.');
      })
      .finally(() => setLoading(false));
  }, [search, from, to, onNotify]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const submitQrToken = useCallback(
    async (rawToken: string) => {
      const token = rawToken.trim();
      if (!token) return;
      setCheckInError('');
      setSubmitting(true);
      try {
        const res = await apiRequest<{
          ok: boolean;
          member: VerifiedMemberPreview;
          warning?: string;
        }>('/api/v1/owner/attendance/qr-scan', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        setLastVerified({ ...res.member, warning: res.warning });
        setQrTokenInput('');
        onNotify('success', `QR verified & checked in: ${res.member.full_name} (${res.member.member_code}).`);
        loadAttendance();
      } catch (err) {
        setCheckInError(err instanceof Error ? err.message : 'QR verification failed.');
      } finally {
        setSubmitting(false);
      }
    },
    [loadAttendance, onNotify]
  );

  async function startCameraScanner() {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API unavailable in this browser. Paste a QR token below to verify.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scanTimerRef.current = window.setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const decoded = jsQR(imgData.data, w, h);
        if (decoded?.data) {
          stopCamera();
          void submitQrToken(decoded.data);
        }
      }, 300);
    } catch {
      setCameraError('Camera permission denied or no webcam found. Use the QR token input below.');
      stopCamera();
    }
  }

  async function handleKeyboardCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setCheckInError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; member: VerifiedMemberPreview }>(
        '/api/v1/owner/attendance/keyboard',
        {
          method: 'POST',
          body: JSON.stringify({ member_code: keyboardCodeInput }),
        }
      );
      setLastVerified(res.member);
      setKeyboardCodeInput('');
      onNotify('success', `Checked in via Member Code: ${res.member.full_name} (${res.member.member_code}).`);
      loadAttendance();
    } catch (err) {
      setCheckInError(err instanceof Error ? err.message : 'Member code check-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setCheckInError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          member_id: Number(memberId),
          attendance_date: attDate,
          check_in_time: checkInTime,
          remarks,
        }),
      });
      onNotify('success', 'Member check-in recorded.');
      setRemarks('');
      loadAttendance();
    } catch (err) {
      setCheckInError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: AttendanceRow) {
    setEditingRow(row);
    setEditDate(row.attendance_date);
    setEditIn(row.check_in_time.slice(0, 5));
    setEditOut(row.check_out_time ? row.check_out_time.slice(0, 5) : '');
    setEditRemarks(row.remarks || '');
  }

  async function handleSaveCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;
    try {
      await apiRequest(`/api/attendance/${editingRow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          attendance_date: editDate,
          check_in_time: editIn,
          check_out_time: editOut,
          remarks: editRemarks,
        }),
      });
      onNotify('success', 'Attendance record corrected.');
      setEditingRow(null);
      loadAttendance();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Correction failed.');
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/attendance/${deleteTarget.id}`, { method: 'DELETE' });
      onNotify('success', 'Attendance record removed.');
      setDeleteTarget(null);
      loadAttendance();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to delete record.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">QR &amp; Front-Desk Attendance</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Scan revocable QR ID cards, enter Member ID via keyboard, or select members manually with photo confirmation.
          </p>
        </div>
        <div className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-neutral-500">Today&apos;s Check-Ins</span>
          <span className="text-xl font-bold font-mono tabular-nums text-neutral-900">{todayCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Multi-mode Check-In Desk */}
        <div className="lg:col-span-4 space-y-6">
          {lastVerified && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3.5">
              {lastVerified.photo_path ? (
                <img
                  src={lastVerified.photo_path}
                  alt={lastVerified.full_name}
                  className="w-14 h-14 rounded-xl object-cover border border-emerald-300 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
                  {lastVerified.full_name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 text-xs">
                <div className="font-bold text-emerald-950 truncate">{lastVerified.full_name}</div>
                <div className="font-mono text-emerald-800">{lastVerified.member_code}</div>
                <div className="text-emerald-700 mt-0.5">
                  {lastVerified.plan_name || 'Verified Member'} · Exp: {lastVerified.membership_expiry_date || '—'}
                </div>
                {lastVerified.warning && <div className="text-amber-700 font-semibold mt-1">{lastVerified.warning}</div>}
              </div>
            </div>
          )}

          {editingRow && (
            <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200">
                <h2 className="text-sm font-bold text-neutral-900">Correct Attendance Entry</h2>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="text-xs text-neutral-500 hover:text-neutral-900"
                >
                  Cancel
                </button>
              </div>
              <div className="text-xs text-neutral-600">
                Member: <strong className="text-neutral-900">{editingRow.full_name}</strong> ({editingRow.member_code})
              </div>
              <form onSubmit={handleSaveCorrection} className="space-y-3">
                <div>
                  <label htmlFor="ed_att_date" className="block text-xs font-semibold text-neutral-700 mb-1">
                    Date
                  </label>
                  <input
                    id="ed_att_date"
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="ed_att_in" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Check-In
                    </label>
                    <input
                      id="ed_att_in"
                      type="time"
                      required
                      value={editIn}
                      onChange={(e) => setEditIn(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="ed_att_out" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Check-Out
                    </label>
                    <input
                      id="ed_att_out"
                      type="time"
                      value={editOut}
                      onChange={(e) => setEditOut(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ed_att_rem" className="block text-xs font-semibold text-neutral-700 mb-1">
                    Remarks
                  </label>
                  <input
                    id="ed_att_rem"
                    type="text"
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold"
                >
                  Save Correction
                </button>
              </form>
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-neutral-100 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('qr');
                  setCheckInError('');
                }}
                className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
                  mode === 'qr' ? 'bg-[#0c0e12] text-white' : 'text-neutral-600'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR Scan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode('keyboard');
                  setCheckInError('');
                }}
                className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
                  mode === 'keyboard' ? 'bg-[#0c0e12] text-white' : 'text-neutral-600'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Code</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode('manual');
                  setCheckInError('');
                }}
                className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
                  mode === 'manual' ? 'bg-[#0c0e12] text-white' : 'text-neutral-600'
                }`}
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>Select</span>
              </button>
            </div>

            {checkInError && (
              <div
                className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800"
                role="alert"
              >
                {checkInError}
              </div>
            )}

            {mode === 'qr' && (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-neutral-200 bg-neutral-950 overflow-hidden">
                  {cameraActive ? (
                    <div className="relative">
                      <video ref={videoRef} className="w-full aspect-video object-cover" muted playsInline />
                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center text-xs text-neutral-400 space-y-2">
                      <QrCode className="w-8 h-8 mx-auto text-orange-500" />
                      <div>Point webcam or mobile camera at member&apos;s QR pass, or scan with USB QR reader below.</div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {!cameraActive ? (
                    <button
                      type="button"
                      onClick={() => void startCameraScanner()}
                      className="w-full py-2 px-3 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 inline-flex items-center justify-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5 text-orange-600" />
                      <span>Start Camera QR Scanner</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="w-full py-2 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <CameraOff className="w-3.5 h-3.5" />
                      <span>Stop Camera</span>
                    </button>
                  )}
                </div>

                {cameraError && <div className="text-[11px] text-amber-700">{cameraError}</div>}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitQrToken(qrTokenInput);
                  }}
                  className="space-y-2 pt-2 border-t border-neutral-100"
                >
                  <label htmlFor="qr_token_input" className="block text-xs font-semibold text-neutral-700">
                    USB Scanner / Paste QR Token
                  </label>
                  <input
                    id="qr_token_input"
                    type="text"
                    required
                    value={qrTokenInput}
                    onChange={(e) => setQrTokenInput(e.target.value)}
                    placeholder="HMNQR_..."
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !qrTokenInput.trim()}
                    className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {submitting ? 'Verifying...' : 'Verify QR & Check In'}
                  </button>
                </form>
              </div>
            )}

            {mode === 'keyboard' && (
              <form onSubmit={handleKeyboardCheckIn} className="space-y-3.5">
                <div>
                  <label htmlFor="kb_code" className="block text-xs font-semibold text-neutral-700 mb-1">
                    Member ID Code or Phone Number *
                  </label>
                  <input
                    id="kb_code"
                    type="text"
                    required
                    value={keyboardCodeInput}
                    onChange={(e) => setKeyboardCodeInput(e.target.value)}
                    placeholder="e.g. GYM-2026-0001 or phone"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !keyboardCodeInput.trim()}
                  className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Checking In...' : 'Check In by Member Code'}
                </button>
              </form>
            )}

            {mode === 'manual' && (
              <form onSubmit={handleCheckIn} className="space-y-3.5" noValidate>
                <div>
                  <label htmlFor="att_member" className="block text-xs font-semibold text-neutral-700 mb-1">
                    Select Member *
                  </label>
                  <select
                    id="att_member"
                    required
                    value={memberId}
                    onChange={(e) => {
                      setMemberId(e.target.value);
                      setCheckInError('');
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-orange-600 focus:outline-none"
                  >
                    <option value="">-- Choose Member --</option>
                    {membersList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} ({m.member_code}
                        {m.status === 'Expired' ? ' - Expired' : ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="att_date" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Date *
                    </label>
                    <input
                      id="att_date"
                      type="date"
                      required
                      value={attDate}
                      onChange={(e) => setAttDate(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="att_time" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Time *
                    </label>
                    <input
                      id="att_time"
                      type="time"
                      required
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="att_remarks" className="block text-xs font-semibold text-neutral-700 mb-1">
                    Remarks (Optional)
                  </label>
                  <input
                    id="att_remarks"
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Morning strength session..."
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <CalendarCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{submitting ? 'Recording...' : 'Record Check-In'}</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Filter & Attendance History */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label htmlFor="att_q" className="block text-xs font-medium text-neutral-500 mb-1">
                  Search Member Name, ID, or Phone
                </label>
                <input
                  id="att_q"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by member..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="att_from" className="block text-xs font-medium text-neutral-500 mb-1">
                  From Date
                </label>
                <input
                  id="att_from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="att_to" className="block text-xs font-medium text-neutral-500 mb-1">
                  To Date
                </label>
                <input
                  id="att_to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
              <div className="sm:col-span-1">
                <button
                  type="button"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                  }}
                  title="Show all dates"
                  className="w-full py-1.5 px-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 whitespace-nowrap"
                >
                  All
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900">Attendance Log ({rows.length} entries)</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Check-In</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Remarks</th>
                    <th className="px-4 py-3 text-right">Correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">
                        Loading attendance...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                        No attendance entries found for the selected date range.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-50/80">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onNavigate({ view: 'member_view', memberId: r.member_id })}
                            className="font-semibold text-neutral-900 hover:text-orange-600 text-left"
                          >
                            {r.full_name}
                          </button>
                          <div className="text-xs font-mono tabular-nums text-neutral-500">{r.member_code}</div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-xs text-neutral-700 whitespace-nowrap">
                          {formatDisplayDate(r.attendance_date)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-xs font-semibold text-neutral-900">
                          {r.check_in_time.slice(0, 5)}
                          {r.check_out_time ? ` → ${r.check_out_time.slice(0, 5)}` : ''}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <StatusIndicator status={r.check_in_method || 'Manual'} />
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-600">{r.remarks || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`Edit attendance for ${r.full_name}`}
                              onClick={() => startEdit(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700"
                            >
                              <Pencil className="w-3 h-3" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove attendance for ${r.full_name}`}
                              onClick={() => setDeleteTarget(r)}
                              className="p-1.5 rounded border border-red-200 bg-white hover:bg-red-50 text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Check-In Record?"
        description={
          deleteTarget
            ? `Remove attendance entry for ${deleteTarget.full_name} on ${formatDisplayDate(deleteTarget.attendance_date)}?`
            : ''
        }
        confirmLabel="Remove Entry"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

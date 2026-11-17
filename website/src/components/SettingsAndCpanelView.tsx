import React, { useEffect, useState } from 'react';
import { Check, Copy, CreditCard, Download, FileCode2, KeyRound, ShieldCheck } from 'lucide-react';
import { apiRequest, readImageFileAsDataUrl } from '../utils/api';
import type { ActiveScreen, AdminUser, GymPaymentGatewayPublic, GymSettings } from '../types/gym';
import type { GatewayProvider } from '../utils/saasRules';

// ----------------------------------------------------------------------------
// 1. Settings View (settings.php + Per-Gym Encrypted Payment Gateway)
// ----------------------------------------------------------------------------
export function SettingsView({
  settings,
  admin,
  onSettingsUpdated,
  onAdminUpdated,
  onNavigate,
  onNotify,
}: {
  settings: GymSettings;
  admin: AdminUser;
  onSettingsUpdated: (s: GymSettings) => void;
  onAdminUpdated: (a: AdminUser) => void;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [gymName, setGymName] = useState(settings.gym_name);
  const [currencyCode, setCurrencyCode] = useState(settings.currency_code);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currency_symbol);
  const [contactNumber, setContactNumber] = useState(settings.contact_number || '');
  const [email, setEmail] = useState(settings.email || '');
  const [address, setAddress] = useState(settings.address || '');
  const [receiptFooter, setReceiptFooter] = useState(settings.receipt_footer || '');
  const [operatingHours, setOperatingHours] = useState(settings.operating_hours || '05:30 AM - 10:00 PM');
  const [idAccent, setIdAccent] = useState(settings.id_card_accent_color || '#ea580c');
  const [qrEnabled, setQrEnabled] = useState(settings.qr_attendance_enabled !== 0);
  const [photoVerify, setPhotoVerify] = useState(settings.require_photo_verify !== 0);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [savingGym, setSavingGym] = useState(false);

  const [adminName, setAdminName] = useState(admin.full_name);
  const [adminEmail, setAdminEmail] = useState(admin.email);
  const [savingProfile, setSavingProfile] = useState(false);

  // Per-Gym Encrypted Gateway state
  const [gateway, setGateway] = useState<GymPaymentGatewayPublic | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [gwProvider, setGwProvider] = useState<GatewayProvider>('razorpay');
  const [gwKeyId, setGwKeyId] = useState('');
  const [gwSecret, setGwSecret] = useState('');
  const [gwWebhookSecret, setGwWebhookSecret] = useState('');
  const [gwMode, setGwMode] = useState<'test' | 'live'>('test');
  const [gwEnabled, setGwEnabled] = useState(true);
  const [gwAutoActivate, setGwAutoActivate] = useState(true);
  const [savingGw, setSavingGw] = useState(false);

  useEffect(() => {
    apiRequest<{ gateway: GymPaymentGatewayPublic | null; webhookUrl: string }>('/api/v1/owner/gateway')
      .then((res) => {
        setGateway(res.gateway);
        setWebhookUrl(res.webhookUrl);
        if (res.gateway) {
          setGwProvider(res.gateway.provider);
          setGwKeyId(res.gateway.merchant_key_id || '');
          setGwMode(res.gateway.mode);
          setGwEnabled(Boolean(res.gateway.is_enabled));
          setGwAutoActivate(Boolean(res.gateway.auto_activate_membership));
        }
      })
      .catch(() => {});
  }, []);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoDataUrl(null);
      return;
    }
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setLogoDataUrl(dataUrl);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Invalid logo image.');
    }
  }

  async function handleSaveGym(e: React.FormEvent) {
    e.preventDefault();
    setSavingGym(true);
    try {
      const res = await apiRequest<{ ok: boolean; settings: GymSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          gym_name: gymName,
          currency_code: currencyCode,
          currency_symbol: currencySymbol,
          contact_number: contactNumber,
          email,
          address,
          receipt_footer: receiptFooter,
          operating_hours: operatingHours,
          id_card_accent_color: idAccent,
          qr_attendance_enabled: qrEnabled ? 1 : 0,
          require_photo_verify: photoVerify ? 1 : 0,
          logo_data_url: logoDataUrl,
          remove_logo: removeLogo,
        }),
      });
      onSettingsUpdated(res.settings);
      setLogoDataUrl(null);
      setRemoveLogo(false);
      onNotify('success', 'Gym branding, QR rules, and ID card settings updated.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSavingGym(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ ok: boolean; admin: AdminUser }>('/api/settings/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name: adminName, email: adminEmail }),
      });
      onAdminUpdated(res.admin);
      onNotify('success', 'Owner profile updated.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveGateway(e: React.FormEvent) {
    e.preventDefault();
    setSavingGw(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/v1/owner/gateway', {
        method: 'PUT',
        body: JSON.stringify({
          provider: gwProvider,
          merchant_key_id: gwKeyId,
          secret: gwSecret,
          webhook_secret: gwWebhookSecret,
          mode: gwMode,
          is_enabled: gwEnabled,
          auto_activate_membership: gwAutoActivate,
        }),
      });
      setGwSecret('');
      setGwWebhookSecret('');
      onNotify('success', res.message);
      const updated = await apiRequest<{ gateway: GymPaymentGatewayPublic | null; webhookUrl: string }>(
        '/api/v1/owner/gateway'
      );
      setGateway(updated.gateway);
      setWebhookUrl(updated.webhookUrl);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save gateway settings.');
    } finally {
      setSavingGw(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Gym Workspace, QR &amp; Gateway Settings
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Configure facility identity, ID card branding, QR verification rules, and your own encrypted payment gateway.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate({ view: 'change_password' })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-semibold text-neutral-800 whitespace-nowrap shrink-0"
        >
          <KeyRound className="w-4 h-4" aria-hidden="true" />
          <span>Change Password</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6">
          <h2 className="text-sm font-bold text-neutral-900 pb-3 mb-4 border-b border-neutral-200">
            Gym Branding, QR Rules &amp; Receipt Settings
          </h2>

          <form onSubmit={handleSaveGym} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-7">
                <label htmlFor="st_name" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Gym Name *
                </label>
                <input
                  id="st_name"
                  type="text"
                  required
                  value={gymName}
                  onChange={(e) => setGymName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="st_ccode" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Currency
                </label>
                <input
                  id="st_ccode"
                  type="text"
                  required
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="st_csym" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Symbol
                </label>
                <input
                  id="st_csym"
                  type="text"
                  required
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="st_phone" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Contact Number
                </label>
                <input
                  id="st_phone"
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="st_email" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Gym Email
                </label>
                <input
                  id="st_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="st_hours" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Operating Hours
                </label>
                <input
                  id="st_hours"
                  type="text"
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="st_accent" className="block text-xs font-semibold text-neutral-700 mb-1">
                  ID Card Accent Color
                </label>
                <input
                  id="st_accent"
                  type="color"
                  value={idAccent}
                  onChange={(e) => setIdAccent(e.target.value)}
                  className="h-9 w-full rounded-lg border border-neutral-300 p-1 bg-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 pt-1 text-xs font-semibold text-neutral-700">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={qrEnabled} onChange={(e) => setQrEnabled(e.target.checked)} />
                <span>Enable QR Attendance Scanner</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={photoVerify} onChange={(e) => setPhotoVerify(e.target.checked)} />
                <span>Require Front-Desk Photo Verification</span>
              </label>
            </div>

            <div>
              <label htmlFor="st_logo" className="block text-xs font-semibold text-neutral-700 mb-1">
                Gym Logo (Displayed on Sidebar, ID Cards &amp; Receipts)
              </label>
              <input
                id="st_logo"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleLogoChange}
                className="w-full text-xs text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-neutral-300 file:bg-neutral-50 file:text-xs file:font-medium"
              />
              {settings.logo_path && !logoDataUrl && (
                <label className="mt-1.5 inline-flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={removeLogo}
                    onChange={(e) => setRemoveLogo(e.target.checked)}
                  />
                  <span>Remove current logo</span>
                </label>
              )}
            </div>

            <div>
              <label htmlFor="st_addr" className="block text-xs font-semibold text-neutral-700 mb-1">
                Gym Address
              </label>
              <textarea
                id="st_addr"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="st_footer" className="block text-xs font-semibold text-neutral-700 mb-1">
                Receipt Footer Message
              </label>
              <textarea
                id="st_footer"
                rows={2}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingGym}
                className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold whitespace-nowrap"
              >
                {savingGym ? 'Saving...' : 'Save Gym Settings'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* Per-Gym Encrypted Payment Gateway */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-orange-600" />
                <span>Per-Gym Member Payment Gateway</span>
              </h2>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
              Secrets are encrypted server-side with AES-256-GCM and never exposed back to the browser. Member renewal fees
              settle directly into your gym&apos;s merchant account.
            </p>

            <form onSubmit={handleSaveGateway} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Provider</label>
                  <select
                    value={gwProvider}
                    onChange={(e) => setGwProvider(e.target.value as GatewayProvider)}
                    className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm bg-white"
                  >
                    <option value="razorpay">Razorpay</option>
                    <option value="cashfree">Cashfree</option>
                    <option value="stripe">Stripe</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Mode</label>
                  <select
                    value={gwMode}
                    onChange={(e) => setGwMode(e.target.value as 'test' | 'live')}
                    className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm bg-white"
                  >
                    <option value="test">Test / Sandbox</option>
                    <option value="live">Live Production</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Merchant / Publishable Key ID</label>
                <input
                  type="text"
                  value={gwKeyId}
                  onChange={(e) => setGwKeyId(e.target.value)}
                  placeholder="rzp_test_..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  API Secret {gateway?.has_secret ? `(${gateway.secret_masked})` : ''}
                </label>
                <input
                  type="password"
                  value={gwSecret}
                  onChange={(e) => setGwSecret(e.target.value)}
                  placeholder="Leave blank to keep stored encrypted secret"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Webhook Secret {gateway?.has_webhook_secret ? `(${gateway.webhook_secret_masked})` : ''}
                </label>
                <input
                  type="password"
                  value={gwWebhookSecret}
                  onChange={(e) => setGwWebhookSecret(e.target.value)}
                  placeholder="Leave blank to keep stored webhook secret"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5 pt-1 font-semibold text-neutral-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={gwEnabled} onChange={(e) => setGwEnabled(e.target.checked)} />
                  <span>Enable Online Renewal Checkout for My Members</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={gwAutoActivate} onChange={(e) => setGwAutoActivate(e.target.checked)} />
                  <span>Auto-Activate Membership After Verified Webhook</span>
                </label>
              </div>

              {webhookUrl && (
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 font-mono text-[11px] text-neutral-600 break-all">
                  Webhook Endpoint: {webhookUrl}
                </div>
              )}

              <button
                type="submit"
                disabled={savingGw}
                className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
              >
                {savingGw ? 'Encrypting & Saving...' : 'Save Encrypted Gateway'}
              </button>
            </form>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-neutral-900 pb-3 mb-4 border-b border-neutral-200">
              Owner Profile
            </h2>
            <form onSubmit={handleSaveProfile} className="space-y-4" noValidate>
              <div>
                <label htmlFor="adm_name" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Full Name *
                </label>
                <input
                  id="adm_name"
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="adm_email" className="block text-xs font-semibold text-neutral-700 mb-1">
                  Login Email *
                </label>
                <input
                  id="adm_email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold"
              >
                {savingProfile ? 'Updating...' : 'Update Profile'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 2. Change Password View (change_password.php)
// ----------------------------------------------------------------------------
export function ChangePasswordView({
  admin,
  onAdminUpdated,
  onNavigate,
  onNotify,
}: {
  admin: AdminUser;
  onAdminUpdated: (a: AdminUser) => void;
  onNavigate: (screen: ActiveScreen) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      onAdminUpdated({ ...admin, is_initial_setup_complete: 1 });
      onNotify('success', 'Owner password updated.');
      onNavigate({ view: 'settings' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Change Owner Password</h1>
        <button
          type="button"
          onClick={() => onNavigate({ view: 'settings' })}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-medium text-neutral-700"
        >
          Back to Settings
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4" noValidate>
        {admin.is_initial_setup_complete === 1 && (
          <div>
            <label htmlFor="cp_cur" className="block text-xs font-semibold text-neutral-700 mb-1">
              Current Password *
            </label>
            <input
              id="cp_cur"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div>
          <label htmlFor="cp_new" className="block text-xs font-semibold text-neutral-700 mb-1">
            New Password *
          </label>
          <input
            id="cp_new"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters (letters & numbers)"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="cp_conf" className="block text-xs font-semibold text-neutral-700 mb-1">
            Confirm New Password *
          </label>
          <input
            id="cp_conf"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onNavigate({ view: 'settings' })}
            className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
          >
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. cPanel PHP 8.1+ & MySQL SaaS Package Download & Source Inspector
// ----------------------------------------------------------------------------
export function CpanelDeploymentView({ onNotify }: { onNotify: (type: 'success' | 'error', msg: string) => void }) {
  const [files, setFiles] = useState<Array<{ path: string; bytes: number }>>([]);
  const [selectedFile, setSelectedFile] = useState('README.md');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiRequest<{
      files: Array<{ path: string; bytes: number }>;
      selectedFile: string;
      content: string;
    }>(`/api/cpanel/files?file=${encodeURIComponent(selectedFile)}`)
      .then((res) => {
        setFiles(res.files);
        setContent(res.content);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load cPanel source files.');
      })
      .finally(() => setLoading(false));
  }, [selectedFile, onNotify]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify('error', 'Clipboard copy unavailable in this browser context.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Hemnity SaaS cPanel PHP 8.1+ &amp; MySQL Bundle
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Complete multi-tenant <code className="font-mono text-neutral-800">public_html</code> archive with{' '}
            <code className="font-mono text-neutral-800">database_saas.sql</code>,{' '}
            <code className="font-mono text-neutral-800">database_migration.sql</code>, Super Admin, Member Portal, and{' '}
            <code className="font-mono text-neutral-800">/api/v1</code>.
          </p>
        </div>

        <a
          href="/api/cpanel/download-zip"
          download="hemnity-gym-saas-cpanel.zip"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Download Hemnity SaaS ZIP</span>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs font-bold text-orange-600 font-mono">01. Backup &amp; SQL</div>
          <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
            For fresh installs import <code className="font-mono">database_saas.sql</code>. For upgrades export a backup and run{' '}
            <code className="font-mono">database_migration.sql</code> to migrate records into <code className="font-mono">gym_id=1</code>.
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs font-bold text-orange-600 font-mono">02. Configure config.php</div>
          <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
            Set DB credentials, <code className="font-mono">HEMNITY_BASE_URL</code>, and AES-256 encryption key in{' '}
            <code className="font-mono">config.php</code> or environment variables.
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs font-bold text-orange-600 font-mono">03. Clean URLs</div>
          <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
            Included <code className="font-mono">.htaccess</code> routes <code className="font-mono">/owner/*</code>,{' '}
            <code className="font-mono">/member/*</code>, <code className="font-mono">/superadmin/*</code>, and{' '}
            <code className="font-mono">/api/v1/*</code> securely.
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs font-bold text-orange-600 font-mono">04. Verify &amp; Launch</div>
          <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
            Confirm existing members under <code className="font-mono">gym_id=1</code>, test QR check-in, and complete initial Super Admin setup.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 text-xs font-bold text-neutral-900">
            Included cPanel Files ({files.length})
          </div>
          <div className="max-h-[540px] overflow-y-auto divide-y divide-neutral-100">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedFile(f.path)}
                className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                  selectedFile === f.path
                    ? 'bg-orange-50 text-orange-700 font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span className="inline-flex items-center gap-2 font-mono truncate">
                  <FileCode2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{f.path}</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-neutral-400 shrink-0">
                  {(f.bytes / 1024).toFixed(1)} KB
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <span className="text-xs font-bold font-mono text-neutral-900">{selectedFile}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy File'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono leading-relaxed text-neutral-800 bg-neutral-50 overflow-auto max-h-[540px] flex-1 m-0">
            {loading ? 'Loading file...' : content}
          </pre>
        </div>
      </div>
    </div>
  );
}

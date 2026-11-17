import { useState } from 'react';
import { ArrowLeft, Building2, Eye, EyeOff, Lock, ShieldCheck, Users } from 'lucide-react';
import { apiRequest, setCsrfToken } from '../utils/api';
import type { AdminUser, PlatformSettings } from '../types/gym';
import type { UserRole } from '../utils/saasRules';

interface AuthPortalsViewProps {
  portalRole: UserRole;
  platform: PlatformSettings | null;
  setupAvailable: { gym_owner: boolean; super_admin: boolean };
  previewSwitchEnabled: boolean;
  onAuthenticated: (user: AdminUser) => void;
  onNavigatePath: (path: string) => void;
}

export function AuthPortalsView({
  portalRole,
  platform,
  setupAvailable,
  previewSwitchEnabled,
  onAuthenticated,
  onNavigatePath,
}: AuthPortalsViewProps) {
  const canSetup =
    (portalRole === 'gym_owner' && setupAvailable.gym_owner) ||
    (portalRole === 'super_admin' && setupAvailable.super_admin);

  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const portalMeta: Record<
    UserRole,
    { title: string; subtitle: string; icon: typeof Building2; accent: string }
  > = {
    gym_owner: {
      title: 'Gym Owner Workspace Login',
      subtitle: 'Sign in to manage members, plans, payments, QR check-ins, and your gym gateway.',
      icon: Building2,
      accent: 'text-orange-500',
    },
    gym_member: {
      title: 'Gym Member Self-Service Portal',
      subtitle: 'Access your active gym memberships, digital QR pass, attendance log, and receipts.',
      icon: Users,
      accent: 'text-emerald-500',
    },
    super_admin: {
      title: 'Hemnity Super Admin Console',
      subtitle: 'Central platform administration for gym tenants, SaaS pricing plans, billing, and CMS.',
      icon: ShieldCheck,
      accent: 'text-orange-500',
    },
  };

  const meta = portalMeta[portalRole];
  const Icon = meta.icon;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; csrfToken: string; user: AdminUser }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: portalRole }),
      });
      setCsrfToken(res.csrfToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; csrfToken: string; user: AdminUser }>('/api/v1/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          role: portalRole,
          full_name: fullName,
          email,
          password,
          confirm_password: confirmPassword,
        }),
      });
      setCsrfToken(res.csrfToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initial setup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePreviewSwitch(target: 'owner_gym1' | 'owner_gym2' | 'member_multi' | 'super_admin') {
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; csrfToken: string; user: AdminUser }>('/api/v1/auth/preview-switch', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      setCsrfToken(res.csrfToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview switch unavailable.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-4">
        <button
          type="button"
          onClick={() => onNavigatePath('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to {platform?.brand_name || 'Hemnity'} Landing Page</span>
        </button>

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="bg-[#0c0e12] text-white p-6 space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-300">
                <Icon className={`w-4 h-4 ${meta.accent}`} aria-hidden="true" />
                <span>{platform?.brand_name || 'Hemnity'} SaaS</span>
              </div>
              <Lock className="w-4 h-4 text-neutral-500" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{meta.title}</h1>
            <p className="text-xs text-neutral-400 leading-relaxed">{meta.subtitle}</p>
          </div>

          <div className="p-6 space-y-5">
            {canSetup && (
              <div className="flex p-1 rounded-xl bg-neutral-100 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className={`flex-1 py-2 rounded-lg transition-colors ${
                    mode === 'login' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('setup');
                    setError('');
                  }}
                  className={`flex-1 py-2 rounded-lg transition-colors ${
                    mode === 'setup' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
                  }`}
                >
                  Initial Setup
                </button>
              </div>
            )}

            {mode === 'setup' && canSetup ? (
              <form onSubmit={handleSetup} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Administrator Name"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@hemnity.in"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, upper, lower & number"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? 'Completing Setup...' : 'Save Credentials & Continue'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      portalRole === 'super_admin'
                        ? 'superadmin@hemnity.in'
                        : portalRole === 'gym_member'
                          ? 'ananya.d@example.com'
                          : 'owner@gymfitness.in'
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-neutral-200 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-[#0c0e12] hover:bg-neutral-800 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* Portal Cross-Navigation */}
            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
              {portalRole !== 'gym_owner' && (
                <button type="button" onClick={() => onNavigatePath('/owner/login')} className="hover:text-neutral-900 font-medium">
                  Gym Owner Login
                </button>
              )}
              {portalRole !== 'gym_member' && (
                <button type="button" onClick={() => onNavigatePath('/member/login')} className="hover:text-neutral-900 font-medium">
                  Member Portal
                </button>
              )}
              {portalRole !== 'super_admin' && (
                <button type="button" onClick={() => onNavigatePath('/superadmin/login')} className="hover:text-neutral-900 font-medium">
                  Super Admin
                </button>
              )}
            </div>

            {/* Interactive Preview Workspace Switcher (dev/sandbox only, zero hardcoded passwords) */}
            {previewSwitchEnabled && (
              <div className="pt-3 border-t border-neutral-100 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Interactive Sandbox Preview Session
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePreviewSwitch('owner_gym1')}
                    className="px-2.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-[11px] font-semibold text-neutral-800 text-left"
                  >
                    Gym #1 Owner (Ironworks)
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePreviewSwitch('owner_gym2')}
                    className="px-2.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-[11px] font-semibold text-neutral-800 text-left"
                  >
                    Gym #2 Owner (IronPulse)
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePreviewSwitch('member_multi')}
                    className="px-2.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-[11px] font-semibold text-neutral-800 text-left"
                  >
                    Multi-Gym Member (Ananya)
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePreviewSwitch('super_admin')}
                    className="px-2.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-[11px] font-semibold text-neutral-800 text-left"
                  >
                    Hemnity Super Admin
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

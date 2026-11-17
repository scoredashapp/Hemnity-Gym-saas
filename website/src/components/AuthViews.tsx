import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { apiRequest, setCsrfToken } from '../utils/api';
import type { AdminUser, GymSettings } from '../types/gym';

interface AuthViewProps {
  settings: GymSettings | null;
  initialSetupAvailable: boolean;
  onAuthenticated: (admin: AdminUser, initialSetupDone: boolean) => void;
}

export function AuthViews({
  settings,
  initialSetupAvailable,
  onAuthenticated,
}: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const gymName = settings?.gym_name || 'GYM';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        csrfToken: string;
        admin: AdminUser;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setCsrfToken(res.csrfToken);
      onAuthenticated(res.admin, res.admin.is_initial_setup_complete === 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function handleInitialSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        csrfToken: string;
        admin: AdminUser;
      }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          confirm_password: confirmPassword,
        }),
      });
      setCsrfToken(res.csrfToken);
      onAuthenticated(res.admin, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete initial setup.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResumePreview() {
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        csrfToken: string;
        admin: AdminUser;
      }>('/api/auth/preview-resume', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setCsrfToken(res.csrfToken);
      onAuthenticated(res.admin, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resume workspace.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0e12] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-orange-600 text-white font-bold flex items-center justify-center shrink-0">
            G
          </div>
          <span className="text-lg font-bold tracking-tight text-neutral-900">{gymName}</span>
        </div>

        {mode === 'login' ? (
          <>
            <h1 className="text-xl font-bold text-neutral-900">Administrator Sign In</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Sign in with your administrator credentials to manage members, plans, and payments.
            </p>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-5 space-y-4" noValidate>
              <div>
                <label htmlFor="login_email" className="block text-sm font-medium text-neutral-700 mb-1">
                  Email Address
                </label>
                <input
                  id="login_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 focus:border-orange-600 focus:outline-none"
                  placeholder="admin@gymfitness.in"
                />
              </div>

              <div>
                <label htmlFor="login_password" className="block text-sm font-medium text-neutral-700 mb-1">
                  Password
                </label>
                <input
                  id="login_password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 focus:border-orange-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>{busy ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>

            {initialSetupAvailable && (
              <div className="mt-6 pt-5 border-t border-neutral-200 space-y-2.5">
                <p className="text-xs text-neutral-500">
                  First-time installation? Configure your custom administrator password via Initial Admin Setup (mirrors <code className="font-mono text-neutral-700">setup_admin.php</code>).
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('setup');
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Open Initial Setup
                  </button>
                  <button
                    type="button"
                    onClick={handleResumePreview}
                    disabled={busy}
                    className="py-2 px-3 rounded-lg border border-neutral-300 hover:bg-neutral-50 text-neutral-700 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Resume Preview Session
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-neutral-900">Create First Administrator</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Configure your primary administrator account. Once saved, initial setup locks permanently.
            </p>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleInitialSetup} className="mt-5 space-y-3.5" noValidate>
              <div>
                <label htmlFor="setup_name" className="block text-sm font-medium text-neutral-700 mb-1">
                  Full Name
                </label>
                <input
                  id="setup_name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 focus:border-orange-600 focus:outline-none"
                  placeholder="Arjun Mehta"
                />
              </div>

              <div>
                <label htmlFor="setup_email" className="block text-sm font-medium text-neutral-700 mb-1">
                  Administrator Email
                </label>
                <input
                  id="setup_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 focus:border-orange-600 focus:outline-none"
                  placeholder="admin@gymfitness.in"
                />
              </div>

              <div>
                <label htmlFor="setup_password" className="block text-sm font-medium text-neutral-700 mb-1">
                  Strong Password
                </label>
                <input
                  id="setup_password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 focus:border-orange-600 focus:outline-none"
                  placeholder="Minimum 8 chars (letters & numbers)"
                />
              </div>

              <div>
                <label htmlFor="setup_confirm" className="block text-sm font-medium text-neutral-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="setup_confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 focus:border-orange-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>{busy ? 'Creating Account...' : 'Create Administrator Account'}</span>
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setError('');
                setMode('login');
              }}
              className="mt-4 w-full py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

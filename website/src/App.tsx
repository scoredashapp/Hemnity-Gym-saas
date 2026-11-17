import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Download,
  FileArchive,
  FileCode2,
  Globe,
  IdCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, setCsrfToken } from './utils/api';
import type {
  ActiveScreen,
  AdminUser,
  GymSettings,
  GymSubscriptionInfo,
  GymTenant,
  PlatformSettings,
  PortalSection,
} from './types/gym';
import { LandingPageView } from './components/LandingPageView';
import { AuthPortalsView } from './components/AuthPortalsView';
import { SuperAdminView } from './components/SuperAdminView';
import { MemberPortalView } from './components/MemberPortalView';
import { ApiDocsView } from './components/ApiDocsView';
import { OfflineBanner, PWAInstallButton } from './components/PwaHelpers';
import { DashboardView } from './components/DashboardView';
import {
  MemberFormView,
  MemberProfileView,
  MembersDirectoryView,
} from './components/MembersView';
import { PlansView } from './components/PlansView';
import {
  PaymentAddView,
  PaymentsLedgerView,
  ReceiptView,
} from './components/PaymentsAndReceiptView';
import { AttendanceView } from './components/AttendanceView';
import { IdCardGeneratorView } from './components/IdCardGeneratorView';
import { ReportsView } from './components/ReportsView';
import { OwnerSubscriptionView } from './components/OwnerSubscriptionView';
import {
  ChangePasswordView,
  CpanelDeploymentView,
  SettingsView,
} from './components/SettingsAndCpanelView';

const DEFAULT_SETTINGS: GymSettings = {
  id: 1,
  gym_id: 1,
  gym_name: 'Hemnity Gym',
  logo_path: null,
  address: '',
  contact_number: '',
  email: '',
  currency_code: 'INR',
  currency_symbol: '₹',
  receipt_footer: 'Thank you for training with us.',
};

interface RouteParseResult {
  section: PortalSection;
  ownerScreen: ActiveScreen;
}

function parsePathname(rawPath: string): RouteParseResult {
  const path = (rawPath || '/').replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/landing') {
    return { section: 'landing', ownerScreen: { view: 'dashboard' } };
  }
  if (path === '/api/docs') {
    return { section: 'api_docs', ownerScreen: { view: 'dashboard' } };
  }
  if (path === '/superadmin' || path.startsWith('/superadmin/')) {
    return { section: 'superadmin', ownerScreen: { view: 'dashboard' } };
  }
  if (path === '/member' || path.startsWith('/member/')) {
    return { section: 'member', ownerScreen: { view: 'dashboard' } };
  }
  if (path === '/owner' || path.startsWith('/owner/')) {
    const sub = path.slice('/owner'.length) || '/dashboard';
    if (sub === '/members') return { section: 'owner', ownerScreen: { view: 'members' } };
    if (sub === '/members/add') return { section: 'owner', ownerScreen: { view: 'member_add' } };
    if (sub === '/plans') return { section: 'owner', ownerScreen: { view: 'plans' } };
    if (sub === '/payments') return { section: 'owner', ownerScreen: { view: 'payments' } };
    if (sub === '/payments/add') return { section: 'owner', ownerScreen: { view: 'payment_add' } };
    if (sub === '/attendance') return { section: 'owner', ownerScreen: { view: 'attendance' } };
    if (sub === '/id-cards') return { section: 'owner', ownerScreen: { view: 'id_cards' } };
    if (sub === '/reports') return { section: 'owner', ownerScreen: { view: 'reports' } };
    if (sub === '/settings') return { section: 'owner', ownerScreen: { view: 'settings' } };
    if (sub === '/subscription') return { section: 'owner', ownerScreen: { view: 'subscription' } };
    if (sub === '/change-password') return { section: 'owner', ownerScreen: { view: 'change_password' } };
    if (sub === '/cpanel') return { section: 'owner', ownerScreen: { view: 'cpanel' } };
    return { section: 'owner', ownerScreen: { view: 'dashboard' } };
  }

  return { section: 'landing', ownerScreen: { view: 'dashboard' } };
}

function ownerScreenToPath(screen: ActiveScreen): string {
  switch (screen.view) {
    case 'dashboard':
      return '/owner/dashboard';
    case 'members':
    case 'member_edit':
    case 'member_view':
      return '/owner/members';
    case 'member_add':
      return '/owner/members/add';
    case 'plans':
      return '/owner/plans';
    case 'payments':
    case 'receipt':
      return '/owner/payments';
    case 'payment_add':
      return '/owner/payments/add';
    case 'attendance':
      return '/owner/attendance';
    case 'id_cards':
      return '/owner/id-cards';
    case 'reports':
      return '/owner/reports';
    case 'settings':
      return '/owner/settings';
    case 'subscription':
      return '/owner/subscription';
    case 'change_password':
      return '/owner/change-password';
    case 'cpanel':
      return '/owner/cpanel';
  }
}

interface SessionResponse {
  authenticated: boolean;
  user: AdminUser | null;
  csrfToken: string;
  previewSwitchEnabled: boolean;
  setupAvailable: { gym_owner: boolean; super_admin: boolean };
  platform: PlatformSettings | null;
  gym: GymTenant | null;
  settings: GymSettings | null;
  subscription: GymSubscriptionInfo | null;
}

export default function App() {
  const initialRoute = parsePathname(window.location.pathname);

  const [section, setSection] = useState<PortalSection>(initialRoute.section);
  const [screen, setScreen] = useState<ActiveScreen>(initialRoute.ownerScreen);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [previewSwitchEnabled, setPreviewSwitchEnabled] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState({ gym_owner: false, super_admin: false });
  const [platform, setPlatform] = useState<PlatformSettings | null>(null);
  const [gym, setGym] = useState<GymTenant | null>(null);
  const [settings, setSettings] = useState<GymSettings>(DEFAULT_SETTINGS);
  const [subscription, setSubscription] = useState<GymSubscriptionInfo | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiRequest<SessionResponse>('/api/v1/auth/session');
      setCsrfToken(res.csrfToken);
      setAuthenticated(res.authenticated);
      setUser(res.user);
      setPreviewSwitchEnabled(Boolean(res.previewSwitchEnabled));
      setSetupAvailable(res.setupAvailable);
      setPlatform(res.platform);
      setGym(res.gym);
      setSubscription(res.subscription);
      if (res.settings) {
        setSettings(res.settings);
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch {
      setAuthenticated(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshSession().finally(() => setBootstrapping(false));
  }, [refreshSession]);

  useEffect(() => {
    function handlePopState() {
      const parsed = parsePathname(window.location.pathname);
      setSection(parsed.section);
      setScreen(parsed.ownerScreen);
      setSidebarOpen(false);
      setAccountMenuOpen(false);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigatePath = useCallback((targetPath: string) => {
    const normalized = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    if (window.location.pathname !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    const parsed = parsePathname(normalized);
    setSection(parsed.section);
    setScreen(parsed.ownerScreen);
    setSidebarOpen(false);
    setAccountMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const navigateOwner = useCallback((next: ActiveScreen) => {
    const nextPath = ownerScreenToPath(next);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setSection('owner');
    setScreen(next);
    setSidebarOpen(false);
    setAccountMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  async function handleLogout(redirectTo = '/') {
    try {
      const res = await apiRequest<{ ok: boolean; csrfToken: string }>('/api/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setCsrfToken(res.csrfToken);
      setAuthenticated(false);
      setUser(null);
      setGym(null);
      setSubscription(null);
      setAccountMenuOpen(false);
      navigatePath(redirectTo);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to sign out.');
    }
  }

  async function handleAuthenticated(loggedInUser: AdminUser, targetOverride?: string) {
    setUser(loggedInUser);
    setAuthenticated(true);
    await refreshSession();

    if (targetOverride) {
      navigatePath(targetOverride);
      return;
    }

    if (section === 'api_docs' && (loggedInUser.role === 'gym_owner' || loggedInUser.role === 'super_admin')) {
      navigatePath('/api/docs');
      return;
    }

    if (loggedInUser.role === 'super_admin') {
      navigatePath('/superadmin/dashboard');
    } else if (loggedInUser.role === 'gym_member') {
      navigatePath('/member/dashboard');
    } else {
      navigatePath('/owner/dashboard');
    }
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center text-sm text-neutral-500">
        Loading Hemnity Gym Management Software...
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Section 1: Public SaaS Landing Page (/)
  // --------------------------------------------------------------------------
  if (section === 'landing') {
    return (
      <>
        <OfflineBanner />
        <LandingPageView
          onNavigatePath={navigatePath}
          onRegisteredOwner={(newOwner) => {
            void handleAuthenticated(newOwner, '/owner/dashboard');
          }}
        />
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Section 2: Protected API Documentation (/api/docs)
  // --------------------------------------------------------------------------
  if (section === 'api_docs') {
    const authorizedForDocs =
      authenticated && user && (user.role === 'gym_owner' || user.role === 'super_admin');
    if (!authorizedForDocs) {
      return (
        <>
          <OfflineBanner />
          <AuthPortalsView
            portalRole="gym_owner"
            platform={platform}
            setupAvailable={setupAvailable}
            previewSwitchEnabled={previewSwitchEnabled}
            onAuthenticated={(u) => {
              void handleAuthenticated(u, '/api/docs');
            }}
            onNavigatePath={navigatePath}
          />
        </>
      );
    }

    return (
      <>
        <OfflineBanner />
        <ApiDocsView
          onBack={() =>
            navigatePath(user.role === 'super_admin' ? '/superadmin/dashboard' : '/owner/dashboard')
          }
        />
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Section 3: Hemnity Super Admin Console (/superadmin/*)
  // --------------------------------------------------------------------------
  if (section === 'superadmin') {
    if (!authenticated || !user || user.role !== 'super_admin') {
      return (
        <>
          <OfflineBanner />
          <AuthPortalsView
            portalRole="super_admin"
            platform={platform}
            setupAvailable={setupAvailable}
            previewSwitchEnabled={previewSwitchEnabled}
            onAuthenticated={(u) => {
              void handleAuthenticated(u, '/superadmin/dashboard');
            }}
            onNavigatePath={navigatePath}
          />
        </>
      );
    }

    return (
      <>
        <OfflineBanner />
        <SuperAdminView
          user={user}
          onLogout={() => {
            void handleLogout('/superadmin/login');
          }}
          onNavigatePath={navigatePath}
        />
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Section 4: Gym Member Self-Service Portal (/member/*)
  // --------------------------------------------------------------------------
  if (section === 'member') {
    if (!authenticated || !user || user.role !== 'gym_member') {
      return (
        <>
          <OfflineBanner />
          <AuthPortalsView
            portalRole="gym_member"
            platform={platform}
            setupAvailable={setupAvailable}
            previewSwitchEnabled={previewSwitchEnabled}
            onAuthenticated={(u) => {
              void handleAuthenticated(u, '/member/dashboard');
            }}
            onNavigatePath={navigatePath}
          />
        </>
      );
    }

    return (
      <>
        <OfflineBanner />
        <MemberPortalView
          user={user}
          onLogout={() => {
            void handleLogout('/member/login');
          }}
          onNavigatePath={navigatePath}
        />
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Section 5: Gym Owner Panel (/owner/*)
  // --------------------------------------------------------------------------
  if (!authenticated || !user || user.role !== 'gym_owner') {
    return (
      <>
        <OfflineBanner />
        <AuthPortalsView
          portalRole="gym_owner"
          platform={platform}
          setupAvailable={setupAvailable}
          previewSwitchEnabled={previewSwitchEnabled}
          onAuthenticated={(u) => {
            void handleAuthenticated(u, '/owner/dashboard');
          }}
          onNavigatePath={navigatePath}
        />
      </>
    );
  }

  const navItems: Array<{
    key: string;
    label: string;
    icon: typeof LayoutDashboard;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: screen.view === 'dashboard',
      onClick: () => navigateOwner({ view: 'dashboard' }),
    },
    {
      key: 'members',
      label: 'Members',
      icon: Users,
      active: ['members', 'member_add', 'member_edit', 'member_view'].includes(screen.view),
      onClick: () => navigateOwner({ view: 'members' }),
    },
    {
      key: 'plans',
      label: 'Membership Plans',
      icon: ClipboardList,
      active: screen.view === 'plans',
      onClick: () => navigateOwner({ view: 'plans' }),
    },
    {
      key: 'payments',
      label: 'Payments',
      icon: CreditCard,
      active: ['payments', 'payment_add', 'receipt'].includes(screen.view),
      onClick: () => navigateOwner({ view: 'payments' }),
    },
    {
      key: 'attendance',
      label: 'Attendance & QR',
      icon: CalendarCheck,
      active: screen.view === 'attendance',
      onClick: () => navigateOwner({ view: 'attendance' }),
    },
    {
      key: 'id_cards',
      label: 'ID Cards & Passes',
      icon: IdCard,
      active: screen.view === 'id_cards',
      onClick: () => navigateOwner({ view: 'id_cards' }),
    },
    {
      key: 'reports',
      label: 'Reports',
      icon: BarChart3,
      active: screen.view === 'reports',
      onClick: () => navigateOwner({ view: 'reports' }),
    },
    {
      key: 'subscription',
      label: 'SaaS Subscription',
      icon: Building2,
      active: screen.view === 'subscription',
      onClick: () => navigateOwner({ view: 'subscription' }),
    },
    {
      key: 'settings',
      label: 'Settings & Gateway',
      icon: Settings,
      active: ['settings', 'change_password'].includes(screen.view),
      onClick: () => navigateOwner({ view: 'settings' }),
    },
  ];

  const breadcrumbLabelMap: Record<ActiveScreen['view'], string> = {
    dashboard: 'Dashboard',
    members: 'Members',
    member_add: 'Add Member',
    member_edit: 'Edit Member',
    member_view: 'Member Profile',
    plans: 'Membership Plans',
    payments: 'Payments & Receipts',
    payment_add: 'Record Payment',
    receipt: 'Payment Receipt',
    attendance: 'Attendance & QR',
    id_cards: 'ID Cards & QR Passes',
    reports: 'Reports',
    subscription: 'SaaS Subscription & Support',
    settings: 'Settings & Payment Gateway',
    change_password: 'Change Password',
    cpanel: 'cPanel PHP + MySQL SaaS Package',
  };

  return (
    <div className="min-h-screen flex bg-[#f8f9fb] text-neutral-900">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 lg:hidden no-print"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Dark Sidebar Navigation */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0c0e12] text-neutral-200 flex flex-col transition-transform duration-150 lg:translate-x-0 no-print ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigateOwner({ view: 'dashboard' })}
            className="flex items-center gap-2.5 text-left min-w-0"
          >
            {settings.logo_path ? (
              <img
                src={settings.logo_path}
                alt={settings.gym_name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span className="w-8 h-8 rounded-lg bg-orange-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                H
              </span>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm tracking-tight text-white truncate">
                {settings.gym_name}
              </div>
              <div className="text-[10px] font-mono text-neutral-400 truncate">
                {gym?.gym_code || 'HEMNITY TENANT'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 text-neutral-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                aria-current={item.active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  item.active
                    ? 'bg-orange-600 text-white font-semibold'
                    : 'text-neutral-400 hover:bg-[#181c24] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-3 mt-3 border-t border-white/10 space-y-1">
            <button
              type="button"
              onClick={() => navigatePath('/api/docs')}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium text-neutral-300 hover:bg-[#181c24] hover:text-white transition-colors whitespace-nowrap"
            >
              <FileCode2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>REST API Docs</span>
            </button>
            <button
              type="button"
              onClick={() => navigateOwner({ view: 'cpanel' })}
              aria-current={screen.view === 'cpanel' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                screen.view === 'cpanel'
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-neutral-300 hover:bg-[#181c24] hover:text-white'
              }`}
            >
              <FileArchive className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>cPanel PHP + SQL</span>
            </button>
            <button
              type="button"
              onClick={() => navigatePath('/')}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:bg-[#181c24] hover:text-white transition-colors whitespace-nowrap"
            >
              <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Public SaaS Site</span>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/10 space-y-2">
          <a
            href="/api/cpanel/download-zip"
            download="gym-cpanel-ready.zip"
            className="w-full py-2 px-3 rounded-lg bg-[#181c24] hover:bg-[#222834] text-neutral-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
            <span>Download cPanel ZIP</span>
          </a>
          <button
            type="button"
            onClick={() => {
              void handleLogout('/owner/login');
            }}
            className="w-full py-2 px-3 rounded-lg border border-white/15 hover:bg-white/5 text-neutral-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <OfflineBanner />

        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-neutral-200 px-4 sm:px-7 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="p-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 lg:hidden shrink-0"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm truncate">
              <span className="text-neutral-500 font-medium truncate">{settings.gym_name}</span>
              <span className="text-neutral-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-neutral-900 truncate">
                {breadcrumbLabelMap[screen.view]}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton compact />

            {screen.view !== 'dashboard' && screen.view !== 'members' && screen.view !== 'member_add' && (
              <button
                type="button"
                onClick={() => navigateOwner({ view: 'member_add' })}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                <span>Quick Add Member</span>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((o) => !o)}
                aria-expanded={accountMenuOpen}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 whitespace-nowrap shrink-0"
              >
                <span>{user.full_name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white border border-neutral-200 shadow-lg py-1.5 z-50">
                  <div className="px-3.5 py-2 border-b border-neutral-100">
                    <div className="text-xs font-bold text-neutral-900 truncate">{user.full_name}</div>
                    <div className="text-[11px] text-neutral-500 truncate">{user.email}</div>
                    {subscription && (
                      <div className="mt-1 text-[10px] font-mono text-orange-600 truncate">
                        {subscription.plan_name} · {subscription.effective_status}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateOwner({ view: 'subscription' })}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>SaaS Subscription &amp; Support</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateOwner({ view: 'settings' })}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Gym Settings &amp; Gateway</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateOwner({ view: 'change_password' })}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigatePath('/api/docs')}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>REST API Documentation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateOwner({ view: 'cpanel' })}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <FileArchive className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>cPanel PHP + SQL Package</span>
                  </button>
                  <div className="my-1 border-t border-neutral-100" />
                  <button
                    type="button"
                    onClick={() => {
                      void handleLogout('/owner/login');
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-7 max-w-[1360px] w-full mx-auto">
          {banner && (
            <div
              role="status"
              className={`mb-5 px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-sm no-print ${
                banner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <span>{banner.message}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                aria-label="Dismiss notification"
                className="text-xs font-semibold opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {screen.view === 'dashboard' && <DashboardView onNavigate={navigateOwner} />}

          {screen.view === 'members' && (
            <MembersDirectoryView
              initialStatus={screen.initialStatus}
              settings={settings}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'member_add' && (
            <MemberFormView settings={settings} onNavigate={navigateOwner} onNotify={notify} />
          )}

          {screen.view === 'member_edit' && (
            <MemberFormView
              editMemberId={screen.memberId}
              settings={settings}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'member_view' && (
            <MemberProfileView
              memberId={screen.memberId}
              settings={settings}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'plans' && (
            <PlansView settings={settings} onNavigate={navigateOwner} onNotify={notify} />
          )}

          {screen.view === 'payments' && (
            <PaymentsLedgerView settings={settings} onNavigate={navigateOwner} onNotify={notify} />
          )}

          {screen.view === 'payment_add' && (
            <PaymentAddView
              preselectedMemberId={screen.preselectedMemberId}
              settings={settings}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'receipt' && (
            <ReceiptView paymentId={screen.paymentId} onNavigate={navigateOwner} onNotify={notify} />
          )}

          {screen.view === 'attendance' && (
            <AttendanceView
              preselectedMemberId={screen.preselectedMemberId}
              initialSearch={screen.searchQuery}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'id_cards' && (
            <IdCardGeneratorView
              preselectedMemberId={screen.preselectedMemberId}
              onNotify={notify}
            />
          )}

          {screen.view === 'reports' && (
            <ReportsView initialTab={screen.initialTab} onNotify={notify} />
          )}

          {screen.view === 'subscription' && <OwnerSubscriptionView onNotify={notify} />}

          {screen.view === 'settings' && (
            <SettingsView
              settings={settings}
              admin={user}
              onSettingsUpdated={setSettings}
              onAdminUpdated={setUser}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'change_password' && (
            <ChangePasswordView
              admin={user}
              onAdminUpdated={setUser}
              onNavigate={navigateOwner}
              onNotify={notify}
            />
          )}

          {screen.view === 'cpanel' && <CpanelDeploymentView onNotify={notify} />}
        </main>

        {/* Quiet Footer */}
        <footer className="px-4 sm:px-7 py-4 bg-white border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 no-print">
          <span>
            © {new Date().getFullYear()} Hemnity Gym Management Software · {settings.gym_name}
          </span>
          <span>
            Currency:{' '}
            <strong className="font-mono tabular-nums text-neutral-700">
              {settings.currency_code} ({settings.currency_symbol})
            </strong>
          </span>
        </footer>
      </div>
    </div>
  );
}

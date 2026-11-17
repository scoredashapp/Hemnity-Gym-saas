import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  IdCard,
  Lock,
  Mail,
  Menu,
  Phone,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import heroGymImg from '../assets/images/hemnity_gym_hero_1794925836254.jpg';
import founderAvatarImg from '../assets/images/hemnity_founder_avatar_1794925837760.jpg';
import { apiRequest, setCsrfToken } from '../utils/api';
import { calculateSaasPlanAmount, type BillingCycle } from '../utils/saasRules';
import type { AdminUser, PlatformFaq, PlatformSettings, SaasPlan } from '../types/gym';
import { PWAInstallButton } from './PwaHelpers';

interface LandingPageViewProps {
  onNavigatePath: (path: string) => void;
  onRegisteredOwner: (user: AdminUser) => void;
}

export function LandingPageView({ onNavigatePath, onRegisteredOwner }: LandingPageViewProps) {
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<PlatformSettings | null>(null);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [faqs, setFaqs] = useState<PlatformFaq[]>([]);
  const [stats, setStats] = useState({ active_gyms: 2, total_members: 12, total_checkins: 10 });
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [openFaqId, setOpenFaqId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Registration modal state
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(0);
  const [regForm, setRegForm] = useState({
    gym_name: '',
    owner_name: '',
    email: '',
    phone: '',
    city: '',
    address: '',
    password: '',
    confirm_password: '',
    start_trial: true,
  });
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState('');

  // Contact form state
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactStatus, setContactStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  // Legal modal state
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'refund' | null>(null);

  useEffect(() => {
    apiRequest<{
      platform: PlatformSettings;
      plans: SaasPlan[];
      faqs: PlatformFaq[];
      stats: { active_gyms: number; total_members: number; total_checkins: number };
    }>('/api/v1/public/landing')
      .then((res) => {
        setPlatform(res.platform);
        setPlans(res.plans);
        setFaqs(res.faqs);
        setStats(res.stats);
        if (res.faqs[0]) setOpenFaqId(res.faqs[0].id);
        const featured = res.plans.find((p) => p.is_featured) || res.plans[0];
        if (featured) setSelectedPlanId(featured.id);
      })
      .finally(() => setLoading(false));
  }, []);

  function openRegisterModal(planId?: number) {
    if (planId) setSelectedPlanId(planId);
    setRegError('');
    setRegisterOpen(true);
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');
    setRegSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; csrfToken: string; user: AdminUser }>('/api/v1/public/register-gym', {
        method: 'POST',
        body: JSON.stringify({
          ...regForm,
          saas_plan_id: selectedPlanId,
          billing_cycle: billingCycle,
        }),
      });
      setCsrfToken(res.csrfToken);
      setRegisterOpen(false);
      onRegisteredOwner(res.user);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegSubmitting(false);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setContactStatus(null);
    setContactSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/v1/public/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactStatus({ type: 'success', text: res.message });
      setContactForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setContactStatus({ type: 'error', text: err instanceof Error ? err.message : 'Could not send message.' });
    } finally {
      setContactSubmitting(false);
    }
  }

  const brandName = platform?.brand_name || 'Hemnity';
  const softwareName = platform?.software_name || 'Hemnity Gym Management Software';

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-neutral-900 flex flex-col">
      {/* Announcement Banner (from Super Admin CMS) */}
      {platform?.announcement_banner && (
        <div className="bg-[#0c0e12] text-neutral-200 px-4 py-2 text-center text-xs font-medium border-b border-white/10">
          <span>{platform.announcement_banner}</span>
        </div>
      )}

      {/* Top Bar Contract — 3-Zone Horizontal Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-neutral-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-7 h-16 flex items-center justify-between gap-4">
          {/* Left: Brand Lockup */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 text-left shrink-0"
          >
            <span className="w-9 h-9 rounded-lg bg-[#0c0e12] text-white font-bold text-base flex items-center justify-center">
              H
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-neutral-900 tracking-tight whitespace-nowrap">{brandName}</div>
              <div className="text-[11px] font-medium text-neutral-500 whitespace-nowrap">Gym SaaS Platform</div>
            </div>
          </button>

          {/* Center: Clean Desktop Nav Links */}
          <nav aria-label="Landing Page Sections" className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600">
            <a href="#features" className="hover:text-neutral-900 whitespace-nowrap">
              Features
            </a>
            <a href="#qr-attendance" className="hover:text-neutral-900 whitespace-nowrap">
              QR & Gateways
            </a>
            <a href="#member-portal" className="hover:text-neutral-900 whitespace-nowrap">
              Member Portal
            </a>
            <a href="#pricing" className="hover:text-neutral-900 whitespace-nowrap">
              Pricing
            </a>
            <a href="#faq" className="hover:text-neutral-900 whitespace-nowrap">
              FAQ
            </a>
          </nav>

          {/* Right: Portals & Primary CTA */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => onNavigatePath('/member/login')}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 whitespace-nowrap shrink-0"
            >
              Member Login
            </button>
            <button
              type="button"
              onClick={() => onNavigatePath('/owner/login')}
              className="px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 whitespace-nowrap shrink-0"
            >
              Gym Owner Login
            </button>
            <button
              type="button"
              onClick={() => openRegisterModal()}
              className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>{platform?.hero_cta_primary || 'Start Free Trial'}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-lg border border-neutral-200 text-neutral-700"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-neutral-200 bg-white px-4 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm font-medium text-neutral-700">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                Features
              </a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                Pricing
              </a>
              <a href="#qr-attendance" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                QR & Gateways
              </a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                FAQ
              </a>
            </div>
            <div className="pt-2 border-t border-neutral-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigatePath('/owner/login');
                }}
                className="w-full py-2.5 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-800"
              >
                Gym Owner Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigatePath('/member/login');
                }}
                className="w-full py-2.5 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-800"
              >
                Member Portal Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openRegisterModal();
                }}
                className="w-full py-2.5 rounded-lg bg-orange-600 text-white text-xs font-semibold"
              >
                Start Free Trial — Create Gym Workspace
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="bg-[#0c0e12] text-white border-b border-white/10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-7 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-orange-400">
              {platform?.hero_badge || 'Multi-Tenant SaaS for Fitness Businesses'}
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12]">
              {platform?.hero_title || 'Run every gym branch, QR check-in, and member renewal from one platform.'}
            </h1>
            <p className="text-base text-neutral-300 leading-relaxed max-w-xl">
              {platform?.hero_subtitle ||
                'Hemnity Gym Management Software gives independent clubs and chains isolated workspaces, revocable QR ID cards, direct Razorpay/Cashfree fee collection, and a member self-service portal.'}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => openRegisterModal()}
                className="px-5 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>{platform?.hero_cta_primary || 'Start 14-Day Free Trial'}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigatePath('/owner/login')}
                className="px-5 py-3 rounded-lg border border-white/20 hover:bg-white/10 text-white text-sm font-semibold whitespace-nowrap transition-colors"
              >
                {platform?.hero_cta_secondary || 'Gym Owner Sign In'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10 max-w-lg">
              <div>
                <div className="text-xl font-bold font-mono tabular-nums text-white">{stats.active_gyms}+</div>
                <div className="text-xs text-neutral-400">Active Gym Tenants</div>
              </div>
              <div>
                <div className="text-xl font-bold font-mono tabular-nums text-white">{stats.total_members}+</div>
                <div className="text-xs text-neutral-400">Managed Members</div>
              </div>
              <div>
                <div className="text-xl font-bold font-mono tabular-nums text-white">100%</div>
                <div className="text-xs text-neutral-400">Tenant Data Isolation</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl overflow-hidden border border-white/15 bg-[#151922] shadow-2xl">
              <img
                src={heroGymImg}
                alt="Modern strength and conditioning studio running Hemnity Gym Management Software"
                className="w-full aspect-video object-cover"
              />
              <div className="p-5 grid grid-cols-3 gap-4 bg-[#12161f] border-t border-white/10">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-400">QR Check-In</div>
                  <div className="text-sm font-semibold text-white mt-0.5">Photo Verified</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-400">Payments</div>
                  <div className="text-sm font-semibold text-white mt-0.5">Direct to Gym Bank</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-400">Deployment</div>
                  <div className="text-sm font-semibold text-white mt-0.5">SaaS + cPanel PHP</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Software Introduction & Feature Highlights */}
      <section id="features" className="py-16 px-4 sm:px-7 max-w-[1280px] mx-auto w-full">
        <div className="max-w-2xl mb-10">
          <div className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-2">
            Built for Gym Operators
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900">
            {platform?.intro_title || 'Everything required to manage members, renewals, receipts, and daily floor access'}
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 mt-2.5 leading-relaxed">
            {platform?.intro_body ||
              'Preserve every member profile, payment receipt, and attendance record inside strictly isolated gym workspaces powered by centralized SaaS administration.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: Building2,
              title: 'Strict Multi-Tenant Isolation',
              body: 'Every gym owner gets an isolated tenant workspace scoped by gym_id in backend authorization, queries, exports, and QR scanners.',
            },
            {
              icon: QrCode,
              title: 'QR & Keyboard Check-In',
              body: 'Scan revocable cryptographic QR passes via webcam or mobile camera, or type a member code at the desk with instant photo verification.',
            },
            {
              icon: IdCard,
              title: 'PVC & A4 ID Card Generator',
              body: 'Generate print-ready CR80/A4 member passes with gym branding, member photo, QR code, and one-click lost-card revocation.',
            },
            {
              icon: CreditCard,
              title: 'Per-Gym Payment Gateways',
              body: 'Each gym stores its own AES-256 encrypted Razorpay or Cashfree keys. Member fees settle directly to the gym, separate from SaaS billing.',
            },
            {
              icon: Smartphone,
              title: 'Member Multi-Gym Portal & PWA',
              body: 'Members belonging to multiple clubs switch gyms cleanly, view attendance calendars, download receipts, and renew online.',
            },
            {
              icon: BarChart3,
              title: 'Financial Reports & CSV Exports',
              body: 'Track monthly collections, partial dues, expiry alerts, renewal history, and download UTF-8 CSV reports scoped to your gym.',
            },
          ].map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="bg-white rounded-xl border border-neutral-200 p-6 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
                  <Icon className="w-5 h-5 text-orange-400" aria-hidden="true" />
                </div>
                <h3 className="text-base font-bold text-neutral-900">{feat.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{feat.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* QR Attendance & Payment Gateway Architecture Section */}
      <section id="qr-attendance" className="bg-white border-y border-neutral-200 py-16 px-4 sm:px-7">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="bg-[#f8f9fb] rounded-2xl border border-neutral-200 p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-orange-600 text-xs font-bold uppercase tracking-wider">
              <QrCode className="w-4 h-4" aria-hidden="true" />
              <span>Anti-Fraud QR Attendance</span>
            </div>
            <h3 className="text-2xl font-bold text-neutral-900">
              Revocable cryptographic tokens — never guessable member numbers
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Static barcodes printed with sequential IDs can be shared or guessed. Hemnity issues each member a 24-character
              cryptographic token bound strictly to their gym tenant.
            </p>
            <ul className="space-y-2.5 text-sm text-neutral-700">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Displays member photograph and plan expiry at front desk immediately upon scan</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Blocks cross-gym tokens and duplicate check-ins automatically</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Instant lost-card revocation and reissue invalidates old QR passes</span>
              </li>
            </ul>
          </div>

          <div id="member-portal" className="bg-[#f8f9fb] rounded-2xl border border-neutral-200 p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-orange-600 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>Member Portal & Verified Billing</span>
            </div>
            <h3 className="text-2xl font-bold text-neutral-900">
              Self-service member dashboard with HMAC-verified online renewals
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Members sign in once to access their digital QR card, attendance calendar, payment receipts, and online plan
              renewals across any gym club they train with.
            </p>
            <ul className="space-y-2.5 text-sm text-neutral-700">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Multi-gym switcher keeps each club&apos;s membership, payments, and QR pass separate</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Memberships only activate after signed HMAC-SHA256 gateway webhook verification</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Installable PWA for Android, iOS, and desktop with offline detection</span>
              </li>
            </ul>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigatePath('/member/login')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0c0e12] hover:bg-neutral-800 text-white text-xs font-semibold transition-colors"
              >
                <Users className="w-4 h-4 text-orange-400" aria-hidden="true" />
                <span>Open Member Portal</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Database-Driven Pricing Plans */}
      <section id="pricing" className="py-16 px-4 sm:px-7 max-w-[1280px] mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-2">
              Transparent SaaS Pricing
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900">
              Choose a plan &amp; launch your gym workspace
            </h2>
            <p className="text-sm text-neutral-600 mt-1.5">
              All plans are managed live from Hemnity Super Admin and include automated data backups.
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-white border border-neutral-200 self-start">
            {(['monthly', 'quarterly', 'yearly'] as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                  billingCycle === cycle ? 'bg-[#0c0e12] text-white' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {cycle}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-neutral-500">Loading subscription plans...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const price = calculateSaasPlanAmount(plan, billingCycle);
              const featured = Boolean(plan.is_featured);
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl p-6 flex flex-col justify-between border ${
                    featured
                      ? 'bg-[#0c0e12] text-white border-[#0c0e12] shadow-xl'
                      : 'bg-white text-neutral-900 border-neutral-200'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg font-bold">{plan.plan_name}</h3>
                        {plan.tagline && (
                          <p className={`text-xs mt-0.5 ${featured ? 'text-neutral-400' : 'text-neutral-500'}`}>
                            {plan.tagline}
                          </p>
                        )}
                      </div>
                      {featured && (
                        <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
                          Most Popular
                        </span>
                      )}
                    </div>

                    <div className="pt-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold font-mono tabular-nums">
                          ₹{price.toLocaleString('en-IN')}
                        </span>
                        <span className={`text-xs ${featured ? 'text-neutral-400' : 'text-neutral-500'}`}>
                          / {billingCycle}
                        </span>
                      </div>
                      {plan.discount_percent > 0 && billingCycle !== 'monthly' && (
                        <div className="text-xs text-emerald-500 font-semibold mt-1">
                          Includes {plan.discount_percent}% bundle discount
                        </div>
                      )}
                    </div>

                    <p className={`text-xs leading-relaxed ${featured ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      {plan.description}
                    </p>

                    <ul className="space-y-2 pt-2 border-t border-current/10 text-xs">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                        <span>Up to {plan.max_members.toLocaleString('en-IN')} active members</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                        <span>Up to {plan.max_branches} gym branch(es)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                        <span>{plan.trial_days}-day free trial included</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                        <span>
                          {plan.enabled_features.payment_gateway
                            ? 'Per-gym Razorpay & Cashfree integration'
                            : 'Front-desk manual & UPI fee ledger'}
                        </span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => openRegisterModal(plan.id)}
                    className={`mt-6 w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors ${
                      featured
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-[#0c0e12] hover:bg-neutral-800 text-white'
                    }`}
                  >
                    Get Started with {plan.plan_name}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Proof & FAQ Section */}
      <section id="faq" className="bg-white border-y border-neutral-200 py-16 px-4 sm:px-7">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#f8f9fb] rounded-2xl border border-neutral-200 p-6 space-y-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={founderAvatarImg}
                  alt="Gym Owner Testimonial"
                  className="w-12 h-12 rounded-full object-cover border border-neutral-200"
                />
                <div>
                  <div className="text-sm font-bold text-neutral-900">Arjun Mehta</div>
                  <div className="text-xs text-neutral-500">Founder, Ironworks Fitness Club (Bengaluru)</div>
                </div>
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed">
                &ldquo;We upgraded from a single-gym spreadsheet and PHP script to Hemnity SaaS without losing a single
                receipt or member history. Our front desk now checks members in via QR photo verification in under two
                seconds.&rdquo;
              </p>
            </div>

            <div className="bg-[#0c0e12] text-white rounded-2xl p-6 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-orange-400">
                Existing cPanel Users
              </div>
              <h3 className="text-lg font-bold">Zero-Data-Loss Single-Gym Upgrade</h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Download the complete PHP 8.1+ &amp; MySQL SaaS bundle inside the Owner panel, run{' '}
                <code className="font-mono text-orange-300">database_migration.sql</code>, and every legacy record is
                safely mapped to <code className="font-mono text-orange-300">gym_id = 1</code>.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Frequently Asked Questions</h2>
            {faqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div key={faq.id} className="border border-neutral-200 rounded-xl bg-[#f8f9fb] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    aria-expanded={isOpen}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-100/70"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-neutral-600 leading-relaxed border-t border-neutral-200/70 pt-3 bg-white">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact & Support Section */}
      <section id="contact" className="py-16 px-4 sm:px-7 max-w-[1280px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-orange-600">Contact Hemnity</div>
            <h2 className="text-2xl font-bold text-neutral-900">Need multi-branch onboarding or enterprise migration?</h2>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Reach our implementation specialists for custom migration support, Android app API keys, or enterprise gym chains.
            </p>
            <div className="space-y-2.5 pt-2 text-sm text-neutral-700">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-orange-600" aria-hidden="true" />
                <span>{platform?.support_email || 'support@hemnity.in'}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-orange-600" aria-hidden="true" />
                <span>{platform?.support_phone || '+91 80 4123 8900'}</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleContactSubmit}
            className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Rohan Kulkarni"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="founder@yourgym.in"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Subject</label>
              <input
                type="text"
                value={contactForm.subject}
                onChange={(e) => setContactForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Multi-branch onboarding inquiry"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Message</label>
              <textarea
                required
                rows={3}
                value={contactForm.message}
                onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Tell us about your gym branches and member count..."
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {contactStatus && (
              <div
                className={`text-xs px-3 py-2 rounded-lg ${
                  contactStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {contactStatus.text}
              </div>
            )}
            <button
              type="submit"
              disabled={contactSubmitting}
              className="px-5 py-2.5 rounded-lg bg-[#0c0e12] hover:bg-neutral-800 text-white text-xs font-semibold disabled:opacity-60"
            >
              {contactSubmitting ? 'Sending...' : 'Send Inquiry to Hemnity'}
            </button>
          </form>
        </div>
      </section>

      {/* Footer with Portals & Legal Pages */}
      <footer className="bg-[#0c0e12] text-neutral-400 border-t border-white/10 mt-auto">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-7 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
          <div className="space-y-2">
            <div className="text-sm font-bold text-white">{softwareName}</div>
            <p className="leading-relaxed">
              Multi-tenant gym management SaaS by {brandName}. Hosting target: {platform?.base_url || 'https://gym.hemnity.in'}.
            </p>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-white uppercase tracking-wider text-[11px]">Portals</div>
            <div className="flex flex-col gap-1.5 items-start">
              <button type="button" onClick={() => onNavigatePath('/owner/login')} className="hover:text-white">
                Gym Owner Login
              </button>
              <button type="button" onClick={() => openRegisterModal()} className="hover:text-white">
                Register New Gym
              </button>
              <button type="button" onClick={() => onNavigatePath('/member/login')} className="hover:text-white">
                Gym Member Portal
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-white uppercase tracking-wider text-[11px]">Administration &amp; API</div>
            <div className="flex flex-col gap-1.5 items-start">
              <button
                type="button"
                onClick={() => onNavigatePath('/superadmin/login')}
                className="hover:text-white inline-flex items-center gap-1.5"
              >
                <Lock className="w-3 h-3" aria-hidden="true" />
                <span>Hemnity Super Admin</span>
              </button>
              <button type="button" onClick={() => onNavigatePath('/api/docs')} className="hover:text-white">
                Protected REST API Docs
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-white uppercase tracking-wider text-[11px]">Legal</div>
            <div className="flex flex-col gap-1.5 items-start">
              <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-white">
                Privacy Policy
              </button>
              <button type="button" onClick={() => setLegalModal('terms')} className="hover:text-white">
                Terms of Service
              </button>
              <button type="button" onClick={() => setLegalModal('refund')} className="hover:text-white">
                Subscription Refund Policy
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 px-4 sm:px-7 text-center text-[11px] text-neutral-500">
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </div>
      </footer>

      {/* Gym Owner Onboarding / Registration Modal */}
      {registerOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Create Your Gym SaaS Workspace</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Instant isolated workspace with default membership plans, QR ID cards, and member portal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRegisterOpen(false)}
                aria-label="Close registration modal"
                className="p-1.5 text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Subscription Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plan_name} — ₹{calculateSaasPlanAmount(p, billingCycle).toLocaleString('en-IN')}/{billingCycle} ({p.trial_days}-day trial)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Gym Name *</label>
                  <input
                    type="text"
                    required
                    value={regForm.gym_name}
                    onChange={(e) => setRegForm((f) => ({ ...f, gym_name: e.target.value }))}
                    placeholder="Apex Barbell Club"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Owner Full Name *</label>
                  <input
                    type="text"
                    required
                    value={regForm.owner_name}
                    onChange={(e) => setRegForm((f) => ({ ...f, owner_name: e.target.value }))}
                    placeholder="Aditya Rao"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Owner Email *</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="owner@apexbarbell.in"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={regForm.phone}
                    onChange={(e) => setRegForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98450 11223"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">City</label>
                  <input
                    type="text"
                    value={regForm.city}
                    onChange={(e) => setRegForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Bengaluru"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Gym Address</label>
                  <input
                    type="text"
                    value={regForm.address}
                    onChange={(e) => setRegForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="100 Feet Road, Indiranagar"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regForm.password}
                    onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars, mixed case + digit"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regForm.confirm_password}
                    onChange={(e) => setRegForm((f) => ({ ...f, confirm_password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-neutral-700 pt-1">
                <input
                  type="checkbox"
                  checked={regForm.start_trial}
                  onChange={(e) => setRegForm((f) => ({ ...f, start_trial: e.target.checked }))}
                  className="rounded border-neutral-300 text-orange-600 focus:ring-orange-500"
                />
                <span>Start with Free Trial immediately (recommended)</span>
              </label>

              {regError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{regError}</div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRegisterOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {regSubmitting ? 'Creating Workspace...' : 'Create Gym Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legal Modal */}
      {legalModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-lg w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900">
                {legalModal === 'privacy'
                  ? 'Privacy Policy'
                  : legalModal === 'terms'
                    ? 'Terms of Service'
                    : 'SaaS Subscription & Refund Policy'}
              </h3>
              <button type="button" onClick={() => setLegalModal(null)} className="p-1 text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-neutral-600 leading-relaxed">
              {legalModal === 'privacy'
                ? platform?.legal_privacy_summary
                : legalModal === 'terms'
                  ? platform?.legal_terms_summary
                  : 'Hemnity provides a full trial period prior to paid billing. Gym owners retain read-only export access to historical member and payment records even after subscription expiry.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

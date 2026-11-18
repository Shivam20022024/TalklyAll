'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  UserRound,
} from 'lucide-react';
import '@fontsource-variable/inter';
import { useAuth } from '@/components/providers/AuthProvider';
import { fetchApi } from '@/lib/api';
import { LoginLogo, LoginWaveform } from '@/components/login/LoginBrandPanel';
import SignupBrandPanel from '@/components/signup/SignupBrandPanel';
import '@/components/login/login.css';

// Same field treatment as the login page; `user-invalid` only shows red after the visitor has interacted.
const fieldClass =
  'h-12 w-full rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] pl-11 text-[0.9375rem] text-[#111827] placeholder:text-[#64748B] transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#CBD5E1] focus:border-[#2463EB] focus:bg-white focus:shadow-[0_0_0_4px_rgb(36_99_235/0.12)] user-invalid:border-[#F04438] user-invalid:focus:shadow-[0_0_0_4px_rgb(240_68_56/0.12)]';
const iconClass = 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]';
const labelClass = 'block text-sm font-medium text-[#111827]';

function Required() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-[#D92D20]">
      *
    </span>
  );
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('general_sales');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingNotice, setPendingNotice] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // display only

  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await fetchApi('/api/v1/auth/register', {
        method: 'POST',
        requireAuth: false,
        body: JSON.stringify({
          name,
          company_name: companyName,
          industry,
          email,
          password,
        }),
      });

      if (data.status === 'success' && data.access_token && data.user) {
        login(data.access_token, data.user);
        router.push('/dashboard');
      } else if (data.status === 'pending_review') {
        setPendingNotice(true);
      } else {
        throw new Error(data.message || 'Registration failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root login-brand min-h-dvh lg:grid lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
      <SignupBrandPanel />

      {/* Compact brand header for tablet and mobile */}
      <header className="px-4 pb-2 pt-5 sm:px-8 lg:hidden">
        <div className="login-fade mx-auto flex max-w-[34rem] items-center justify-between">
          <LoginLogo />
          <LoginWaveform count={14} className="h-6" />
        </div>
        <p
          className="login-rise mx-auto mt-6 max-w-[34rem] text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-[#111827] [text-wrap:balance] sm:text-2xl"
          style={{ '--rise-delay': '60ms' } as React.CSSProperties}
        >
          Create Your <span translate="no">TalklyAI</span> Workspace
        </p>
      </header>

      <main className="flex flex-col items-center px-4 py-5 sm:px-8 sm:py-8 lg:justify-center lg:px-10 lg:py-5">
        <div
          className="login-rise w-full max-w-[34rem] rounded-[20px] border border-[#E2E8F0] bg-white px-4 py-7 shadow-[0_1px_2px_rgb(30_58_138/0.04),0_24px_60px_-32px_rgb(36_70_170/0.35)] sm:px-10 sm:py-7"
          style={{ '--rise-delay': '120ms' } as React.CSSProperties}
        >
          <div className="flex flex-col items-center text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#EEF3FF,#F1ECFE)] text-[#2463EB]">
              <Bot size={24} aria-hidden="true" />
            </span>
            <h1 className="mt-3 text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-[#111827] sm:text-[1.875rem]">
              Create Workspace
            </h1>
            <p className="mt-2 text-[0.9375rem] text-[#475569] [text-wrap:balance]">Get started with 10&nbsp;free AI voice calling minutes.</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-1 text-[0.8125rem] font-semibold text-[#067647]">
              <Sparkles size={14} aria-hidden="true" />
              Instant Trial Sandbox — No Card Required
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-sm text-[#B91C1C]"
            >
              <AlertCircle size={18} aria-hidden="true" className="mt-px flex-none" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          {pendingNotice ? (
            <div role="status" className="mt-8 flex flex-col items-center rounded-2xl bg-[#F8FAFC] px-6 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF3] text-[#16a34a]">
                <CheckCircle2 size={26} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-[#111827]">Request Submitted</h2>
              <p className="mt-2 max-w-[22rem] text-sm leading-relaxed text-[#475569]">
                Your account request has been received. Our team will activate your workspace shortly.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#2463EB] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Return to Login
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="signup-name">
                  Your Full Name
                  <Required />
                </label>
                <div className="relative">
                  <UserRound size={18} aria-hidden="true" className={iconClass} />
                  <input
                    id="signup-name"
                    name="name"
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name…"
                    autoComplete="name"
                    className={`${fieldClass} pr-3.5`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="signup-company">
                  Company / Organization Name
                  <Required />
                </label>
                <div className="relative">
                  <Building2 size={18} aria-hidden="true" className={iconClass} />
                  <input
                    id="signup-company"
                    name="company_name"
                    required
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Sunrise Realty…"
                    autoComplete="organization"
                    className={`${fieldClass} pr-3.5`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="signup-industry">
                  Primary Industry / Use Case
                  <Required />
                </label>
                <div className="relative">
                  <LayoutGrid size={18} aria-hidden="true" className={iconClass} />
                  <select
                    id="signup-industry"
                    name="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className={`${fieldClass} cursor-pointer appearance-none pr-11`}
                  >
                    <option value="general_sales">B2B Sales & Services</option>
                    <option value="healthcare">Healthcare & Medical Clinics</option>
                    <option value="edtech">EdTech & Education</option>
                    <option value="bfsi">BFSI & Loans</option>
                    <option value="real_estate">Real Estate</option>
                  </select>
                  <ChevronDown size={18} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#475569]" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="signup-email">
                  Business Email
                  <Required />
                </label>
                <div className="relative">
                  <Mail size={18} aria-hidden="true" className={iconClass} />
                  <input
                    id="signup-email"
                    name="email"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    spellCheck={false}
                    className={`${fieldClass} pr-3.5`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="signup-password">
                  Password
                  <Required />
                </label>
                <div className="relative">
                  <Lock size={18} aria-hidden="true" className={iconClass} />
                  <input
                    id="signup-password"
                    name="password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password…"
                    autoComplete="new-password"
                    className={`${fieldClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="signup-password"
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#EEF2F7] hover:text-[#111827]"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="group !mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2463EB] text-[0.9375rem] font-semibold text-white shadow-[0_1px_2px_rgb(30_58_138/0.12),0_8px_20px_-10px_rgb(36_99_235/0.55)] transition-[background-color,transform] duration-150 [touch-action:manipulation] hover:bg-[#1D4ED8] active:scale-[0.99] active:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} aria-hidden="true" className="animate-spin" />
                    <span className="sr-only">Creating workspace…</span>
                  </>
                ) : (
                  <>
                    Start Free Trial
                    <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          )}

          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[#475569]">
            <span>
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[#2463EB] hover:text-[#1D4ED8] hover:underline">
                Sign in
              </Link>
            </span>
            <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-[#CBD5E1] sm:inline-block" />
            <Link href="/pricing" className="font-semibold text-[#2463EB] hover:text-[#1D4ED8] hover:underline">
              View Pricing
            </Link>
          </p>

          <nav
            aria-label="Legal and company"
            className="mt-5 flex flex-wrap items-center justify-center gap-x-2 border-t border-[#E2E8F0] pt-3 text-[0.8125rem] text-[#475569] sm:gap-x-1"
          >
            {[
              { label: 'Terms', href: '/terms' },
              { label: 'Privacy', href: '/privacy' },
              { label: 'Refund Policy', href: '/refund-policy' },
              { label: 'Contact', href: '/contact' },
            ].map((link, index) => (
              <span key={link.href} className="inline-flex items-center">
                {index > 0 && <span aria-hidden="true" className="mx-1 hidden h-1 w-1 rounded-full bg-[#CBD5E1] sm:inline-block" />}
                <Link href={link.href} className="inline-flex min-h-10 items-center px-1.5 hover:text-[#111827] hover:underline lg:min-h-8">
                  {link.label}
                </Link>
              </span>
            ))}
          </nav>
        </div>

        <p className="mt-5 text-center text-xs text-[#475569] lg:hidden">
          A product by <span className="font-semibold text-[#111827]">Novalantis</span>
        </p>
      </main>
    </div>
  );
}

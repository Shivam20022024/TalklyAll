'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CalendarDays, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import '@fontsource-variable/inter';
import { useAuth, normalizeRole } from '@/components/providers/AuthProvider';
import { fetchApi } from '@/lib/api';
import LoginBrandPanel, { LoginLogo, LoginWaveform } from '@/components/login/LoginBrandPanel';
import '@/components/login/login.css';

const fieldClass =
  'h-12 w-full rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] pl-10 text-[0.9375rem] text-[#111827] placeholder:text-[#64748B] transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#CBD5E1] focus:border-[#2463EB] focus:bg-white focus:shadow-[0_0_0_4px_rgb(36_99_235/0.12)]';

const footerLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund-policy' },
  { label: 'Contact', href: '/contact' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false); // display only
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await fetchApi('/api/v1/auth/login', {
        method: 'POST',
        requireAuth: false,
        body: JSON.stringify({ email, password }),
      });

      if (data.access_token && data.user) {
        login(data.access_token, data.user);
        router.push(normalizeRole(data.user.role) === 'super_admin' ? '/admin' : '/dashboard');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root min-h-dvh lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      <LoginBrandPanel />

      {/* Compact brand header for tablet and mobile */}
      <header className="login-brand relative overflow-hidden border-b border-[#E2E8F0] px-4 pb-7 pt-5 sm:px-8 lg:hidden">
        <div className="login-fade mx-auto flex max-w-[26rem] items-center justify-between md:max-w-[34rem]">
          <LoginLogo />
          <LoginWaveform count={14} className="h-6" />
        </div>
        <p className="login-rise mx-auto mt-6 max-w-[26rem] text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-[#111827] sm:text-2xl md:max-w-[34rem]" style={{ '--rise-delay': '60ms' } as React.CSSProperties}>
          Welcome to <span className="text-[#2463EB]">Smarter Conversations.</span>
        </p>
        <p className="login-rise mx-auto mt-2 max-w-[26rem] text-sm leading-relaxed text-[#475569] md:max-w-[34rem]" style={{ '--rise-delay': '100ms' } as React.CSSProperties}>
          Automate conversations, qualify leads and grow your business with AI-powered voice calling.
        </p>
      </header>

      <main className="flex min-h-0 flex-col px-4 sm:px-8 lg:min-h-dvh lg:px-12">
        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="login-rise w-full max-w-[26rem]" style={{ '--rise-delay': '120ms' } as React.CSSProperties}>
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-[#111827] sm:text-[2rem]">
              Welcome back
            </h1>
            <p className="mt-2 text-[0.9375rem] text-[#475569]">Sign in to your TalklyAI workspace.</p>

            {error && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-sm text-[#B91C1C]"
              >
                <AlertCircle size={18} aria-hidden="true" className="mt-px flex-none" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#111827]" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                  <Mail size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${fieldClass} pr-3.5`}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-[#111827]" htmlFor="password">
                    Password
                  </label>
                  <a href="#" className="-my-2.5 inline-flex min-h-10 items-center text-[0.8125rem] font-medium text-[#2463EB] hover:text-[#1D4ED8] hover:underline">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${fieldClass} pr-12`}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="password"
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
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2463EB] text-[0.9375rem] font-semibold text-white shadow-[0_1px_2px_rgb(30_58_138/0.12),0_8px_20px_-10px_rgb(36_99_235/0.55)] transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#1D4ED8] active:scale-[0.99] active:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} aria-hidden="true" className="animate-spin" />
                    <span className="sr-only">Signing in</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#475569]">
              New company?{' '}
              <a href="/register" className="font-semibold text-[#2463EB] hover:text-[#1D4ED8] hover:underline">
                Start Free Trial
              </a>
            </p>

            <div className="my-6 flex items-center gap-3 text-xs text-[#64748B]" aria-hidden="true">
              <span className="h-px flex-1 bg-[#E2E8F0]" />
              or
              <span className="h-px flex-1 bg-[#E2E8F0]" />
            </div>

            <a
              href="/demo"
              className="group flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#E2E8F0] bg-white text-sm font-semibold text-[#111827] transition-colors hover:border-[#C7D2FE] hover:bg-[#F8FAFC]"
            >
              <CalendarDays size={17} aria-hidden="true" className="text-[#7955E8]" />
              Request Demo
              <ArrowRight size={16} aria-hidden="true" className="text-[#64748B] transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        <footer className="pb-6 pt-2">
          <nav aria-label="Legal and company" className="mx-auto flex max-w-[26rem] flex-wrap items-center justify-center gap-x-2 text-[0.8125rem] text-[#475569] sm:gap-x-1">
            {footerLinks.map((link, index) => (
              <span key={link.href} className="inline-flex items-center">
                {/* Separators only where the row never wraps, so none is left dangling on mobile. */}
                {index > 0 && <span aria-hidden="true" className="hidden px-1 text-[#CBD5E1] sm:inline">|</span>}
                <a href={link.href} className="inline-flex min-h-10 items-center px-1.5 hover:text-[#111827] hover:underline lg:min-h-8">
                  {link.label}
                </a>
              </span>
            ))}
          </nav>
          <p className="mt-2 text-center text-xs text-[#64748B] lg:hidden">
            A product by <span className="font-semibold text-[#111827]">Novalantis</span>
          </p>
        </footer>
      </main>
    </div>
  );
}

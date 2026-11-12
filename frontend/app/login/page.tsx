'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Bot, Loader2, Lock, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useAuth, normalizeRole } from '@/components/providers/AuthProvider';
import { fetchApi } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    <div className="flex min-h-screen bg-background">
      {/* Brand panel - desktop only */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-primary/70 p-12 text-primary-foreground lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <Bot size={20} />
          </div>
          <span className="text-lg font-bold tracking-tight">Voice AI</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            AI voice calling that actually talks to your customers.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
            Automate conversations, qualify leads, and drive business growth - in Hindi, Hinglish, or English.
          </p>

          <ul className="mt-8 space-y-4">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-white/15">
                <Phone size={14} />
              </span>
              <span className="text-sm text-primary-foreground/90">Natural, real-time AI conversations at scale</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-white/15">
                <BarChart3 size={14} />
              </span>
              <span className="text-sm text-primary-foreground/90">Post-call intelligence and lead scoring on every call</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-white/15">
                <ShieldCheck size={14} />
              </span>
              <span className="text-sm text-primary-foreground/90">Identity verification and compliance built in</span>
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">Autonomous Enterprise Voice Platform</p>
      </div>

      {/* Login form */}
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center lg:items-start">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary lg:hidden">
              <Bot size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your Voice AI workspace</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" htmlFor="password">Password</label>
                <a href="#" className="text-xs font-medium text-primary hover:underline">Forgot password?</a>
              </div>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New company?{' '}
            <a href="/register" className="font-semibold text-primary hover:underline">
              Start Free Trial
            </a>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <a href="/request-access" className="hover:underline">
              Request Demo
            </a>
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
            <a href="/pricing" className="hover:text-foreground hover:underline">Pricing</a>
            <span className="text-border">·</span>
            <a href="/terms" className="hover:text-foreground hover:underline">Terms</a>
            <span className="text-border">·</span>
            <a href="/privacy" className="hover:text-foreground hover:underline">Privacy</a>
            <span className="text-border">·</span>
            <a href="/refund-policy" className="hover:text-foreground hover:underline">Refund Policy</a>
            <span className="text-border">·</span>
            <a href="/contact" className="hover:text-foreground hover:underline">Contact</a>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground lg:hidden">
            Powered by <span className="font-semibold text-foreground">Voice AI</span>
          </p>
        </div>
      </div>
    </div>
  );
}

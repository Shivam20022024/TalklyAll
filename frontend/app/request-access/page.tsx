'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function RequestAccessPage() {
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    password: '',
    phone: '',
    use_case: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchApi('/api/v1/access-requests', {
        method: 'POST',
        requireAuth: false,
        body: JSON.stringify(form),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Request submitted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your access request is now pending review. Once a TalklyAI administrator approves it,
            you&apos;ll be able to sign in with the email and password you provided.
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Request access</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Tell us about your company. An administrator will review and approve your account.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Field label="Company name" required value={form.company_name} onChange={(v) => set('company_name', v)} placeholder="Acme Realty" />
          <Field label="Your name" value={form.contact_name} onChange={(v) => set('contact_name', v)} placeholder="Jane Doe" />
          <Field label="Work email" type="email" required value={form.email} onChange={(v) => set('email', v)} placeholder="jane@acme.com" />
          <Field label="Password" type="password" required value={form.password} onChange={(v) => set('password', v)} placeholder="Choose a password" />
          <Field label="Phone (optional)" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+91 98765 43210" />
          <div className="space-y-1">
            <label className="text-sm font-medium">How will you use TalklyAI? (optional)</label>
            <textarea
              value={form.use_case}
              onChange={(e) => set('use_case', e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Outbound calling for real-estate leads…"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Submit request'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
        </p>
      </div>
      <div className="mt-8 text-center text-sm font-medium text-muted-foreground">Made by Novalantis</div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required = false, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

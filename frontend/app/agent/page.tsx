'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, Loader2, Bot, Languages, Copy, Check, CheckCircle2, AlertTriangle, Route, ArrowUpRight } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { fetchApi } from '@/lib/api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Alert } from '@/components/ui/Alert';
import { ErrorState, LoadingState, Skeleton } from '@/components/ui/States';
export default function AgentPage() {
  const [agentId, setAgentId] = useState('');
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Presentation-only: if the configuration could not be loaded, the empty form below would look like
  // "no agent configured", and saving it would overwrite the real setting with blanks.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetchApi('/api/v1/agent')
      .then((r) => {
        setAgentId(r.data?.bolna_agent_id || '');
        setMappings(r.data?.language_mappings || []);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetchApi('/api/v1/agent', {
        method: 'PUT',
        body: JSON.stringify({
          bolna_agent_id: agentId || null,
          language_mappings: mappings.map((m) => ({
            language: m.language,
            bolna_agent_id: m.bolna_agent_id,
            status: m.status || 'Supported',
          })),
        }),
      });
      alert('Saved.');
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const updateMapping = (i: number, field: string, value: string) => {
    setMappings((ms) => ms.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  };

  // ── presentation-only helpers (no request, payload or handler is changed) ──
  const [copied, setCopied] = useState(false);
  const copyAgentId = () => {
    if (!agentId) return;
    navigator.clipboard.writeText(agentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const configured = Boolean(agentId);
  const inputCls =
    'h-11 w-full rounded-xl border border-ds-line bg-ds-bg px-3.5 font-mono text-[15px] text-ds-ink outline-none transition-colors placeholder:font-sans placeholder:text-ds-ink-3 hover:border-ds-line-strong focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20';
  const card = 'rounded-2xl border border-ds-line bg-ds-bg p-5 shadow-sm sm:p-6';
  const iconTile = (children: React.ReactNode, tone = 'bg-blue-50 text-ds-primary') => (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">{children}</span>
  );

  return (
    <AppLayout title="Agent">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Voice Agent</h1>
          <p className="mt-1.5 text-[16px] text-ds-ink-2 sm:text-[17px]">Manage your company&apos;s dedicated AI voice agents and language routing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          {!loading && !loadFailed && (
            configured ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 text-[14px] font-semibold text-emerald-700"><CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />Configured</span>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-amber-50 px-3.5 text-[14px] font-semibold text-amber-800"><AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />Not configured</span>
            )
          )}
          <button
            onClick={save}
            disabled={saving || loading || loadFailed}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ds-primary px-5 text-[15px] font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-ds-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={1.75} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </header>

      {loading ? (
        <LoadingState label="Loading agent configuration…">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        </LoadingState>
      ) : loadFailed ? (
        <div className={card}>
          <ErrorState
            title="Your agent configuration couldn’t be loaded"
            description="Nothing is shown rather than an empty form that looks like no agent is set. Saving is disabled so your existing settings can’t be overwritten. Reload the page to try again."
          />
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            {/* Default agent */}
            <section className={card} aria-labelledby="default-agent-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3.5">
                  {iconTile(<Bot size={22} strokeWidth={1.75} />)}
                  <div className="min-w-0">
                    <h2 id="default-agent-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Default Agent</h2>
                    <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">Used for every call unless a language below has its own agent.</p>
                  </div>
                </div>
                {configured ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[14px] font-semibold text-emerald-700">Configured</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[14px] font-semibold text-amber-800">Not set</span>
                )}
              </div>

              <div className="mt-5 border-t border-ds-line pt-5">
                <label htmlFor="default-agent-id" className="text-[15px] font-semibold text-ds-ink">Default agent ID</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="default-agent-id"
                    aria-describedby="default-agent-hint"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="Bolna agent id"
                    spellCheck={false}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={copyAgentId}
                    disabled={!agentId}
                    aria-label="Copy agent ID"
                    title={copied ? 'Copied' : 'Copy agent ID'}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ds-line bg-ds-bg text-ds-ink-2 shadow-sm transition-colors hover:border-ds-primary/40 hover:bg-blue-50 hover:text-ds-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {copied ? <Check size={18} className="text-ds-success-ink" /> : <Copy size={18} strokeWidth={1.75} />}
                  </button>
                </div>
                <p id="default-agent-hint" className="mt-2 text-[14px] text-ds-ink-2">The Bolna agent identifier for your company.</p>
              </div>

              {!agentId && (
                <Alert tone="warning" className="mt-4" title="No agent configured">
                  Outbound calls will fail unless a fallback is enabled by the platform.
                </Alert>
              )}
            </section>

            {/* Language-specific agents */}
            <section className={card} aria-labelledby="language-agents-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3.5">
                  {iconTile(<Languages size={22} strokeWidth={1.75} />, 'bg-violet-50 text-violet-700')}
                  <div className="min-w-0">
                    <h2 id="language-agents-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Language-specific Agents</h2>
                    <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">Optional overrides: a call in one of these languages uses its own agent.</p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-ds-surface px-3 py-1 text-[14px] font-semibold text-ds-ink-2 tabular-nums">{mappings.length} configured</span>
              </div>

              {mappings.length > 0 ? (
                <div className="mt-5 overflow-hidden rounded-xl border border-ds-line">
                  <div className="hidden grid-cols-[160px_130px_minmax(0,1fr)] gap-4 bg-slate-50 px-4 py-3 text-[13px] font-semibold tracking-wide text-ds-ink-2 md:grid">
                    <span>Language</span>
                    <span>Status</span>
                    <span>Agent ID</span>
                  </div>
                  <ul className="divide-y divide-ds-line">
                    {mappings.map((m, i) => (
                      <li key={m.language} className="grid items-center gap-x-4 gap-y-2.5 px-4 py-3.5 md:grid-cols-[160px_130px_minmax(0,1fr)]">
                        <span className="text-[16px] font-semibold text-ds-ink">{m.language}</span>
                        <span>{m.status ? <StatusBadge status={m.status} className="px-3 py-1 text-[14px]" /> : <span className="text-ds-ink-3">—</span>}</span>
                        <input
                          aria-label={`Agent ID for ${m.language}`}
                          value={m.bolna_agent_id || ''}
                          onChange={(e) => updateMapping(i, 'bolna_agent_id', e.target.value)}
                          placeholder="Uses the default agent when empty"
                          spellCheck={false}
                          className={inputCls}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-ds-line-strong bg-ds-surface/60 px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ds-bg text-ds-ink-2 shadow-sm" aria-hidden="true"><Languages size={24} strokeWidth={1.75} /></span>
                  <h3 className="mt-4 text-[18px] font-semibold text-ds-ink">No language-specific agents configured</h3>
                  <p className="mt-1.5 max-w-md text-[15px] text-ds-ink-2">Calls in every language currently use the default agent.</p>
                </div>
              )}
            </section>
          </div>

          {/* Call routing */}
          <aside className="min-w-0 xl:sticky xl:top-[4.5rem]" aria-label="Call routing">
            <section className={card} aria-labelledby="agent-how-title">
              <div className="flex items-start gap-3.5">
                {iconTile(<Route size={22} strokeWidth={1.75} />, 'bg-blue-50 text-ds-primary')}
                <div className="min-w-0">
                  <h2 id="agent-how-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Call Routing</h2>
                  <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">Which agent handles a call, in priority order.</p>
                </div>
              </div>
              <ol className="mt-5 divide-y divide-ds-line border-y border-ds-line">
                {[
                  "The agent mapped to the call's language, if one is set.",
                  'Otherwise the English mapping, if one is set.',
                  'Otherwise your default agent ID.',
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3 py-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[14px] font-semibold text-ds-primary" aria-hidden="true">{i + 1}</span>
                    <span className="text-[15px] leading-snug text-ds-ink">{text}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[15px] leading-snug text-ds-ink-2">
                The prompt, greeting, and knowledge base the agent speaks with are configured in Prompt Studio.
              </p>
              <Link
                href="/prompt"
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface"
              >
                Open Prompt Studio<ArrowUpRight size={17} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </section>
          </aside>
        </div>
      )}
    </AppLayout>
  );
}

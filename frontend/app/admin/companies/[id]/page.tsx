'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Bot, Loader2, Phone, Save, Sparkles, Target, Users, Wallet } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/ui/MetricCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Field, Input } from '@/components/ui/Field';
import { buttonClass } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States';
import { CompanyStatusBadge, ActiveBadge, RoleBadge } from '@/components/admin/StatusPills';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { fetchApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/components/providers/AuthProvider';

const TABS = ['Overview', 'Users', 'Calls', 'Campaigns', 'Leads', 'Analytics', 'Billing', 'Prompt'] as const;
type Tab = (typeof TABS)[number];

const endpointFor = (companyId: string, t: Tab): string | null => {
  switch (t) {
    case 'Overview': return `/api/v1/admin/companies/${companyId}/overview`;
    case 'Users': return `/api/v1/admin/companies/${companyId}/users`;
    case 'Calls': return `/api/v1/admin/companies/${companyId}/calls`;
    case 'Campaigns': return `/api/v1/admin/companies/${companyId}/campaigns`;
    case 'Leads': return `/api/v1/admin/companies/${companyId}/leads`;
    case 'Analytics': return `/api/v1/admin/companies/${companyId}/analytics`;
    case 'Billing': return `/api/v1/admin/companies/${companyId}/billing`;
    case 'Prompt': return `/api/v1/admin/companies/${companyId}/prompt`;
  }
};

export default function AdminCompanyDetail() {
  const params = useParams();
  const companyId = params.id as string;
  const { setCompanyContext } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [tabData, setTabData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agentDraft, setAgentDraft] = useState('');
  const [savingAgent, setSavingAgent] = useState(false);
  // Presentation-only: failed loads (so an error is never shown as "No data").
  const [companyFailed, setCompanyFailed] = useState(false);
  const [tabFailed, setTabFailed] = useState(false);
  const currentId = useRef(companyId);
  currentId.current = companyId;

  // Switching company (e.g. from the header selector) reuses this page, so a response for the
  // previous company must never land on the new one: it would show the wrong company's details
  // and agent ID, and Save would then write them to the new company.
  useEffect(() => {
    let cancelled = false;
    setCompany(null);
    setAgentDraft('');
    setCompanyFailed(false);
    fetchApi(`/api/v1/admin/companies/${companyId}`)
      .then((r) => {
        if (cancelled) return;
        setCompany(r.data);
        setAgentDraft(r.data?.bolna_agent_id || '');
        setCompanyContext({ id: companyId, name: r.data?.name || 'Company' });
      })
      .catch(() => {
        if (!cancelled) setCompanyFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, setCompanyContext]);

  // Same rule for the tab content: only the latest tab / company request may set the data.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTabData(null);
    setTabFailed(false);
    const ep = endpointFor(companyId, tab);
    if (!ep) {
      setLoading(false);
      return;
    }
    fetchApi(ep)
      .then((r) => {
        if (!cancelled) setTabData(r.data);
      })
      .catch(() => {
        if (!cancelled) setTabFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, companyId]);

  const saveAgent = async () => {
    const target = companyId;
    setSavingAgent(true);
    try {
      await fetchApi(`/api/v1/admin/companies/${target}`, {
        method: 'PATCH',
        body: JSON.stringify({ bolna_agent_id: agentDraft || null }),
      });
      if (currentId.current === target) setCompany((c: any) => ({ ...c, bolna_agent_id: agentDraft }));
      alert('Saved');
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setSavingAgent(false);
    }
  };

  const back = (
    <Link href="/admin/companies" className="inline-flex h-6 items-center gap-1 text-xs text-ds-ink-3 hover:text-ds-primary">
      <ArrowLeft size={13} /> All companies
    </Link>
  );

  if (companyFailed) {
    return (
      <AppLayout title="Company">
        <PageHeader meta={back} title="Company" />
        <Panel>
          <ErrorState
            title="This company couldn’t be loaded"
            description="It may not exist, or the request failed. Pick a company from the selector in the header, or go back to the company list."
            action={<Link href="/admin/companies" className={buttonClass('outline', 'md')}>Back to companies</Link>}
          />
        </Panel>
      </AppLayout>
    );
  }

  const agentUnchanged = (agentDraft || '') === (company?.bolna_agent_id || '');

  return (
    <AppLayout title={company?.name || 'Company'}>
      <PageHeader
        meta={back}
        title={company?.name || <Skeleton className="inline-block h-7 w-56 align-middle" />}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {company ? <CompanyStatusBadge status={company.status} /> : null}
            <span className="text-xs text-ds-ink-3">
              ID <span className="font-mono">{companyId}</span>
            </span>
          </span>
        }
      />

      <Panel>
        <PanelHeader title="Dedicated Bolna agent" description="Calls for this company use this agent. Leave empty to clear it." />
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (company) saveAgent();
          }}
        >
          <Field label="Bolna agent ID" className="sm:flex-1">
            <Input
              className="font-mono"
              value={agentDraft}
              onChange={(e) => setAgentDraft(e.target.value)}
              placeholder="Agent ID for this company"
              disabled={!company}
            />
          </Field>
          <button type="submit" disabled={savingAgent || !company || agentUnchanged} className={buttonClass('primary', 'md')}>
            {savingAgent ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />}
            Save
          </button>
        </form>
      </Panel>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Company sections" idPrefix="company" />

      <div role="tabpanel" id="company-panel" aria-labelledby={`company-tab-${tab}`} tabIndex={0} className="min-w-0 space-y-4 outline-none">
        {loading ? (
          <LoadingState label={`Loading ${tab.toLowerCase()}…`}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[116px] animate-pulse rounded-xl border border-ds-line bg-ds-bg" />
              ))}
            </div>
          </LoadingState>
        ) : tabFailed ? (
          <Panel>
            <ErrorState title={`${tab} couldn’t be loaded`} description="The request failed. Switch tabs or reload the page to try again." />
          </Panel>
        ) : (
          <TabContent tab={tab} data={tabData} />
        )}
      </div>
    </AppLayout>
  );
}

const when = (v: unknown) => <span className="whitespace-nowrap text-ds-ink-2">{formatDateTime(v)}</span>;
const mono = (v: unknown) => <span className="font-mono text-xs text-ds-ink-2">{v === null || v === undefined || v === '' ? '—' : String(v)}</span>;
const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function TabContent({ tab, data }: { tab: Tab; data: any }) {
  if (!data) {
    return (
      <Panel>
        <EmptyState title="No data" description={`There is nothing to show for ${tab.toLowerCase()} yet.`} />
      </Panel>
    );
  }

  if (tab === 'Overview') {
    return (
      <>
        <p className="text-[13px] text-ds-ink-2">All-time figures for this company.</p>
        <section aria-label="Overview metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <MetricCard label="Total calls" value={String(data.total_calls ?? 0)} Icon={Phone} tone="violet" />
          <MetricCard label="Inbound calls" value={String(data.inbound_calls ?? 0)} Icon={Phone} tone="blue" />
          <MetricCard label="Outbound calls" value={String(data.outbound_calls ?? 0)} Icon={Phone} tone="blue" />
          <MetricCard label="Total leads" value={String(data.total_leads ?? 0)} Icon={Users} tone="blue" hint="Analysed calls" />
          <MetricCard label="Hot leads" value={String(data.hot_leads ?? 0)} Icon={Sparkles} tone="violet" />
          <MetricCard label="Total spend" value={inr(data.total_spending)} Icon={Wallet} tone="blue" />
        </section>
      </>
    );
  }

  if (tab === 'Analytics') {
    return (
      <>
        <p className="text-[13px] text-ds-ink-2">The last 30 days.</p>
        <section aria-label="Analytics metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <MetricCard label="Total leads" value={String(data.total_leads ?? 0)} Icon={Users} tone="blue" />
          <MetricCard label="Calls made" value={String(data.calls_made ?? 0)} Icon={Phone} tone="violet" />
          <MetricCard label="Connected" value={String(data.connected_calls ?? 0)} Icon={Phone} tone="blue" />
          <MetricCard label="Qualified" value={String(data.qualified_leads ?? 0)} Icon={Target} tone="violet" />
          <MetricCard label="Converted" value={String(data.converted_leads ?? 0)} Icon={Sparkles} tone="blue" />
          <MetricCard label="Conversion rate" value={String(data.conversion_rate ?? '0%')} Icon={Target} tone="violet" />
        </section>
      </>
    );
  }

  if (tab === 'Billing') {
    const usage: any[] = data.usage || [];
    return (
      <>
        <section aria-label="Billing metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <MetricCard label="Wallet balance" value={inr(data.wallet?.balance)} Icon={Wallet} tone="blue" hint={data.wallet?.plan_name || undefined} />
          <MetricCard label="Minutes used" value={String(data.wallet?.minutes_used ?? 0)} Icon={Phone} tone="violet" />
          <MetricCard label="Total spending" value={inr(data.wallet?.total_spending)} Icon={Wallet} tone="blue" />
        </section>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-ds-ink">Recent usage</h3>
          <DataTable
            label="Recent usage"
            minWidth={560}
            rows={usage}
            columns={[
              { key: 'created_at', label: 'Date', render: (r) => when(r.created_at) },
              { key: 'service_type', label: 'Service', render: (r) => (r.service_type ? <Badge variant="neutral">{String(r.service_type).replace(/_/g, ' ')}</Badge> : <span className="text-ds-ink-3">—</span>) },
              { key: 'billed_minutes', label: 'Billed minutes', align: 'right', className: 'tabular-nums' },
              { key: 'customer_cost', label: 'Cost', align: 'right', className: 'tabular-nums', render: (r) => (typeof r.customer_cost === 'number' ? inr(r.customer_cost) : <span className="text-ds-ink-3">—</span>) },
            ]}
            message={usage.length === 0 ? <EmptyState icon={<Wallet size={18} strokeWidth={1.75} />} title="No usage yet" description="Billed calls will be listed here." /> : undefined}
          />
        </div>
      </>
    );
  }

  if (tab === 'Prompt') {
    return (
      <Panel>
        <PanelHeader
          title="Agent prompt"
          description="The prompt this company’s agent is working from."
          action={data.prompt_status ? <StatusBadge status={data.prompt_status} /> : undefined}
        />
        {data.welcome_message && (
          <div className="mt-4">
            <p className="text-xs font-medium text-ds-ink-3">Greeting</p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-ds-surface px-3 py-2 text-[13px] text-ds-ink">{data.welcome_message}</p>
          </div>
        )}
        <div className="mt-4">
          <p className="text-xs font-medium text-ds-ink-3">Prompt</p>
          {data.prompt ? (
            <pre className="mt-1 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-ds-line bg-ds-surface p-3 text-[13px] leading-relaxed text-ds-ink">{data.prompt}</pre>
          ) : (
            <p className="mt-1 flex items-center gap-2 text-[13px] text-ds-ink-2"><Bot size={14} /> No prompt has been saved for this company.</p>
          )}
        </div>
      </Panel>
    );
  }

  const rows: any[] = Array.isArray(data) ? data : [];
  const config: Record<'Users' | 'Calls' | 'Campaigns' | 'Leads', { columns: Column<any>[]; empty: string }> = {
    Users: {
      empty: 'This company has no users.',
      columns: [
        { key: 'name', label: 'Name', className: 'font-medium' },
        { key: 'email', label: 'Email', render: (r) => <span className="text-ds-ink-2">{r.email || '—'}</span> },
        { key: 'role', label: 'Role', render: (r) => <RoleBadge role={r.role} /> },
        { key: 'is_active', label: 'Status', render: (r) => <ActiveBadge active={r.is_active !== false} /> },
      ],
    },
    Calls: {
      empty: 'No calls have been made for this company yet.',
      columns: [
        { key: 'call_id', label: 'Call ID', render: (r) => mono(r.call_id) },
        { key: 'customer_name', label: 'Customer' },
        { key: 'direction', label: 'Direction', render: (r) => (r.direction ? <Badge variant="neutral" className="capitalize">{r.direction}</Badge> : <span className="text-ds-ink-3">—</span>) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'created_at', label: 'Date', render: (r) => when(r.created_at) },
      ],
    },
    Campaigns: {
      empty: 'This company has no campaigns.',
      columns: [
        { key: 'name', label: 'Campaign', className: 'font-medium' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'leads_count', label: 'Leads', align: 'right', className: 'tabular-nums' },
        { key: 'calls_made', label: 'Calls made', align: 'right', className: 'tabular-nums' },
        { key: 'created_at', label: 'Created', render: (r) => when(r.created_at) },
      ],
    },
    Leads: {
      empty: 'This company has no leads.',
      columns: [
        { key: 'name', label: 'Name', className: 'font-medium' },
        { key: 'phone', label: 'Phone', render: (r) => mono(r.phone) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'aiScore', label: 'AI score', align: 'right', className: 'tabular-nums' },
        { key: 'created_at', label: 'Created', render: (r) => when(r.created_at) },
      ],
    },
  };
  const c = config[tab as 'Users' | 'Calls' | 'Campaigns' | 'Leads'];
  return (
    <DataTable
      label="Company records"
      minWidth={640}
      rows={rows}
      columns={c.columns}
      message={rows.length === 0 ? <EmptyState title={`No ${tab.toLowerCase()}`} description={c.empty} /> : undefined}
    />
  );
}

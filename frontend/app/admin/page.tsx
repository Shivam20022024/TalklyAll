'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Building2, CreditCard, Phone, Sparkles, Target, TrendingUp, UserCheck, Users, Wallet } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/ui/MetricCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/button';
import { CompanyStatusBadge } from '@/components/admin/StatusPills';
import { DataTable } from '@/components/admin/DataTable';
import { fetchApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/components/providers/AuthProvider';

const num = (v: unknown) => Number(v ?? 0).toLocaleString('en-IN');
const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PlatformDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Presentation-only: the figures request failed (never show zeros in its place).
  const [failed, setFailed] = useState(false);
  // Extra context from existing admin endpoints; each is optional and only shown when it loaded.
  const [recent, setRecent] = useState<any[] | null>(null);
  const [requestStats, setRequestStats] = useState<any>(null);
  const router = useRouter();
  const { setCompanyContext } = useAuth();

  useEffect(() => {
    fetchApi('/api/v1/admin/dashboard')
      .then((r) => setData(r.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchApi('/api/v1/admin/companies?limit=5')
      .then((r) => setRecent(r.data || []))
      .catch(() => {});
    fetchApi('/api/v1/admin/access-requests/stats')
      .then((s) => setRequestStats(s))
      .catch(() => {});
  }, []);

  // Same company-selection behaviour as the Companies page.
  const view = (c: any) => {
    setCompanyContext({ id: c.company_id, name: c.name });
    router.push(`/admin/companies/${c.company_id}`);
  };

  const group = (id: string, title: string, description: string, cards: ReactNode, cols: string) => (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-base font-semibold text-ds-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-ds-ink-2">{description}</p>
      </div>
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cols}`}>{cards}</div>
    </section>
  );

  const pending = Number(requestStats?.pending ?? 0);

  return (
    <AppLayout title="Platform Dashboard">
      <PageHeader
        title="Platform overview"
        description="Global figures across every company on TalklyAI."
        actions={
          <>
            <Link href="/admin/access-requests" className={buttonClass('outline', 'md')}>
              <UserCheck size={15} strokeWidth={1.75} />
              Access requests
            </Link>
            <Link href="/admin/companies" className={buttonClass('primary', 'md')}>
              <Building2 size={15} strokeWidth={1.75} />
              Manage companies
            </Link>
          </>
        }
      />

      {pending > 0 && (
        <Alert
          tone="info"
          title={`${pending} access ${pending === 1 ? 'request is' : 'requests are'} waiting for review`}
          action={
            <Link href="/admin/access-requests" className={buttonClass('outline', 'sm')}>
              Review
            </Link>
          }
        >
          Approving a request creates the company and its admin login.
        </Alert>
      )}

      {loading ? (
        <LoadingState label="Loading platform figures…">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[116px] animate-pulse rounded-xl border border-ds-line bg-ds-bg" />
            ))}
          </div>
          <Skeleton className="mt-6 h-48 w-full" />
        </LoadingState>
      ) : failed || !data ? (
        <Panel>
          <ErrorState
            title="Platform figures couldn’t be loaded"
            description="The request failed, so nothing is shown rather than zeros that could be mistaken for real counts. Reload the page to try again."
          />
        </Panel>
      ) : (
        <>
          {group(
            'tenants-heading',
            'Companies and users',
            'Tenants on the platform and the people using them.',
            <>
              <MetricCard label="Total companies" value={num(data.total_companies)} Icon={Building2} tone="blue" />
              <MetricCard
                label="Active companies"
                value={num(data.active_companies)}
                Icon={Activity}
                tone="green"
                hint={`${num(Math.max(0, Number(data.total_companies ?? 0) - Number(data.active_companies ?? 0)))} not active`}
              />
              <MetricCard label="Total users" value={num(data.total_users)} Icon={Users} tone="violet" />
              <MetricCard label="Total campaigns" value={num(data.total_campaigns)} Icon={Target} tone="orange" />
            </>,
            'xl:grid-cols-4'
          )}

          {group(
            'activity-heading',
            'Leads and calls',
            'Across all companies, all time.',
            <>
              <MetricCard label="Total leads" value={num(data.total_leads)} Icon={Users} tone="blue" />
              <MetricCard label="Total calls" value={num(data.total_calls)} Icon={Phone} tone="violet" />
              <MetricCard label="Interested leads" value={num(data.interested_leads)} Icon={Sparkles} tone="green" hint="Interested or qualified" />
              <MetricCard label="Conversions" value={num(data.conversions)} Icon={TrendingUp} tone="orange" hint="Leads marked converted" />
            </>,
            'xl:grid-cols-4'
          )}

          {group(
            'money-heading',
            'Billing',
            'Wallet and usage totals across all companies.',
            <>
              <MetricCard label="Revenue" value={inr(data.revenue)} Icon={CreditCard} tone="green" hint="Completed wallet top-ups" />
              {data.usage_spend !== undefined && data.usage_spend !== null && (
                <MetricCard label="Usage spend" value={inr(data.usage_spend)} Icon={Wallet} tone="blue" hint="Charged for calls" />
              )}
            </>,
            'xl:grid-cols-4'
          )}
        </>
      )}

      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="recent-heading" className="text-base font-semibold text-ds-ink">Newest companies</h2>
            <p className="mt-0.5 text-[13px] text-ds-ink-2">The most recently added tenants. Select one to open it.</p>
          </div>
          <Link href="/admin/companies" className="inline-flex h-6 items-center text-[13px] font-medium text-ds-primary hover:underline">
            View all companies
          </Link>
        </div>
        {recent === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <DataTable
            label="Newest companies"
            minWidth={640}
            rows={recent}
            rowKey={(c) => c.company_id}
            message={
              recent.length === 0 ? (
                <EmptyState icon={<Building2 size={18} strokeWidth={1.75} />} title="No companies yet" description="Companies appear here once an access request is approved." />
              ) : undefined
            }
            columns={[
              {
                key: 'name',
                label: 'Company',
                render: (c) => (
                  <button type="button" onClick={() => view(c)} className="inline-flex min-h-6 items-center text-left font-medium text-ds-ink hover:text-ds-primary hover:underline">
                    {c.name}
                  </button>
                ),
              },
              { key: 'status', label: 'Status', render: (c) => <CompanyStatusBadge status={c.status} /> },
              { key: 'users', label: 'Users', align: 'right', className: 'tabular-nums', render: (c) => num(c.stats?.users) },
              { key: 'calls', label: 'Calls', align: 'right', className: 'tabular-nums', render: (c) => num(c.stats?.calls) },
              { key: 'leads', label: 'Leads', align: 'right', className: 'tabular-nums', render: (c) => num(c.stats?.leads) },
              { key: 'created_at', label: 'Added', render: (c) => <span className="whitespace-nowrap text-ds-ink-2">{formatDate(c.created_at)}</span> },
            ]}
          />
        )}
      </section>
    </AppLayout>
  );
}

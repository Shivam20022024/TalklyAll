'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar, SearchInput } from '@/components/ui/Toolbar';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/button';
import { CompanyStatusBadge } from '@/components/admin/StatusPills';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fetchApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/components/providers/AuthProvider';

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Presentation-only state: result count, failed load, client-side status filter, deactivate confirmation.
  const [total, setTotal] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [confirming, setConfirming] = useState<any>(null);
  const latest = useRef(0);
  const router = useRouter();
  const { setCompanyContext } = useAuth();

  const load = useCallback(async () => {
    // Searches are debounced; ignore a response that arrives after a newer request was made.
    const seq = ++latest.current;
    setLoading(true);
    try {
      const r = await fetchApi(`/api/v1/admin/companies?limit=200${query ? `&search=${encodeURIComponent(query)}` : ''}`);
      if (seq !== latest.current) return;
      setCompanies(r.data || []);
      setTotal(typeof r.total === 'number' ? r.total : null);
      setLoadFailed(false);
    } catch {
      if (seq !== latest.current) return;
      setLoadFailed(true);
    } finally {
      if (seq === latest.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggleStatus = async (c: any) => {
    setBusy(c.company_id);
    try {
      const action = c.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await fetchApi(`/api/v1/admin/companies/${c.company_id}/${action}`, { method: 'POST' });
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const view = (c: any) => {
    setCompanyContext({ id: c.company_id, name: c.name });
    router.push(`/admin/companies/${c.company_id}`);
  };

  const statuses = Array.from(new Set(companies.map((c) => String(c.status || '').toUpperCase()).filter(Boolean)));
  const visible = statusFilter === 'ALL' ? companies : companies.filter((c) => String(c.status || '').toUpperCase() === statusFilter);
  const truncated = total !== null && total > companies.length;
  const filtered = !!query || statusFilter !== 'ALL';

  return (
    <AppLayout title="Companies">
      <PageHeader title="Companies" description="Search tenant companies, open their details, and activate or deactivate them." />

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search companies" label="Search companies" />
        <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-44">
          <option value="ALL">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs tabular-nums text-ds-ink-3" aria-live="polite">
          {loading ? 'Loading…' : loadFailed ? '' : `${visible.length} ${visible.length === 1 ? 'company' : 'companies'}${truncated ? ` of ${total}` : ''}`}
        </span>
      </Toolbar>

      {truncated && !loading && (
        <Alert tone="info">
          Showing the first {companies.length} of {total} companies. Use the search to find the others.
        </Alert>
      )}

      <DataTable
        label="Companies"
        minWidth={860}
        rows={loadFailed ? [] : visible}
        rowKey={(c) => c.company_id}
        message={
          loading && companies.length === 0 ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-[13px] text-ds-ink-2">
              <Loader2 size={16} className="animate-spin" /> Loading companies…
            </div>
          ) : loadFailed ? (
            <ErrorState title="Companies couldn’t be loaded" description="Change the search or reload the page to try again." />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Building2 size={18} strokeWidth={1.75} />}
              title={filtered ? 'No companies match' : 'No companies yet'}
              description={filtered ? 'Try a different search or status.' : 'Companies appear here once an access request is approved.'}
            />
          ) : undefined
        }
        columns={[
          {
            key: 'name',
            label: 'Company',
            render: (c) => (
              <button type="button" onClick={() => view(c)} className="flex min-h-6 items-center gap-2 text-left font-medium text-ds-ink hover:text-ds-primary hover:underline">
                <Building2 size={15} strokeWidth={1.75} className="shrink-0 text-ds-ink-3" />
                {c.name}
              </button>
            ),
          },
          { key: 'status', label: 'Status', render: (c) => <CompanyStatusBadge status={c.status} /> },
          { key: 'users', label: 'Users', align: 'right', className: 'tabular-nums', render: (c) => Number(c.stats?.users ?? 0).toLocaleString('en-IN') },
          { key: 'calls', label: 'Calls', align: 'right', className: 'tabular-nums', render: (c) => Number(c.stats?.calls ?? 0).toLocaleString('en-IN') },
          { key: 'leads', label: 'Leads', align: 'right', className: 'tabular-nums', render: (c) => Number(c.stats?.leads ?? 0).toLocaleString('en-IN') },
          {
            key: 'bolna',
            label: 'Bolna agent',
            render: (c) =>
              c.bolna_agent_id ? (
                <span className="font-mono text-xs text-ds-ink-2" title={String(c.bolna_agent_id)}>
                  {String(c.bolna_agent_id).slice(0, 10)}…
                </span>
              ) : (
                <Badge variant="warning">Not set</Badge>
              ),
          },
          { key: 'created_at', label: 'Added', render: (c) => <span className="whitespace-nowrap text-ds-ink-2">{formatDate(c.created_at)}</span> },
          {
            key: 'actions',
            label: 'Actions',
            align: 'right',
            render: (c) => (
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => view(c)} className={buttonClass('secondary', 'sm')}>
                  View
                </button>
                <button
                  type="button"
                  onClick={() => (c.status === 'ACTIVE' ? setConfirming(c) : toggleStatus(c))}
                  disabled={busy === c.company_id}
                  aria-label={`${c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${c.name}`}
                  className={buttonClass(c.status === 'ACTIVE' ? 'danger' : 'outline', 'sm')}
                >
                  {busy === c.company_id ? <Loader2 size={13} className="animate-spin" /> : c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!confirming}
        title={confirming ? `Deactivate ${confirming.name}?` : ''}
        confirmLabel="Deactivate company"
        busy={!!confirming && busy === confirming.company_id}
        onClose={() => setConfirming(null)}
        onConfirm={async () => {
          const target = confirming;
          if (!target) return;
          await toggleStatus(target);
          setConfirming(null);
        }}
      >
        This changes the company’s status to SUSPENDED. The platform currently records this status but does not use it to block the company’s users, so
        their access is unchanged. To stop a specific person from signing in, deactivate that user on the Users page. You can activate the company again at any time.
      </ConfirmDialog>
    </AppLayout>
  );
}

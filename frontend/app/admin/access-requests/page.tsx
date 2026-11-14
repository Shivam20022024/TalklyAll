'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, X, UserCheck } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/MetricCard';
import { Segmented } from '@/components/ui/Segmented';
import { Toolbar } from '@/components/ui/Toolbar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/button';
import { DataTable } from '@/components/admin/DataTable';
import { fetchApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];
// Display labels for the filter; the value sent to the API is still the upper-case status above.
const LABELS = ['Pending', 'Approved', 'Rejected', 'All'] as const;

export default function AccessRequestsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Presentation-only: a failed load must not look like "no requests".
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        fetchApi(`/api/v1/admin/access-requests?status=${status}&limit=100`),
        fetchApi('/api/v1/admin/access-requests/stats').catch(() => null),
      ]);
      setItems(list.items || []);
      setStats(s);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, kind: 'approve' | 'reject') => {
    if (kind === 'reject' && !confirm('Reject this request?')) return;
    setBusy(id);
    try {
      await fetchApi(`/api/v1/admin/access-requests/${id}/${kind}`, {
        method: 'POST',
        body: kind === 'reject' ? JSON.stringify({ reason: 'Not approved' }) : undefined,
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const label = LABELS[Math.max(0, STATUSES.indexOf(status))];

  return (
    <AppLayout title="Access Requests">
      <PageHeader title="Access requests" description="Review requests for platform access. Approving a request creates the company and its admin login." />

      {stats && (
        <section aria-label="Request totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatTile label="Pending" value={stats.pending} hint="Waiting for review" />
          <StatTile label="Approved" value={stats.approved} />
          <StatTile label="Rejected" value={stats.rejected} />
          <StatTile label="Companies" value={stats.total_companies} hint="On the platform" />
        </section>
      )}

      <Toolbar>
        <Segmented label="Request status" options={LABELS} value={label} onChange={(l) => setStatus(l.toUpperCase())} />
        <span className="ml-auto text-xs tabular-nums text-ds-ink-3" aria-live="polite">
          {loading ? 'Loading…' : loadFailed ? '' : `${items.length} ${items.length === 1 ? 'request' : 'requests'}`}
        </span>
      </Toolbar>

      <DataTable
        label="Access requests"
        minWidth={760}
        rows={loadFailed ? [] : items}
        rowKey={(r, i) => String(r.id || r._id || i)}
        message={
          loading && items.length === 0 ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-[13px] text-ds-ink-2">
              <Loader2 size={16} className="animate-spin" /> Loading requests…
            </div>
          ) : loadFailed ? (
            <ErrorState title="Requests couldn’t be loaded" action={<button type="button" onClick={load} className={buttonClass('outline', 'md')}>Try again</button>} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<UserCheck size={18} strokeWidth={1.75} />}
              title={status === 'ALL' ? 'No requests yet' : `No ${label.toLowerCase()} requests`}
              description={status === 'PENDING' ? 'New access requests will appear here.' : undefined}
            />
          ) : undefined
        }
        columns={[
          { key: 'company_name', label: 'Company', className: 'font-medium' },
          { key: 'contact_name', label: 'Contact', render: (r) => r.contact_name || <span className="text-ds-ink-3">—</span> },
          { key: 'email', label: 'Email', render: (r) => <span className="text-ds-ink-2">{r.email || '—'}</span> },
          { key: 'created_at', label: 'Requested', render: (r) => <span className="whitespace-nowrap text-ds-ink-2">{formatDate(r.created_at)}</span> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            label: 'Actions',
            align: 'right',
            render: (r) =>
              r.status === 'PENDING' ? (
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => act(r.id, 'approve')} disabled={busy === r.id} aria-label={`Approve ${r.company_name}`} className={buttonClass('primary', 'sm')}>
                    {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
                    Approve
                  </button>
                  <button type="button" onClick={() => act(r.id, 'reject')} disabled={busy === r.id} aria-label={`Reject ${r.company_name}`} className={buttonClass('outline', 'sm')}>
                    <X size={13} strokeWidth={2} />
                    Reject
                  </button>
                </div>
              ) : null,
          },
        ]}
      />
    </AppLayout>
  );
}

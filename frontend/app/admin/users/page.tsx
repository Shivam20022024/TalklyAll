'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Users } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar, SearchInput } from '@/components/ui/Toolbar';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/button';
import { ActiveBadge, RoleBadge, roleLabel } from '@/components/admin/StatusPills';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fetchApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Presentation-only state: failed load, client-side role/status filters, deactivate confirmation.
  const [loadFailed, setLoadFailed] = useState(false);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [confirming, setConfirming] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi('/api/v1/admin/users');
      setUsers(r.data || []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (u: any) => {
    setBusy(u.user_id);
    try {
      await fetchApi(`/api/v1/admin/users/${u.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !(u.is_active !== false) }),
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const visible = users.filter(
    (u) =>
      ((u.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(q.toLowerCase()) ||
        (u.company_name || '').toLowerCase().includes(q.toLowerCase())) &&
      (roleFilter === 'ALL' || u.role === roleFilter) &&
      (statusFilter === 'ALL' || (statusFilter === 'ACTIVE') === (u.is_active !== false)),
  );

  const roles = Array.from(new Set(users.map((u) => u.role).filter(Boolean))) as string[];
  const filtered = !!q || roleFilter !== 'ALL' || statusFilter !== 'ALL';

  return (
    <AppLayout title="Users">
      <PageHeader title="Users" description="Every user across all companies, with their role and workspace." />

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email, company" label="Search users" className="sm:w-72" />
        <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="sm:w-44">
          <option value="ALL">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-40">
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
        <span className="ml-auto text-xs tabular-nums text-ds-ink-3" aria-live="polite">
          {loading ? 'Loading…' : loadFailed ? '' : `${visible.length} of ${users.length} users`}
        </span>
      </Toolbar>

      <DataTable
        label="Users"
        minWidth={820}
        rows={loadFailed ? [] : visible}
        rowKey={(u) => u.user_id}
        message={
          loading && users.length === 0 ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-[13px] text-ds-ink-2">
              <Loader2 size={16} className="animate-spin" /> Loading users…
            </div>
          ) : loadFailed ? (
            <ErrorState title="Users couldn’t be loaded" action={<button type="button" onClick={load} className={buttonClass('outline', 'md')}>Try again</button>} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Users size={18} strokeWidth={1.75} />}
              title={filtered ? 'No users match' : 'No users yet'}
              description={filtered ? 'Try a different search or filter.' : undefined}
            />
          ) : undefined
        }
        columns={[
          { key: 'name', label: 'Name', className: 'font-medium', render: (u) => u.name || '—' },
          { key: 'email', label: 'Email', render: (u) => <span className="text-ds-ink-2">{u.email || '—'}</span> },
          {
            key: 'company',
            label: 'Company',
            render: (u) =>
              u.company_name && u.company_id ? (
                <Link href={`/admin/companies/${u.company_id}`} className="text-ds-ink hover:text-ds-primary hover:underline">
                  {u.company_name}
                </Link>
              ) : (
                <span className="text-ds-ink-3">{u.role === 'super_admin' ? 'Platform' : '—'}</span>
              ),
          },
          { key: 'role', label: 'Role', render: (u) => <RoleBadge role={u.role} /> },
          { key: 'is_active', label: 'Status', render: (u) => <ActiveBadge active={u.is_active !== false} /> },
          { key: 'created_at', label: 'Joined', render: (u) => <span className="whitespace-nowrap text-ds-ink-2">{formatDate(u.created_at)}</span> },
          {
            key: 'actions',
            label: 'Actions',
            align: 'right',
            render: (u) =>
              u.role !== 'super_admin' ? (
                <button
                  type="button"
                  onClick={() => (u.is_active === false ? toggleActive(u) : setConfirming(u))}
                  disabled={busy === u.user_id}
                  aria-label={`${u.is_active === false ? 'Activate' : 'Deactivate'} ${u.name || u.email}`}
                  className={buttonClass(u.is_active === false ? 'outline' : 'danger', 'sm')}
                >
                  {busy === u.user_id ? <Loader2 size={13} className="animate-spin" /> : u.is_active === false ? 'Activate' : 'Deactivate'}
                </button>
              ) : null,
          },
        ]}
      />

      <ConfirmDialog
        open={!!confirming}
        title={confirming ? `Deactivate ${confirming.name || confirming.email}?` : ''}
        confirmLabel="Deactivate user"
        busy={!!confirming && busy === confirming.user_id}
        onClose={() => setConfirming(null)}
        onConfirm={async () => {
          const target = confirming;
          if (!target) return;
          await toggleActive(target);
          setConfirming(null);
        }}
      >
        They will no longer be able to sign in{confirming?.company_name ? ` to ${confirming.company_name}` : ''}. You can activate them again at any time from this page.
      </ConfirmDialog>
    </AppLayout>
  );
}

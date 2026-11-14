'use client'

import { Building2, Crown, Mail, ShieldCheck, User, UserPlus, Users, UsersRound } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { useAuth } from '@/components/providers/AuthProvider'
import { EmptyState, LoadingState, Skeleton } from '@/components/ui/States'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  company_admin: 'Company admin',
}

function roleLabel(role?: string) {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function initials(name?: string, email?: string) {
  const source = (name || email || '').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase()
}

export default function TeamPage() {
  const { user, loading, isSuperAdmin } = useAuth()

  const card = 'rounded-2xl border border-ds-line bg-ds-bg p-5 shadow-sm sm:p-6'
  const roleTone = isSuperAdmin ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'
  const RoleIcon = isSuperAdmin ? ShieldCheck : Crown
  const cardHead = (icon: React.ReactNode, id: string, title: string, description?: string, action?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className={`flex min-w-0 gap-3.5 ${description ? 'items-start' : 'items-center'}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h2 id={id} className="text-[19px] font-semibold leading-tight text-ds-ink">{title}</h2>
          {description && <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
  const detailRow = (Icon: any, label: string, value: React.ReactNode) => (
    <div className="flex items-center gap-4 border-b border-ds-line py-4 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ds-surface text-ds-ink-2" aria-hidden="true"><Icon size={19} strokeWidth={1.75} /></span>
      <dt className="w-16 shrink-0 text-[15px] text-ds-ink-2 sm:w-24">{label}</dt>
      <dd className="min-w-0 flex-1 text-[16px] font-medium text-ds-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )

  return (
    <AppLayout title="Team">
      {/* Page header */}
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Team</h1>
        <p className="mt-1.5 text-[16px] text-ds-ink-2 sm:text-[17px]">Your workspace members and their roles.</p>
      </header>

      {loading && !user ? (
        <LoadingState label="Loading your account…">
          <div className="space-y-5">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-52 w-full rounded-2xl" />
          </div>
        </LoadingState>
      ) : !user ? (
        <div className={card}>
          <EmptyState icon={<Users size={18} strokeWidth={1.75} />} title="Account details aren’t available" description="Sign in again to see your account." />
        </div>
      ) : (
        <>
          {/* Profile overview */}
          <section aria-label="Your account" className="relative overflow-hidden rounded-2xl border border-ds-line bg-gradient-to-r from-blue-50/80 via-white to-violet-50/50 p-5 shadow-sm sm:p-6">
            <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-[22px] font-bold text-ds-primary ring-1 ring-white/70 sm:h-[72px] sm:w-[72px] sm:text-[26px]" aria-hidden="true">
                {initials(user.name, user.email)}
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="truncate text-[24px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[26px]">{user.name || user.email}</p>
                {user.name && <p className="mt-1 truncate text-[16px] text-ds-ink-2">{user.email}</p>}
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold ${roleTone}`}>
                <RoleIcon size={17} strokeWidth={1.75} aria-hidden="true" />
                {roleLabel(user.role)}
              </span>
            </div>
          </section>

          {/* Workspace details */}
          <section className={card} aria-labelledby="workspace-title">
            {cardHead(<Building2 size={21} strokeWidth={1.75} />, 'workspace-title', 'Workspace Details')}
            <dl className="mt-3 grid gap-x-10 md:grid-cols-2">
              {detailRow(User, 'Name', user.name || '—')}
              {detailRow(Mail, 'Email', user.email || '—')}
              {detailRow(UsersRound, 'Role', <span className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold ${roleTone}`}>{roleLabel(user.role)}</span>)}
              {detailRow(Building2, 'Company', user.company_name || '—')}
            </dl>
          </section>
        </>
      )}

      {/* Members */}
      <section className={card} aria-labelledby="members-title">
        {cardHead(
          <Users size={21} strokeWidth={1.75} />,
          'members-title',
          'Members',
          'Everyone with access to this workspace.',
          // There is no invitation endpoint, so the action is shown but cannot be used.
          <button
            type="button"
            disabled
            title="Inviting members isn’t available yet"
            className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink opacity-50"
          >
            <UserPlus size={17} strokeWidth={1.75} />
            Invite member
          </button>
        )}
        <div className="mt-5 flex flex-col items-center rounded-xl border border-ds-line bg-ds-surface/50 px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-ds-primary" aria-hidden="true"><Users size={30} strokeWidth={1.75} /></span>
          <h3 className="mt-4 text-[19px] font-semibold text-ds-ink">The member list isn’t available yet</h3>
          <p className="mt-1.5 max-w-lg text-[15px] leading-relaxed text-ds-ink-2">Once the platform supports team accounts, members, their roles and invitations will be listed here.</p>
        </div>
      </section>
    </AppLayout>
  )
}

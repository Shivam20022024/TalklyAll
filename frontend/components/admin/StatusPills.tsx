import { Badge, type BadgeVariant } from '@/components/ui/Badge'

const DOT: Record<BadgeVariant, string> = {
  neutral: 'bg-ds-ink-3',
  primary: 'bg-ds-primary',
  accent: 'bg-ds-accent',
  success: 'bg-ds-success',
  warning: 'bg-ds-warning',
  error: 'bg-ds-error',
}

/**
 * Presentation-only colours for the company status values the API returns
 * (ACTIVE / SUSPENDED / TRIAL / INACTIVE). The text shown is always the original value.
 */
export function companyStatusVariant(status?: string | null): BadgeVariant {
  switch (String(status ?? '').trim().toUpperCase()) {
    case 'ACTIVE':
      return 'success'
    case 'SUSPENDED':
      return 'error'
    case 'TRIAL':
      return 'accent'
    default:
      return 'neutral'
  }
}

export function CompanyStatusBadge({ status }: { status?: string | null }) {
  const label = String(status ?? '').trim()
  if (!label) return <span className="text-ds-ink-3">—</span>
  const variant = companyStatusVariant(label)
  return (
    <Badge variant={variant}>
      <i className={`h-1.5 w-1.5 rounded-full ${DOT[variant]}`} aria-hidden="true" />
      {label}
    </Badge>
  )
}

/** A user's active flag. The API treats a missing flag as active. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      <i className={`h-1.5 w-1.5 rounded-full ${active ? DOT.success : DOT.neutral}`} aria-hidden="true" />
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

const ROLE_LABELS: Record<string, string> = { super_admin: 'Super admin', company_admin: 'Company admin' }

export function roleLabel(role?: string | null) {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function RoleBadge({ role }: { role?: string | null }) {
  if (!role) return <span className="text-ds-ink-3">—</span>
  return <Badge variant={role === 'super_admin' ? 'accent' : 'neutral'}>{roleLabel(role)}</Badge>
}

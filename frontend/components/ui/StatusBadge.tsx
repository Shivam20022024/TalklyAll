import { Badge, type BadgeVariant } from './Badge';

/**
 * Presentation-only mapping of the status strings the API already returns
 * (leads, calls, campaigns, companies, access requests, collections, WhatsApp)
 * to badge colors. It never changes or interprets the value itself: the label
 * shown is the original string, and unknown values fall back to neutral.
 */
const VARIANT_BY_STATUS: Record<string, BadgeVariant> = {
  // Lead pipeline
  new: 'neutral',
  calling: 'primary',
  contacted: 'primary',
  interested: 'accent',
  'follow up': 'accent',
  urgent: 'warning',
  qualified: 'primary',
  converted: 'success',
  'no answer': 'warning',
  busy: 'warning',
  'not interested': 'neutral',
  // Display-only statuses derived by the call pages when a call never connected
  'not received': 'warning',
  'not answered': 'warning',
  // Calls
  initiating: 'neutral',
  initiated: 'neutral',
  'in progress': 'primary',
  active: 'primary',
  completed: 'success',
  analyzed: 'success',
  failed: 'error',
  error: 'error',
  // Campaigns / companies / requests
  paused: 'warning',
  draft: 'neutral',
  trial: 'accent',
  suspended: 'error',
  inactive: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  // Collections promise-to-pay reconciliation
  kept: 'success',
  kept_late: 'warning',
  partial: 'warning',
  broken: 'error',
  // WhatsApp delivery
  sent: 'success',
  simulated: 'neutral',
};

const DOT: Record<BadgeVariant, string> = {
  neutral: 'bg-ds-ink-3',
  primary: 'bg-ds-primary',
  accent: 'bg-ds-accent',
  success: 'bg-ds-success',
  warning: 'bg-ds-warning',
  error: 'bg-ds-error',
};

export function statusVariant(status?: string | null): BadgeVariant {
  return VARIANT_BY_STATUS[String(status ?? '').trim().toLowerCase()] ?? 'neutral';
}

export function StatusBadge({ status, className = '' }: { status?: string | null; className?: string }) {
  const label = String(status ?? '').trim();
  if (!label) return <span className="text-ds-ink-3">—</span>;
  const variant = statusVariant(label);
  return (
    <Badge variant={variant} className={className}>
      <i className={`h-1.5 w-1.5 rounded-full ${DOT[variant]}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}

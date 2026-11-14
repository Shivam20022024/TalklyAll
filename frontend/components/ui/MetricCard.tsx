import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  /** Optional delta shown as a pill. Hidden when empty. Never invent this value. */
  change?: string;
  Icon: LucideIcon;
  tone: 'blue' | 'violet' | 'green' | 'orange';
  /** Optional one-line caption under the value. */
  hint?: string;
}

// Icon tiles stay on the brand palette. Green is reserved for positive
// indicators and success states, so it is not used as a decorative tile color.
const TILE: Record<MetricCardProps['tone'], string> = {
  blue: 'bg-ds-primary-soft text-ds-primary',
  green: 'bg-ds-primary-soft text-ds-primary',
  violet: 'bg-ds-accent-soft text-ds-accent',
  orange: 'bg-ds-accent-soft text-ds-accent',
};

function deltaStyle(change: string) {
  const c = change.trim();
  if (c.startsWith('+')) return 'bg-ds-success-soft text-ds-success-ink';
  if (c.startsWith('-') || c.startsWith('−')) return 'bg-ds-error-soft text-ds-error-ink';
  return 'bg-ds-surface text-ds-ink-2';
}

/**
 * Compact summary tile for list pages (campaign totals, inbound stats,
 * collections recovery). Only pass values that come from the API.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'success' | 'error';
}) {
  const valueColor = tone === 'success' ? 'text-ds-success-ink' : tone === 'error' ? 'text-ds-error-ink' : 'text-ds-ink';
  return (
    <div className="rounded-xl border border-ds-line bg-ds-bg px-4 py-3.5">
      <p className="truncate text-xs font-medium text-ds-ink-2">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ds-ink-3">{hint}</p>}
    </div>
  );
}

export function MetricCard({ label, value, change, Icon, tone, hint }: MetricCardProps) {
  const showChange = !!change && change.trim().length > 0;
  return (
    <article className="rounded-xl border border-ds-line bg-ds-bg p-4 transition-colors hover:border-ds-line-strong sm:p-5">
      {/* Phones show two cards per row, so labels may take two lines there instead of truncating. */}
      <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
        {/* A label, not a heading: cards sit directly under the page title, so an h3 here skips heading levels. */}
        <p className="line-clamp-2 min-h-8 min-w-0 text-xs font-medium leading-4 text-ds-ink-2 sm:line-clamp-1 sm:min-h-0 sm:text-[13px] sm:leading-5">
          {label}
        </p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${TILE[tone]}`} aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold leading-none tracking-tight text-ds-ink tabular-nums sm:text-[28px]">{value}</p>
        {showChange && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${deltaStyle(change!)}`}>{change}</span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-ds-ink-3">{hint}</p>}
    </article>
  );
}

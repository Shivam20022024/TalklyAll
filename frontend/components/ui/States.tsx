import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';

/** Nothing to show yet: explains why and, when possible, offers the next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ds-surface text-ds-ink-3" aria-hidden="true">
        {icon ?? <Inbox size={18} strokeWidth={1.75} />}
      </span>
      <p className="mt-3 text-sm font-medium text-ds-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ds-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Data could not be loaded. Says what failed and what happens next; never invents data. */
export function ErrorState({
  title = 'Couldn’t load this data',
  description,
  action,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ds-error-soft text-ds-error-ink" aria-hidden="true">
        <AlertTriangle size={18} strokeWidth={1.75} />
      </span>
      <p className="mt-3 text-sm font-medium text-ds-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] text-ds-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Neutral placeholder block that matches the shape of the content it stands in for. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ds-line/60 ${className}`} aria-hidden="true" />;
}

/** Wraps skeletons with a screen-reader announcement so loading isn't silent. */
export function LoadingState({ label = 'Loading…', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

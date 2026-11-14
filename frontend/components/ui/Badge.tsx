import type { ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error';

const STYLES: Record<BadgeVariant, string> = {
  neutral: 'bg-ds-surface text-ds-ink-2 border-ds-line',
  primary: 'bg-ds-primary-soft text-ds-primary border-transparent',
  accent: 'bg-ds-accent-soft text-ds-accent border-transparent',
  success: 'bg-ds-success-soft text-ds-success-ink border-transparent',
  warning: 'bg-ds-warning-soft text-ds-warning-ink border-transparent',
  error: 'bg-ds-error-soft text-ds-error-ink border-transparent',
};

export function Badge({
  variant = 'neutral',
  children,
  className = '',
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

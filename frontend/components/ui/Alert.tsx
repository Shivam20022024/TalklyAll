import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Tone = 'info' | 'warning' | 'error' | 'success';

const STYLE: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-ds-primary/20 bg-ds-primary-soft text-ds-ink', icon: <Info size={16} strokeWidth={1.75} className="text-ds-primary" /> },
  warning: { box: 'border-ds-warning/30 bg-ds-warning-soft text-ds-ink', icon: <AlertTriangle size={16} strokeWidth={1.75} className="text-ds-warning-ink" /> },
  error: { box: 'border-ds-error/25 bg-ds-error-soft text-ds-ink', icon: <XCircle size={16} strokeWidth={1.75} className="text-ds-error-ink" /> },
  success: { box: 'border-ds-success/25 bg-ds-success-soft text-ds-ink', icon: <CheckCircle2 size={16} strokeWidth={1.75} className="text-ds-success-ink" /> },
};

/**
 * Inline, non-blocking notice. Uses role="status" (polite) by default so it is
 * announced without interrupting; pass urgent for role="alert".
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  urgent = false,
  className = '',
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  urgent?: boolean;
  className?: string;
}) {
  const s = STYLE[tone];
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${s.box} ${className}`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {s.icon}
      </span>
      <div className="min-w-0 flex-1 text-[13px]">
        {title && <p className="font-medium text-ds-ink">{title}</p>}
        {children && <div className={`text-ds-ink-2 ${title ? 'mt-0.5' : ''}`}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

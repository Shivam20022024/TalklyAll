import type { ReactNode } from 'react';

/** Label + value over a thin progress bar (funnels, distributions). */
export function BarRow({
  label,
  value,
  percent,
  barClassName = 'bg-ds-primary',
  dotClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 0 to 100. */
  percent: number;
  barClassName?: string;
  /** When set, shows a leading color dot. */
  dotClassName?: string;
}) {
  const width = Math.min(Math.max(Number.isFinite(percent) ? percent : 0, 0), 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
        <span className="flex min-w-0 items-center gap-2 text-ds-ink-2">
          {dotClassName && <i className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />}
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-medium tabular-nums text-ds-ink">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ds-surface" role="presentation">
        <div className={`h-full rounded-full transition-[width] duration-500 ${barClassName}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

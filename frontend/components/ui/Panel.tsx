import type { ReactNode } from 'react';

/** Bordered surface used for every dashboard section. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-ds-line bg-ds-bg p-5 ${className}`}>{children}</section>;
}

export function PanelHeader({
  title,
  description,
  action,
  alignDescription = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * Reserve two description lines so side-by-side panels start their content at
   * the same height. `true` applies from md up; 'xl' only once the panel sits in
   * a row with siblings at xl (use it for a panel that spans the full row below xl).
   */
  alignDescription?: boolean | 'xl';
}) {
  const reserve = alignDescription === 'xl' ? 'xl:min-h-10' : alignDescription ? 'md:min-h-10' : '';
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold text-ds-ink">{title}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {description && (
        <p className={`mt-1 text-[13px] text-ds-ink-2 ${reserve}`}>{description}</p>
      )}
    </div>
  );
}

/** Quiet inline note, used for empty states inside a panel. */
export function InlineNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-ds-surface px-3 py-2.5 text-xs text-ds-ink-2">
      {icon && <span className="mt-0.5 shrink-0 text-ds-ink-3">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

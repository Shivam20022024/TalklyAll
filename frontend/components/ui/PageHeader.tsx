import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Small row above the title (badges, breadcrumbs). */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // Title and actions share a row only on wide screens; below that the actions
    // sit on their own row instead of squeezing beside a wrapping title.
    <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="min-w-0">
        {meta && <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ds-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ds-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

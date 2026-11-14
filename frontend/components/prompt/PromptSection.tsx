import type { ReactNode } from 'react'

/** Numbered/iconed section frame used throughout Prompt Studio. */
export function PromptSection({
  id,
  icon,
  title,
  description,
  action,
  children,
  className = '',
}: {
  id?: string
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`rounded-xl border border-ds-line bg-ds-bg ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ds-line px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ds-primary-soft text-ds-primary" aria-hidden="true">{icon}</span>}
          <div className="min-w-0">
            <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold text-ds-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ds-ink-2">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

/** Heading for one tab panel of the editing workspace: icon tile, title and a one-line description. */
export function PanelHeading({
  id,
  icon,
  title,
  description,
  action,
}: {
  id: string
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h2 id={id} className="text-[19px] font-semibold leading-tight text-ds-ink">{title}</h2>
          {description && <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Small "{{variable}}" code token. */
export function VarTag({ children }: { children: ReactNode }) {
  return <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[13px] text-ds-primary">{children}</code>
}

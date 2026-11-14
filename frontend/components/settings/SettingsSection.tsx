import type { ReactNode } from 'react'

/**
 * Titled settings group with an anchor id so the section nav can link to it.
 * Presentation only. The form controls inside are the shared ones, sized up here
 * (labels 15px, inputs 44px tall at 16px) so every section reads at the same density.
 */
export function SettingsSection({
  id,
  icon,
  title,
  description,
  badge,
  children,
}: {
  id: string
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-20">
      <section
        aria-labelledby={`${id}-title`}
        className="rounded-2xl border border-ds-line bg-ds-bg p-5 shadow-sm sm:p-6 [&_input:not([type=checkbox])]:h-11 [&_input]:text-[16px] [&_label]:text-[15px] [&_select]:h-11 [&_select]:text-[16px] [&_p[id$='-hint']]:text-[14px]"
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 id={`${id}-title`} className="text-[19px] font-semibold leading-tight text-ds-ink">
                {title}
              </h2>
              {badge}
            </div>
            {description && <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">{description}</p>}
          </div>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  )
}

/** Right-aligned action row at the bottom of a settings form. */
export function FormFooter({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-ds-line pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-[14px] text-ds-ink-2">{note}</div>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  )
}

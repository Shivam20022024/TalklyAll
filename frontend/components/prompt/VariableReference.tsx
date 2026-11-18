'use client'

import { Braces } from 'lucide-react'
import { greetingTags } from './PromptEditor'

/** Dynamic Variables panel: every supported {{tag}} for the selected template, each with an Insert control. */
export function VariableReference({ template, onInsert }: { template: any; onInsert: (tag: string) => void }) {
  const standardKeys = new Set(['{{customer_name}}', '{{company_name}}', '{{offering}}', '{{location}}'])
  const extraTags = ((template.specific_variables || []) as { key: string; label: string }[])
    .map((sv) => {
      const cleanKey = sv.key.replace(/^\{\{|\}\}$/g, '')
      return { tag: `{{${cleanKey}}}`, desc: sv.label }
    })
    .filter((item) => !standardKeys.has(item.tag))
  const rawList = [
    { tag: '{{customer_name}}', desc: 'Contact / lead name' },
    { tag: '{{company_name}}', desc: 'Your company name' },
    { tag: '{{offering}}', desc: template.default_offering_label },
    { tag: '{{location}}', desc: 'City, branch, or property location' },
    ...extraTags,
  ]
  // Any other tag the template declares stays insertable, as the greeting's quick-insert row used to offer.
  greetingTags(template).forEach((tag) => {
    if (!rawList.some((r) => r.tag === tag)) rawList.push({ tag, desc: 'Template variable' })
  })
  rawList.push({ tag: '{{any_csv_column}}', desc: 'Any extra CSV column (e.g. doctor, date)' })
  const seen = new Set<string>()
  const list = rawList.filter((item) => (seen.has(item.tag) ? false : (seen.add(item.tag), true)))

  return (
    <section className="rounded-2xl border border-ds-line bg-ds-bg p-4 shadow-sm sm:p-5" aria-labelledby="vars-title">
      <h2 id="vars-title" className="flex items-center gap-2.5 text-[19px] font-semibold text-ds-ink">
        <Braces size={20} strokeWidth={1.75} className="text-ds-ink-2" aria-hidden="true" />Dynamic Variables
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-ds-ink-2">Use these placeholders in your prompt. Values are filled from the lead, CSV or Business details. Insert adds the tag to the end of the greeting.</p>
      <ul className="mt-3 divide-y divide-ds-line border-t border-ds-line">
        {list.map((v, idx) => (
          <li key={`${v.tag}-${idx}`} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-[14px] font-semibold text-ds-primary" title={v.tag}>{v.tag}</p>
              <p className="truncate text-[14px] text-ds-ink-2" title={v.desc}>{v.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => onInsert(v.tag)}
              className="h-9 shrink-0 rounded-lg border border-ds-line bg-ds-surface px-3.5 text-[14px] font-semibold text-ds-ink hover:border-ds-primary/40 hover:bg-blue-50 hover:text-ds-primary"
              aria-label={`Insert ${v.tag} into the greeting`}
            >
              Insert
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

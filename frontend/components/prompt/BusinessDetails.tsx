'use client'

import { useId } from 'react'
import { Braces, Building2, HelpCircle } from 'lucide-react'
import { PanelHeading, VarTag } from './PromptSection'

const INPUT =
  'h-11 w-full rounded-xl border border-ds-line bg-ds-bg px-3.5 text-[16px] text-ds-ink outline-none transition-colors placeholder:text-ds-ink-3 hover:border-ds-line-strong focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'

function LabelledInput({ label, hint, value, onChange, placeholder }: { label: React.ReactNode; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold text-ds-ink">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-describedby={hintId} className={INPUT} />
      {hint && <p id={hintId} className="text-[14px] text-ds-ink-2">{hint}</p>}
    </div>
  )
}

/** Business Details tab: defaults injected into {{offering}} and {{location}} when a lead has no value of its own. */
export function BusinessDetails({
  template,
  offering,
  setOffering,
  location,
  setLocation,
}: {
  template: any
  offering: string
  setOffering: (v: string) => void
  location: string
  setLocation: (v: string) => void
}) {
  return (
    <section aria-labelledby="business-title" className="space-y-5">
      <PanelHeading
        id="business-title"
        icon={<Building2 size={21} strokeWidth={1.75} />}
        title="Business Details"
        description={<>Defaults used when a lead has no value of its own. Injected into <VarTag>{'{{offering}}'}</VarTag> and <VarTag>{'{{location}}'}</VarTag>.</>}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <LabelledInput
          label={<>{template.default_offering_label} <VarTag>{'{{offering}}'}</VarTag></>}
          hint="The product, property, course, or service your agent speaks about."
          value={offering}
          onChange={setOffering}
          placeholder={template.offering_placeholder}
        />
        <LabelledInput
          label={<>Default location / branch <VarTag>{'{{location}}'}</VarTag></>}
          hint="Used for office, clinic, or site-visit mentions when the lead has no location."
          value={location}
          onChange={setLocation}
          placeholder="e.g. Connaught Place, New Delhi / Sector 62, Noida"
        />
      </div>
    </section>
  )
}

/** Variables tab: the template's own default values, and how every variable gets filled. */
export function VariableDefaults({
  template,
  industryVariables,
  setIndustryVariables,
}: {
  template: any
  industryVariables: Record<string, string>
  setIndustryVariables: (v: Record<string, string>) => void
}) {
  const specific: { key: string; label: string; placeholder: string }[] = (template.specific_variables || []).filter(
    (sv: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.key === sv.key) === i
  )
  return (
    <section aria-labelledby="variables-title" className="space-y-6">
      <PanelHeading
        id="variables-title"
        icon={<Braces size={21} strokeWidth={1.75} />}
        title={`${template.name} variables`}
        description="Default values for the placeholders this template uses. They fill in when a lead has no value of its own."
      />
      {specific.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {specific.map((sv, idx) => (
            <LabelledInput
              key={`${sv.key}-${idx}`}
              label={<>{sv.label} <VarTag>{`{{${sv.key}}}`}</VarTag></>}
              value={industryVariables[sv.key] || ''}
              onChange={(v) => setIndustryVariables({ ...industryVariables, [sv.key]: v })}
              placeholder={sv.placeholder}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-ds-line-strong bg-ds-surface/60 px-4 py-6 text-center text-[15px] text-ds-ink-2">
          This template has no extra default variables. Offering and location are set in Business Details.
        </p>
      )}

      <div className="rounded-xl border border-ds-line bg-ds-surface/60 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ds-ink">
          <HelpCircle size={17} strokeWidth={1.75} className="text-ds-ink-2" aria-hidden="true" />How variables are filled
        </h3>
        <ol className="mt-2.5 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-ds-ink-2">
          <li><span className="font-semibold text-ds-ink">Lead / CSV value:</span> if the uploaded row has an offering or matching column, it is used first.</li>
          <li><span className="font-semibold text-ds-ink">Template default:</span> otherwise the default from Business Details or this tab is used.</li>
          <li><span className="font-semibold text-ds-ink">No cross-industry leaks:</span> an offering from another industry is never injected into this template&apos;s calls.</li>
        </ol>
      </div>
    </section>
  )
}

'use client'

import { Banknote, Briefcase, Building2, CreditCard, GraduationCap, LayoutGrid, Plus, ShoppingBag, Sparkles, Stethoscope, Trash2 } from 'lucide-react'

const PRESET_ICONS: Record<string, any> = {
  real_estate: Building2,
  healthcare: Stethoscope,
  edtech: GraduationCap,
  bfsi: CreditCard,
  general_sales: Briefcase,
  collections: Banknote,
  ecommerce: ShoppingBag,
}

/**
 * Agent template gallery: a horizontal row of the built-in industry presets, the
 * company's own custom agents and the entry point to Auto Build. Presentation only -
 * every action calls a handler owned by the Prompt Studio page.
 */
export function TemplatePicker({
  presets,
  customTemplates,
  selectedIndustry,
  activeLiveIndustry,
  industrySummary,
  onSelect,
  onDeleteCustom,
  onAutoBuild,
  onHowItWorks,
}: {
  presets: Record<string, { name: string; description: string }>
  customTemplates: any[]
  selectedIndustry: string
  activeLiveIndustry: string
  industrySummary: Record<string, { status: string; offering: string }>
  onSelect: (key: string) => void
  onDeleteCustom: (id: string, name: string, e: React.MouseEvent) => void
  onAutoBuild: () => void
  onHowItWorks: () => void
}) {
  const status = (key: string) =>
    activeLiveIndustry === key ? (
      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-700">Live</span>
    ) : industrySummary[key]?.status === 'Published' ? (
      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[13px] font-semibold text-blue-700">Published</span>
    ) : null

  const card = (selected: boolean) =>
    `group relative flex h-full min-h-[132px] min-w-0 flex-col rounded-xl border p-3 text-left transition-colors ${
      selected ? 'border-ds-primary bg-blue-50/60 ring-1 ring-ds-primary/40' : 'border-ds-line bg-ds-bg hover:border-ds-line-strong hover:bg-ds-surface'
    }`

  return (
    <section aria-labelledby="agent-template-title" className="rounded-2xl border border-ds-line bg-ds-bg p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true"><LayoutGrid size={20} strokeWidth={1.75} /></span>
          <div className="min-w-0">
            <h2 id="agent-template-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Agent Templates</h2>
            <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">Pick a template to get started or edit an existing one.</p>
          </div>
        </div>
        <button type="button" onClick={onHowItWorks} className="shrink-0 rounded-lg px-2 py-1.5 text-[14px] font-semibold text-ds-primary hover:bg-blue-50">How it works</button>
      </div>

      <div role="group" aria-label="Agent templates" className="mt-4 grid auto-rows-fr grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Object.entries(presets).map(([key, t]) => {
              const selected = selectedIndustry === key
              const Icon = PRESET_ICONS[key] || Sparkles
              return (
                <button key={key} type="button" onClick={() => onSelect(key)} aria-pressed={selected} data-selected={selected} className={card(selected)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-ds-primary text-white' : 'bg-blue-50 text-ds-primary'}`} aria-hidden="true">
                      <Icon size={19} strokeWidth={1.75} />
                    </span>
                    {status(key)}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[16px] font-semibold leading-tight text-ds-ink" title={t.name}>{t.name}</p>
                  <p className="mt-1 line-clamp-2 text-[14px] leading-[1.35] text-ds-ink-2">{t.description}</p>
                </button>
              )
            })}

            {customTemplates.map((ct) => {
              const selected = selectedIndustry === ct.id
              return (
                <div key={ct.id} data-selected={selected} className={card(selected)}>
                  <button type="button" onClick={() => onSelect(ct.id)} aria-pressed={selected} className="absolute inset-0 rounded-xl" aria-label={`Edit ${ct.name}`} />
                  <div className="pointer-events-none relative flex items-start justify-between gap-2">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-ds-primary text-white' : 'bg-violet-50 text-violet-700'}`} aria-hidden="true">
                      <Sparkles size={19} strokeWidth={1.75} />
                    </span>
                    {status(ct.id) || <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[13px] font-semibold text-violet-700">Custom</span>}
                  </div>
                  <p className="pointer-events-none relative mt-2 line-clamp-2 text-[16px] font-semibold leading-tight text-ds-ink" title={ct.name}>{ct.name}</p>
                  <p className="pointer-events-none relative mt-1 line-clamp-2 text-[14px] leading-[1.35] text-ds-ink-2">{ct.description || 'Custom company agent prompt'}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteCustom(ct.id, ct.name, e)
                    }}
                    className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg text-ds-ink-3 hover:bg-ds-error-soft hover:text-ds-error-ink"
                    title="Delete this custom template"
                    aria-label={`Delete custom agent ${ct.name}`}
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </div>
              )
            })}

        <button
          type="button"
          onClick={onAutoBuild}
          className="flex min-h-[132px] min-w-0 flex-col items-center justify-center rounded-xl border border-dashed border-ds-primary/50 bg-blue-50/40 p-3 text-center transition-colors hover:border-ds-primary hover:bg-blue-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ds-bg text-ds-primary shadow-sm" aria-hidden="true"><Plus size={18} /></span>
          <span className="mt-2 text-[16px] font-semibold text-ds-ink">New custom agent</span>
          <span className="mt-0.5 text-[14px] text-ds-ink-2">Auto Build from your brief</span>
        </button>
      </div>
    </section>
  )
}

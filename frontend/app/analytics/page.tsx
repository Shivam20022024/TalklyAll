'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gauge, Phone, Sparkles, Target, BarChart3, Briefcase, ChevronDown, Filter, LineChart, MessageCircle, Megaphone, PhoneCall, Search, ShieldAlert, Thermometer } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { MiniChart } from '@/components/ui/MiniChart'
import { InlineNote } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { DirectionChart, TemperatureChart } from '@/components/analytics/AnalyticsCharts'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey, getIndustryConfig } from '@/lib/industry'

const RANGES = ['Today', '7 Days', '30 Days', '90 Days'] as const

const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

export default function AnalyticsPage() {
  const { user, isSuperAdmin } = useAuth()

  // All-time totals: the same endpoint and handling as before the redesign.
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetchApi('/api/v1/analytics/overall')
        setData(res.data)
      } catch (e) {
        console.error('Failed to load analytics', e)
      } finally {
        setLoading(false)
      }
    }
    loadAnalytics()
  }, [])

  // Filters. The range / campaign / vertical filters are the ones the dashboard
  // endpoint already accepts; they apply to the "Selected period" section only.
  const [range, setRange] = useState<string>('30 Days')
  const [campaignId, setCampaignId] = useState<string>('')
  const [industry, setIndustry] = useState<string>('')
  const [customTitle, setCustomTitle] = useState<string>('')
  const [customOffering, setCustomOffering] = useState<string>('')
  const [industryReady, setIndustryReady] = useState(false)

  const [period, setPeriod] = useState<any>(null)
  const [periodLoading, setPeriodLoading] = useState(true)
  const [periodFailed, setPeriodFailed] = useState(false)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [campaignsFailed, setCampaignsFailed] = useState(false)
  const [campaignsLoaded, setCampaignsLoaded] = useState(false)

  // Same vertical resolution as the dashboard, so both pages report the same figures.
  useEffect(() => {
    let cancelled = false
    async function initIndustry() {
      setIndustryReady(false)
      let ind = ''
      let title = ''
      let offering = ''
      if (!isSuperAdmin) {
        try {
          const res = await fetchApi('/api/v1/auth/company-settings')
          ind = res?.company?.industry || user?.industry || ''
          title = res?.company?.custom_industry_name || ''
          offering = res?.company?.offering || ''
        } catch { }
        if (!ind) {
          try {
            const promptRes = await fetchApi('/api/v1/prompt')
            if (promptRes?.industry) {
              ind = promptRes.industry
              offering = promptRes.offering || offering
            }
          } catch { }
        }
        if (!ind) ind = user?.industry || 'real_estate'
      } else {
        try {
          ind = localStorage.getItem('talkly_selected_industry') || ''
        } catch { }
        if (!ind) ind = 'real_estate'
      }
      if (cancelled) return
      setIndustry(ind)
      setCustomTitle(title)
      setCustomOffering(offering)
      setIndustryReady(true)
    }
    initIndustry()
    return () => {
      cancelled = true
    }
  }, [user?.industry, isSuperAdmin])

  useEffect(() => {
    let cancelled = false
    async function loadCampaigns() {
      try {
        const res = await fetchApi('/api/v1/campaigns')
        if (cancelled) return
        setCampaigns(Array.isArray(res) ? res : [])
        setCampaignsFailed(false)
      } catch (e) {
        if (cancelled) return
        console.error('Failed to load campaigns', e)
        setCampaignsFailed(true)
      } finally {
        if (!cancelled) setCampaignsLoaded(true)
      }
    }
    loadCampaigns()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!industryReady) return
    let cancelled = false
    async function loadPeriod() {
      setPeriodLoading(true)
      try {
        const industryQuery = industry ? `&industry=${encodeURIComponent(industry)}` : ''
        const campaignQuery = campaignId ? `&campaign_id=${encodeURIComponent(campaignId)}` : ''
        const res = await fetchApi(`/api/v1/analytics/dashboard?range=${encodeURIComponent(range)}${campaignQuery}${industryQuery}`)
        if (cancelled) return
        setPeriod(res.data)
        setPeriodFailed(false)
      } catch (e) {
        if (cancelled) return
        console.error('Failed to load period analytics', e)
        // The previous figures belong to different filters, so never keep showing them.
        setPeriod(null)
        setPeriodFailed(true)
      } finally {
        if (!cancelled) setPeriodLoading(false)
      }
    }
    loadPeriod()
    return () => {
      cancelled = true
    }
  }, [range, campaignId, industry, industryReady])

  const handleIndustryChange = (next: string) => {
    setIndustry(next)
    setCampaignId('') // a campaign from another vertical would not match
    try {
      localStorage.setItem('talkly_selected_industry', next)
    } catch { }
  }

  const config = getIndustryConfig(industry, customTitle, customOffering)

  const visibleCampaigns = campaigns.filter(
    (c: any) =>
      isSuperAdmin ||
      !industry ||
      c.industry === industry ||
      (String(c.industry || '').startsWith('custom_') && String(industry || '').startsWith('custom_'))
  )

  // ---- Selected period (from /analytics/dashboard) ----
  const callsMade = Number(period?.calls_made || 0)
  const totalLeads = Number(period?.total_leads || 0)
  const connectedCalls = Number(period?.connected_calls || 0)
  const qualifiedLeads = Number(period?.qualified_leads || 0)
  const interestedLeads = Number(period?.interested_leads || 0)
  const convertedLeads = Number(period?.converted_leads || 0)
  const contactedLeads = Number(period?.contacted_leads || 0)
  const conversionRate = period?.conversion_rate || '0%'
  const realIntents: any[] = period?.real_intents || []
  const realObjections: any[] = period?.real_objections || []
  const analyzedInPeriod = Number(period?.analyzed_calls_count || 0)

  const periodMetrics = [
    [config.metrics.total_leads.label, String(totalLeads), config.metrics.total_leads.icon, config.metrics.total_leads.tone],
    [config.metrics.calls_made.label, String(callsMade), config.metrics.calls_made.icon, config.metrics.calls_made.tone],
    [config.metrics.connected_calls.label, String(connectedCalls), config.metrics.connected_calls.icon, config.metrics.connected_calls.tone],
    [config.metrics.qualified_leads.label, String(qualifiedLeads), config.metrics.qualified_leads.icon, config.metrics.qualified_leads.tone],
    [config.metrics.interested_leads.label, String(interestedLeads), config.metrics.interested_leads.icon, config.metrics.interested_leads.tone],
    [config.metrics.conversion_rate.label, String(conversionRate), config.metrics.conversion_rate.icon, config.metrics.conversion_rate.tone],
  ] as const

  const funnel: [string, number][] = [
    [config.funnelStages[0], totalLeads],
    [config.funnelStages[1], contactedLeads],
    [config.funnelStages[2], connectedCalls],
    [config.funnelStages[3], interestedLeads],
    [config.funnelStages[4], qualifiedLeads],
    [config.funnelStages[5], convertedLeads],
  ]

  // ---- All-time (from /analytics/overall) ----
  const allTimeCalls = Number(data?.total_calls || 0)
  const analysedCalls = Number(data?.total_leads || 0) // the API counts calls that have an analysis
  const hot = Number(data?.hot_leads || 0)
  const warm = Number(data?.warm_leads || 0)
  const cold = Number(data?.cold_leads || 0)
  const temperatureTotal = hot + warm + cold
  const inbound = Number(data?.inbound_calls || 0)
  const outbound = Number(data?.outbound_calls || 0)
  const directionTotal = inbound + outbound

  const hasAnalysis = analysedCalls > 0

  const initialLoading = loading && !data && periodLoading && !period

  // ── presentation-only helpers (no request, filter or calculation is changed) ──
  const [campaignSearch, setCampaignSearch] = useState('')
  const shownCampaigns = visibleCampaigns.filter((c: any) => {
    const q = campaignSearch.trim().toLowerCase()
    return !q || String(c.name || '').toLowerCase().includes(q) || String(c.offering || '').toLowerCase().includes(q)
  })
  const TILE_TONE: Record<string, string> = {
    blue: 'bg-blue-50 text-ds-primary',
    violet: 'bg-violet-50 text-violet-700',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-500',
  }
  const card = 'rounded-2xl border border-ds-line bg-ds-bg p-4 shadow-sm sm:p-5'
  const controlCls =
    'h-11 rounded-xl border border-ds-line bg-ds-bg text-[15px] font-medium text-ds-ink outline-none transition focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'
  const cardHead = (icon: React.ReactNode, title: React.ReactNode, description?: React.ReactNode, tone = 'bg-blue-50 text-ds-primary') => (
    <div className="flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold leading-tight text-ds-ink">{title}</h3>
        {description && <p className="mt-1 text-[14px] leading-snug text-ds-ink-2">{description}</p>}
      </div>
    </div>
  )
  // Label on the left, value and share right-aligned, thin bar underneath.
  const statRow = (label: React.ReactNode, value: React.ReactNode, percent: number, bar: string) => (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="min-w-0 truncate text-ds-ink">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-ds-ink">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ds-surface" role="presentation">
        <div className={`h-full rounded-full transition-[width] duration-500 ${bar}`} style={{ width: `${Math.min(Math.max(Number.isFinite(percent) ? percent : 0, 0), 100)}%` }} />
      </div>
    </div>
  )
  const share = (n: React.ReactNode) => <span className="ml-1 font-normal text-ds-ink-2">({n})</span>
  const kpiGrid = 'grid grid-cols-2 gap-3 sm:gap-4'
  const kpiCard = (label: string, value: string, Icon: any, tone: string, hint?: string) => (
    <article key={label} className="rounded-2xl border border-ds-line bg-ds-bg p-4 shadow-sm">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${TILE_TONE[tone] || TILE_TONE.blue}`} aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
      <p className="mt-3 text-[14px] font-medium leading-snug text-ds-ink-2">{label}</p>
      <p className="mt-1 text-[30px] font-bold leading-none tracking-tight text-ds-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-[13px] leading-snug text-ds-ink-2">{hint}</p>}
    </article>
  )
  const sectionHead = (id: string, title: string, description: React.ReactNode) => (
    <div>
      <h2 id={id} className="text-[19px] font-semibold leading-tight text-ds-ink">{title}</h2>
      <p className="mt-1 text-[14px] text-ds-ink-2 sm:text-[15px]">{description}</p>
    </div>
  )

  if (initialLoading) {
    return (
      <AppLayout title="Analytics">
        <LoadingState label="Loading analytics…">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-ds-line bg-ds-bg" />
              ))}
            </div>
            <div className="h-[360px] animate-pulse rounded-2xl border border-ds-line bg-ds-bg" />
          </div>
        </LoadingState>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Analytics">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-[14px] font-semibold text-violet-700">
              <BarChart3 size={15} strokeWidth={2} aria-hidden="true" />
              {config.label}
            </span>
            {!isSuperAdmin && (
              <Link href="/settings" className="text-[14px] font-medium text-ds-ink-2 underline-offset-2 hover:text-ds-primary hover:underline" title="Change your company vertical in Settings">
                Edit in Settings
              </Link>
            )}
          </div>
          <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Analytics</h1>
          <p className="mt-1.5 text-[16px] text-ds-ink-2 sm:text-[17px]">Calling, lead and campaign performance from your real call data.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:shrink-0 xl:justify-end">
          {isSuperAdmin && (
            <div className="relative">
              <select aria-label="Filter by vertical" value={industry} onChange={(e) => handleIndustryChange(e.target.value)} className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 sm:w-52`}>
                {!(INDUSTRY_CONFIGS as Record<string, unknown>)[industry] && industry && <option value={industry}>{config.shortLabel}</option>}
                {(Object.keys(INDUSTRY_CONFIGS) as IndustryKey[]).map((key) => (
                  <option key={key} value={key}>
                    {INDUSTRY_CONFIGS[key].shortLabel}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
            </div>
          )}
          <div className="relative w-full sm:w-auto">
            <Briefcase size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-2" aria-hidden="true" />
            <select aria-label="Filter by campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${controlCls} w-full cursor-pointer appearance-none pl-10 pr-9 sm:w-72`}>
              <option value="">All {config.shortLabel} campaigns</option>
              {visibleCampaigns.map((c: any) => (
                <option key={c.campaign_id} value={c.campaign_id}>
                  {c.name} {c.offering ? `(${c.offering})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>
          <div role="group" aria-label="Date range" className="inline-flex w-full rounded-xl border border-ds-line bg-ds-bg p-1 shadow-sm sm:w-auto">
            {RANGES.map((r) => {
              const active = range === r
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRange(r)}
                  className={`h-9 flex-1 rounded-lg px-3.5 text-[14px] font-semibold transition-colors sm:flex-none sm:px-4 ${active ? 'border border-ds-primary bg-blue-50 text-ds-primary' : 'border border-transparent text-ds-ink-2 hover:text-ds-ink'}`}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {campaignsFailed && (
        <Alert tone="warning" title="Couldn’t load your campaigns">
          The campaign filter and the campaign table are unavailable. The other figures are not affected.
        </Alert>
      )}

      {/* ---------------- Selected period ---------------- */}
      <section aria-labelledby="period-heading" className="space-y-4">
        {sectionHead(
          'period-heading',
          'Selected period',
          <>
            {range === 'Today' ? 'Today' : `The last ${range.toLowerCase()}`}
            {campaignId ? ', for the selected campaign' : ''}. Changes with the filters above.
          </>
        )}

        {periodLoading && !period ? (
          <LoadingState label="Loading period figures…">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-ds-line bg-ds-bg" />
              ))}
            </div>
          </LoadingState>
        ) : periodFailed || !period ? (
          <div className={card}>
            <ErrorState
              title="Period figures couldn’t be loaded"
              description="The request for these figures failed. Change a filter or reload the page to try again. Nothing is shown rather than guessing."
            />
          </div>
        ) : (
          <div aria-busy={periodLoading} className={`space-y-4 transition-opacity ${periodLoading ? 'opacity-60' : ''}`}>
            <div aria-label="Selected period metrics" className={`${kpiGrid} lg:grid-cols-3 xl:grid-cols-6`}>
              {periodMetrics.map((item) => kpiCard(item[0] as string, item[1] as string, item[2] as any, item[3] as string))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <section className={card} aria-label="Calling performance">
                {cardHead(<LineChart size={20} strokeWidth={1.75} />, 'Calling Performance', 'Calls attempted and calls that connected over time.')}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ds-ink-2">
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-ds-primary" />Attempted</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-ds-accent" />Connected</span>
                </div>
                <MiniChart data={period.chart_data} />
              </section>

              <section className={card} aria-label={`${config.shortLabel} funnel`}>
                {cardHead(<Filter size={20} strokeWidth={1.75} />, `${config.shortLabel} Funnel`, 'How leads in this period moved through each stage.', 'bg-violet-50 text-violet-700')}
                {totalLeads === 0 ? (
                  <div className="mt-4">
                    <InlineNote>No leads were created in this period, so there is no funnel to show.</InlineNote>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {funnel.map(([label, value], index) =>
                      <div key={label}>{statRow(label, <>{value}{share(`${pct(value, totalLeads)}%`)}</>, pct(value, totalLeads), index < 2 ? 'bg-ds-primary' : index < 4 ? 'bg-ds-primary/70' : 'bg-ds-primary/45')}</div>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className={card} aria-label="What customers ask about">
                {cardHead(
                  <MessageCircle size={20} strokeWidth={1.75} />,
                  'What customers ask about',
                  analyzedInPeriod > 200
                    ? `Top intents from the first 200 of ${analyzedInPeriod} analysed calls in this period.`
                    : `Top intents from ${analyzedInPeriod} analysed ${analyzedInPeriod === 1 ? 'call' : 'calls'} in this period.`
                )}
                {realIntents.length === 0 ? (
                  <div className="mt-4">
                    <InlineNote icon={<Sparkles size={14} />}>No analysed calls with intents in this period yet.</InlineNote>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {realIntents.map((item: any, index: number) => (
                      <div key={item.label}>{statRow(item.label, <>{item.count}{share(`${item.pct}%`)}</>, Number(item.pct) || 0, index % 2 === 0 ? 'bg-ds-primary' : 'bg-ds-accent')}</div>
                    ))}
                  </div>
                )}
              </section>

              <section className={card} aria-label="Top objections">
                {cardHead(<ShieldAlert size={20} strokeWidth={1.75} />, 'Top objections', 'Objections raised on analysed calls in this period.', 'bg-violet-50 text-violet-700')}
                {realObjections.length === 0 ? (
                  <div className="mt-4">
                    <InlineNote icon={<Sparkles size={14} />}>No objections were recorded in this period.</InlineNote>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {realObjections.map((item: any, index: number) => (
                      <div key={item.objection}>{statRow(item.objection, <>{item.count}{share(item.frequency)}</>, parseFloat(String(item.frequency)) || 0, index % 2 === 0 ? 'bg-ds-accent' : 'bg-ds-primary')}</div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </section>

      {/* ---------------- All-time ---------------- */}
      <section aria-labelledby="alltime-heading" className="space-y-4">
        {sectionHead('alltime-heading', 'All time', 'Lifetime totals for your workspace. These are not affected by the filters above.')}

        {loading ? (
          <LoadingState label="Loading all-time figures…">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-ds-line bg-ds-bg" />
              ))}
            </div>
          </LoadingState>
        ) : !data ? (
          <div className={card}>
            <ErrorState title="All-time figures couldn’t be loaded" description="The request for your lifetime totals failed. Reload the page to try again." />
          </div>
        ) : (
          <>
            <div aria-label="All-time metrics" className={`${kpiGrid} lg:grid-cols-4`}>
              {kpiCard('Total calls', String(allTimeCalls), Phone, 'blue')}
              {kpiCard('Analysed calls', String(analysedCalls), Sparkles, 'violet', 'Calls with a completed analysis')}
              {kpiCard('Avg lead score', hasAnalysis ? String(data.average_buyer_intent ?? 0) : '—', Gauge, 'blue', hasAnalysis ? 'Average across analysed calls' : 'Needs at least one analysed call')}
              {kpiCard('Avg conversion probability', hasAnalysis ? `${data.average_conversion_probability ?? 0}%` : '—', Target, 'violet', hasAnalysis ? 'Average across analysed calls' : 'Needs at least one analysed call')}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className={card} aria-label="Lead temperature">
                {cardHead(<Thermometer size={20} strokeWidth={1.75} />, 'Lead Temperature', 'Analysed calls grouped by the lead temperature the analysis assigned.')}
                {temperatureTotal === 0 ? (
                  <div className="mt-4">
                    <EmptyState title="No temperature data yet" description="This fills in as calls are analysed." />
                  </div>
                ) : (
                  <div className="mt-4">
                    <TemperatureChart hot={hot} warm={warm} cold={cold} />
                    <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                      {[
                        ['Hot', hot],
                        ['Warm', warm],
                        ['Cold', cold],
                      ].map(([label, value]) => (
                        <div key={label as string} className="rounded-xl bg-ds-surface px-2 py-2.5">
                          <dt className="text-[13px] text-ds-ink-2">{label}</dt>
                          <dd className="text-[16px] font-semibold tabular-nums text-ds-ink">
                            {value as number} <span className="text-[13px] font-normal text-ds-ink-2">({pct(value as number, temperatureTotal)}%)</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </section>

              <section className={card} aria-label="Call direction">
                {cardHead(<PhoneCall size={20} strokeWidth={1.75} />, 'Call Direction', 'Calls you placed compared with calls customers placed to you.', 'bg-violet-50 text-violet-700')}
                {directionTotal === 0 ? (
                  <div className="mt-4">
                    <EmptyState title="No calls yet" description="Call direction appears once calls have been made or received." />
                  </div>
                ) : (
                  <div className="mt-4">
                    <DirectionChart inbound={inbound} outbound={outbound} />
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-ds-surface px-2 py-2.5">
                        <dt className="flex items-center justify-center gap-1.5 text-[13px] text-ds-ink-2"><i className="h-2.5 w-2.5 rounded-full bg-ds-primary" />Outbound</dt>
                        <dd className="text-[16px] font-semibold tabular-nums text-ds-ink">
                          {outbound} <span className="text-[13px] font-normal text-ds-ink-2">({pct(outbound, directionTotal)}%)</span>
                        </dd>
                      </div>
                      <div className="rounded-xl bg-ds-surface px-2 py-2.5">
                        <dt className="flex items-center justify-center gap-1.5 text-[13px] text-ds-ink-2"><i className="h-2.5 w-2.5 rounded-full bg-ds-accent" />Inbound</dt>
                        <dd className="text-[16px] font-semibold tabular-nums text-ds-ink">
                          {inbound} <span className="text-[13px] font-normal text-ds-ink-2">({pct(inbound, directionTotal)}%)</span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </section>

      {/* ---------------- Campaign performance ---------------- */}
      <section aria-labelledby="campaigns-heading" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true"><Megaphone size={20} strokeWidth={1.75} /></span>
            <div>
              <h2 id="campaigns-heading" className="text-[19px] font-semibold leading-tight text-ds-ink">Campaign Performance</h2>
              <p className="mt-1 text-[14px] text-ds-ink-2 sm:text-[15px]">Lifetime figures per campaign. The date range above does not apply here.</p>
            </div>
          </div>
          {campaignsLoaded && !campaignsFailed && visibleCampaigns.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                placeholder="Search campaigns…"
                aria-label="Search campaigns"
                className={`${controlCls} w-full pl-10 pr-3 font-normal placeholder:text-ds-ink-3 [&::-webkit-search-cancel-button]:hidden`}
              />
            </div>
          )}
        </div>

        <div className="mt-5">
          {!campaignsLoaded ? (
            <div className="h-40 animate-pulse rounded-xl border border-ds-line bg-ds-bg" aria-hidden="true" />
          ) : campaignsFailed ? (
            <ErrorState title="Campaigns couldn’t be loaded" description="Reload the page to try again." />
          ) : visibleCampaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" description="Create a campaign to see how it performs here." action={<Link href="/campaigns" className="text-[14px] font-semibold text-ds-primary hover:underline">Go to Campaigns</Link>} />
          ) : shownCampaigns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ds-line-strong px-4 py-8 text-center text-[15px] text-ds-ink-2">No campaigns match “{campaignSearch}”.</p>
          ) : (
            <>
              <div role="region" aria-label="Campaign performance table" tabIndex={0} className="hidden overflow-x-auto rounded-xl border border-ds-line outline-none focus-visible:outline-2 focus-visible:outline-ds-primary xl:block">
                <table className="w-full border-collapse text-[15px]">
                  <thead>
                    <tr className="bg-slate-50 text-[13px] font-semibold tracking-wide text-ds-ink-2">
                      <th scope="col" className="px-4 py-3 text-left">Campaign</th>
                      <th scope="col" className="px-3 py-3 text-left">Status</th>
                      <th scope="col" className="px-3 py-3 text-right">Leads</th>
                      <th scope="col" className="px-3 py-3 text-right">Calls</th>
                      <th scope="col" className="px-3 py-3 text-right">Connected</th>
                      <th scope="col" className="px-3 py-3 text-right">Interested</th>
                      <th scope="col" className="px-4 py-3 text-right">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownCampaigns.map((c: any) => {
                      const sel = !!campaignId && c.campaign_id === campaignId
                      return (
                        <tr key={c.campaign_id || c.name} className={`border-t border-ds-line ${sel ? 'bg-blue-50/60' : 'hover:bg-ds-surface/70'}`}>
                          <td className="px-4 py-3.5">
                            <span className="block text-[16px] font-semibold text-ds-ink">{c.name}</span>
                            {c.offering && <span className="block text-[14px] text-ds-ink-2">{c.offering}</span>}
                          </td>
                          <td className="px-3 py-3.5"><StatusBadge status={c.status} className="px-3 py-1 text-[14px]" /></td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-ds-ink">{c.leads ?? 0}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-ds-ink">{c.calls ?? 0}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-ds-ink">{c.connected ?? 0}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-ds-ink">{c.interested ?? 0}</td>
                          <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ds-ink">{c.conversion ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-3 xl:hidden" aria-label="Campaign performance">
                {shownCampaigns.map((c: any) => {
                  const sel = !!campaignId && c.campaign_id === campaignId
                  return (
                    <li key={c.campaign_id || c.name} className={`rounded-xl border p-4 ${sel ? 'border-ds-primary/40 bg-blue-50/50' : 'border-ds-line bg-ds-bg'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold text-ds-ink">{c.name}</p>
                          {c.offering && <p className="truncate text-[14px] text-ds-ink-2">{c.offering}</p>}
                        </div>
                        <StatusBadge status={c.status} className="shrink-0 px-2.5 py-0.5 text-[14px]" />
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
                        {[
                          ['Leads', c.leads ?? 0],
                          ['Calls', c.calls ?? 0],
                          ['Connected', c.connected ?? 0],
                          ['Interested', c.interested ?? 0],
                          ['Conversion', c.conversion ?? '—'],
                        ].map(([k, v]) => (
                          <div key={k as string} className="rounded-lg bg-ds-surface px-1 py-2">
                            <dt className="text-[12px] text-ds-ink-2 sm:text-[13px]">{k}</dt>
                            <dd className="text-[15px] font-semibold tabular-nums text-ds-ink">{v as any}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      <p className="text-[13px] text-ds-ink-2">
        Chart dates and times are in UTC. No comparisons with earlier periods are shown because the API does not provide them.
      </p>
    </AppLayout>
  )
}

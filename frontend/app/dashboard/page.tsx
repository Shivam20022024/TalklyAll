'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  GraduationCap,
  Layers,
  MoreHorizontal,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
  Banknote,
  ShoppingBag,
} from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { MetricCard } from '@/components/ui/MetricCard'
import { MiniChart } from '@/components/ui/MiniChart'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey } from '@/lib/industry'

const INDUSTRY_ICONS: Record<IndustryKey, any> = {
  real_estate: Building2,
  healthcare: Stethoscope,
  edtech: GraduationCap,
  bfsi: CreditCard,
  general_sales: Briefcase,
  collections: Banknote,
  ecommerce: ShoppingBag,
}

export default function DashboardPage() {
  const { user, isSuperAdmin } = useAuth()
  const [range, setRange] = useState('30 Days')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')

  // Adaptive Industry Selection:
  // For company logins, always locked 100% to their company profile industry.
  // Only platform Super Admins see the demo switcher.
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryKey>('healthcare')

  const [dashboardData, setDashboardData] = useState<any>(null)
  const [campaignsList, setCampaignsList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Good morning')

  // Set greeting based on local time
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  // Initialize industry from company settings for company users, or localStorage for Super Admin demo
  useEffect(() => {
    async function initIndustry() {
      if (!isSuperAdmin) {
        if (user?.industry && INDUSTRY_CONFIGS[user.industry as IndustryKey]) {
          setSelectedIndustry(user.industry as IndustryKey)
          return
        }
        try {
          const res = await fetchApi('/api/v1/auth/company-settings')
          if (res?.company?.industry && INDUSTRY_CONFIGS[res.company.industry as IndustryKey]) {
            setSelectedIndustry(res.company.industry as IndustryKey)
            return
          }
        } catch { }
      } else {
        try {
          const saved = localStorage.getItem('talkly_selected_industry') as IndustryKey
          if (saved && INDUSTRY_CONFIGS[saved]) {
            setSelectedIndustry(saved)
            return
          }
        } catch { }
      }
    }
    initIndustry()
  }, [user?.industry, isSuperAdmin])

  // Handle switching industry (Super Admin demo mode)
  const handleIndustryChange = async (ind: IndustryKey) => {
    setSelectedIndustry(ind)
    setSelectedCampaignId('') // Reset campaign filter when switching industry
    try {
      localStorage.setItem('talkly_selected_industry', ind)
    } catch { }
  }

  // Load Dashboard metrics & campaigns
  useEffect(() => {
    async function loadDashboard(silent = false) {
      try {
        if (!silent) setLoading(true)
        const industryQuery = selectedIndustry ? `&industry=${encodeURIComponent(selectedIndustry)}` : ''
        const campaignQuery = selectedCampaignId ? `&campaign_id=${encodeURIComponent(selectedCampaignId)}` : ''
        const [dashRes, campRes] = await Promise.all([
          fetchApi(`/api/v1/analytics/dashboard?range=${encodeURIComponent(range)}${campaignQuery}${industryQuery}`),
          fetchApi('/api/v1/campaigns')
        ])
        setDashboardData(dashRes.data)
        setCampaignsList(campRes || [])

        // If super admin selected a campaign with an associated industry, preview that industry
        if (isSuperAdmin && selectedCampaignId && campRes) {
          const camp = campRes.find((c: any) => c.campaign_id === selectedCampaignId)
          if (camp?.industry && INDUSTRY_CONFIGS[camp.industry as IndustryKey] && camp.industry !== selectedIndustry) {
            setSelectedIndustry(camp.industry as IndustryKey)
          }
        }
      } catch (e) {
        console.error('Failed to load dashboard data', e)
      } finally {
        if (!silent) setLoading(false)
      }
    }
    loadDashboard()

    // Background auto-refresh every 12 seconds so dashboard metrics stay synced
    const interval = setInterval(() => {
      loadDashboard(true)
    }, 12000)
    return () => clearInterval(interval)
  }, [range, selectedCampaignId, selectedIndustry])

  const config = INDUSTRY_CONFIGS[selectedIndustry] || INDUSTRY_CONFIGS.real_estate
  const IndustryIcon = INDUSTRY_ICONS[selectedIndustry] || Building2

  const callsMade = Number(dashboardData?.calls_made || 0)
  const totalLeads = Number(dashboardData?.total_leads || 0)
  const connectedCalls = Number(dashboardData?.connected_calls || 0)
  const qualifiedLeads = Number(dashboardData?.qualified_leads || 0)
  const interestedLeads = Number(dashboardData?.interested_leads || 0)
  const convertedLeads = Number(dashboardData?.converted_leads || 0)
  const conversionRate = dashboardData?.conversion_rate || '0%'
  const hasCalls = callsMade > 0

  const realIntents: any[] = dashboardData?.real_intents || []
  const hasRealIntents = realIntents.length > 0
  const realObjections: any[] = dashboardData?.real_objections || []
  const hasRealObjections = realObjections.length > 0

  // Dynamically mapped metrics based on active industry
  const metrics = [
    [config.metrics.total_leads.label, totalLeads.toString(), totalLeads > 0 ? '+12%' : '0%', config.metrics.total_leads.icon, config.metrics.total_leads.tone],
    [config.metrics.calls_made.label, callsMade.toString(), callsMade > 0 ? '+18%' : '0%', config.metrics.calls_made.icon, config.metrics.calls_made.tone],
    [config.metrics.connected_calls.label, connectedCalls.toString(), connectedCalls > 0 ? '+15%' : '0%', config.metrics.connected_calls.icon, config.metrics.connected_calls.tone],
    [config.metrics.qualified_leads.label, qualifiedLeads.toString(), qualifiedLeads > 0 ? '+22%' : '0%', config.metrics.qualified_leads.icon, config.metrics.qualified_leads.tone],
    [config.metrics.interested_leads.label, interestedLeads.toString(), interestedLeads > 0 ? '+8%' : '0%', config.metrics.interested_leads.icon, config.metrics.interested_leads.tone],
    [config.metrics.conversion_rate.label, conversionRate, conversionRate !== '0%' && conversionRate !== '0.0%' ? '+5.4%' : '0%', config.metrics.conversion_rate.icon, config.metrics.conversion_rate.tone],
  ] as const

  const tLeads = totalLeads
  const calcPct = (val: number) => tLeads > 0 ? `${Math.min(Math.round(((val || 0) / tLeads) * 100), 100)}%` : '0%'

  // Dynamically adapt conversion funnel stages to selected industry
  const funnel = [
    [config.funnelStages[0], tLeads, tLeads > 0 ? '100%' : '0%'],
    [config.funnelStages[1], dashboardData?.contacted_leads || 0, calcPct(dashboardData?.contacted_leads)],
    [config.funnelStages[2], connectedCalls, calcPct(connectedCalls)],
    [config.funnelStages[3], interestedLeads, calcPct(interestedLeads)],
    [config.funnelStages[4], qualifiedLeads, calcPct(qualifiedLeads)],
    [config.funnelStages[5], convertedLeads, calcPct(convertedLeads)],
  ]

  const handleDownload = () => {
    if (!dashboardData) return alert("No data to download")
    const csv = [
      `Industry,${config.label}`,
      `Metric,Value`,
      `${config.metrics.total_leads.label},${dashboardData.total_leads || 0}`,
      `${config.metrics.calls_made.label},${dashboardData.calls_made || 0}`,
      `${config.metrics.connected_calls.label},${dashboardData.connected_calls || 0}`,
      `${config.metrics.qualified_leads.label},${dashboardData.qualified_leads || 0}`,
      `${config.metrics.interested_leads.label},${dashboardData.interested_leads || 0}`,
      `${config.metrics.conversion_rate.label},${dashboardData.conversion_rate || '0%'}`,
    ]
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `talkly_${selectedIndustry}_metrics.csv`
    a.click()
  }

  if (loading && !dashboardData) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="text-sm font-medium text-muted-foreground">Loading industry intelligence dashboard...</div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Dashboard">
      {/* Top Header Section */}
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="eyebrow text-primary">Overview / Revenue Intelligence</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
              <IndustryIcon size={12} />
              {config.label}
            </span>
            <Link
              href="/settings"
              className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
              title="Change your company vertical in Settings"
            >
              (Edit in Settings)
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] sm:text-[34px] text-foreground">
            {greeting}, {user?.name || 'User'}
          </h1>
          <p className="mt-1 text-sm font-bold text-foreground/80">
            {config.tagline}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Campaign Selector */}
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
          >
            <option value="">All {config.shortLabel} Campaigns</option>
            {campaignsList
              .filter((c: any) => isSuperAdmin || c.industry === selectedIndustry)
              .map((c: any) => (
                <option key={c.campaign_id} value={c.campaign_id}>
                  {c.name} {c.offering ? `(${c.offering})` : ''} {isSuperAdmin && c.industry ? `• ${INDUSTRY_CONFIGS[c.industry as IndustryKey]?.shortLabel || c.industry}` : ''}
                </option>
              ))}
          </select>

          {/* Export CSV Button */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted shadow-sm"
            title="Export CSV Report"
          >
            <Download size={14} className="stroke-[2.5]" />
            Export
          </button>
        </div>
      </section>

      {/* Super Admin Vertical Switcher (Only visible to platform super_admin for investor/client demos) */}
      {isSuperAdmin && (
        <section className="rounded-xl border border-dashed border-primary/40 bg-card/60 p-3 shadow-sm">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers size={15} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground">Super Admin Demo Switcher</p>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">Platform Preview</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Preview how different vertical dashboards render for prospective client demonstrations</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(INDUSTRY_CONFIGS) as IndustryKey[]).map((key) => {
                const item = INDUSTRY_CONFIGS[key]
                const Icon = INDUSTRY_ICONS[key]
                const isActive = selectedIndustry === key
                return (
                  <button
                    key={key}
                    onClick={() => handleIndustryChange(key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${isActive
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                        : 'border border-border bg-card text-foreground/70 hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    <Icon size={14} />
                    <span>{item.shortLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Adaptive 6-Card KPI Metrics Grid */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((item) => (
          <MetricCard
            key={item[0]}
            label={item[0] as string}
            value={item[1] as string}
            change={item[2] as string}
            Icon={item[3] as any}
            tone={item[4] as any}
          />
        ))}
      </section>

      {/* Performance Chart & Adaptive Funnel Section */}
      <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        {/* Calling Performance Chart */}
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-muted-foreground font-bold">{config.shortLabel} Engagement</p>
              <h2 className="text-lg font-black text-foreground">Calling Performance & Reach</h2>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {['Today', '7 Days', '30 Days', '90 Days'].map((item) => (
                <button
                  key={item}
                  onClick={() => setRange(item)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${range === item ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground/70 hover:bg-card hover:text-foreground'
                    }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex gap-4 text-xs font-bold text-foreground">
            <span><i className="legend-dot bg-primary/25" />Outbound Attempted</span>
            <span><i className="legend-dot bg-primary" />Connected & Spoken</span>
          </div>
          <MiniChart data={dashboardData?.chart_data} />
        </article>

        {/* Adaptive Conversion Funnel */}
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow text-primary font-bold">Vertical Conversion Path</p>
              <h2 className="mt-1 text-lg font-black text-foreground">{config.shortLabel} Funnel</h2>
            </div>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground border border-border/80">
              Goal: {config.conversionGoal}
            </span>
          </div>

          <div className="mt-5 space-y-3.5">
            {funnel.map(([label, value, percentage], index) => (
              <div key={label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground">{label}</span>
                  <span className="font-black text-foreground">{value} <span className="ml-1 text-muted-foreground font-bold">({percentage})</span></span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${index < 2 ? 'bg-primary' : index < 4 ? 'bg-primary/75' : 'bg-primary/50'
                      }`}
                    style={{ width: `${Math.min(Math.max(percentage === '100%' ? 100 : parseFloat(percentage as string), 0), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground flex items-center justify-between">
            <span>Top conversion driver:</span>
            <span className="font-semibold text-foreground">
              {convertedLeads > 0
                ? (config.intentDistribution[0]?.label || 'High Intent')
                : `${config.intentDistribution[0]?.label || 'High Intent'} (Target)`}
            </span>
          </div>
        </article>
      </section>

      {/* Vertical-Specific AI Intelligence Panel */}
      <section className="grid gap-5 lg:grid-cols-3">
        {/* Card 1: Intent & Category Distribution */}
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground">Top Inquired Categories</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${hasRealIntents
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-primary/10 text-primary border-primary/20'
              }`}>
              {hasRealIntents ? `Live Signals (${realIntents.reduce((a, b) => a + (b.count || 0), 0)} calls)` : 'Configured Taxonomy'}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {hasRealIntents
              ? `Real buyer intent signals extracted from ${config.shortLabel} conversations`
              : `Target inquiry taxonomy configured for ${config.shortLabel}`}
          </p>

          <div className="mt-4 space-y-3">
            {(hasRealIntents ? realIntents : config.intentDistribution).map((item, idx) => {
              const defaultColors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500']
              const colorClass = item.color || defaultColors[idx % defaultColors.length]
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${colorClass}`} />
                      <span className="font-bold text-foreground truncate">{item.label}</span>
                    </div>
                    <span className="font-black text-foreground ml-2 shrink-0">
                      {item.pct}%{item.count ? ` (${item.count})` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                      style={{ width: `${Math.min(Math.max(item.pct, 2), 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {!hasRealIntents && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              <Activity size={13} className="shrink-0 text-primary stroke-[2.5]" />
              <span>Live breakdown updates automatically as {config.shortLabel} calls are analyzed.</span>
            </div>
          )}
        </article>

        {/* Card 2: AI Extraction Parameters */}
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground">AI Extraction Parameters</h3>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Active Schema</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Structured fields extracted into CRM webhook payload
          </p>

          <div className="mt-4 space-y-2.5">
            {config.keyExtractionFields.map((field, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs hover:bg-muted/60 transition-colors">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 stroke-[2.5]" />
                <span className="font-bold text-foreground truncate">{field}</span>
              </div>
            ))}
          </div>
        </article>

        {/* Card 3: Top Objections & Voice Agent Counter-Pitch */}
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground">
              {hasRealObjections ? 'Top Objections Handled' : 'Configured Objection Playbook'}
            </h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${hasRealObjections ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-primary/10 text-primary border-primary/20'
              }`}>
              {hasRealObjections ? 'Speech AI' : 'Playbook Active'}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {hasRealObjections
              ? `Friction points detected on live ${config.shortLabel} calls`
              : callsMade > 0
                ? `0 objections raised on ${callsMade} call recorded`
                : `Rules your voice agent will use when prospects raise concerns on calls`}
          </p>

          <div className="mt-3 space-y-3">
            {(hasRealObjections ? realObjections : config.topObjections).map((item, idx) => (
              <div key={idx} className="border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground">{item.objection}</span>
                  <span className="text-xs font-black text-foreground">
                    {hasRealObjections ? item.frequency : 'Active Rule'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-bold text-primary">AI Rebuttal:</span> {item.aiHandling || 'Pre-trained counter-pitch with real-time value positioning'}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* Quick Link to Industry Prompt Studio */}
      <section className="flex flex-col items-center justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-primary/5 p-4 sm:flex-row sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <IndustryIcon size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Tuning Voice AI for {config.label}?
            </h4>
            <p className="text-xs text-muted-foreground">
              Customize conversation persona, Hindi/English greeting, and qualification checklist in the AI Prompt Studio.
            </p>
          </div>
        </div>

        <Link
          href={`/prompt?template=${selectedIndustry}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md hover:opacity-90"
        >
          Open {config.shortLabel} Prompt Studio
          <ArrowRight size={14} />
        </Link>
      </section>
    </AppLayout>
  )
}

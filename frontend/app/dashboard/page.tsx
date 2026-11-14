'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  GraduationCap,
  Layers,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Sun,
  Target,
  TrendingUp,
  User,
  Users,
  Zap,
} from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { MiniChart } from '@/components/ui/MiniChart'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Select } from '@/components/ui/Select'
import { buttonClass } from '@/components/ui/button'
import { Alert } from '@/components/ui/Alert'
import { LoadingState, Skeleton } from '@/components/ui/States'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey, getIndustryConfig } from '@/lib/industry'

const INDUSTRY_ICONS: Record<string, any> = {
  real_estate: Building2,
  healthcare: Stethoscope,
  edtech: GraduationCap,
  bfsi: CreditCard,
  general_sales: Briefcase,
  collections: ShoppingBag,
  ecommerce: ShoppingBag,
}

const RANGES = [
  { label: 'Today', value: 'Today' },
  { label: 'Last 7 Days', value: '7 Days' },
  { label: 'Last 30 Days', value: '30 Days' },
  { label: 'Last 90 Days', value: '90 Days' },
] as const
type RangeValue = (typeof RANGES)[number]['value']

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'just now'
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  } catch {
    return 'recent'
  }
}

export default function DashboardPage() {
  const { user, isSuperAdmin } = useAuth()
  const [range, setRange] = useState<RangeValue>('30 Days')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')

  // Adaptive Industry Selection:
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [customIndustryTitle, setCustomIndustryTitle] = useState<string>('')
  const [customOffering, setCustomOffering] = useState<string>('')

  const [dashboardData, setDashboardData] = useState<any>(null)
  const [campaignsList, setCampaignsList] = useState<any[]>([])
  const [recentCalls, setRecentCalls] = useState<any[]>([])
  const [recentLeads, setRecentLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [greeting, setGreeting] = useState('Good morning')

  // Set greeting based on local time
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  // Initialize industry from company settings / active prompt
  useEffect(() => {
    async function initIndustry() {
      if (!isSuperAdmin) {
        try {
          const res = await fetchApi('/api/v1/auth/company-settings')
          const compInd = res?.company?.industry || user?.industry
          if (compInd) {
            setSelectedIndustry(compInd)
            if (res?.company?.custom_industry_name) {
              setCustomIndustryTitle(res.company.custom_industry_name)
            }
            if (res?.company?.offering) {
              setCustomOffering(res.company.offering)
            }
            return
          }
        } catch {}

        try {
          const promptRes = await fetchApi('/api/v1/prompt')
          if (promptRes?.industry) {
            setSelectedIndustry(promptRes.industry)
            if (promptRes.offering) setCustomOffering(promptRes.offering)
            return
          }
        } catch {}

        if (user?.industry) {
          setSelectedIndustry(user.industry)
          return
        }
        setSelectedIndustry('edtech')
      } else {
        try {
          const saved = localStorage.getItem('talkly_selected_industry')
          if (saved) {
            setSelectedIndustry(saved)
            return
          }
        } catch {}
        setSelectedIndustry(user?.industry || 'edtech')
      }
    }
    initIndustry()
  }, [user?.industry, isSuperAdmin])

  const handleIndustryChange = async (ind: string) => {
    setSelectedIndustry(ind)
    setSelectedCampaignId('')
    try {
      localStorage.setItem('talkly_selected_industry', ind)
    } catch {}
  }

  // Load Dashboard metrics, campaigns, and recent activity
  useEffect(() => {
    async function loadDashboard(silent = false) {
      try {
        if (!silent) setLoading(true)
        const industryQuery = selectedIndustry ? `&industry=${encodeURIComponent(selectedIndustry)}` : ''
        const campaignQuery = selectedCampaignId ? `&campaign_id=${encodeURIComponent(selectedCampaignId)}` : ''

        const [dashRes, campRes, callsRes, leadsRes] = await Promise.all([
          fetchApi(`/api/v1/analytics/dashboard?range=${encodeURIComponent(range)}${campaignQuery}${industryQuery}`),
          fetchApi('/api/v1/campaigns').catch(() => []),
          fetchApi('/api/v1/calls?limit=8').catch(() => []),
          fetchApi('/api/v1/leads?limit=8').catch(() => []),
        ])

        setDashboardData(dashRes.data)
        setCampaignsList(campRes || [])
        setRecentCalls(callsRes || [])
        setRecentLeads(leadsRes || [])
        setRefreshFailed(false)
        setLastUpdated(new Date())

        if (isSuperAdmin && selectedCampaignId && campRes) {
          const camp = campRes.find((c: any) => c.campaign_id === selectedCampaignId)
          if (camp?.industry && camp.industry !== selectedIndustry) {
            setSelectedIndustry(camp.industry)
          }
        }
      } catch (e) {
        console.error('Failed to load dashboard data', e)
        setRefreshFailed(true)
      } finally {
        if (!silent) setLoading(false)
      }
    }
    loadDashboard()

    const interval = setInterval(() => {
      loadDashboard(true)
    }, 12000)
    return () => clearInterval(interval)
  }, [range, selectedCampaignId, selectedIndustry, isSuperAdmin])

  const config = getIndustryConfig(selectedIndustry, customIndustryTitle, customOffering)
  const isSolar =
    (selectedIndustry || '').toLowerCase().includes('solar') ||
    (customIndustryTitle || '').toLowerCase().includes('solar')
  const IndustryIcon = isSolar ? Sun : INDUSTRY_ICONS[selectedIndustry] || GraduationCap

  // Metric values directly from API
  const callsMade = Number(dashboardData?.calls_made || 0)
  const totalLeads = Number(dashboardData?.total_leads || 0)
  const connectedCalls = Number(dashboardData?.connected_calls || 0)
  const qualifiedLeads = Number(dashboardData?.qualified_leads || 0)
  const interestedLeads = Number(dashboardData?.interested_leads || 0)
  const convertedLeads = Number(dashboardData?.converted_leads || 0)
  const conversionRate = dashboardData?.conversion_rate || '0%'

  // 6 KPI cards mapped to active industry configuration
  const kpiCards = [
    {
      label: config.metrics.total_leads.label,
      value: totalLeads.toLocaleString(),
      Icon: config.metrics.total_leads.icon || Users,
      colorClass: 'text-blue-600 bg-blue-50',
    },
    {
      label: config.metrics.calls_made.label,
      value: callsMade.toLocaleString(),
      Icon: config.metrics.calls_made.icon || Phone,
      colorClass: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: config.metrics.connected_calls.label,
      value: connectedCalls.toLocaleString(),
      Icon: config.metrics.connected_calls.icon || Activity,
      colorClass: 'text-ds-success-ink bg-emerald-50',
    },
    {
      label: config.metrics.qualified_leads.label,
      value: qualifiedLeads.toLocaleString(),
      Icon: config.metrics.qualified_leads.icon || Target,
      colorClass: 'text-violet-600 bg-violet-50',
    },
    {
      label: config.metrics.interested_leads.label,
      value: interestedLeads.toLocaleString(),
      Icon: config.metrics.interested_leads.icon || Sparkles,
      colorClass: 'text-amber-600 bg-amber-50',
    },
    {
      label: config.metrics.conversion_rate.label,
      value: conversionRate,
      Icon: config.metrics.conversion_rate.icon || TrendingUp,
      colorClass: 'text-blue-600 bg-blue-50',
    },
  ]

  // Funnel calculations based on real API data
  const tLeads = totalLeads
  const calcPct = (val: number) => (tLeads > 0 ? `${Math.min(Math.round(((val || 0) / tLeads) * 100), 100)}%` : '0%')

  const funnel = [
    { label: config.funnelStages[0], value: tLeads, pct: tLeads > 0 ? '100%' : '0%' },
    {
      label: config.funnelStages[1],
      value: dashboardData?.contacted_leads || 0,
      pct: calcPct(dashboardData?.contacted_leads),
    },
    { label: config.funnelStages[2], value: connectedCalls, pct: calcPct(connectedCalls) },
    {
      label: config.funnelStages[3] || 'Specialty / Goal Matched',
      value: qualifiedLeads,
      pct: calcPct(qualifiedLeads),
    },
    {
      label: config.funnelStages[4] || 'High-Intent / Priority',
      value: interestedLeads,
      pct: calcPct(interestedLeads),
    },
    {
      label: config.funnelStages[5] || config.conversionGoal,
      value: convertedLeads,
      pct: calcPct(convertedLeads),
    },
  ]

  // Call outcomes breakdown derived from existing real calls and metrics
  const notAnsweredCalls = Math.max(0, callsMade - connectedCalls)
  const connectedPct = callsMade > 0 ? Math.round((connectedCalls / callsMade) * 100) : 0
  const notAnsweredPct = callsMade > 0 ? Math.round((notAnsweredCalls / callsMade) * 100) : 0

  const handleDownload = () => {
    if (!dashboardData) return alert('No data to download')
    const csv = [
      `Industry,${config.label}`,
      `Metric,Value`,
      `${config.metrics.total_leads.label},${totalLeads}`,
      `${config.metrics.calls_made.label},${callsMade}`,
      `${config.metrics.connected_calls.label},${connectedCalls}`,
      `${config.metrics.qualified_leads.label},${qualifiedLeads}`,
      `${config.metrics.interested_leads.label},${interestedLeads}`,
      `${config.metrics.conversion_rate.label},${conversionRate}`,
    ]
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `talkly_${selectedIndustry}_metrics.csv`
    a.click()
  }

  const visibleCampaigns = campaignsList.filter(
    (c: any) =>
      isSuperAdmin ||
      !selectedIndustry ||
      c.industry === selectedIndustry ||
      (String(c.industry || '').startsWith('custom_') && String(selectedIndustry || '').startsWith('custom_'))
  )

  if (loading && !dashboardData) {
    return (
      <AppLayout title="Dashboard">
        <LoadingState label="Loading dashboard…">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-ds-line bg-ds-bg" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <div className="h-80 animate-pulse rounded-xl border border-ds-line bg-ds-bg" />
              <div className="h-80 animate-pulse rounded-xl border border-ds-line bg-ds-bg" />
            </div>
          </div>
        </LoadingState>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Dashboard">
      {/* 1. HERO HEADER BAR */}
      <section className="flex flex-col justify-between gap-4 border-b border-ds-line pb-5 xl:flex-row xl:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-[13px] font-semibold text-blue-700">
              <IndustryIcon size={13} strokeWidth={2} />
              {config.label}
            </span>
            <Link
              href="/settings"
              className="text-[13px] text-ds-ink-3 underline-offset-2 hover:text-ds-primary hover:underline"
            >
              Edit in Settings
            </Link>
          </div>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-ds-ink sm:text-3xl xl:text-[32px]">
            {greeting}, {user?.name || 'User'}
          </h1>
          <p className="mt-1 text-[15px] text-ds-ink-2">{config.tagline}</p>
        </div>

        {/* Right Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            aria-label="Date range"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeValue)}
            className="w-36 bg-white text-sm font-medium"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by campaign"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="sm:w-60 bg-white text-sm font-medium"
          >
            <option value="">All {config.shortLabel} campaigns</option>
            {visibleCampaigns.map((c: any) => (
              <option key={c.campaign_id} value={c.campaign_id}>
                {c.name} {c.offering ? `(${c.offering})` : ''}
              </option>
            ))}
          </Select>

          <button
            onClick={handleDownload}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ds-line bg-white px-3.5 text-sm font-medium text-ds-ink shadow-sm hover:bg-ds-surface"
            title="Export CSV report"
          >
            <Download size={14} strokeWidth={1.75} />
            Export
          </button>
        </div>
      </section>

      {/* Super Admin Switcher if authorized */}
      {isSuperAdmin && (
        <section className="rounded-xl border border-dashed border-ds-accent/40 bg-ds-accent-soft/40 p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ds-bg text-ds-accent">
                <Layers size={14} strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ds-ink">Super Admin Vertical Preview</p>
                <p className="text-[13px] text-ds-ink-2">Test how all industry layouts adapt dynamically.</p>
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
                    className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-ds-primary text-white'
                        : 'border border-ds-line bg-white text-ds-ink-2 hover:border-ds-line-strong hover:text-ds-ink'
                    }`}
                  >
                    {Icon && <Icon size={12} strokeWidth={1.75} />}
                    <span>{item.shortLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* 2. SIX COMPACT KPI CARDS IN ONE ROW */}
      <section aria-label="Key Performance Indicators">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((kpi, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between rounded-xl border border-ds-line bg-white p-4 shadow-sm transition-all hover:border-ds-line-strong"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${kpi.colorClass}`}
                >
                  <kpi.Icon size={15} strokeWidth={2} />
                </span>
                {/* Two lines are allowed so the longer industry labels stay readable at 15px without widening the card. */}
                <span className="line-clamp-2 min-h-10 text-[15px] font-medium leading-5 text-ds-ink-2" title={kpi.label}>
                  {kpi.label}
                </span>
              </div>
              <div className="mt-2">
                <span className="whitespace-nowrap text-[30px] font-bold leading-none tracking-tight text-ds-ink tabular-nums">{kpi.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. CALLING PERFORMANCE & CONVERSION FUNNEL (SIDE BY SIDE) */}
      <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Calling Performance Chart */}
        <div className="flex min-w-0 flex-col justify-between rounded-xl border border-ds-line bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-[19px] font-semibold leading-snug text-ds-ink">Calling Performance</h2>
              <p className="text-sm text-ds-ink-2">{config.shortLabel} outreach and reach</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-4 text-sm font-medium text-ds-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  Attempted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                  Connected
                </span>
              </div>
              <div className="flex rounded-md border border-ds-line bg-ds-surface p-0.5 text-sm font-medium">
                {(['Today', '7D', '30D', '90D'] as const).map((r) => {
                  const val = r === 'Today' ? 'Today' : r === '7D' ? '7 Days' : r === '30D' ? '30 Days' : '90 Days'
                  const isActive = range === val
                  return (
                    <button
                      key={r}
                      onClick={() => setRange(val as RangeValue)}
                      className={`rounded px-2.5 py-1 text-[13px] transition-colors ${
                        isActive ? 'bg-white font-semibold text-ds-primary shadow-xs' : 'text-ds-ink-3 hover:text-ds-ink'
                      }`}
                    >
                      {r}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 min-h-[220px]">
            <MiniChart data={dashboardData?.chart_data} height={230} />
          </div>
        </div>

        {/* Industry Conversion Funnel */}
        <div className="flex flex-col justify-between rounded-xl border border-ds-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-ds-line pb-3">
            <div>
              <h2 className="text-[19px] font-semibold leading-snug text-ds-ink">{config.shortLabel}-Lead Funnel</h2>
              <p className="text-sm text-ds-ink-2">Goal: {config.conversionGoal}</p>
            </div>
            <Badge variant="primary" className="text-[13px]">Active Pipeline</Badge>
          </div>

          <div className="mt-3.5 space-y-3">
            {funnel.map((item, idx) => {
              const pctNumber = parseFloat(item.pct) || 0
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-[15px] font-medium">
                    <span className="truncate text-ds-ink-2">{item.label}</span>
                    <span className="tabular-nums text-ds-ink">
                      {item.value.toLocaleString()} <span className="text-ds-ink-3 font-normal">({item.pct})</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        idx === 0
                          ? 'bg-blue-600'
                          : idx === 1
                          ? 'bg-blue-500'
                          : idx === 2
                          ? 'bg-indigo-500'
                          : idx === 3
                          ? 'bg-indigo-600'
                          : idx === 4
                          ? 'bg-violet-600'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.max(pctNumber, 3)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-ds-line pt-3 text-sm text-ds-ink-2">
            <span>Overall Conversion</span>
            <span className="font-semibold text-ds-primary tabular-nums">{conversionRate}</span>
          </div>
        </div>
      </section>

      {/* 4. THREE ANALYTICS CARDS BELOW: CAMPAIGN PERFORMANCE, CALL OUTCOMES, RESPONSE TIME */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Card 1: Campaign Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-ds-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-ds-line pb-3">
            <div>
              <h2 className="text-[19px] font-semibold leading-snug text-ds-ink">Campaign Performance</h2>
              <p className="text-sm text-ds-ink-2">Outreach campaigns breakdown</p>
            </div>
            <Link href="/campaigns" className="text-sm font-semibold text-ds-primary hover:underline">
              View all
            </Link>
          </div>

          <div className="mt-3 flex-1 overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-ds-line text-ds-ink-3">
                  <th className="whitespace-nowrap pb-2 text-[13px] font-medium">Campaign</th>
                  <th className="whitespace-nowrap pb-2 pl-2 text-right text-[13px] font-medium">Inquiries</th>
                  <th className="whitespace-nowrap pb-2 pl-2 text-right text-[13px] font-medium">Connected</th>
                  <th className="whitespace-nowrap pb-2 pl-2 text-right text-[13px] font-medium">Book Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-line">
                {visibleCampaigns.length > 0 ? (
                  visibleCampaigns.slice(0, 4).map((c: any, i: number) => {
                    const leads = Number(c.leads) || 0
                    const connected = Number(c.connected) || 0
                    const interested = Number(c.interested) || 0
                    const rate = leads > 0 ? `${Math.round((interested / leads) * 100)}%` : '0%'
                    return (
                      <tr key={i} className="hover:bg-ds-surface/50">
                        <td className="py-2.5 font-medium leading-snug text-ds-ink [overflow-wrap:anywhere]" title={c.name}>{c.name}</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-ds-ink-2">{leads}</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-ds-ink-2">{connected}</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-semibold text-ds-success-ink">{rate}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-ds-ink-3">
                      No campaigns found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 2: Call Outcomes (Donut Visualizer) */}
        <div className="flex flex-col justify-between rounded-xl border border-ds-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-ds-line pb-3">
            <div>
              <h2 className="text-[19px] font-semibold leading-snug text-ds-ink">Call Outcomes</h2>
              <p className="text-sm text-ds-ink-2">Outreach reachability distribution</p>
            </div>
            <Badge variant="neutral" className="text-[13px]">{callsMade} calls</Badge>
          </div>

          <div className="mt-4 flex flex-1 items-center justify-between gap-4">
            {/* Center donut illustration */}
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="4.5" />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#2463EB"
                  strokeWidth="4.5"
                  strokeDasharray={`${connectedPct} 100`}
                  strokeLinecap="round"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#7955E8"
                  strokeWidth="4.5"
                  strokeDasharray={`${notAnsweredPct} 100`}
                  strokeDashoffset={`-${connectedPct}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold leading-none text-ds-ink tabular-nums">{connectedCalls}</span>
                <span className="mt-0.5 text-[13px] text-ds-ink-3">Connected</span>
              </div>
            </div>

            {/* Outcomes Legend */}
            <div className="flex-1 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-ds-ink-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  Connected
                </span>
                <span className="font-semibold text-ds-ink tabular-nums">{connectedPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-ds-ink-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                  Not Answered
                </span>
                <span className="font-semibold text-ds-ink tabular-nums">{notAnsweredPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-ds-ink-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  Busy
                </span>
                <span className="font-semibold text-ds-ink tabular-nums">
                  {callsMade > 0 ? Math.max(0, 100 - connectedPct - notAnsweredPct) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-ds-ink-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  Other
                </span>
                <span className="font-semibold text-ds-ink tabular-nums">0%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Response Time Insights */}
        <div className="flex flex-col justify-between rounded-xl border border-ds-line bg-white p-5 shadow-sm md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between border-b border-ds-line pb-3">
            <div>
              <h2 className="text-[19px] font-semibold leading-snug text-ds-ink">Response Time Insights</h2>
              <p className="text-sm text-ds-ink-2">Time to first outreach response</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-700">
              <Zap size={11} strokeWidth={2} />
              Instant
            </span>
          </div>

          <div className="mt-4 flex flex-1 flex-col justify-center">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-ds-ink">~ 2.4 min</span>
              <span className="flex items-center gap-1 text-sm font-medium text-ds-success-ink">
                <TrendingUp size={12} /> Faster than manual
              </span>
            </div>
            <p className="mt-1.5 text-sm text-ds-ink-2">
              Automated AI dialers initiate student engagement within minutes of inquiry capture.
            </p>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-ds-surface p-3">
              <div>
                <p className="text-[13px] font-medium text-ds-ink-3">Avg. Call Duration</p>
                <p className="text-base font-semibold text-ds-ink">3m 42s</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-medium text-ds-ink-3">Call Success Rate</p>
                <p className="text-base font-semibold text-ds-success-ink">{conversionRate}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FULL-WIDTH RECENT ACTIVITY SECTION */}
      <section className="rounded-xl border border-ds-line bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-ds-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Activity size={17} strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-[19px] font-semibold leading-snug text-ds-ink">Recent Activity</h2>
              <p className="text-sm text-ds-ink-2">Latest student inquiries, calls and counseling follow-ups</p>
            </div>
          </div>
          <Link href="/calls" className="shrink-0 whitespace-nowrap text-sm font-semibold text-ds-primary hover:underline">
            View all activity
          </Link>
        </div>

        <div className="mt-3 divide-y divide-ds-line">
          {recentCalls.length > 0 ? (
            recentCalls.slice(0, 5).map((call: any, idx: number) => {
              const name = call.customer_name || 'Prospect'
              const phone = call.customer_phone || call.customer_id || ''
              const status = call.status || 'Completed'
              const direction = call.direction || 'outbound'
              const duration = call.duration || (call.duration_seconds ? `${call.duration_seconds}s` : '—')
              return (
                <div key={idx} className="flex flex-col gap-2 py-3 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-700">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-ds-ink">{name}</span>
                        <span className="font-mono text-[13px] text-ds-ink-3">{phone}</span>
                      </div>
                      <p className="text-sm text-ds-ink-2">
                        {direction === 'inbound' ? 'Inbound inquiry' : 'Counseling outreach'} · Duration: {duration}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-12 sm:shrink-0 sm:pl-0">
                    <StatusBadge status={status} className="text-[13px]" />
                    <span className="whitespace-nowrap text-[13px] text-ds-ink-3">{timeAgo(call.created_at)}</span>
                  </div>
                </div>
              )
            })
          ) : recentLeads.length > 0 ? (
            recentLeads.slice(0, 5).map((lead: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-2 py-3 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[13px] font-semibold text-blue-700">
                    {(lead.name || 'L').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <span className="text-[15px] font-semibold text-ds-ink">{lead.name || 'Candidate'}</span>
                    <p className="text-sm text-ds-ink-2">
                      Inquiry captured for {lead.offering || config.shortLabel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-12 sm:shrink-0 sm:pl-0">
                  <StatusBadge status={lead.status || 'New'} className="text-[13px]" />
                  <span className="whitespace-nowrap text-[13px] text-ds-ink-3">{timeAgo(lead.created_at)}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-ds-ink-3">No recent activities recorded yet.</p>
          )}
        </div>
      </section>

      {/* 6. PROMPT STUDIO TUNING BANNER */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-xl border border-ds-line bg-ds-bg p-4.5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ds-primary-soft text-ds-primary">
            <IndustryIcon size={17} strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold text-ds-ink">Tuning Voice AI for {config.label}?</h2>
            <p className="mt-0.5 text-sm text-ds-ink-2">
              Customize counseling persona, demo booking flow, and objection rebuttals in AI Prompt Studio.
            </p>
          </div>
        </div>
        <Link href={`/prompt?template=${selectedIndustry}`} className={buttonClass('primary', 'md', 'shrink-0')}>
          Open {config.shortLabel} Prompt Studio
          <ArrowRight size={14} strokeWidth={1.75} />
        </Link>
      </section>
    </AppLayout>
  )
}

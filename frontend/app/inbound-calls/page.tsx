'use client'

import { useEffect, useState } from 'react'
import { PhoneIncoming, Sparkles, MessageSquare, Flame, Copy, Check, RefreshCw, FileSpreadsheet, FileText, Sun, CheckCircle2, Calendar, Bot, Clock, Users, User, Search, ChevronDown } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, fetchBlob, downloadBlob } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { Alert } from '@/components/ui/Alert'
import { LoadMore } from '@/components/ui/Pagination'
import { Sheet, DetailGrid, SheetSection } from '@/components/ui/Dialog'
import { Transcript } from '@/components/ui/Transcript'
import { buttonClass } from '@/components/ui/button'
import { formatDateTime, parseApiDate } from '@/lib/format'

interface CallStats {
  total_calls: number
  answered_calls: number
  missed_calls: number
  calls_today: number
  avg_duration_seconds: number
  unique_callers: number
}

export default function InboundCallsPage() {
  const [calls, setCalls] = useState<any[]>([])
  const [stats, setStats] = useState<CallStats | null>(null)
  const [loading, setLoading] = useState(true)
  // Presentation-only: true while the latest load (or "load more") failed, so it is never shown as "no inbound calls".
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('All')
  const [page, setPage] = useState(0)
  const [selectedCall, setSelectedCall] = useState<any>(null)
  const [hasMore, setHasMore] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // Presentation-only filters applied to the calls already loaded (no extra request).
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all')
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [rangeFilter, setRangeFilter] = useState<string>('all')
  const LIMIT = 500

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await fetchBlob('/api/v1/calls/export?direction=inbound')
      downloadBlob(blob, 'talkly_inbound_calls.xlsx')
    } catch (e: any) {
      alert(e.message || 'Failed to export inbound calls')
    } finally {
      setExporting(false)
    }
  }

  const loadCalls = async (pageNum: number) => {
    if (pageNum === 0) setLoading(true)
    try {
      const data = await fetchApi(`/api/v1/calls?direction=inbound&limit=${LIMIT}&skip=${pageNum * LIMIT}`)
      if (data && data.length > 0) {
        if (pageNum === 0) setCalls(data)
        else setCalls(prev => [...prev, ...data])
        if (data.length < LIMIT) setHasMore(false)
      } else {
        if (pageNum === 0) setCalls([])
        setHasMore(false)
      }
      setLoadFailed(false)
    } catch (e) {
      console.error('Failed to load inbound calls', e)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const data = await fetchApi('/api/v1/calls/stats?direction=inbound')
      if (data) setStats(data)
    } catch (e) {
      console.error('Failed to load inbound call stats', e)
    }
  }

  useEffect(() => {
    loadCalls(page)
  }, [page])

  useEffect(() => {
    loadStats()
  }, [])

  const copyPhone = (e: React.MouseEvent, phone: string, id: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(phone)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDuration = (secs: any) => {
    const sNum = typeof secs === 'number' ? secs : parseInt(secs, 10)
    if (isNaN(sNum) || sNum <= 0) return '00:00'
    const m = Math.floor(sNum / 60)
    const s = Math.round(sNum % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getLeadTemperature = (call: any): { label: string; score: number | null; color: string } => {
    const raw = call.analysis?.lead_temperature || call.lead_temperature
    const score = typeof call.analysis?.lead_score === 'number' ? call.analysis.lead_score : null
    if (raw === 'Hot' || (score !== null && score >= 75)) {
      return { label: 'Hot', score, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/50' }
    }
    if (raw === 'Warm' || (score !== null && score >= 45)) {
      return { label: 'Warm', score, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-900/50' }
    }
    if (raw === 'Cold' || (score !== null && score < 45)) {
      return { label: 'Cold', score, color: 'text-slate-600 bg-slate-50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800' }
    }
    return { label: 'Neutral', score, color: 'text-muted-foreground bg-muted/40 border-border/60' }
  }

  const visibleCalls = calls
    .filter((c) =>
      (c.customer_name || '').toLowerCase().includes(query.toLowerCase()) ||
      String(c.customer_id || '').includes(query) ||
      (c.summary || c.analysis?.summary || '').toLowerCase().includes(query.toLowerCase())
    )
    .filter((c) => {
      if (filterStatus === 'All') return true
      if (filterStatus === 'Hot') return c.analysis?.lead_temperature === 'Hot' || (c.analysis?.lead_score && c.analysis.lead_score >= 75)
      if (filterStatus === 'Warm') return c.analysis?.lead_temperature === 'Warm' || (c.analysis?.lead_score && c.analysis.lead_score >= 45 && c.analysis.lead_score < 75)
      if (filterStatus === 'Cold') return c.analysis?.lead_temperature === 'Cold'
      if (filterStatus === 'Analyzed') return c.status === 'Analyzed'
      if (filterStatus === 'Missed') return c.status === 'Not Answered' || c.status === 'Failed'
      return true
    })

  // Per-row display values. Answered/duration rules are the page's existing logic,
  // moved here unchanged. Summary no longer falls back to invented text.
  const inboundView = (call: any) => {
    const durationSecs = typeof call.duration_seconds === 'number' ? call.duration_seconds : (parseInt(call.duration, 10) || 0)
    const hasDuration = durationSecs > 0 || (call.duration && call.duration !== '00:00' && call.duration !== '0')
    const wasAnswered = hasDuration || !!call.transcript || ['Analyzed', 'Completed', 'In Progress'].includes(call.status)
    const displayStatus = !wasAnswered ? 'Not Answered' : call.status
    const isKnownCaller = call.customer_name && !['inbound caller', 'unknown', 'there', ''].includes(call.customer_name.toLowerCase())
    const tempInfo = getLeadTemperature(call)
    const durationFormatted = formatDuration(durationSecs > 0 ? durationSecs : (call.duration || 0))
    const summaryText = call.outcome_summary || call.summary || call.analysis?.summary || null
    return { displayStatus, isKnownCaller, tempInfo, durationFormatted, summaryText }
  }
  const FILTERS = ['All', 'Hot', 'Warm', 'Analyzed'] as const
  const answeredPct = stats?.total_calls ? Math.round(((stats.answered_calls || 0) / stats.total_calls) * 100) : null

  // ── presentation-only state and helpers (no request, payload or handler is changed) ──
  // Same rules as the tab filter above, so each tab can show how many loaded calls it holds.
  const tabMatches = (c: any, f: string) => {
    if (f === 'Hot') return c.analysis?.lead_temperature === 'Hot' || (c.analysis?.lead_score && c.analysis.lead_score >= 75)
    if (f === 'Warm') return c.analysis?.lead_temperature === 'Warm' || (c.analysis?.lead_score && c.analysis.lead_score >= 45 && c.analysis.lead_score < 75)
    if (f === 'Analyzed') return c.status === 'Analyzed'
    return true
  }
  const TABS = [
    { key: 'All', label: 'All Calls', Icon: null as any },
    { key: 'Hot', label: 'Hot', Icon: Flame },
    { key: 'Warm', label: 'Warm', Icon: Sun },
    { key: 'Analyzed', label: 'Analyzed', Icon: CheckCircle2 },
  ]
  const tabCount = (key: string) => (key === 'All' ? calls.length : calls.filter((c) => tabMatches(c, key)).length)
  const outcomeOptions = Array.from(new Set(calls.map((c) => c.analysis?.intent_label as string).filter(Boolean)))
  const languageOptions = Array.from(new Set(calls.map((c) => c.language as string).filter(Boolean)))
  const RANGES: { key: string; label: string; days: number | null }[] = [
    { key: 'all', label: 'All Time', days: null },
    { key: '7', label: 'Last 7 Days', days: 7 },
    { key: '30', label: 'Last 30 Days', days: 30 },
  ]
  const filteredView = visibleCalls
    .filter((c) => outcomeFilter === 'all' || c.analysis?.intent_label === outcomeFilter)
    .filter((c) => scoreFilter === 'all' || getLeadTemperature(c).label === scoreFilter)
    .filter((c) => languageFilter === 'all' || c.language === languageFilter)
    .filter((c) => {
      const days = RANGES.find((r) => r.key === rangeFilter)?.days
      if (!days) return true
      const d = parseApiDate(c.created_at)
      return d ? Date.now() - d.getTime() <= days * 86400000 : false
    })
  const filtersActive = Boolean(query || filterStatus !== 'All' || outcomeFilter !== 'all' || scoreFilter !== 'all' || languageFilter !== 'all' || rangeFilter !== 'all')
  const clearFilters = () => { setQuery(''); setFilterStatus('All'); setOutcomeFilter('all'); setScoreFilter('all'); setLanguageFilter('all'); setRangeFilter('all') }

  const statsReady = stats !== null
  // Compact indicators are plain ratios of the same stats the cards already show (never a trend or estimate).
  const ratio = (n?: number) => (stats && stats.total_calls ? Math.max(0, Math.min(100, Math.round(((n || 0) / stats.total_calls) * 100))) : 0)
  const KPI_CARDS = [
    { label: 'Total Inbound', value: stats ? (stats.total_calls ?? 0).toLocaleString() : '—', hint: stats ? `${stats.calls_today ?? 0} today` : '', pct: ratio(stats?.calls_today), bar: 'bg-blue-500', Icon: PhoneIncoming, card: 'from-blue-50 via-white to-white border-blue-100', tile: 'from-blue-100 to-blue-50 text-ds-primary' },
    { label: 'Answered by AI', value: stats ? (stats.answered_calls ?? 0).toLocaleString() : '—', hint: stats ? (answeredPct !== null ? `${answeredPct}% of inbound calls` : 'No inbound calls yet') : '', pct: ratio(stats?.answered_calls), bar: 'bg-violet-500', Icon: Bot, card: 'from-violet-50 via-white to-white border-violet-100', tile: 'from-violet-100 to-violet-50 text-[#7955E8]' },
    { label: 'Avg Conversation', value: stats ? formatDuration(stats.avg_duration_seconds ?? 0) : '—', hint: stats ? `${stats.missed_calls ?? 0} missed or incomplete` : '', pct: ratio(stats?.missed_calls), bar: 'bg-emerald-500', Icon: Clock, card: 'from-emerald-50 via-white to-white border-emerald-100', tile: 'from-emerald-100 to-emerald-50 text-emerald-600' },
    { label: 'Unique Callers', value: stats ? (stats.unique_callers ?? 0).toLocaleString() : '—', hint: stats ? 'Distinct phone numbers' : '', pct: ratio(stats?.unique_callers), bar: 'bg-orange-400', Icon: Users, card: 'from-orange-50 via-white to-white border-orange-100', tile: 'from-orange-100 to-orange-50 text-orange-500' },
  ]

  const controlCls =
    'h-11 rounded-xl border border-ds-line bg-ds-bg text-[15px] text-ds-ink outline-none transition focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'
  const headBtn =
    'inline-flex h-12 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-5 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-50'
  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ds-line bg-ds-bg text-ds-ink-2 shadow-sm transition-colors hover:border-ds-primary/40 hover:bg-blue-50 hover:text-ds-primary'
  const th = 'px-2.5 py-3.5 text-[13px] font-semibold tracking-wide text-ds-ink-2'
  const select = (label: string, value: string, onChange: (v: string) => void, children: React.ReactNode, lead?: React.ReactNode) => (
    <div className="relative min-w-[140px] flex-1 sm:min-w-0 sm:flex-none">
      {lead && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-2">{lead}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={`${controlCls} w-full cursor-pointer appearance-none ${lead ? 'pl-10' : 'pl-3.5'} pr-9 font-medium`}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
    </div>
  )

  const avatar = (call: any, known: boolean) => {
    const name = String(call.customer_name || '').trim()
    if (!name) return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700" aria-hidden="true"><User size={19} strokeWidth={1.75} /></span>
    return (
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ring-1 ring-inset ${known ? 'bg-blue-50 text-ds-primary ring-blue-100' : 'bg-violet-50 text-violet-700 ring-violet-100'}`} aria-hidden="true">
        {name.slice(0, 2).toUpperCase()}
      </span>
    )
  }
  const SCORE_TONE: Record<string, string> = { Hot: 'bg-rose-50 text-rose-700 border-rose-100', Warm: 'bg-violet-50 text-violet-700 border-violet-100', Cold: 'bg-slate-50 text-slate-700 border-slate-200' }
  const scoreBadge = (t: { label: string; score: number | null }) =>
    t.label === 'Neutral'
      ? <span className="text-ds-ink-3">—</span>
      : (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-[14px] font-semibold ${SCORE_TONE[t.label] || 'border-ds-line bg-ds-surface text-ds-ink-2'}`}>
          {t.label === 'Hot' ? <Flame size={13} strokeWidth={1.75} aria-hidden="true" /> : null}
          {t.label}{t.score !== null && <span className="tabular-nums"> · {t.score}</span>}
        </span>
      )
  const callerBadge = (known: boolean) =>
    known
      ? <span className="rounded-lg bg-blue-50 px-2.5 py-0.5 text-[13px] font-semibold text-blue-700">CRM lead</span>
      : <span className="rounded-lg border border-ds-line bg-ds-surface px-2.5 py-0.5 text-[13px] font-medium text-ds-ink-2">New caller</span>
  const INTENT_TONE: Record<string, string> = { Hot: 'bg-rose-50 text-rose-700', Warm: 'bg-violet-50 text-violet-700' }
  const intentChip = (call: any, label: string) =>
    call.analysis?.intent_label ? (
      <span className={`mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-0.5 text-[13px] font-semibold ${INTENT_TONE[label] || 'bg-blue-50 text-blue-700'}`}>
        <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" /><span className="truncate">{call.analysis.intent_label}</span>
      </span>
    ) : null
  const copyButton = (call: any) => call.customer_id ? (
    <button
      onClick={(e) => copyPhone(e, call.customer_id, call.call_id)}
      className={iconBtn}
      title="Copy number"
      aria-label={`Copy ${call.customer_id}`}
    >
      {copiedId === call.call_id ? <Check size={18} className="text-ds-success-ink" /> : <Copy size={17} strokeWidth={1.75} />}
    </button>
  ) : null
  const viewButton = (call: any) => (
    <button
      onClick={(e) => { e.stopPropagation(); setSelectedCall(call) }}
      aria-label={`View call from ${call.customer_name || 'inbound caller'}`}
      title="View call details and transcript"
      className={iconBtn}
    >
      <FileText size={17} strokeWidth={1.75} />
    </button>
  )
  const tabIcon = (key: string, active: boolean) => {
    if (key === 'Hot') return <Flame size={18} strokeWidth={1.5} aria-hidden="true" className={active ? 'fill-white/90' : 'fill-rose-500 text-rose-500'} />
    if (key === 'Warm') return <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-full ${active ? 'bg-white/90' : 'bg-amber-400'}`} />
    if (key === 'Analyzed') return <CheckCircle2 size={19} strokeWidth={2} aria-hidden="true" className={active ? 'fill-white/90 text-ds-primary' : 'fill-emerald-500 text-white'} />
    return null
  }

  return (
    <AppLayout title="Inbound Calls">
      {/* Page header */}
      <header className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-100/70 via-blue-50/70 to-white px-5 py-5 shadow-sm sm:px-6">
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8b6cf0] to-[#6a47d6] text-white shadow-md shadow-violet-500/30 ring-1 ring-white/70" aria-hidden="true">
              <PhoneIncoming size={30} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Inbound Calls</h1>
              <p className="mt-0.5 text-[16px] text-ds-ink-2">Calls to your number, answered by your AI agent, with transcripts and lead outcomes.</p>
            </div>
          </div>
          {/* Decorative waveform (no data) */}
          <svg aria-hidden="true" viewBox="0 0 180 40" className="pointer-events-none hidden h-10 w-44 shrink-0 text-[#7955E8]/55 2xl:block" fill="currentColor">
            {[8, 16, 26, 14, 30, 20, 10, 24, 34, 18, 28, 12, 22, 32, 16, 8].map((h, i) => (
              <rect key={i} x={i * 11 + 2} y={20 - h / 2} width="4" height={h} rx="2" />
            ))}
          </svg>
          <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
            <button
              onClick={() => {
                setPage(0)
                loadCalls(0)
                loadStats()
              }}
              className={headBtn}
              title="Refresh list"
            >
              <RefreshCw size={18} strokeWidth={1.75} />Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-ds-primary px-6 text-[15px] font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-ds-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSpreadsheet size={18} strokeWidth={1.75} />
              {exporting ? 'Exporting…' : 'Export .xlsx'}
            </button>
          </div>
        </div>
      </header>

      {/* Summary stat cards (the existing inbound stats endpoint) */}
      <section aria-label="Inbound call statistics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {KPI_CARDS.map(({ label, value, hint, pct, bar, Icon, card, tile }) => (
          <div key={label} className={`rounded-2xl border bg-gradient-to-br px-4 py-4 shadow-sm sm:px-5 ${card}`}>
            <div className="flex items-center gap-3.5 sm:gap-4">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ring-1 ring-white/80 sm:h-14 sm:w-14 ${tile}`} aria-hidden="true">
                <Icon size={24} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-snug text-ds-ink-2 sm:text-[16px]">{label}</p>
                <p className="mt-0.5 text-[30px] font-bold leading-none tracking-tight text-ds-ink tabular-nums sm:text-[32px]">{value}</p>
              </div>
            </div>
            <p className="mt-3 text-[14px] leading-snug text-ds-ink-2 sm:text-[15px]">{statsReady && hint ? hint : ' '}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5" aria-hidden="true">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${statsReady ? pct : 0}%` }} />
            </div>
          </div>
        ))}
      </section>

      {/* Main panel */}
      <div className="rounded-2xl border border-ds-line bg-ds-bg shadow-sm">
        {/* Status navigation */}
        <div role="tablist" aria-label="Filter inbound calls" className="flex items-center gap-2.5 overflow-x-auto px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          {TABS.map(({ key, label }) => {
            const isActive = (FILTERS as readonly string[]).includes(filterStatus) ? filterStatus === key : key === 'All'
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilterStatus(key)}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-5 text-[15px] font-semibold transition-colors sm:text-[16px] ${
                  isActive ? 'border-ds-primary bg-ds-primary text-white shadow-md shadow-blue-600/25' : 'border-ds-line bg-ds-bg text-ds-ink hover:border-ds-primary/40 hover:bg-blue-50/60'
                }`}
              >
                {tabIcon(key, isActive)}
                {label} <span className="tabular-nums">({tabCount(key)})</span>
              </button>
            )
          })}
        </div>

        {/* Filter toolbar */}
        <div className="mx-4 flex flex-wrap items-center gap-2.5 border-t border-ds-line py-4 sm:mx-6">
          <div className="relative w-full sm:min-w-[200px] sm:flex-1">
            <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search caller, phone, or outcome…"
              aria-label="Search inbound calls"
              className={`${controlCls} w-full bg-ds-surface pl-10 pr-3 placeholder:text-ds-ink-3 [&::-webkit-search-cancel-button]:hidden`}
            />
          </div>
          {outcomeOptions.length > 0 &&
            select('Filter by outcome', outcomeFilter, setOutcomeFilter, <>
              <option value="all">All Outcomes</option>
              {outcomeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </>)}
          {select('Filter by AI score', scoreFilter, setScoreFilter, <>
            <option value="all">All AI Score</option>
            <option value="Hot">Hot (75+)</option>
            <option value="Warm">Warm (45–74)</option>
            <option value="Cold">Cold (under 45)</option>
          </>)}
          {languageOptions.length > 0 &&
            select('Filter by language', languageFilter, setLanguageFilter, <>
              <option value="all">All Languages</option>
              {languageOptions.map((l) => <option key={l} value={l}>{l}</option>)}
            </>)}
          <div className="contents">
            {select('Filter by date range', rangeFilter, setRangeFilter, <>
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </>, <Calendar size={17} strokeWidth={1.75} />)}
          </div>
        </div>

        {/* Stale data warning */}
        {loadFailed && calls.length > 0 && (
          <div className="px-4 pb-3 sm:px-6">
            <Alert tone="warning" title="Couldn’t load inbound calls">
              The calls below were loaded earlier and may be out of date. Try "Load more" again or reload the page.
            </Alert>
          </div>
        )}

        {/* Call records */}
        {loading ? (
          <div className="p-6 pt-2">
            <LoadingState label="Loading inbound calls…">
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            </LoadingState>
          </div>
        ) : loadFailed && calls.length === 0 ? (
          <div className="p-6 pt-2">
            <ErrorState title="Inbound calls couldn’t be loaded" description="The request failed, so no list is shown rather than an empty one. Reload the page to try again." />
          </div>
        ) : filteredView.length === 0 ? (
          <div className="p-6 pt-2">
            <EmptyState
              icon={<PhoneIncoming size={18} strokeWidth={1.75} />}
              title={calls.length === 0 ? 'No inbound calls yet' : 'No inbound calls match these filters'}
              description={calls.length === 0 ? 'Calls placed to your phone number will appear here automatically.' : 'Try a different search or filter. Only loaded calls are searched.'}
              action={calls.length > 0 && filtersActive ? <button onClick={clearFilters} className={buttonClass('outline', 'md')}>Clear filters</button> : undefined}
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div role="region" aria-label="Inbound calls table" tabIndex={0} className="mx-3 hidden overflow-x-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary sm:mx-4 xl:block">
              <table className="w-full min-w-[940px] border-collapse text-[15px]">
                <thead>
                  <tr className="bg-slate-50 [&>th:first-child]:rounded-l-xl [&>th:last-child]:rounded-r-xl">
                    <th scope="col" className={`${th} pl-4 text-left`}>Caller</th>
                    <th scope="col" className={`${th} text-left`}>Phone</th>
                    <th scope="col" className={`${th} text-left`}>Outcome &amp; Intent</th>
                    <th scope="col" className={`${th} text-left`}>AI Score</th>
                    <th scope="col" className={`${th} text-right`}>Duration</th>
                    <th scope="col" className={`${th} text-left`}>Status</th>
                    <th scope="col" className={`${th} pr-4 text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredView.map((call, idx) => {
                    const v = inboundView(call)
                    return (
                      <tr key={`${call._id || call.call_id || 'call'}-${idx}`} onClick={() => setSelectedCall(call)} className="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-blue-50/40">
                        <td className="max-w-[260px] py-4 pl-4 pr-2.5 align-top">
                          <div className="flex min-w-0 items-start gap-3">
                            {avatar(call, Boolean(v.isKnownCaller))}
                            <div className="min-w-0">
                              <p className={`truncate text-[16px] ${v.isKnownCaller ? 'font-semibold text-ds-ink' : 'font-semibold text-ds-ink'}`}>{call.customer_name || 'Inbound caller'}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                {callerBadge(Boolean(v.isKnownCaller))}
                                {call.language && <span className="text-[14px] text-ds-ink-2">{call.language}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-4 align-top">
                          <p className="whitespace-nowrap font-medium tabular-nums text-ds-ink" title={call.customer_id}>{call.customer_id || '—'}</p>
                          <p className="mt-1 text-[14px] text-ds-ink-2">{formatDateTime(call.created_at)}</p>
                        </td>
                        <td className="min-w-[190px] max-w-[320px] px-2.5 py-4 align-top">
                          {intentChip(call, v.tempInfo.label)}
                          {v.summaryText
                            ? <p className="line-clamp-2 break-words text-ds-ink-2" title={v.summaryText}>{v.summaryText}</p>
                            : <p className="text-ds-ink-3">No summary yet</p>}
                        </td>
                        <td className="px-2.5 py-4 align-top">{scoreBadge(v.tempInfo)}</td>
                        <td className="px-2.5 py-4 text-right align-top font-medium tabular-nums text-ds-ink">{v.durationFormatted}</td>
                        <td className="px-2.5 py-4 align-top"><StatusBadge status={v.displayStatus} className="px-2.5 py-1 text-[14px]" /></td>
                        <td className="py-3 pl-2.5 pr-3 align-top">
                          <div className="flex items-center justify-end gap-1.5">{copyButton(call)}{viewButton(call)}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards: phones and tablets */}
            <div className="space-y-2.5 px-3 pb-3 xl:hidden">
              {filteredView.map((call, idx) => {
                const v = inboundView(call)
                return (
                  <article key={`${call._id || call.call_id || 'call'}-m-${idx}`} className="rounded-2xl border border-ds-line bg-ds-bg p-3.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      {avatar(call, Boolean(v.isKnownCaller))}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[16px] font-semibold text-ds-ink">{call.customer_name || 'Inbound caller'}</p>
                            <p className="text-[14px] tabular-nums text-ds-ink-2">{call.customer_id || '—'}</p>
                          </div>
                          <StatusBadge status={v.displayStatus} className="shrink-0 px-2.5 py-0.5 text-[14px]" />
                        </div>
                        <div className="mt-2">{intentChip(call, v.tempInfo.label)}</div>
                        {v.summaryText && <p className="line-clamp-2 text-[14px] text-ds-ink-2">{v.summaryText}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-ds-ink-2">
                          {scoreBadge(v.tempInfo)}
                          {callerBadge(Boolean(v.isKnownCaller))}
                          <span className="tabular-nums">{v.durationFormatted}</span>
                          {call.language && <span>{call.language}</span>}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[14px] text-ds-ink-2">{formatDateTime(call.created_at)}</span>
                          <div className="flex items-center gap-2">{copyButton(call)}{viewButton(call)}</div>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}

        {/* Footer: loaded count + existing "Load more" */}
        {!loading && calls.length > 0 && (
          <div className="mx-4 mt-1 flex flex-col gap-3 border-t border-ds-line py-4 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-ds-ink-2 tabular-nums">
              Showing <span className="font-medium text-ds-ink">{filteredView.length}</span> of <span className="font-medium text-ds-ink">{calls.length}</span> loaded calls{hasMore ? ' · more available' : ''}
            </p>
            {hasMore && <LoadMore onClick={() => setPage(p => p + 1)} label="Load more inbound calls" />}
          </div>
        )}
      </div>

      <Sheet
        open={Boolean(selectedCall)}
        onClose={() => setSelectedCall(null)}
        title={selectedCall?.customer_name || 'Inbound caller'}
        description={<span className="tabular-nums">{selectedCall?.customer_id}</span>}
        headerExtra={selectedCall ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedCall.customer_name && !['inbound caller', 'unknown', 'there', ''].includes(selectedCall.customer_name.toLowerCase()) && <Badge variant="primary">CRM lead</Badge>}
            <StatusBadge status={selectedCall.status} />
          </div>
        ) : null}
      >
        {selectedCall && (
          <>
            <DetailGrid
              items={[
                { label: 'Duration', value: <span className="tabular-nums">{formatDuration(selectedCall.duration_seconds || selectedCall.duration || 0)}</span> },
                { label: 'Language', value: selectedCall.language || '—' },
                { label: 'AI intent', value: selectedCall.analysis?.lead_temperature ? `${selectedCall.analysis.lead_temperature} intent` : (selectedCall.status || '—') },
                { label: 'Date', value: formatDateTime(selectedCall.created_at) },
              ]}
            />
            <SheetSection title="AI call summary & outcome" icon={<Sparkles size={14} />}>
              <p className="rounded-lg border border-ds-line bg-ds-surface p-3.5 text-[13px] leading-relaxed text-ds-ink-2">
                {selectedCall.outcome_summary || selectedCall.summary || selectedCall.analysis?.summary || 'No summary available.'}
              </p>
            </SheetSection>
            {selectedCall.transcript && (
              <SheetSection title="Conversation transcript" icon={<MessageSquare size={14} />}>
                <Transcript text={selectedCall.transcript} customerLabel="Caller" />
              </SheetSection>
            )}
          </>
        )}
      </Sheet>
    </AppLayout>
  )
}

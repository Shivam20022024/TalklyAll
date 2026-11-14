'use client'

import { useEffect, useState } from 'react'
import { Download, Phone, Sparkles, MessageSquare, Trash2, CircleDollarSign, PhoneIncoming, PhoneOutgoing, PanelRightOpen, Clock, User, Search, ChevronDown } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, fetchBlob, downloadBlob } from '@/lib/api'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { Alert } from '@/components/ui/Alert'
import { LoadMore } from '@/components/ui/Pagination'
import { Sheet, DetailGrid, SheetSection } from '@/components/ui/Dialog'
import { Transcript } from '@/components/ui/Transcript'
import { buttonClass } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/Field'
import { formatDateTime, formatDuration, parseApiDate } from '@/lib/format'

type DirectionTab = 'all' | 'outbound' | 'inbound'

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Presentation-only: true while the latest load (or "load more") failed, so it is never shown as "no calls".
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<any>(null)
  const [hasMore, setHasMore] = useState(true)
  const [selectedCalls, setSelectedCalls] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  // Presentation-only filters applied to the calls already loaded (no extra request).
  const [directionFilter, setDirectionFilter] = useState<DirectionTab>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const LIMIT = 500

  const loadCalls = async (pageNum: number) => {
    if (pageNum === 0) setLoading(true)
    try {
      const data = await fetchApi(`/api/v1/calls?limit=${LIMIT}&skip=${pageNum * LIMIT}`)
      if (data && data.length > 0) {
        if (pageNum === 0) {
          setCalls(data)
        } else {
          setCalls(prev => [...prev, ...data])
        }
        if (data.length < LIMIT) setHasMore(false)
      } else {
        if (pageNum === 0) setCalls([])
        setHasMore(false)
      }
      setLoadFailed(false)
    } catch (e) {
      console.error(e)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCalls(page)
  }, [page])

  const handleDownload = async (direction: 'outbound' | 'inbound') => {
    setExporting(true)
    try {
      const blob = await fetchBlob(`/api/v1/calls/export?direction=${direction}`)
      downloadBlob(blob, `talkly_${direction}_calls.xlsx`)
    } catch (e: any) {
      alert(e.message || 'Failed to export calls')
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedCalls.length === 0) return alert('Please select at least one call to delete.')
    if (!confirm(`Are you sure you want to delete ${selectedCalls.length} selected call(s)? This cannot be undone.`)) return
    try {
      await fetchApi('/api/v1/calls/delete-bulk', { 
        method: 'POST',
        body: JSON.stringify({ call_ids: selectedCalls })
      })
      alert('Selected calls deleted successfully!')
      setSelectedCalls([])
      setPage(0)
      loadCalls(0)
    } catch (e: any) {
      alert(`Failed to delete calls: ${e.message}`)
    }
  }

  const visibleCalls = calls
    .filter((c) => 
      (c.customer_name || '').toLowerCase().includes(query.toLowerCase()) || 
      // Phone numbers are stored in customer_id; customer_phone is not set by the backend.
      String(c.customer_phone || c.customer_id || '').includes(query) ||
      String(c.call_id || '').toLowerCase().includes(query.toLowerCase())
    )
    .filter((c) => directionFilter === 'all' || c.direction === directionFilter)
    .filter((c) => languageFilter === 'all' || c.language === languageFilter)
    .filter((c) => {
      if (!filterStatus || filterStatus === 'All Statuses') return true;
      if (filterStatus === 'Qualified') return c.analysis?.lead_temperature === 'Hot';
      if (filterStatus === 'Interested') return c.analysis?.lead_temperature === 'Warm';
      if (filterStatus === 'Not Interested') return c.analysis?.lead_temperature === 'Cold';
      return c.status === filterStatus;
    })

  // Per-row display values. The "Not Received" rule and duration fallback are the
  // page's existing logic, moved here unchanged from the previous table markup.
  const callView = (call: any) => {
    const durationSecs = call.duration_seconds || 0
    const hasDuration = !!call.duration || durationSecs > 0
    // Missing duration alone doesn't mean the call wasn't
    // received - Plivo's hangup webhook isn't wired for every
    // call path, so older records may have a real
    // transcript/analysis but no duration. Only call it
    // "Not Received" when there's no other evidence it connected.
    const explicitZero = call.duration === '00:00' || call.duration === '0'
    const wasReceived = !explicitZero && (hasDuration || !!call.transcript || ['Analyzed', 'Completed', 'In Progress'].includes(call.status))
    const isNotReceived = !wasReceived
    const displayStatus = isNotReceived ? 'Not Received' : call.status
    const durationDisplay = isNotReceived ? null : (call.duration || formatDuration(durationSecs))
    return { displayStatus, durationDisplay }
  }
  // Summary figures, derived from the calls loaded so far (no extra request or invented metric).
  const outboundCount = calls.filter((c) => c.direction === 'outbound').length
  const inboundCount = calls.filter((c) => c.direction === 'inbound').length
  const languageOptions = Array.from(new Set(calls.map((c) => c.language as string).filter(Boolean)))
  const durationOf = (c: any): number => {
    if (c.duration_seconds > 0) return c.duration_seconds
    const parts = String(c.duration || '').split(':').map(Number)
    return parts.length >= 2 && parts.every(Number.isFinite) ? parts.reduce((a, n) => a * 60 + n, 0) : 0
  }
  const timed = calls.map(durationOf).filter((s) => s > 0)
  const avgDuration = timed.length > 0 ? formatDuration(Math.round(timed.reduce((a, s) => a + s, 0) / timed.length)) : null
  const visibleIds = visibleCalls.map((c: any) => c.call_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id: string) => selectedCalls.includes(id))
  const toggleCall = (id: string, checked: boolean) => setSelectedCalls(checked ? [...selectedCalls, id] : selectedCalls.filter((x) => x !== id))
  const knownName = (call: any) => call.customer_name && !['Not Provided', 'Unknown'].includes(call.customer_name)

  // ── presentation-only state and helpers (no request, payload or handler is changed) ──
  const CALL_TABS: { key: DirectionTab; label: string; count: number }[] = [
    { key: 'all', label: 'All Calls', count: calls.length },
    { key: 'outbound', label: 'Outbound', count: outboundCount },
    { key: 'inbound', label: 'Inbound', count: inboundCount },
  ]
  const filtersActive = Boolean(query || filterStatus || directionFilter !== 'all' || languageFilter !== 'all')
  const clearFilters = () => { setQuery(''); setFilterStatus(null); setDirectionFilter('all'); setLanguageFilter('all') }

  // Never keep a selection the user can no longer see: bulk delete must only touch what is on screen.
  const visibleKey = visibleIds.join('|')
  useEffect(() => {
    const ids = new Set(visibleIds)
    setSelectedCalls((prev) => (prev.every((id) => ids.has(id)) ? prev : prev.filter((id) => ids.has(id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey])

  const kpiReady = !loading && !(loadFailed && calls.length === 0)
  const loadedNote = hasMore ? 'Loaded so far' : undefined
  const KPI_CARDS = [
    { label: 'Total Calls', value: calls.length.toLocaleString(), Icon: Phone, tile: 'bg-blue-50 text-ds-primary' },
    { label: 'Outbound Calls', value: outboundCount.toLocaleString(), Icon: PhoneOutgoing, tile: 'bg-emerald-50 text-emerald-600' },
    { label: 'Inbound Calls', value: inboundCount.toLocaleString(), Icon: PhoneIncoming, tile: 'bg-violet-50 text-ds-accent' },
    { label: 'Average Duration', value: avgDuration || '—', Icon: Clock, tile: 'bg-orange-50 text-orange-500' },
  ]

  const controlCls =
    'h-10 rounded-lg border border-ds-line bg-ds-bg text-[15px] text-ds-ink outline-none transition focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'
  const headBtn =
    'inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-50'
  const rowAction =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-ink-2 transition-colors hover:bg-ds-surface hover:text-ds-primary disabled:opacity-50'
  const th = 'px-3 py-3 text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2'

  const AVATAR_TONES = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-orange-100 text-orange-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700']
  const avatar = (call: any, size = 'h-10 w-10') => {
    if (!knownName(call)) {
      return <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-ds-surface text-ds-ink-3`} aria-hidden="true"><User size={18} strokeWidth={1.75} /></span>
    }
    const name = String(call.customer_name).trim()
    const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('')
    const tone = AVATAR_TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TONES.length]
    return <span className={`flex ${size} shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${tone}`} aria-hidden="true">{initials}</span>
  }
  const directionBadge = (call: any) =>
    call.direction === 'inbound' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-[14px] font-medium text-violet-700"><PhoneIncoming size={14} strokeWidth={1.75} aria-hidden="true" />Inbound</span>
    ) : call.direction === 'outbound' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[14px] font-medium text-emerald-700"><PhoneOutgoing size={14} strokeWidth={1.75} aria-hidden="true" />Outbound</span>
    ) : null
  const callDate = (value: unknown) => {
    const d = parseApiDate(value)
    if (!d) return { day: '—', time: '' }
    return { day: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }
  }
  const viewButton = (call: any) => (
    <button onClick={() => setSelectedCall(call)} aria-label={`View call with ${call.customer_name || 'contact'}`} title="View call details" className={rowAction}>
      <PanelRightOpen size={18} strokeWidth={1.75} />
    </button>
  )

  return (
    <AppLayout title="Calls">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-ds-primary-soft px-3 py-1.5 text-[14px] font-semibold text-ds-primary">
            <Phone size={15} strokeWidth={2} aria-hidden="true" />
            Calls
          </span>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[30px]">Call Management</h1>
          <p className="mt-1 text-[16px] text-ds-ink-2">Every outbound and inbound call, with transcripts and AI analysis.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          <button onClick={() => handleDownload('outbound')} disabled={exporting} title="Export outbound calls to Excel" className={headBtn}>
            <Download size={17} strokeWidth={1.75} />Outbound .xlsx
          </button>
          <button onClick={() => handleDownload('inbound')} disabled={exporting} title="Export inbound calls to Excel" className={headBtn}>
            <Download size={17} strokeWidth={1.75} />Inbound .xlsx
          </button>
        </div>
      </header>

      {/* Summary stat cards (computed from the calls loaded so far) */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Call summary">
        {KPI_CARDS.map(({ label, value, Icon, tile }) => (
          <div key={label} className="flex items-center gap-3.5 rounded-[14px] border border-ds-line bg-ds-bg px-4 py-4 shadow-sm sm:gap-4 sm:px-5">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:h-14 sm:w-14 ${tile}`} aria-hidden="true">
              <Icon size={24} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug text-ds-ink-2 sm:text-[16px]">{label}</p>
              <p className="mt-0.5 text-[28px] font-bold leading-none tracking-tight text-ds-ink tabular-nums sm:text-[32px]">{kpiReady ? value : '—'}</p>
              {kpiReady && loadedNote && label !== 'Average Duration' && <p className="mt-1 text-[13px] text-ds-ink-3">{loadedNote}</p>}
            </div>
          </div>
        ))}
      </section>

      {/* Main panel */}
      <div className="rounded-[14px] border border-ds-line bg-ds-bg shadow-sm">
        {/* Direction tabs (same filter as the call type dropdown) */}
        <div role="tablist" aria-label="Call direction" className="flex items-end gap-1 overflow-x-auto border-b border-ds-line px-3 sm:px-5">
          {CALL_TABS.map(({ key, label, count }) => {
            const isActive = directionFilter === key
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setDirectionFilter(key)}
                className={`relative -mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold transition-colors sm:px-4 sm:text-[16px] ${
                  isActive ? 'border-ds-primary text-ds-primary' : 'border-transparent text-ds-ink-2 hover:text-ds-ink'
                }`}
              >
                {label}
                <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[13px] font-semibold tabular-nums ${isActive ? 'bg-ds-primary text-white' : 'bg-ds-surface text-ds-ink-2'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 px-3 py-3.5 sm:px-5">
          <div className="relative w-full sm:min-w-[240px] sm:max-w-[400px] sm:flex-1">
            <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone or call ID…"
              aria-label="Search calls"
              className={`${controlCls} w-full pl-10 pr-3 placeholder:text-ds-ink-3 [&::-webkit-search-cancel-button]:hidden`}
            />
          </div>
          <div className="relative min-w-[140px] flex-1 sm:min-w-[165px] sm:flex-none">
            <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value as DirectionTab)} aria-label="Filter by call type" className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium`}>
              <option value="all">All Types</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>
          <div className="relative min-w-[140px] flex-1 sm:min-w-[165px] sm:flex-none">
            <select
              aria-label="Filter by status"
              value={filterStatus || 'All Statuses'}
              onChange={(e) => setFilterStatus(e.target.value === 'All Statuses' ? null : e.target.value)}
              className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium`}
            >
              <option value="All Statuses">All Status</option>
              <option value="Qualified">Qualified (Hot)</option>
              <option value="Interested">Interested (Warm)</option>
              <option value="Not Interested">Not Interested (Cold)</option>
              <option value="Completed">Completed</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>
          {languageOptions.length > 0 && (
            <div className="relative min-w-[140px] flex-1 sm:min-w-[165px] sm:flex-none">
              <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} aria-label="Filter by language" className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium`}>
                <option value="all">All Languages</option>
                {languageOptions.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
            </div>
          )}
          {selectedCalls.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-ds-line bg-ds-surface px-3 py-1 sm:ml-auto">
              <span className="text-[14px] font-medium text-ds-ink">{selectedCalls.length} selected</span>
              <button onClick={handleDeleteSelected} className={buttonClass('danger', 'sm')}><Trash2 size={14} strokeWidth={1.75} />Delete</button>
              <button onClick={() => setSelectedCalls([])} className={buttonClass('ghost', 'sm')}>Clear</button>
            </div>
          )}
        </div>

        {/* Stale data warning */}
        {loadFailed && calls.length > 0 && (
          <div className="border-t border-ds-line px-3 py-2.5 sm:px-5">
            <Alert tone="warning" title="Couldn’t load calls">
              The calls below were loaded earlier and may be out of date. Try "Load more" again or reload the page.
            </Alert>
          </div>
        )}

        {/* Table content */}
        {loading ? (
          <div className="border-t border-ds-line p-6">
            <LoadingState label="Loading calls…">
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            </LoadingState>
          </div>
        ) : loadFailed && calls.length === 0 ? (
          <div className="border-t border-ds-line p-6">
            <ErrorState title="Calls couldn’t be loaded" description="The request failed, so no list is shown rather than an empty one. Reload the page to try again." />
          </div>
        ) : visibleCalls.length === 0 ? (
          <div className="border-t border-ds-line p-6">
            <EmptyState
              icon={<Phone size={18} strokeWidth={1.75} />}
              title={calls.length === 0 ? 'No calls yet' : 'No calls match these filters'}
              description={calls.length === 0 ? 'Calls appear here as soon as your agent places or receives one.' : 'Try a different search or filter. Only loaded calls are searched.'}
              action={calls.length > 0 && filtersActive ? <button onClick={clearFilters} className={buttonClass('outline', 'md')}>Clear filters</button> : undefined}
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div role="region" aria-label="Calls table" tabIndex={0} className="hidden overflow-x-auto border-t border-ds-line outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ds-primary xl:block">
              <table className="w-full min-w-[980px] border-collapse text-[15px]">
                <thead>
                  <tr className="border-b border-ds-line bg-ds-surface">
                    <th scope="col" className="w-12 py-3 pl-5 pr-1 text-left">
                      <Checkbox className="scale-125" aria-label="Select all listed calls" checked={allVisibleSelected} onChange={(e) => setSelectedCalls(e.target.checked ? visibleCalls.map((c: any) => c.call_id) : [])} />
                    </th>
                    <th scope="col" className={`${th} text-left`}>Contact</th>
                    <th scope="col" className={`${th} text-left`}>Phone</th>
                    <th scope="col" className={`${th} text-left`}>Direction</th>
                    <th scope="col" className={`${th} text-left`}>Language</th>
                    <th scope="col" className={`${th} text-right`}>Duration</th>
                    <th scope="col" className={`${th} text-left`}>Status</th>
                    <th scope="col" className={`${th} text-left`}>Date &amp; Time</th>
                    <th scope="col" className={`${th} pr-5 text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCalls.map((call, idx) => {
                    const v = callView(call)
                    const dt = callDate(call.created_at)
                    const isSelected = selectedCalls.includes(call.call_id)
                    return (
                      <tr key={`${call._id || call.call_id || 'call'}-${idx}`} className={`border-b border-ds-line transition-colors last:border-b-0 ${isSelected ? 'bg-ds-primary-soft/60' : 'hover:bg-ds-surface/70'}`}>
                        <td className="w-12 py-3 pl-5 pr-1 align-middle">
                          <Checkbox className="scale-125" aria-label={`Select call with ${call.customer_name || 'contact'}`} checked={isSelected} onChange={(e) => toggleCall(call.call_id, e.target.checked)} />
                        </td>
                        <td className="max-w-[220px] px-3 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            {avatar(call)}
                            <button onClick={() => setSelectedCall(call)} className={`truncate text-left text-[16px] hover:text-ds-primary ${knownName(call) ? 'font-semibold text-ds-ink' : 'text-ds-ink-3'}`} title={call.customer_name || 'Not provided'}>
                              {call.customer_name || 'Not provided'}
                            </button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-middle tabular-nums text-ds-ink-2" title={call.customer_phone || call.customer_id}>{call.customer_phone || call.customer_id || '—'}</td>
                        <td className="px-3 py-3 align-middle">{directionBadge(call) || <span className="text-ds-ink-3">—</span>}</td>
                        <td className="px-3 py-3 align-middle text-ds-ink-2">{call.language || '—'}</td>
                        <td className="px-3 py-3 text-right align-middle tabular-nums text-ds-ink">{v.durationDisplay || <span className="text-ds-ink-3">—</span>}</td>
                        <td className="px-3 py-3 align-middle"><StatusBadge status={v.displayStatus} className="px-3 py-1 text-[14px]" /></td>
                        <td className="whitespace-nowrap px-3 py-3 align-middle">
                          <p className="text-[15px] text-ds-ink">{dt.day}</p>
                          {dt.time && <p className="text-[14px] tabular-nums text-ds-ink-2">{dt.time}</p>}
                        </td>
                        <td className="py-3 pl-3 pr-4 align-middle">
                          <div className="flex items-center justify-end">{viewButton(call)}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards: phones and tablets */}
            <div className="space-y-2.5 border-t border-ds-line p-3 xl:hidden">
              <label className="flex items-center gap-2.5 px-1 text-[15px] text-ds-ink-2">
                <Checkbox aria-label="Select all listed calls" checked={allVisibleSelected} onChange={(e) => setSelectedCalls(e.target.checked ? visibleCalls.map((c: any) => c.call_id) : [])} />
                Select all listed
              </label>
              {visibleCalls.map((call, idx) => {
                const v = callView(call)
                const dt = callDate(call.created_at)
                const isSelected = selectedCalls.includes(call.call_id)
                return (
                  <article key={`${call._id || call.call_id || 'call'}-m-${idx}`} className={`rounded-xl border p-3.5 ${isSelected ? 'border-ds-primary/40 bg-ds-primary-soft/50' : 'border-ds-line bg-ds-bg'}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox className="mt-2.5" aria-label={`Select call with ${call.customer_name || 'contact'}`} checked={isSelected} onChange={(e) => toggleCall(call.call_id, e.target.checked)} />
                      {avatar(call)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`truncate text-[16px] ${knownName(call) ? 'font-semibold text-ds-ink' : 'text-ds-ink-3'}`}>{call.customer_name || 'Not provided'}</p>
                            <p className="text-[14px] tabular-nums text-ds-ink-2">{call.customer_phone || call.customer_id || '—'}</p>
                          </div>
                          <StatusBadge status={v.displayStatus} className="shrink-0 px-2.5 py-0.5 text-[14px]" />
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-ds-ink-2">
                          {directionBadge(call)}
                          <span className="tabular-nums">{v.durationDisplay || '—'}</span>
                          {call.language && <span>{call.language}</span>}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[14px] text-ds-ink-2">{dt.day}{dt.time ? ` · ${dt.time}` : ''}</span>
                          {viewButton(call)}
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
          <div className="flex flex-col gap-3 border-t border-ds-line px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[15px] text-ds-ink-2 tabular-nums">
              Showing <span className="font-medium text-ds-ink">{visibleCalls.length}</span> of <span className="font-medium text-ds-ink">{calls.length}</span> loaded calls{hasMore ? ' · more available' : ''}
            </p>
            {hasMore && <LoadMore onClick={() => setPage(p => p + 1)} label="Load more calls" />}
          </div>
        )}
      </div>

      <Sheet
        open={Boolean(selectedCall)}
        onClose={() => setSelectedCall(null)}
        title={selectedCall?.customer_name || 'Phone lead'}
        description={<span className="tabular-nums">{selectedCall?.customer_phone || selectedCall?.customer_id}</span>}
        headerExtra={selectedCall ? <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={selectedCall.status} />{directionBadge(selectedCall)}</div> : null}
      >
        {selectedCall && (
          <>
            <DetailGrid
              items={[
                { label: 'Duration', value: <span className="tabular-nums">{selectedCall.duration_seconds ? `${Math.floor(selectedCall.duration_seconds / 60)}:${(selectedCall.duration_seconds % 60).toString().padStart(2, '0')}` : '—'}</span> },
                { label: 'Language', value: selectedCall.language || '—' },
                { label: 'AI intent', value: selectedCall.analysis?.lead_temperature || '—' },
                { label: 'Date', value: formatDateTime(selectedCall.created_at) },
              ]}
            />

            {selectedCall.industry === 'collections' && selectedCall.analysis?.promise_to_pay?.promised && (
              <SheetSection title="Promise to pay" icon={<CircleDollarSign size={14} />}>
                <DetailGrid items={[{ label: 'Amount', value: selectedCall.analysis.promise_to_pay.amount || '—' }, { label: 'Date', value: selectedCall.analysis.promise_to_pay.date || '—' }]} />
              </SheetSection>
            )}

            <SheetSection title="Call summary" icon={<Sparkles size={14} />}>
              <p className="rounded-lg border border-ds-line bg-ds-surface p-3.5 text-[13px] leading-relaxed text-ds-ink-2">
                {selectedCall.summary || selectedCall.analysis?.summary || 'No summary available.'}
              </p>
            </SheetSection>

            {selectedCall.transcript && (
              <SheetSection title="Transcript" icon={<MessageSquare size={14} />}>
                <Transcript text={selectedCall.transcript} />
              </SheetSection>
            )}
          </>
        )}
      </Sheet>
    </AppLayout>
  )
}

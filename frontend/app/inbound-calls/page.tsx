'use client'

import { useEffect, useState } from 'react'
import {
  PhoneIncoming,
  Search,
  X,
  User,
  Sparkles,
  MessageSquare,
  Clock,
  Activity,
  PhoneMissed,
  Users,
  CalendarDays,
  Download,
  Flame,
  Zap,
  Phone,
  Eye,
  Filter,
  CheckCircle2,
  Copy,
  Check,
  Radio,
  FileSpreadsheet
} from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, fetchBlob, downloadBlob } from '@/lib/api'

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
  const [query, setQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('All')
  const [page, setPage] = useState(0)
  const [selectedCall, setSelectedCall] = useState<any>(null)
  const [hasMore, setHasMore] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const LIMIT = 25

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
    } catch (e) {
      console.error('Failed to load inbound calls', e)
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

  return (
    <AppLayout title="Inbound Calls">
      {/* Header Banner with live pulse & action buttons */}
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="eyebrow text-primary">Workspace / Inbound Calling</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Helpline Line Active
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.06em] sm:text-[34px] text-foreground">
            Inbound Call Log & Lead Outcomes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Real-time inquiries and incoming calls handled directly by your AI Voice Agent with automatic transcript extraction and CRM lead qualification.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setPage(0)
              loadCalls(0)
              loadStats()
            }}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer shadow-xs"
            title="Refresh list"
          >
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet size={15} />
            {exporting ? 'Exporting...' : 'Export Inbound (.xlsx)'}
          </button>
        </div>
      </section>

      {/* KPI Stat Cards with Gradient Glow & Animations */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Inbound Calls */}
        <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-violet-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black tracking-wider text-muted-foreground uppercase">Total Inbound</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 group-hover:scale-110 transition-transform">
              <PhoneIncoming size={17} />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-foreground">{stats?.total_calls ?? 0}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-bold text-violet-600 dark:text-violet-400">+{stats?.calls_today ?? 0}</span>
            <span>calls received today</span>
          </div>
          <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-violet-500/5 blur-xl group-hover:bg-violet-500/15 transition-colors" />
        </div>

        {/* Answered by AI Agent */}
        <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black tracking-wider text-muted-foreground uppercase">Answered by AI</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-foreground">{stats?.answered_calls ?? 0}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {stats?.total_calls ? Math.round(((stats.answered_calls || 0) / stats.total_calls) * 100) : 100}%
            </span>
            <span>answered automatically</span>
          </div>
          <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-emerald-500/5 blur-xl group-hover:bg-emerald-500/15 transition-colors" />
        </div>

        {/* Avg Call Duration */}
        <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-amber-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black tracking-wider text-muted-foreground uppercase">Avg Conversation</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <Clock size={17} />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-foreground">
            {formatDuration(stats?.avg_duration_seconds ?? 0)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Missed / incomplete:</span>
            <span className="font-bold text-foreground">{stats?.missed_calls ?? 0}</span>
          </div>
          <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-amber-500/5 blur-xl group-hover:bg-amber-500/15 transition-colors" />
        </div>

        {/* Unique Callers */}
        <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-500/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black tracking-wider text-muted-foreground uppercase">Unique Callers</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
              <Users size={17} />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-foreground">{stats?.unique_callers ?? 0}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Distinct phone numbers</span>
          </div>
          <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-blue-500/5 blur-xl group-hover:bg-blue-500/15 transition-colors" />
        </div>
      </section>

      {/* Main Table Card with Search, Filter Pills & Outcome Column */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          {/* Live Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 text-primary" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by caller, phone, or outcome..."
              className="h-10 w-full sm:w-80 rounded-xl border border-border bg-background pl-10 pr-4 text-xs font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'All', label: 'All Inbound' },
              { id: 'Hot', label: '🔥 Hot Leads' },
              { id: 'Warm', label: '⚡ Warm' },
              { id: 'Analyzed', label: 'Analyzed' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === f.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'border border-border/80 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table View */}
        <div className="mt-5 overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
              <p className="animate-pulse">Loading inbound calls and AI outcomes...</p>
            </div>
          ) : visibleCalls.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
                <PhoneIncoming size={22} />
              </div>
              <p className="font-semibold text-foreground">No inbound calls found</p>
              <p className="text-xs text-muted-foreground mt-1">Calls placed to your phone number will appear here automatically.</p>
            </div>
          ) : (
            <table className="w-full min-w-[950px] text-left">
              <thead>
                <tr className="border-b border-border/80 h-12 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pl-4 font-bold w-[18%]">Caller</th>
                  <th className="pb-3 px-3 font-bold w-[14%]">Phone</th>
                  <th className="pb-3 px-3 font-bold w-[30%]">Outcome & Intent</th>
                  <th className="pb-3 px-2 font-bold text-center w-[10%]">AI Score</th>
                  <th className="pb-3 px-2 font-bold text-center w-[8%]">Duration</th>
                  <th className="pb-3 px-2 font-bold text-center w-[8%]">Status</th>
                  <th className="pb-3 px-3 font-bold text-right w-[12%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visibleCalls.map((call, idx) => {
                  const durationSecs = typeof call.duration_seconds === 'number' ? call.duration_seconds : (parseInt(call.duration, 10) || 0)
                  const hasDuration = durationSecs > 0 || (call.duration && call.duration !== '00:00' && call.duration !== '0')
                  const wasAnswered = hasDuration || !!call.transcript || ['Analyzed', 'Completed', 'In Progress'].includes(call.status)
                  const displayStatus = !wasAnswered ? 'Not Answered' : call.status
                  const isKnownCaller = call.customer_name && !['inbound caller', 'unknown', 'there', ''].includes(call.customer_name.toLowerCase())
                  const tempInfo = getLeadTemperature(call)
                  const durationFormatted = formatDuration(durationSecs > 0 ? durationSecs : (call.duration || 0))
                  const summaryText = call.outcome_summary || call.summary || call.analysis?.summary || (call.status === 'Completed' ? 'Call completed successfully.' : 'Inbound conversation recorded.')

                  return (
                    <tr
                      key={`${call._id || call.call_id || 'call'}-${idx}`}
                      onClick={() => setSelectedCall(call)}
                      className="group transition-all duration-150 hover:bg-muted/40 cursor-pointer"
                    >
                      {/* Caller */}
                      <td className="pl-4 py-4 align-top">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 group-hover:scale-105 transition-transform">
                            <PhoneIncoming size={15} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <p className={`text-sm truncate max-w-[150px] ${isKnownCaller ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'}`}>
                              {call.customer_name || 'Inbound Caller'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isKnownCaller ? (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  CRM Lead
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                                  New Caller
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground">{call.language || 'Hindi'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-3 py-4 align-top">
                        <div className="flex items-center gap-1 text-xs font-mono font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                          <span title={call.customer_id}>{call.customer_id || '-'}</span>
                          {call.customer_id && (
                            <button
                              onClick={(e) => copyPhone(e, call.customer_id, call.call_id)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Copy number"
                            >
                              {copiedId === call.call_id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {call.created_at ? new Date(call.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </div>
                      </td>

                      {/* Outcome & Intent (Lead Style) */}
                      <td className="px-3 py-4 align-top">
                        <div className="flex flex-col gap-1 max-w-[340px]">
                          {call.analysis?.intent_label && (
                            <span className="inline-flex items-center gap-1 w-fit rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary tracking-wide border border-primary/20">
                              <Sparkles size={11} /> {call.analysis.intent_label}
                            </span>
                          )}
                          <p
                            className="text-xs text-muted-foreground line-clamp-2 leading-relaxed break-words"
                            title={summaryText}
                          >
                            {summaryText}
                          </p>
                        </div>
                      </td>

                      {/* AI Temperature / Score */}
                      <td className="px-2 py-4 align-top text-center">
                        {tempInfo.label !== 'Neutral' ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold border ${tempInfo.color}`}>
                            {tempInfo.label === 'Hot' ? <Flame size={12} /> : <Zap size={12} />}
                            {tempInfo.label}
                            {tempInfo.score !== null && <span className="opacity-75 font-normal">({tempInfo.score})</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-2 py-4 align-top text-center">
                        <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-foreground bg-muted/40 px-2 py-1 rounded-lg">
                          <Clock size={11} className="text-muted-foreground" />
                          {durationFormatted}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-2 py-4 align-top text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${
                            displayStatus === 'Completed' ? 'bg-emerald-500' :
                            displayStatus === 'Analyzed' ? 'bg-purple-500' :
                            displayStatus === 'In Progress' ? 'bg-blue-500 animate-ping' :
                            displayStatus === 'Not Answered' ? 'bg-amber-500' : 'bg-muted-foreground'
                          }`} />
                          <span className="text-xs font-medium text-foreground">{displayStatus}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-4 align-top text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCall(call)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-xs cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {calls.length > 0 && hasMore && (
            <div className="mt-6 flex justify-center pb-2">
              <button
                onClick={() => setPage(p => p + 1)}
                className="rounded-xl border border-border bg-card px-5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-all shadow-xs cursor-pointer"
              >
                Load More Inbound Calls
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Slide-over / Modal for Full Call Analysis & Conversation Transcript */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-background/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="relative border-b border-border bg-muted/40 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shadow-sm">
                  <PhoneIncoming size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                      {selectedCall.customer_name || 'Inbound Caller'}
                    </h2>
                    {selectedCall.customer_name && !['inbound caller', 'unknown', 'there', ''].includes(selectedCall.customer_name.toLowerCase()) && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-600 border border-emerald-500/20">
                        CRM Lead
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{selectedCall.customer_id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCall(null)}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* 4 Stat Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    <Clock size={12} className="text-primary" /> Duration
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {formatDuration(selectedCall.duration_seconds || selectedCall.duration || 0)}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    <MessageSquare size={12} className="text-blue-500" /> Language
                  </div>
                  <div className="text-sm font-bold text-foreground">{selectedCall.language || 'Hindi'}</div>
                </div>

                <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    <Sparkles size={12} className="text-amber-500" /> AI Intent
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {selectedCall.analysis?.lead_temperature ? `${selectedCall.analysis.lead_temperature} Intent` : selectedCall.status}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    <CalendarDays size={12} className="text-emerald-500" /> Date
                  </div>
                  <div className="text-xs font-semibold text-foreground truncate">
                    {selectedCall.created_at ? new Date(selectedCall.created_at).toLocaleDateString() : '-'}
                  </div>
                </div>
              </div>

              {/* Call Summary & Outcome Box */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-foreground">
                  <Sparkles size={14} className="text-primary" /> AI Call Summary & Outcome
                </h3>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs font-medium leading-relaxed text-foreground shadow-xs">
                  {selectedCall.outcome_summary || selectedCall.summary || selectedCall.analysis?.summary || 'Call concluded and analyzed.'}
                </div>
              </div>

              {/* Full Transcript with Styled Bubbles */}
              {selectedCall.transcript && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-foreground">
                    <MessageSquare size={14} className="text-primary" /> Conversation Transcript
                  </h3>
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-h-[300px] overflow-y-auto">
                    {selectedCall.transcript.split('\n').filter(Boolean).map((line: string, i: number) => {
                      const isAi = line.startsWith('AI:')
                      const cleanText = line.replace(/^(AI:|Customer:|User:)\s*/, '')
                      return (
                        <div key={i} className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}>
                          <span className="text-[10px] font-bold text-muted-foreground mb-1">
                            {isAi ? '🤖 Talkly AI' : '👤 Caller'}
                          </span>
                          <div className={`rounded-xl px-3.5 py-2 text-xs leading-relaxed max-w-[85%] ${
                            isAi
                              ? 'bg-muted/70 text-foreground border border-border/60'
                              : 'bg-primary text-primary-foreground font-medium shadow-xs'
                          }`}>
                            {cleanText}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

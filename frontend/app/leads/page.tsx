'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { Download, Phone, Upload, Loader2, Plus, X, Sparkles, MessageSquare, Trash2, CircleDollarSign, ShoppingBag, Users, PanelRightOpen, FileSpreadsheet, Search, ChevronDown, Building2, Stethoscope, GraduationCap, CreditCard, Briefcase, Banknote, Zap, Target, CheckCircle2, SlidersHorizontal } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, getAuthToken, API_BASE_URL } from '@/lib/api'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey } from '@/lib/industry'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatTile } from '@/components/ui/MetricCard'
import { Select } from '@/components/ui/Select'
import { type SortDir } from '@/components/ui/Table'
import { Checkbox, Field, Input } from '@/components/ui/Field'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { Alert } from '@/components/ui/Alert'
import { LeadsPager } from '@/components/leads/LeadsPager'
import { Segmented } from '@/components/ui/Segmented'
import { Dialog, Sheet, DetailGrid, SheetSection } from '@/components/ui/Dialog'
import { Transcript } from '@/components/ui/Transcript'
import { buttonClass } from '@/components/ui/button'
import { formatINR, parseApiDate } from '@/lib/format'

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatIndustryLabel(industry?: string): string {
  if (!industry) return ''
  const config = INDUSTRY_CONFIGS[industry as IndustryKey]
  if (config?.shortLabel) return config.shortLabel
  const cleaned = industry.replace(/^custom_/i, '').replace(/_/g, ' ').trim()
  return cleaned
    .split(' ')
    .map(w => {
      const upper = w.toUpperCase()
      if (['AI', 'ML', 'QA', 'API', 'IT', 'UI', 'UX', 'HP', 'PC', 'TCS', 'BHK'].includes(upper)) return upper
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Returns a relative "2 min ago" / "1 hr ago" string from an ISO timestamp or null. */
function relativeTime(ts?: string | null): string {
  if (!ts) return '—'
  // The API sends UTC timestamps without a timezone suffix; parseApiDate reads them as UTC (new Date() would read them as local time).
  const when = parseApiDate(ts)
  if (!when) return '—'
  const diff = Math.max(0, Date.now() - when.getTime())
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

/** Deterministic colour for lead avatar based on name */
const AVATAR_PALETTES = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
]
function avatarClass(name?: string) {
  if (!name) return AVATAR_PALETTES[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
}
function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Status-tab config ────────────────────────────────────────────────────────
// Maps tab key → filterStatus value used by the existing filter logic
type TabKey = 'all' | 'urgent' | 'followup' | 'qualified'
const TAB_STATUS: Record<TabKey, string | null> = {
  all: null,
  urgent: 'Urgent',
  followup: 'Follow Up',
  qualified: 'Qualified',
}

// ─── Main component ───────────────────────────────────────────────────────────

function LeadsContent() {
  const { user } = useAuth()
  const activeIndustry = (user?.industry as IndustryKey) || 'bfsi'
  const config = INDUSTRY_CONFIGS[activeIndustry]

  // ── existing state (unchanged) ──────────────────────────────────────────────
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [range, setRange] = useState('All Time')
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [uploading, setUploading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showQuickCallModal, setShowQuickCallModal] = useState(false)
  const [quickCallNumber, setQuickCallNumber] = useState('')
  const [quickCallName, setQuickCallName] = useState('')
  const [quickCallLanguage, setQuickCallLanguage] = useState('English')
  const [calling, setCalling] = useState(false)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [selectedCall, setSelectedCall] = useState<any>(null)
  const [loadingCall, setLoadingCall] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [selectedLeads, setSelectedLeads] = useState<string[]>([])
  const [newLead, setNewLead] = useState({ name: '', phone: '', property: '' })
  const [creating, setCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [repaymentUploading, setRepaymentUploading] = useState(false)
  const repaymentFileInputRef = useRef<HTMLInputElement>(null)
  const [recoveryAnalytics, setRecoveryAnalytics] = useState<any>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [campaignId, setCampaignId] = useState<string | null>(searchParams.get('campaign_id'))

  useEffect(() => {
    setCampaignId(searchParams.get('campaign_id'))
  }, [searchParams])

  // ── active tab (drives filterStatus) ───────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab)
    setFilterStatus(TAB_STATUS[tab])
  }

  // ── data fetching (unchanged) ───────────────────────────────────────────────
  const loadLeads = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.append('range', range)
      if (campaignId) qs.append('campaign_id', campaignId)
      const data = await fetchApi(`/api/v1/leads?${qs.toString()}`)
      setLeads(data || [])
      setLoadFailed(false)
    } catch (e) {
      console.error(e)
      setLoadFailed(true)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { loadLeads() }, [range, campaignId])

  useEffect(() => {
    const hasCalling = leads.some((l) => (l.status || '').toLowerCase() === 'calling')
    const pollInterval = hasCalling ? 3000 : 15000
    const interval = setInterval(() => { loadLeads(true) }, pollInterval)
    return () => clearInterval(interval)
  }, [leads, range, campaignId])

  const loadRecoveryAnalytics = async () => {
    try {
      const data = await fetchApi('/api/v1/collections/recovery-analytics')
      setRecoveryAnalytics(data)
    } catch (e) {
      setRecoveryAnalytics(null)
    }
  }

  useEffect(() => { loadRecoveryAnalytics() }, [])

  const showCollectionsUI = industryFilter === 'collections' || (industryFilter === 'active' && activeIndustry === 'collections')

  useEffect(() => {
    if (selectedLead) {
      const fetchCall = async () => {
        setLoadingCall(true)
        try {
          const leadId = selectedLead.lead_id || selectedLead._id
          const data = await fetchApi(`/api/v1/calls/${leadId}`)
          setSelectedCall(data)
        } catch (e) {
          setSelectedCall(null)
        } finally {
          setLoadingCall(false)
        }
      }
      fetchCall()
    } else {
      setSelectedCall(null)
    }
  }, [selectedLead])

  // ── filtered / sorted / paged lists (unchanged logic) ──────────────────────
  const visibleLeads = leads
    .filter((l) => l.name?.toLowerCase().includes(query.toLowerCase()) || String(l.phone || '').includes(query))
    .filter((l) => filterStatus ? (l.status || '').toLowerCase() === filterStatus.toLowerCase() : true)
    .filter((l) => {
      if (industryFilter === 'all') return true
      if (industryFilter === 'active') return l.industry === activeIndustry
      return l.industry === industryFilter
    })

  // Tab counts (applied to ALL leads, ignoring other filters for counts)
  const tabCount = (tab: TabKey) => {
    if (tab === 'all') return leads.length
    const st = TAB_STATUS[tab]
    if (!st) return leads.length
    return leads.filter(l => (l.status || '').toLowerCase() === st.toLowerCase()).length
  }

  // ── handlers (unchanged) ───────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await fetchApi('/api/v1/leads', { method: 'POST', body: JSON.stringify(newLead) })
      setShowModal(false)
      setNewLead({ name: '', phone: '', property: '' })
      loadLeads()
    } catch (e) {
      alert('Failed to add lead')
    } finally {
      setCreating(false)
    }
  }

  const handleQuickCall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickCallName.trim()) { alert('Please enter the customer name'); return }
    setCalling(true)
    try {
      await fetchApi('/api/v1/calls/trigger', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: quickCallNumber,
          customer_name: quickCallName.trim(),
          lead_id: 'quick-call-' + Date.now(),
          campaign_language: quickCallLanguage,
          industry: activeIndustry === 'all' ? (user?.industry || 'general_sales') : activeIndustry
        })
      })
      alert(`Call dispatched successfully to ${quickCallName.trim()}!`)
      setShowQuickCallModal(false)
      setQuickCallNumber('')
      setQuickCallName('')
      loadLeads()
    } catch (e: any) {
      alert(`Failed to dispatch call: ${e.message}`)
    } finally {
      setCalling(false)
    }
  }

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleDeleteSelected = async () => {
    if (selectedLeads.length === 0) return alert('Please select at least one lead to delete.')
    if (!confirm(`Are you sure you want to delete ${selectedLeads.length} selected lead(s)? This cannot be undone.`)) return
    try {
      await fetchApi('/api/v1/leads/delete-bulk', { method: 'POST', body: JSON.stringify({ lead_ids: selectedLeads }) })
      alert('Selected leads deleted successfully!')
      setSelectedLeads([])
      loadLeads()
    } catch (e: any) {
      alert(`Failed to delete leads: ${e.message}`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/api/v1/leads/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (!response.ok) throw new Error('Upload failed')
      const result = await response.json()
      alert(`Successfully uploaded ${result.inserted_count} leads!`)
      loadLeads()
    } catch (error) {
      alert('Failed to upload leads')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRepaymentUploadClick = () => repaymentFileInputRef.current?.click()

  const handleRepaymentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRepaymentUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/api/v1/collections/repayments/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (!response.ok) throw new Error('Upload failed')
      const result = await response.json()
      alert(`Uploaded ${result.repayments_inserted} repayments. Reconciled ${result.leads_reconciled} collections leads against promise-to-pay commitments.`)
      loadLeads()
      loadRecoveryAnalytics()
    } catch (error) {
      alert('Failed to upload repayments')
    } finally {
      setRepaymentUploading(false)
      if (repaymentFileInputRef.current) repaymentFileInputRef.current.value = ''
    }
  }

  const handleCall = async (lead: any) => {
    try {
      const SARVAM_SUPPORTED_LANGUAGES = ['english', 'hindi', 'hinglish']
      const leadLanguage = (lead.language || '').trim()
      const safeLanguage = SARVAM_SUPPORTED_LANGUAGES.includes(leadLanguage.toLowerCase()) ? leadLanguage : 'Hinglish'
      alert(`Initiating call to ${lead.name || 'Lead'} (${lead.phone})...`)
      await fetchApi('/api/v1/calls/trigger', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: lead.phone,
          customer_name: lead.name,
          lead_id: lead.lead_id || lead._id || 'manual-lead',
          campaign_language: safeLanguage,
          industry: activeIndustry !== 'all' ? activeIndustry : (lead.industry || user?.industry || 'general_sales'),
          offering: (lead.industry && activeIndustry !== 'all' && activeIndustry !== lead.industry) ? '' : (lead.offering || lead.property || ''),
          location: lead.location || '',
          amount_due: lead.amount_due || lead.custom_fields?.amount_due || lead.custom_fields?.['Loan Amount'] || lead.custom_fields?.loan_amount || '',
          due_date: lead.due_date || lead.custom_fields?.due_date || lead.custom_fields?.['due date'] || '',
          custom_fields: lead.custom_fields || {}
        })
      })
      alert('Call dispatched successfully!')
    } catch (e: any) {
      alert(`Failed to dispatch call: ${e.message}`)
    }
  }

  const handleDownload = () => {
    if (leads.length === 0) return alert('No data to download')
    const csv = ['Name,Phone,Offering,Location,Status,AI Score']
    leads.forEach(l => csv.push(`${l.name},${l.phone},${l.offering || l.property || ''},${l.location || ''},${l.status},${l.aiScore}`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_export.csv'
    a.click()
  }

  // ── sort & page (unchanged) ─────────────────────────────────────────────────
  const PAGE_SIZE = 10
  const [sortKey, setSortKey] = useState<'name' | 'status' | 'aiScore' | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(0)

  useEffect(() => { setPage(0) }, [query, filterStatus, industryFilter, range, campaignId, sortKey, sortDir])

  const STATUS_ORDER: Record<string, number> = { new: 0, calling: 1, contacted: 2, 'no answer': 2, busy: 2, interested: 3, qualified: 4, converted: 5 }
  const toggleSort = (key: 'name' | 'status' | 'aiScore') => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'aiScore' ? 'desc' : 'asc') }
  }
  const sortedLeads = sortKey
    ? [...visibleLeads].sort((a, b) => {
        let r = 0
        if (sortKey === 'name') r = String(a.name || '').localeCompare(String(b.name || ''))
        if (sortKey === 'status') r = (STATUS_ORDER[String(a.status || '').toLowerCase()] ?? 1.5) - (STATUS_ORDER[String(b.status || '').toLowerCase()] ?? 1.5)
        if (sortKey === 'aiScore') r = Number(a.aiScore || 0) - Number(b.aiScore || 0)
        return sortDir === 'asc' ? r : -r
      })
    : visibleLeads

  const pageCount = Math.max(1, Math.ceil(sortedLeads.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageLeads = sortedLeads.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const pageIds = pageLeads.map((l: any) => l.lead_id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id: string) => selectedLeads.includes(id))
  const toggleLead = (id: string, checked: boolean) =>
    setSelectedLeads(checked ? [...selectedLeads, id] : selectedLeads.filter((x) => x !== id))
  const filtersActive = Boolean(query || filterStatus || industryFilter !== 'all')
  const clearFilters = () => { setQuery(''); setFilterStatus(null); setIndustryFilter('all'); setActiveTab('all') }

  const leadAmount = (lead: any) => lead.amount_due || lead.custom_fields?.amount_due || lead.custom_fields?.['Loan Amount']
  const leadDueDate = (lead: any) => lead.due_date || lead.custom_fields?.due_date || lead.custom_fields?.['due date']
  const ptpAmount = (lead: any) => formatINR(lead.promise_to_pay?.amount || lead.amount_due)

  const ANALYSIS_SKIP = ['summary', 'action_items', 'lead_score', 'lead_temperature', 'conversion_probability', 'customer_name', 'customer_id', 'sentiment', 'status', 'promise_to_pay', 'order_confirmation']
  const renderAnalysisValue = (v: any) =>
    typeof v === 'boolean'
      ? (v ? 'Yes' : 'No')
      : typeof v === 'object' && v !== null
        ? (Array.isArray(v)
          ? v.map((item: any) => typeof item === 'object' && item !== null ? (item.action || item.recommendation || item.text || item.title || Object.values(item).filter(x => typeof x === 'string').join(' - ') || JSON.stringify(item)) : String(item)).join('; ')
          : Object.entries(v).map(([k, x]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${typeof x === 'number' && x < 1 && x > 0 ? `${Math.round(x * 100)}%` : x}`).join(', '))
        : String(v || '-')

  const loadedNote = leads.length >= 200 ? 'Showing the 200 most recently active leads.' : null

  // ── intent label from lead data ─────────────────────────────────────────────
  const intentLabel = (lead: any): string => {
    const raw = lead.intent || lead.intents?.[0] || lead.offering || lead.property || ''
    if (!raw) return '—'
    // prettify snake_case or camelCase
    return String(raw)
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim()
  }

  // campaign label
  const campaignLabel = (lead: any): string => lead.campaign_name || lead.campaign || '—'

  // ── tabs definition ─────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All Leads' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'followup', label: 'Follow Up' },
    { key: 'qualified', label: 'Qualified' },
  ]

  // ── unique campaigns for filter ─────────────────────────────────────────────
  const campaignOptions = Array.from(new Set(leads.map(l => l.campaign_name || l.campaign).filter(Boolean)))

  // ── presentation-only state and helpers (no data, request or handler is changed) ──
  const [showFilters, setShowFilters] = useState(false)
  const filtersWrapRef = useRef<HTMLDivElement>(null)
  const filtersButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showFilters) return
    const onDown = (e: MouseEvent) => {
      if (filtersWrapRef.current && !filtersWrapRef.current.contains(e.target as Node)) setShowFilters(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFilters(false)
        filtersButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showFilters])

  const INDUSTRY_ICON: Record<string, any> = {
    real_estate: Building2, healthcare: Stethoscope, edtech: GraduationCap, bfsi: CreditCard,
    general_sales: Briefcase, collections: Banknote, ecommerce: ShoppingBag,
  }
  const IndustryIcon = INDUSTRY_ICON[activeIndustry] || Briefcase
  const industryBadgeLabel = config?.label || formatIndustryLabel(user?.industry)

  // KPI figures are counts of the leads already loaded (same numbers as the tab counts); they show a dash until real data exists.
  const kpiReady = !loading && !(loadFailed && leads.length === 0)
  const convertedCount = leads.filter((l) => (l.status || '').toLowerCase() === 'converted').length
  const KPI_CARDS = [
    { label: 'Total Leads', value: leads.length, Icon: Users, tile: 'bg-blue-50 text-ds-primary' },
    { label: 'Urgent Leads', value: tabCount('urgent'), Icon: Zap, tile: 'bg-orange-50 text-orange-500' },
    { label: 'Qualified Leads', value: tabCount('qualified'), Icon: Target, tile: 'bg-violet-50 text-ds-accent' },
    { label: 'Converted Leads', value: convertedCount, Icon: CheckCircle2, tile: 'bg-emerald-50 text-emerald-600' },
  ]
  const extraFiltersActive = (range !== 'All Time' ? 1 : 0) + (industryFilter !== 'all' ? 1 : 0)
  const controlCls =
    'h-10 rounded-lg border border-ds-line bg-ds-bg text-[15px] text-ds-ink outline-none transition focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'
  const sortMark = (key: 'name' | 'status') => (sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '')
  const sortLabel = (key: 'name' | 'status') => (sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none')
  const rowAction =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-ink-2 transition-colors hover:bg-ds-surface hover:text-ds-primary'

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <AppLayout title="Leads">
      {/* ── hidden file inputs ── */}
      <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
      {showCollectionsUI && (
        <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" ref={repaymentFileInputRef} onChange={handleRepaymentFileChange} />
      )}

      {/* ═══ Page header ═══════════════════════════════════════════════════════ */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          {industryBadgeLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ds-primary-soft px-3 py-1.5 text-[14px] font-semibold text-ds-primary">
              <IndustryIcon size={15} strokeWidth={2} aria-hidden="true" />
              {industryBadgeLabel}
            </span>
          )}
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[30px]">Lead Management</h1>
          <p className="mt-1 text-[16px] text-ds-ink-2">Track prospects, identify opportunities and manage follow-ups.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          {showCollectionsUI && (
            <button
              onClick={handleRepaymentUploadClick}
              disabled={repaymentUploading}
              title="Upload a CSV/Excel of repayments received, to reconcile against Promise-to-Pay commitments"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:opacity-60"
            >
              {repaymentUploading ? <Loader2 size={17} className="animate-spin" /> : <CircleDollarSign size={17} strokeWidth={1.75} />}
              {repaymentUploading ? 'Uploading…' : 'Upload repayments'}
            </button>
          )}
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:opacity-60"
          >
            {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} strokeWidth={1.75} />}
            {uploading ? 'Uploading…' : 'Upload CSV'}
          </button>
          <button
            onClick={() => setShowQuickCallModal(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface"
          >
            <Phone size={17} strokeWidth={1.75} />Quick Call
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ds-primary px-5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-ds-primary-hover active:scale-[0.98]"
          >
            <Plus size={18} strokeWidth={2.25} />Add Lead
          </button>
        </div>
      </header>

      {/* ═══ KPI cards ══════════════════════════════════════════════════════════ */}
      <section aria-label="Lead summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {KPI_CARDS.map(({ label, value, Icon, tile }) => (
          <div key={label} className="flex items-center gap-3.5 rounded-[14px] border border-ds-line bg-ds-bg px-4 py-4 shadow-sm sm:gap-4 sm:px-5">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:h-14 sm:w-14 ${tile}`} aria-hidden="true">
              <Icon size={24} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug text-ds-ink-2 sm:text-[16px]">{label}</p>
              <p className="mt-0.5 text-[28px] font-bold leading-none tracking-tight text-ds-ink tabular-nums sm:text-[32px]">{kpiReady ? value.toLocaleString() : '—'}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ═══ Recovery analytics (collections only) ═════════════════════════════ */}
      {showCollectionsUI && recoveryAnalytics && (
        <section aria-label="Recovery analytics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Overdue accounts" value={recoveryAnalytics.overdue_accounts} />
          <StatTile label="PTPs secured" value={recoveryAnalytics.ptp_secured} />
          <StatTile label="PTP kept rate" value={`${recoveryAnalytics.ptp_kept_rate_pct}%`} tone="success" />
          <StatTile label="PTP broken" value={recoveryAnalytics.ptp_broken} tone="error" />
          <StatTile label="Amount due" value={formatINR(recoveryAnalytics.total_amount_due) ?? '₹0'} />
          <StatTile label="Recovery rate" value={`${recoveryAnalytics.recovery_rate_pct}%`} hint={`${formatINR(recoveryAnalytics.total_amount_recovered) ?? '₹0'} recovered`} tone="success" />
        </section>
      )}

      {/* ═══ Lead directory ═════════════════════════════════════════════════════ */}
      <div className="rounded-[14px] border border-ds-line bg-ds-bg shadow-sm">

        {/* ── Status tabs ───────────────────────────────────────────────────── */}
        <div role="tablist" aria-label="Lead status" className="flex items-end gap-1 overflow-x-auto border-b border-ds-line px-3 sm:px-5">
          {TABS.map(({ key, label }) => {
            const count = tabCount(key)
            const isActive = activeTab === key
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => switchTab(key)}
                className={`relative -mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold transition-colors sm:px-4 sm:text-[16px] ${
                  isActive ? 'border-ds-primary text-ds-primary' : 'border-transparent text-ds-ink-2 hover:text-ds-ink'
                }`}
              >
                {label}
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[13px] font-semibold tabular-nums ${
                    isActive ? 'bg-ds-primary text-white' : 'bg-ds-surface text-ds-ink-2'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Toolbar ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2.5 px-3 py-3.5 sm:px-5">
          <div className="relative w-full sm:min-w-[260px] sm:max-w-[440px] sm:flex-1">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-3" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search leads by name, phone or intent..."
              aria-label="Search leads"
              className={`${controlCls} w-full pl-10 pr-3 placeholder:text-ds-ink-3 [&::-webkit-search-cancel-button]:hidden`}
            />
          </div>

          <div className="relative min-w-[140px] flex-1 sm:flex-none">
            <select
              aria-label="Filter by campaign"
              value={campaignId || ''}
              onChange={e => {
                const val = e.target.value
                if (val) {
                  setCampaignId(val)
                  router.push(`/leads?campaign_id=${val}`)
                } else {
                  setCampaignId(null)
                  router.push('/leads')
                }
              }}
              className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium sm:w-auto`}
            >
              <option value="">All Campaigns</option>
              {campaignId && !campaignOptions.includes(campaignId) && <option value={campaignId}>Selected campaign</option>}
              {campaignOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>

          <div className="relative min-w-[140px] flex-1 sm:flex-none">
            <select
              aria-label="Filter by status"
              value={filterStatus || ''}
              onChange={e => {
                const val = e.target.value
                setFilterStatus(val || null)
                // keep tab in sync
                const matchedTab = (Object.entries(TAB_STATUS) as [TabKey, string | null][]).find(([, v]) => v?.toLowerCase() === val.toLowerCase())
                setActiveTab(matchedTab ? matchedTab[0] : 'all')
              }}
              className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium sm:w-auto`}
            >
              <option value="">All Status</option>
              <option value="New">New</option>
              <option value="Interested">Interested</option>
              <option value="Qualified">Qualified</option>
              <option value="Follow Up">Follow Up</option>
              <option value="Urgent">Urgent</option>
              <option value="Converted">Converted</option>
              <option value="Not Interested">Not Interested</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>

          <div className="flex w-full items-center justify-end gap-2.5 sm:ml-auto sm:w-auto">
            {/* Filters: opens the date-range and sector filters this page already supports */}
            <div className="relative" ref={filtersWrapRef}>
              <button
                ref={filtersButtonRef}
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-controls="lead-more-filters"
                className={`${controlCls} inline-flex items-center gap-2 bg-ds-surface px-3.5 font-semibold hover:bg-ds-line/40`}
              >
                <SlidersHorizontal size={16} strokeWidth={1.75} />
                Filters
                {extraFiltersActive > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ds-primary px-1.5 text-[12px] font-semibold text-white">{extraFiltersActive}</span>
                )}
              </button>
              {showFilters && (
                <div
                  id="lead-more-filters"
                  role="group"
                  aria-label="More filters"
                  className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-ds-line bg-ds-bg p-4 shadow-ds-pop"
                >
                  <p className="text-[15px] font-semibold text-ds-ink">Date range</p>
                  <div className="mt-2">
                    <Segmented label="Date range" options={['Today', '7 Days', '30 Days', 'All Time'] as const} value={range as any} onChange={(v) => setRange(v)} />
                  </div>
                  <label htmlFor="lead-sector-filter" className="mt-4 block text-[15px] font-semibold text-ds-ink">Sector</label>
                  <div className="relative mt-2">
                    <select
                      id="lead-sector-filter"
                      value={industryFilter}
                      onChange={(e) => setIndustryFilter(e.target.value)}
                      className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9`}
                    >
                      <option value="all">All sectors ({leads.length})</option>
                      <option value="active">{INDUSTRY_CONFIGS[activeIndustry]?.shortLabel || 'Active Sector'} ({leads.filter(l => l.industry === activeIndustry).length})</option>
                      <option value="real_estate">Real Estate ({leads.filter(l => l.industry === 'real_estate').length})</option>
                      <option value="bfsi">BFSI & Lending ({leads.filter(l => l.industry === 'bfsi').length})</option>
                      <option value="healthcare">Healthcare ({leads.filter(l => l.industry === 'healthcare').length})</option>
                      <option value="edtech">EdTech ({leads.filter(l => l.industry === 'edtech').length})</option>
                      <option value="collections">Collections ({leads.filter(l => l.industry === 'collections').length})</option>
                      {Array.from(new Set(leads.map(l => l.industry).filter(ind => ind && !['real_estate', 'bfsi', 'healthcare', 'edtech', 'collections', activeIndustry].includes(ind)))).map(customInd => (
                        <option key={customInd} value={customInd}>
                          {formatIndustryLabel(customInd)} ({leads.filter(l => l.industry === customInd).length})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setRange('All Time'); setIndustryFilter('all') }}
                      disabled={extraFiltersActive === 0}
                      className="h-9 rounded-lg px-3 text-[14px] font-semibold text-ds-primary hover:bg-ds-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleDownload}
              title="Export as CSV"
              className={`${controlCls} inline-flex items-center gap-2 bg-ds-surface px-3.5 font-semibold hover:bg-ds-line/40`}
            >
              <Download size={16} strokeWidth={1.75} />Export
            </button>
          </div>
        </div>

        {/* ── Campaign / selection banners ──────────────────────────────────── */}
        {(campaignId || selectedLeads.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ds-line px-3 py-2.5 sm:px-5">
            {campaignId && (
              <button
                onClick={() => { setCampaignId(null); router.push('/leads') }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ds-primary-soft px-3 text-[14px] font-medium text-ds-primary hover:bg-ds-primary-soft/70"
              >
                Filtered to one campaign <X size={14} aria-hidden="true" /><span className="sr-only">Clear campaign filter</span>
              </button>
            )}
            {selectedLeads.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ds-line bg-ds-surface px-3 py-1.5">
                <span className="text-[15px] font-medium text-ds-ink">{selectedLeads.length} selected</span>
                <button onClick={handleDeleteSelected} className={buttonClass('danger', 'sm')}>
                  <Trash2 size={14} strokeWidth={1.75} />Delete selected
                </button>
                <button onClick={() => setSelectedLeads([])} className={buttonClass('ghost', 'sm')}>Clear selection</button>
              </div>
            )}
          </div>
        )}

        {/* ── Stale data warning ────────────────────────────────────────────── */}
        {loadFailed && leads.length > 0 && (
          <div className="border-t border-ds-line px-3 py-2.5 sm:px-5">
            <Alert tone="warning" title="Couldn't refresh leads">
              The list below is from the last successful update and may be out of date. Retrying automatically.
            </Alert>
          </div>
        )}

        {loadedNote && !loading && (
          <p className="border-t border-ds-line px-3 py-2 text-[14px] text-ds-ink-3 sm:px-5">{loadedNote}</p>
        )}

        {/* ══ Desktop table ═══════════════════════════════════════════════════ */}
        <div role="region" aria-label="Leads table" tabIndex={0} className="hidden overflow-x-auto border-t border-ds-line outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ds-primary xl:block">
          <table className="w-full min-w-[820px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-ds-line bg-ds-surface">
                <th className="w-14 py-3 pl-5 pr-2 text-left">
                  <Checkbox
                    className="scale-125"
                    aria-label="Select all leads on this page"
                    checked={allPageSelected}
                    onChange={(e) => setSelectedLeads(e.target.checked ? Array.from(new Set([...selectedLeads, ...pageIds])) : selectedLeads.filter((id) => !pageIds.includes(id)))}
                  />
                </th>
                <th scope="col" aria-sort={sortLabel('name')} className="py-3 pr-4 text-left text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2">
                  <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ds-ink">
                    Patient / Contact <span aria-hidden="true">{sortMark('name')}</span>
                  </button>
                </th>
                <th scope="col" className="py-3 pr-4 text-left text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2">Intent</th>
                <th scope="col" className="py-3 pr-4 text-left text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2">Campaign</th>
                <th scope="col" aria-sort={sortLabel('status')} className="py-3 pr-4 text-left text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2">
                  <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ds-ink">
                    Status <span aria-hidden="true">{sortMark('status')}</span>
                  </button>
                </th>
                <th scope="col" className="py-3 pr-4 text-left text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2">Last Activity</th>
                <th scope="col" className="py-3 pr-5 text-right text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <LoadingState label="Loading leads…">
                      <div className="space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                      </div>
                    </LoadingState>
                  </td>
                </tr>
              ) : loadFailed && leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <ErrorState title="Leads couldn't be loaded" description="The request failed, so no list is shown rather than an empty one. This page retries automatically." />
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <EmptyState
                      icon={<Users size={18} strokeWidth={1.75} />}
                      title="No leads yet"
                      description="Upload a spreadsheet of contacts or add a lead to get started."
                      action={
                        <div className="flex gap-2">
                          <button onClick={handleUploadClick} className={buttonClass('primary', 'md')}><Upload size={15} />Upload leads</button>
                          <button onClick={() => setShowModal(true)} className={buttonClass('outline', 'md')}>Add lead</button>
                        </div>
                      }
                    />
                  </td>
                </tr>
              ) : visibleLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <EmptyState
                      title="No leads match these filters"
                      description="Try a different search, status, or date range."
                      action={filtersActive || extraFiltersActive > 0 ? <button onClick={() => { clearFilters(); setRange('All Time') }} className={buttonClass('outline', 'md')}>Clear filters</button> : undefined}
                    />
                  </td>
                </tr>
              ) : (
                pageLeads.map((lead, idx) => {
                  const isSelected = selectedLeads.includes(lead.lead_id)
                  return (
                    <tr
                      key={`${lead._id || lead.lead_id || 'lead'}-${idx}`}
                      className={`group border-b border-ds-line transition-colors last:border-b-0 ${isSelected ? 'bg-ds-primary-soft/60' : 'hover:bg-ds-surface/70'}`}
                    >
                      <td className="w-14 py-3 pl-5 pr-2 align-middle">
                        <Checkbox
                          className="scale-125"
                          aria-label={`Select ${lead.name || 'lead'}`}
                          checked={isSelected}
                          onChange={(e) => toggleLead(lead.lead_id, e.target.checked)}
                        />
                      </td>

                      <td className="py-3 pr-4 align-middle">
                        <button onClick={() => setSelectedLead(lead)} className="flex items-center gap-3 text-left">
                          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${avatarClass(lead.name)}`}>
                            {initials(lead.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block max-w-[200px] truncate text-[16px] font-semibold text-ds-ink transition-colors group-hover:text-ds-primary" title={lead.name}>
                              {lead.name || 'Unknown'}
                            </span>
                            <span className="block text-[14px] tabular-nums text-ds-ink-2">{lead.phone || '—'}</span>
                          </span>
                        </button>
                      </td>

                      <td className="max-w-[200px] py-3 pr-4 align-middle">
                        <span className="block truncate text-ds-ink" title={intentLabel(lead)}>{intentLabel(lead)}</span>
                      </td>

                      <td className="max-w-[180px] py-3 pr-4 align-middle">
                        <span className="block truncate text-ds-ink" title={campaignLabel(lead)}>{campaignLabel(lead)}</span>
                      </td>

                      <td className="py-3 pr-4 align-middle">
                        <StatusBadge status={lead.status} className="px-3 py-1 text-[15px]" />
                        {lead.promise_to_pay?.promised && (
                          <Badge variant="success" className="mt-1 block w-fit text-[13px]">
                            {ptpAmount(lead) ? `PTP ${ptpAmount(lead)}` : 'PTP'}
                          </Badge>
                        )}
                      </td>

                      <td className="whitespace-nowrap py-3 pr-4 align-middle">
                        <span className="tabular-nums text-ds-ink">
                          {relativeTime(lead.lastContact || lead.last_called_at || lead.updated_at || lead.created_at)}
                        </span>
                      </td>

                      <td className="py-3 pr-4 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleCall(lead)}
                            aria-label={`Call ${lead.name || 'lead'}`}
                            title="Call now"
                            className={rowAction}
                          >
                            <Phone size={18} strokeWidth={1.75} />
                          </button>
                          <button
                            onClick={() => setSelectedLead(lead)}
                            aria-label={`View details for ${lead.name || 'lead'}`}
                            title="View details"
                            className={rowAction}
                          >
                            <PanelRightOpen size={18} strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ══ Mobile card list ═════════════════════════════════════════════════ */}
        <div className="space-y-2.5 border-t border-ds-line p-3 xl:hidden">
          {loading ? (
            <LoadingState label="Loading leads…">
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
            </LoadingState>
          ) : loadFailed && leads.length === 0 ? (
            <div className="rounded-xl border border-ds-line">
              <ErrorState title="Leads couldn't be loaded" description="This page retries automatically." />
            </div>
          ) : leads.length === 0 ? (
            <div className="rounded-xl border border-ds-line">
              <EmptyState icon={<Users size={18} strokeWidth={1.75} />} title="No leads yet" description="Upload a spreadsheet of contacts or add a lead to get started." />
            </div>
          ) : visibleLeads.length === 0 ? (
            <div className="rounded-xl border border-ds-line">
              <EmptyState title="No leads match these filters" action={filtersActive || extraFiltersActive > 0 ? <button onClick={() => { clearFilters(); setRange('All Time') }} className={buttonClass('outline', 'md')}>Clear filters</button> : undefined} />
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2.5 px-1 text-[15px] text-ds-ink-2">
                <Checkbox
                  aria-label="Select all leads on this page"
                  checked={allPageSelected}
                  onChange={(e) => setSelectedLeads(e.target.checked ? Array.from(new Set([...selectedLeads, ...pageIds])) : selectedLeads.filter((id) => !pageIds.includes(id)))}
                />
                Select page
              </label>
              {pageLeads.map((lead, idx) => (
                <article
                  key={`${lead._id || lead.lead_id || 'lead'}-m-${idx}`}
                  className={`rounded-xl border p-3.5 ${selectedLeads.includes(lead.lead_id) ? 'border-ds-primary/40 bg-ds-primary-soft/50' : 'border-ds-line bg-ds-bg'}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox className="mt-1" aria-label={`Select ${lead.name || 'lead'}`} checked={selectedLeads.includes(lead.lead_id)} onChange={(e) => toggleLead(lead.lead_id, e.target.checked)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${avatarClass(lead.name)}`}>
                          {initials(lead.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[16px] font-semibold text-ds-ink">{lead.name || 'Unknown'}</p>
                          <p className="text-[14px] tabular-nums text-ds-ink-2">{lead.phone}</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] text-ds-ink-2">
                        <StatusBadge status={lead.status} className="px-2.5 py-0.5 text-[14px]" />
                        {intentLabel(lead) !== '—' && <span className="text-ds-ink">{intentLabel(lead)}</span>}
                        {campaignLabel(lead) !== '—' && <span>· {campaignLabel(lead)}</span>}
                        <span>{relativeTime(lead.lastContact || lead.last_called_at || lead.updated_at || lead.created_at)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-1">
                        <button onClick={() => handleCall(lead)} aria-label={`Call ${lead.name || 'lead'}`} className={rowAction}>
                          <Phone size={18} strokeWidth={1.75} />
                        </button>
                        <button onClick={() => setSelectedLead(lead)} aria-label={`View details for ${lead.name || 'lead'}`} className={rowAction}>
                          <PanelRightOpen size={18} strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>

        {/* ── Pagination ────────────────────────────────────────────────────── */}
        {!loading && (
          <div className="border-t border-ds-line px-3 py-4 sm:px-5">
            <LeadsPager page={safePage} pageSize={PAGE_SIZE} total={sortedLeads.length} onChange={setPage} noun="leads" />
          </div>
        )}
      </div>

      {/* ═══ Add lead dialog ════════════════════════════════════════════════════ */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} title="Add lead" description="Create a single lead. To add many at once, use Upload leads.">
        <form id="add-lead-form" onSubmit={handleCreate} className="space-y-4">
          <Field label="Lead name" required>
            <Input data-autofocus value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} placeholder="e.g. John Doe" />
          </Field>
          <Field label="Phone number" required>
            <Input type="tel" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} placeholder="e.g. +91 98765 43210" />
          </Field>
          <Field label="Offering / product / service" hint="Optional">
            <Input value={newLead.property} onChange={(e) => setNewLead({ ...newLead, property: e.target.value })} placeholder="e.g. Full-Stack Web Dev / Villa / Dental Checkup" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowModal(false)} className={buttonClass('outline', 'md')}>Cancel</button>
            <button disabled={creating} className={buttonClass('primary', 'md')}>
              {creating ? <Loader2 size={15} className="animate-spin" /> : null}
              {creating ? 'Adding…' : 'Add lead'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* ═══ Quick call dialog ══════════════════════════════════════════════════ */}
      <Dialog open={showQuickCallModal} onClose={() => setShowQuickCallModal(false)} title="Quick call" description="TalklyAI will greet this customer by name during the call.">
        <form onSubmit={handleQuickCall} className="space-y-4">
          <Field label="Customer name" required>
            <Input data-autofocus value={quickCallName} onChange={(e) => setQuickCallName(e.target.value)} placeholder="e.g. Rahul Sharma" />
          </Field>
          <Field label="Phone number" required>
            <Input type="tel" value={quickCallNumber} onChange={(e) => setQuickCallNumber(e.target.value)} placeholder="e.g. +91 98765 43210" />
          </Field>
          <Field label="Voice language">
            <Select value={quickCallLanguage} onChange={(e) => setQuickCallLanguage(e.target.value)}>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowQuickCallModal(false)} className={buttonClass('outline', 'md')}>Cancel</button>
            <button disabled={calling} className={buttonClass('primary', 'md')}>
              {calling ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} strokeWidth={1.75} />}
              {calling ? 'Calling…' : 'Call now'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* ═══ Lead detail sheet ══════════════════════════════════════════════════ */}
      <Sheet
        open={Boolean(selectedLead)}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.name || 'Unknown lead'}
        description={<span className="tabular-nums">{selectedLead?.phone}</span>}
        headerExtra={selectedLead ? <div className="mt-2"><StatusBadge status={selectedLead.status} /></div> : null}
      >
        {selectedLead && (
          <>
            <DetailGrid
              items={[
                { label: 'Offering', value: selectedLead.offering || selectedLead.property || '—' },
                { label: 'Location', value: selectedLead.location || '—' },
                { label: 'AI score', value: <span className="tabular-nums">{selectedLead.aiScore ?? 0} <span className="font-normal text-ds-ink-3">/ 100</span></span> },
                { label: 'Sector', value: selectedLead.industry ? formatIndustryLabel(selectedLead.industry) : '—' },
              ]}
            />

            {selectedLead.custom_fields && Object.keys(selectedLead.custom_fields).length > 0 && (
              <SheetSection title="Uploaded lead data" icon={<FileSpreadsheet size={14} />}>
                <DetailGrid items={Object.entries(selectedLead.custom_fields).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v || '—') }))} />
              </SheetSection>
            )}

            {((selectedLead?.industry === 'collections' || selectedCall?.industry === 'collections') && (selectedLead?.promise_to_pay || selectedCall?.analysis?.promise_to_pay)) && (() => {
              const ptp = selectedLead?.promise_to_pay || selectedCall?.analysis?.promise_to_pay || {}
              const isPromised = Boolean(ptp.promised)
              const amt = formatINR(ptp.amount || selectedLead?.amount_due)
              return (
                <SheetSection title="Promise to pay" icon={<CircleDollarSign size={14} />}>
                  <div className={`rounded-lg border p-3.5 text-[13px] ${isPromised ? 'border-ds-success/30 bg-ds-success-soft' : 'border-ds-line bg-ds-surface'}`}>
                    {isPromised ? (
                      <>
                        <p className="font-medium text-ds-ink">
                          {amt ? `Committed to pay ${amt}` : 'Committed to pay (amount not captured)'}{ptp.date ? ` by ${ptp.date}` : ''}
                        </p>
                        {selectedLead?.collections_status && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge status={selectedLead.collections_status} />
                            {selectedLead.collections_total_paid > 0 && <span className="text-xs text-ds-ink-2">{formatINR(selectedLead.collections_total_paid)} received</span>}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-ds-ink-2">No confirmed commitment yet - the customer did not give a clear amount and date during this call.</p>
                    )}
                  </div>
                </SheetSection>
              )
            })()}

            {((selectedLead?.industry === 'ecommerce' || selectedCall?.industry === 'ecommerce' || Boolean(selectedLead?.order_amount || selectedLead?.custom_fields?.order_amount)) ||
              (selectedCall?.analysis?.order_confirmation?.status && ['Confirmed', 'Cancelled'].includes(selectedCall.analysis.order_confirmation.status) && selectedCall?.analysis?.intents?.some((i: string) => i.toLowerCase().includes('order') || i.toLowerCase().includes('cod')))) && (() => {
                const oc = selectedCall?.analysis?.order_confirmation || {}
                const isConfirmed = oc.status === 'Confirmed' || selectedLead?.status === 'Confirmed'
                const isCancelled = oc.status === 'Cancelled' || selectedLead?.status === 'Cancelled'
                return (
                  <SheetSection
                    title="COD order status"
                    icon={<ShoppingBag size={14} />}
                    action={<Badge variant={isConfirmed ? 'success' : isCancelled ? 'error' : 'warning'}>{isConfirmed ? 'Confirmed' : isCancelled ? 'Cancelled' : 'Pending'}</Badge>}
                  >
                    <div className="rounded-lg border border-ds-line bg-ds-surface p-3.5 text-[13px]">
                      <p className="font-medium text-ds-ink">
                        {isConfirmed ? 'COD order confirmed for dispatch' : isCancelled ? 'Order cancelled by customer (RTO prevented)' : 'Pending order confirmation'}
                      </p>
                      {(selectedLead?.order_amount || selectedLead?.custom_fields?.order_amount) && (
                        <p className="mt-1 text-ds-ink-2">
                          COD amount: <span className="font-medium text-ds-ink">₹{selectedLead?.order_amount || selectedLead?.custom_fields?.order_amount}</span>
                          {(selectedLead?.delivery_address || selectedLead?.location) && (
                            <> · Delivery address: <span className="font-medium text-ds-ink">{selectedLead?.delivery_address || selectedLead?.location}</span></>
                          )}
                        </p>
                      )}
                    </div>
                  </SheetSection>
                )
              })()}

            {selectedCall?.analysis && Object.keys(selectedCall.analysis).filter(k => !ANALYSIS_SKIP.includes(k)).length > 0 && (
              <SheetSection title="Extracted by AI" icon={<Sparkles size={14} />}>
                <DetailGrid
                  items={Object.keys(selectedCall.analysis)
                    .filter(k => !ANALYSIS_SKIP.includes(k))
                    .map(key => ({ label: key.replace(/_/g, ' '), value: <span className="line-clamp-4">{renderAnalysisValue(selectedCall.analysis[key])}</span> }))}
                />
              </SheetSection>
            )}

            <SheetSection title="Call transcript" icon={<MessageSquare size={14} />} action={loadingCall ? <Loader2 size={14} className="animate-spin text-ds-ink-3" /> : null}>
              {loadingCall ? (
                <LoadingState label="Fetching conversation…">
                  <div className="space-y-2 rounded-lg border border-ds-line p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="ml-auto h-4 w-1/2" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                </LoadingState>
              ) : selectedCall && selectedCall.transcript ? (
                <Transcript text={selectedCall.transcript} />
              ) : (
                <p className="rounded-lg border border-dashed border-ds-line px-4 py-6 text-center text-[13px] text-ds-ink-3">No call transcript available for this lead yet.</p>
              )}
            </SheetSection>
          </>
        )}
      </Sheet>
    </AppLayout>
  )
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <LeadsContent />
    </Suspense>
  )
}

'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Plus, Zap, Loader2, Upload, CreditCard, Building2,
  Stethoscope, GraduationCap, Briefcase, Banknote,
  ShoppingBag, Search, Users, Megaphone, CirclePause,
  LayoutGrid, CheckCircle2, Download, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, getAuthToken, API_BASE_URL } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey } from '@/lib/industry'
import { LeadsPager } from '@/components/leads/LeadsPager'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { Alert } from '@/components/ui/Alert'
import { Dialog } from '@/components/ui/Dialog'
import { buttonClass } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'

const INDUSTRY_ICONS: Record<string, any> = {
  real_estate: Building2,
  healthcare: Stethoscope,
  edtech: GraduationCap,
  bfsi: CreditCard,
  general_sales: Briefcase,
  collections: Banknote,
  ecommerce: ShoppingBag
}

export default function CampaignsPage() {
  const { user } = useAuth()
  const activeIndustry = (user?.industry as IndustryKey) || 'bfsi'

  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [industryFilter, setIndustryFilter] = useState<string>('all') // presentation filter over the loaded campaigns
  const [selected, setSelected] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [newCampaign, setNewCampaign] = useState<{ name: string; offering: string; industry: IndustryKey }>({
    name: '',
    offering: '',
    industry: activeIndustry
  })
  const [creating, setCreating] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingCampaignId, setUploadingCampaignId] = useState<string | null>(null)

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const data = await fetchApi('/api/v1/campaigns')
      setCampaigns(data || [])
      setLoadFailed(false)
    } catch (e) {
      console.error(e)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  useEffect(() => {
    if (user?.industry && INDUSTRY_CONFIGS[user.industry as IndustryKey]) {
      setNewCampaign((prev) => ({ ...prev, industry: user.industry as IndustryKey }))
    }
  }, [user?.industry])

  // Status-based counts
  const activeCount = campaigns.filter((c) => (c.status || 'Active').toLowerCase() === 'active').length
  const pausedCount = campaigns.filter((c) => (c.status || '').toLowerCase() === 'paused').length
  const completedCount = campaigns.filter((c) => (c.status || '').toLowerCase() === 'completed').length

  // Filter campaigns
  const visibleCampaigns = campaigns
    .filter((c) => {
      if (statusFilter === 'all') return true
      return (c.status || 'Active').toLowerCase() === statusFilter.toLowerCase()
    })
    .filter((c) => industryFilter === 'all' || ((c.industry as string) || activeIndustry) === industryFilter)
    .filter((c) =>
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.offering?.toLowerCase().includes(query.toLowerCase()) ||
      c.property?.toLowerCase().includes(query.toLowerCase())
    )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await fetchApi('/api/v1/campaigns', {
        method: 'POST',
        body: JSON.stringify(newCampaign)
      })
      setShowModal(false)
      setNewCampaign({ name: '', offering: '', industry: activeIndustry })
      loadCampaigns()
    } catch (e) {
      alert('Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  const openCreateModal = () => {
    setNewCampaign({ name: '', offering: '', industry: activeIndustry })
    setShowModal(true)
  }

  const handleUploadClick = (campaignId: string) => {
    setUploadingCampaignId(campaignId)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingCampaignId) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('campaign_id', uploadingCampaignId)
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/api/v1/leads/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (!response.ok) throw new Error('Upload failed')
      const result = await response.json()
      alert(`Successfully uploaded ${result.inserted_count} leads to the campaign!`)
      loadCampaigns()
    } catch (error) {
      alert('Failed to upload leads')
    } finally {
      setUploadingCampaignId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleStartCalling = async () => {
    try {
      await fetchApi('/api/v1/calls/trigger-campaigns', {
        method: 'POST',
        body: JSON.stringify({ campaign_ids: selected })
      })
      alert('Calls dispatched successfully!')
      setSelected([])
    } catch (e: any) {
      alert(`Failed to trigger campaigns: ${e.message || 'Unknown error'}`)
    }
  }

  const handleDownload = () => {
    const csv = ['Campaign,Offering,Industry,Leads,Calls,Connected,Interested,Status']
    visibleCampaigns.forEach((c) =>
      csv.push(`"${c.name}","${c.offering || c.property || ''}","${c.industry || ''}",${c.leads || 0},${c.calls || 0},${c.connected || 0},${c.interested || 0},${c.status || 'Active'}`)
    )
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaigns_export.csv`
    a.click()
  }

  const getOfferingPlaceholder = (ind: string) => {
    switch (ind) {
      case 'ecommerce': return 'e.g. Wireless Noise-Cancelling Earbuds, Running Shoes'
      case 'collections': return 'e.g. Personal Loan EMI, Credit Card Overdue Dues'
      case 'bfsi': return 'e.g. Pre-Approved Personal Loan (10.5%), Home Loan Balance Transfer'
      case 'healthcare': return 'e.g. Dental Implants & Cleaning, Knee Replacement Consultation'
      case 'edtech': return 'e.g. Executive MBA Program, Data Science Full-Stack Course'
      case 'real_estate': return 'e.g. 3BHK Luxury Highrise Flat, 200 Sqyd Villa'
      default: return 'e.g. Enterprise Consulting, Outbound Sales Service'
    }
  }

  const sectorLabel = (ind: string) => INDUSTRY_CONFIGS[ind as IndustryKey]?.shortLabel || ind

  const conversionRate = (c: any) => {
    const leads = Number(c.leads) || 0
    const booked = Number(c.interested) || 0
    if (!leads) return '0%'
    return `${Math.round((booked / leads) * 100)}%`
  }

  // ── presentation-only state and helpers (no request, payload or handler is changed) ──
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  type CampTab = 'all' | 'active' | 'paused' | 'completed'
  const CAMP_TABS: { key: CampTab; label: string; count: number }[] = [
    { key: 'all', label: 'All Campaigns', count: campaigns.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'paused', label: 'Paused', count: pausedCount },
    { key: 'completed', label: 'Completed', count: completedCount },
  ]
  // Industries that actually occur in the loaded campaigns (the filter only offers what the data supports).
  const industryOptions = Array.from(new Set(campaigns.map((c) => (c.industry as string) || activeIndustry).filter(Boolean)))
  const filtersActive = Boolean(query || statusFilter !== 'all' || industryFilter !== 'all')

  // Page back to the first page whenever the visible list changes, and never keep a selection the user can no longer see.
  const visibleKey = visibleCampaigns.map((c) => c.campaign_id).join('|')
  useEffect(() => {
    setPage(0)
    const ids = new Set(visibleCampaigns.map((c) => c.campaign_id))
    setSelected((prev) => (prev.every((id) => ids.has(id)) ? prev : prev.filter((id) => ids.has(id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, industryFilter, visibleKey])

  const pageCount = Math.max(1, Math.ceil(visibleCampaigns.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageCampaigns = visibleCampaigns.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const pageIds = pageCampaigns.map((c) => c.campaign_id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const toggleCampaign = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)))
  const togglePage = (checked: boolean) =>
    setSelected((prev) => (checked ? Array.from(new Set([...prev, ...pageIds])) : prev.filter((id) => !pageIds.includes(id))))
  const clearFilters = () => { setQuery(''); setStatusFilter('all'); setIndustryFilter('all') }

  const kpiReady = !loading && !(loadFailed && campaigns.length === 0)
  const KPI_CARDS = [
    { label: 'Total Campaigns', value: campaigns.length, Icon: LayoutGrid, tile: 'bg-blue-50 text-ds-primary' },
    { label: 'Active', value: activeCount, Icon: Zap, tile: 'bg-emerald-50 text-emerald-600' },
    { label: 'Paused', value: pausedCount, Icon: CirclePause, tile: 'bg-orange-50 text-orange-500' },
    { label: 'Completed', value: completedCount, Icon: CheckCircle2, tile: 'bg-violet-50 text-ds-accent' },
  ]
  const controlCls =
    'h-10 rounded-lg border border-ds-line bg-ds-bg text-[15px] text-ds-ink outline-none transition focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'
  const headBtn =
    'inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-50'
  const rowAction =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-ink-2 transition-colors hover:bg-ds-surface hover:text-ds-primary disabled:opacity-50'
  const th = 'px-4 py-3 text-[13px] font-semibold uppercase tracking-wider text-ds-ink-2'
  const industryPill = (ind: IndustryKey, Icon: any) => (
    <span className="inline-flex items-center gap-2 rounded-full border border-ds-line bg-ds-bg px-3 py-1.5 text-[15px] font-medium text-ds-ink">
      <Icon size={16} strokeWidth={1.75} className="text-ds-ink-2" aria-hidden="true" />
      {sectorLabel(ind)}
    </span>
  )

  return (
    <AppLayout title="Campaigns">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-ds-primary-soft px-3 py-1.5 text-[14px] font-semibold text-ds-primary">
            <Megaphone size={15} strokeWidth={2} aria-hidden="true" />
            Campaigns
          </span>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[30px]">Campaign Management</h1>
          <p className="mt-1 text-[16px] text-ds-ink-2">Manage and track your outreach campaigns.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          <button
            onClick={handleStartCalling}
            disabled={selected.length === 0}
            title={selected.length === 0 ? 'Select one or more campaigns first' : 'Calls New and No Answer leads in the selected campaigns'}
            className={headBtn}
          >
            <Zap size={17} strokeWidth={1.75} />Start AI Calling
          </button>
          <button onClick={handleDownload} title="Export as CSV" className={headBtn}>
            <Download size={17} strokeWidth={1.75} />Export
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ds-primary px-5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-ds-primary-hover active:scale-[0.98]"
          >
            <Plus size={18} strokeWidth={2.25} />Create Campaign
          </button>
        </div>
      </header>

      {/* Summary stat cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Campaign summary">
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

      {/* Main panel */}
      <div className="rounded-[14px] border border-ds-line bg-ds-bg shadow-sm">
        {/* Status tabs (same filter as the status dropdown) */}
        <div role="tablist" aria-label="Campaign status" className="flex items-end gap-1 overflow-x-auto border-b border-ds-line px-3 sm:px-5">
          {CAMP_TABS.map(({ key, label, count }) => {
            const isActive = statusFilter === key
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatusFilter(key)}
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
          <div className="relative w-full sm:min-w-[260px] sm:max-w-[440px] sm:flex-1">
            <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search campaigns..."
              aria-label="Search campaigns"
              className={`${controlCls} w-full pl-10 pr-3 placeholder:text-ds-ink-3 [&::-webkit-search-cancel-button]:hidden`}
            />
          </div>
          <div className="relative min-w-[140px] flex-1 sm:flex-none">
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              aria-label="Filter by industry"
              className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium sm:w-auto`}
            >
              <option value="all">All Industries</option>
              {industryOptions.map((ind) => (
                <option key={ind} value={ind}>{sectorLabel(ind)}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>
          <div className="relative min-w-[140px] flex-1 sm:flex-none">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className={`${controlCls} w-full cursor-pointer appearance-none pl-3.5 pr-9 font-medium sm:w-auto`}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-2" />
          </div>
          <div className="flex w-full justify-end sm:ml-auto sm:w-auto">
            <button onClick={handleDownload} title="Export as CSV" className={`${controlCls} inline-flex items-center gap-2 bg-ds-surface px-3.5 font-semibold hover:bg-ds-line/40`}>
              <Download size={16} strokeWidth={1.75} />Export
            </button>
          </div>
        </div>

        {/* Stale data warning */}
        {loadFailed && campaigns.length > 0 && (
          <div className="border-t border-ds-line px-3 py-2.5 sm:px-5">
            <Alert tone="warning" title="Couldn't refresh campaigns">
              The list below is from the last successful load. Reload the page to try again.
            </Alert>
          </div>
        )}

        {/* Table content */}
        {loading ? (
          <div className="border-t border-ds-line p-6">
            <LoadingState label="Loading campaigns…">
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            </LoadingState>
          </div>
        ) : loadFailed && campaigns.length === 0 ? (
          <div className="border-t border-ds-line p-6">
            <ErrorState
              title="Campaigns couldn't be loaded"
              description="The request failed. Reload the page to try again."
            />
          </div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="border-t border-ds-line p-6">
            <EmptyState
              title={filtersActive ? 'No campaigns match these filters' : 'No campaigns yet'}
              description={filtersActive ? undefined : 'Create your first campaign, then upload its leads.'}
              action={
                filtersActive ? (
                  <button onClick={clearFilters} className={buttonClass('outline', 'md')}>Clear filters</button>
                ) : (
                  <button onClick={openCreateModal} className={buttonClass('primary', 'md')}>
                    <Plus size={15} strokeWidth={1.75} />Create Campaign
                  </button>
                )
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div role="region" aria-label="Campaigns table" tabIndex={0} className="hidden overflow-x-auto border-t border-ds-line outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ds-primary xl:block">
              <table className="w-full min-w-[900px] border-collapse text-[15px]">
                <thead>
                  <tr className="border-b border-ds-line bg-ds-surface">
                    <th scope="col" className="w-14 py-3 pl-5 pr-2 text-left">
                      <Checkbox className="scale-125" aria-label="Select all campaigns on this page" checked={allPageSelected} onChange={(e) => togglePage(e.target.checked)} />
                    </th>
                    <th scope="col" className={`${th} text-left`}>Campaign Name</th>
                    <th scope="col" className={`${th} text-left`}>Industry / Goal</th>
                    <th scope="col" className={`${th} text-right`}>Leads</th>
                    <th scope="col" className={`${th} text-right`}>Connected</th>
                    <th scope="col" className={`${th} text-right`}>Bookings</th>
                    <th scope="col" className={`${th} text-right`}>Rate</th>
                    <th scope="col" className={`${th} text-left`}>Status</th>
                    <th scope="col" className={`${th} pr-5 text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageCampaigns.map((campaign) => {
                    const campInd = (campaign.industry as IndustryKey) || activeIndustry
                    const CampIcon = INDUSTRY_ICONS[campInd] || Building2
                    const isSelected = selected.includes(campaign.campaign_id)
                    return (
                      <tr key={campaign.campaign_id} className={`group border-b border-ds-line transition-colors last:border-b-0 ${isSelected ? 'bg-ds-primary-soft/60' : 'hover:bg-ds-surface/70'}`}>
                        <td className="w-14 py-3 pl-5 pr-2 align-middle">
                          <Checkbox className="scale-125" aria-label={`Select ${campaign.name}`} checked={isSelected} onChange={(e) => toggleCampaign(campaign.campaign_id, e.target.checked)} />
                        </td>
                        <td className="max-w-[300px] px-4 py-3 align-middle">
                          <p className="truncate text-[16px] font-semibold text-ds-ink" title={campaign.name}>{campaign.name}</p>
                          <p className="truncate text-[14px] text-ds-ink-2" title={campaign.offering || campaign.property}>
                            {campaign.offering || campaign.property || 'No offering set'}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">{industryPill(campInd, CampIcon)}</td>
                        <td className="px-4 py-3 text-right align-middle font-medium tabular-nums text-ds-ink">{campaign.leads || 0}</td>
                        <td className="px-4 py-3 text-right align-middle tabular-nums text-ds-ink">{campaign.connected || 0}</td>
                        <td className="px-4 py-3 text-right align-middle tabular-nums text-ds-ink">{campaign.interested || 0}</td>
                        <td className="px-4 py-3 text-right align-middle font-medium tabular-nums text-ds-ink">{campaign.conversion || conversionRate(campaign)}</td>
                        <td className="px-4 py-3 align-middle">
                          <StatusBadge status={campaign.status || 'Active'} className="px-3 py-1 text-[15px]" />
                        </td>
                        <td className="py-3 pl-4 pr-4 align-middle">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleUploadClick(campaign.campaign_id)}
                              disabled={uploadingCampaignId === campaign.campaign_id}
                              title="Upload leads"
                              aria-label={`Upload leads to ${campaign.name}`}
                              className={rowAction}
                            >
                              {uploadingCampaignId === campaign.campaign_id ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} strokeWidth={1.75} />}
                            </button>
                            <Link
                              href={`/leads?campaign_id=${campaign.campaign_id}`}
                              title="View leads"
                              aria-label={`View leads for ${campaign.name}`}
                              className={rowAction}
                            >
                              <Users size={18} strokeWidth={1.75} />
                            </Link>
                          </div>
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
                <Checkbox aria-label="Select all campaigns on this page" checked={allPageSelected} onChange={(e) => togglePage(e.target.checked)} />
                Select page
              </label>
              {pageCampaigns.map((campaign) => {
                const campInd = (campaign.industry as IndustryKey) || activeIndustry
                const CampIcon = INDUSTRY_ICONS[campInd] || Building2
                const isSelected = selected.includes(campaign.campaign_id)
                return (
                  <article key={campaign.campaign_id} className={`rounded-xl border p-3.5 ${isSelected ? 'border-ds-primary/40 bg-ds-primary-soft/50' : 'border-ds-line bg-ds-bg'}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox className="mt-1" aria-label={`Select ${campaign.name}`} checked={isSelected} onChange={(e) => toggleCampaign(campaign.campaign_id, e.target.checked)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[16px] font-semibold text-ds-ink">{campaign.name}</p>
                            <p className="truncate text-[14px] text-ds-ink-2">{campaign.offering || campaign.property || 'No offering set'}</p>
                          </div>
                          <StatusBadge status={campaign.status || 'Active'} className="shrink-0 px-2.5 py-0.5 text-[14px]" />
                        </div>
                        <div className="mt-2.5">{industryPill(campInd, CampIcon)}</div>
                        <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                          {[
                            ['Leads', campaign.leads || 0],
                            ['Connected', campaign.connected || 0],
                            ['Bookings', campaign.interested || 0],
                            ['Rate', campaign.conversion || conversionRate(campaign)]
                          ].map(([k, v]) => (
                            <div key={k as string} className="rounded-lg bg-ds-surface px-1 py-2">
                              <dt className="text-[12px] text-ds-ink-2 sm:text-[13px]">{k}</dt>
                              <dd className="text-[15px] font-semibold tabular-nums text-ds-ink">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-3 flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleUploadClick(campaign.campaign_id)}
                            disabled={uploadingCampaignId === campaign.campaign_id}
                            title="Upload leads"
                            aria-label={`Upload leads to ${campaign.name}`}
                            className={rowAction}
                          >
                            {uploadingCampaignId === campaign.campaign_id ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} strokeWidth={1.75} />}
                          </button>
                          <Link href={`/leads?campaign_id=${campaign.campaign_id}`} aria-label={`View leads for ${campaign.name}`} title="View leads" className={rowAction}>
                            <Users size={18} strokeWidth={1.75} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}

        {/* Footer: bulk action + pagination */}
        <div className="flex flex-col gap-4 border-t border-ds-line px-3 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-ds-ink-2">
              <span className="font-semibold text-ds-ink tabular-nums">{selected.length}</span>{' '}
              {selected.length === 1 ? 'campaign' : 'campaigns'} selected
              <span className="block text-[14px] text-ds-ink-3 sm:inline"> <span className="hidden sm:inline">· </span>calls New and No Answer leads in selected campaigns</span>
            </p>
            <button
              onClick={handleStartCalling}
              disabled={selected.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-ds-primary px-4 text-[15px] font-semibold text-white transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Zap size={16} strokeWidth={1.75} />
              Start AI calling
            </button>
          </div>
          {!loading && visibleCampaigns.length > 0 && (
            <div className="border-t border-ds-line pt-4">
              <LeadsPager page={safePage} pageSize={PAGE_SIZE} total={visibleCampaigns.length} onChange={setPage} noun="campaigns" />
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input for CSV upload */}
      <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

      {/* Create Campaign Dialog */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} title="Create campaign" description="Launch a targeted AI calling campaign.">
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Industry / sector" hint="Configures speech intelligence, AI persona, and objections.">
            <Select data-autofocus value={newCampaign.industry} onChange={(e) => setNewCampaign({ ...newCampaign, industry: e.target.value as IndustryKey })}>
              <option value="bfsi">BFSI &amp; Lending Advisory</option>
              <option value="ecommerce">E-commerce &amp; COD Confirmation</option>
              <option value="healthcare">Healthcare &amp; Clinics</option>
              <option value="edtech">EdTech &amp; Academies</option>
              <option value="real_estate">Real Estate &amp; Developers</option>
              <option value="general_sales">B2B Sales &amp; Outreach</option>
              <option value="collections">Collections &amp; EMI Recovery</option>
            </Select>
          </Field>
          <Field label="Campaign name" required>
            <Input
              value={newCampaign.name}
              onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              placeholder={
                newCampaign.industry === 'ecommerce'
                  ? 'e.g. COD Confirmation - Wireless Earbuds'
                  : newCampaign.industry === 'bfsi'
                  ? 'e.g. Q4 Personal Loan Campaign'
                  : 'e.g. Summer Outreach Campaign'
              }
            />
          </Field>
          <Field label="Offering / product / service" hint={<>Passed to the AI agent as the <code className="font-mono text-ds-primary">{'{{offering}}'}</code> variable.</>}>
            <Input
              value={newCampaign.offering}
              onChange={(e) => setNewCampaign({ ...newCampaign, offering: e.target.value })}
              placeholder={getOfferingPlaceholder(newCampaign.industry)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowModal(false)} className={buttonClass('outline', 'md')}>Cancel</button>
            <button type="submit" disabled={creating} className={buttonClass('primary', 'md')}>
              {creating && <Loader2 size={15} className="animate-spin" />}
              {creating ? 'Creating…' : 'Create campaign'}
            </button>
          </div>
        </form>
      </Dialog>
    </AppLayout>
  )
}

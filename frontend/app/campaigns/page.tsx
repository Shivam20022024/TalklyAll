'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Check,
  Download,
  Plus,
  Search,
  Zap,
  Loader2,
  X,
  Upload,
  CreditCard,
  Building2,
  Stethoscope,
  GraduationCap,
  Briefcase,
  Layers,
  Filter
} from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, getAuthToken, API_BASE_URL } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey } from '@/lib/industry'

const INDUSTRY_ICONS: Record<string, any> = {
  real_estate: Building2,
  healthcare: Stethoscope,
  edtech: GraduationCap,
  bfsi: CreditCard,
  general_sales: Briefcase
}

export default function CampaignsPage() {
  const { user } = useAuth()
  const activeIndustry = (user?.industry as IndustryKey) || 'bfsi'

  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [verticalFilter, setVerticalFilter] = useState<string>('active') // 'active', 'all', or specific key
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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  // Auto-sync newCampaign default industry when user loads
  useEffect(() => {
    if (user?.industry && INDUSTRY_CONFIGS[user.industry as IndustryKey]) {
      setNewCampaign((prev) => ({ ...prev, industry: user.industry as IndustryKey }))
    }
  }, [user?.industry])

  // Compute counts
  const activeCount = campaigns.filter((c) => c.industry === activeIndustry).length
  const otherIndustries = Array.from(
    new Set(campaigns.map((c) => c.industry).filter((ind): ind is string => Boolean(ind) && ind !== activeIndustry))
  )

  // Filter campaigns
  const visibleCampaigns = campaigns
    .filter((c) => {
      if (verticalFilter === 'active') return c.industry === activeIndustry
      if (verticalFilter === 'all') return true
      return c.industry === verticalFilter
    })
    .filter((c) => c.name?.toLowerCase().includes(query.toLowerCase()) || c.offering?.toLowerCase().includes(query.toLowerCase()) || c.property?.toLowerCase().includes(query.toLowerCase()))

  const toggleCampaign = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

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
      setVerticalFilter(newCampaign.industry || 'active')
      loadCampaigns()
    } catch (e) {
      alert('Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  const openCreateModal = (targetIndustry?: IndustryKey) => {
    setNewCampaign({
      name: '',
      offering: '',
      industry: targetIndustry || activeIndustry
    })
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
        body: JSON.stringify({
          campaign_ids: selected
        })
      })
      alert('Calls dispatched successfully!')
      setSelected([])
    } catch (e: any) {
      alert(`Failed to trigger campaigns: ${e.message || 'Unknown error'}`)
    }
  }

  const handleDownload = () => {
    const csv = ['Campaign,Offering,Industry,Leads,Calls,Connected,Interested,Status']
    visibleCampaigns.forEach((c) => csv.push(`"${c.name}","${c.offering || c.property || ''}","${c.industry || ''}",${c.leads || 0},${c.calls || 0},${c.connected || 0},${c.interested || 0},${c.status || 'Active'}`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaigns_${verticalFilter}_export.csv`
    a.click()
  }

  const getOfferingPlaceholder = (ind: string) => {
    switch (ind) {
      case 'bfsi': return 'e.g. Pre-Approved Personal Loan (10.5%), Home Loan Balance Transfer'
      case 'healthcare': return 'e.g. Dental Implants & Cleaning, Knee Replacement Consultation'
      case 'edtech': return 'e.g. Executive MBA Program, Data Science Full-Stack Course'
      case 'real_estate': return 'e.g. 3BHK Luxury Highrise Flat, 200 Sqyd Villa'
      default: return 'e.g. Enterprise Consulting, Outbound Sales Service'
    }
  }

  const ActiveIcon = INDUSTRY_ICONS[activeIndustry] || CreditCard

  return (
    <AppLayout title="Campaigns">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="eyebrow text-primary">Workspace / Campaigns</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <ActiveIcon size={12} />
              {INDUSTRY_CONFIGS[activeIndustry]?.label || activeIndustry}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Campaign Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage and launch your industry-tailored AI outbound calling campaigns.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openCreateModal(activeIndustry)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90"
          >
            <Plus size={15} />Create {INDUSTRY_CONFIGS[activeIndustry]?.shortLabel || ''} Campaign
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        {/* Industry Sector Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mr-1">
              <Filter size={13} className="text-primary" /> Sector Filter:
            </span>

            {/* Active Company Sector Tab */}
            <button
              onClick={() => setVerticalFilter('active')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${verticalFilter === 'active'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              <ActiveIcon size={13} />
              {INDUSTRY_CONFIGS[activeIndustry]?.shortLabel || 'Active Vertical'} ({activeCount})
              <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-extrabold uppercase ${verticalFilter === 'active' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/20 text-primary'}`}>
                Company Default
              </span>
            </button>

            {/* Other Industries with Existing Campaigns (e.g. Real Estate) */}
            {otherIndustries.map((ind) => {
              const count = campaigns.filter((c) => c.industry === ind).length
              const label = INDUSTRY_CONFIGS[ind as IndustryKey]?.shortLabel || ind
              const Icon = INDUSTRY_ICONS[ind] || Building2
              return (
                <button
                  key={ind}
                  onClick={() => setVerticalFilter(ind)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${verticalFilter === ind
                      ? 'bg-foreground text-background shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  <Icon size={13} />
                  {label} ({count})
                </button>
              )
            })}

            {/* View All Campaigns Tab */}
            <button
              onClick={() => setVerticalFilter('all')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${verticalFilter === 'all'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              <Layers size={13} />
              All ({campaigns.length})
            </button>
          </div>

          {/* Search & Export Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-primary" size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns..."
                className="h-9 w-48 rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleDownload}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Export CSV"
            >
              <Download size={15} />
            </button>
          </div>
        </div>

        {/* Content Section: Empty State or Campaigns Table */}
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Loader2 size={24} className="animate-spin text-primary" />
            Loading campaigns...
          </div>
        ) : verticalFilter === 'active' && activeCount === 0 ? (
          /* Empty State for Active Industry (e.g. BFSI has no campaigns yet) */
          <div className="my-6 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-3 border border-amber-500/20">
              <ActiveIcon size={28} />
            </div>
            <h3 className="text-base font-bold text-foreground">
              No {INDUSTRY_CONFIGS[activeIndustry]?.label} Campaigns Found
            </h3>
            <p className="mt-1.5 text-xs text-muted-foreground max-w-lg mx-auto">
              Your company profile is set to <strong>{INDUSTRY_CONFIGS[activeIndustry]?.label}</strong>. Your {campaigns.length} previous Real Estate campaigns are preserved under the <button onClick={() => setVerticalFilter('real_estate')} className="text-primary underline font-semibold">Real Estate ({campaigns.length}) tab</button>.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => openCreateModal(activeIndustry)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                <Plus size={14} /> Create First {INDUSTRY_CONFIGS[activeIndustry]?.shortLabel} Campaign
              </button>
              <button
                onClick={() => setVerticalFilter('all')}
                className="rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                View Previous Campaigns ({campaigns.length})
              </button>
            </div>
          </div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No campaigns match your current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border h-12 text-sm font-bold uppercase tracking-wider text-foreground">
                  <th className="px-4 font-semibold w-[32%]">Campaign & Offering</th>
                  <th className="px-2 text-center font-semibold w-[8%]">Leads</th>
                  <th className="px-2 text-center font-semibold w-[8%]">Calls</th>
                  <th className="px-2 text-center font-semibold w-[10%]">Connected</th>
                  <th className="px-2 text-center font-semibold w-[10%]">Interested</th>
                  <th className="px-2 text-center font-semibold w-[10%]">Conversion</th>
                  <th className="px-2 font-semibold w-[10%]">Status</th>
                  <th className="px-4 text-right font-semibold w-[12%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visibleCampaigns.map((campaign) => {
                  const campInd = (campaign.industry as IndustryKey) || 'real_estate'
                  const CampIcon = INDUSTRY_ICONS[campInd] || Building2
                  return (
                    <tr key={campaign.campaign_id} className="group h-16 hover:bg-muted/30 transition-colors">
                      <td className="px-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleCampaign(campaign.campaign_id)}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${selected.includes(campaign.campaign_id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:border-primary/50 bg-background'}`}
                          >
                            {selected.includes(campaign.campaign_id) && <Check size={12} strokeWidth={3} />}
                          </button>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground truncate max-w-[200px]" title={campaign.name}>
                                {campaign.name}
                              </span>
                              {/* Industry Badge */}
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${campInd === 'bfsi' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                                  campInd === 'healthcare' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                    campInd === 'edtech' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                                      campInd === 'real_estate' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                                        'bg-primary/10 text-primary'
                                }`}>
                                <CampIcon size={10} />
                                {INDUSTRY_CONFIGS[campInd]?.shortLabel || campInd}
                              </span>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground truncate max-w-[220px]" title={campaign.offering || campaign.property}>
                              {campaign.offering || campaign.property || 'General Campaign'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-center text-sm font-medium">{campaign.leads || 0}</td>
                      <td className="px-2 text-center text-sm font-medium">{campaign.calls || 0}</td>
                      <td className="px-2 text-center text-sm font-medium">{campaign.connected || 0}</td>
                      <td className="px-2 text-center text-sm font-medium">{campaign.interested || 0}</td>
                      <td className="px-2 text-center text-sm font-bold text-primary">{campaign.conversion || '0%'}</td>
                      <td className="px-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {campaign.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/leads?campaign_id=${campaign.campaign_id}`}
                            className="inline-flex h-8 items-center justify-center whitespace-nowrap gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                          >
                            View Leads
                          </a>
                          <button
                            onClick={() => handleUploadClick(campaign.campaign_id)}
                            disabled={uploadingCampaignId === campaign.campaign_id}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                            title="Upload Leads"
                          >
                            {uploadingCampaignId === campaign.campaign_id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Batch action footer */}
        <div className="mt-4 flex flex-col items-start justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{selected.length} campaigns selected</span>
          </p>
          <button onClick={handleStartCalling} disabled={selected.length === 0} className="flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50">
            <Zap size={14} />Start AI calling
          </button>
        </div>
      </section>

      <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

      {/* Create Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex justify-between items-center mb-5 border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-bold">Create Campaign</h2>
                <p className="text-xs text-muted-foreground">Launch a targeted AI calling campaign.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Industry / Sector</label>
                <select
                  value={newCampaign.industry}
                  onChange={(e) => setNewCampaign({ ...newCampaign, industry: e.target.value as IndustryKey })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="bfsi">BFSI & Lending Advisory</option>
                  <option value="healthcare">Healthcare & Clinics</option>
                  <option value="edtech">EdTech & Academies</option>
                  <option value="real_estate">Real Estate & Developers</option>
                  <option value="general_sales">B2B Sales & Outreach</option>
                  <option value="collections">Collections & EMI Recovery</option>
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">Configures speech intelligence, AI persona, and objections.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Campaign Name</label>
                <input
                  required
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder={newCampaign.industry === 'bfsi' ? 'e.g. Q4 Personal Loan Campaign' : 'e.g. Summer Outreach Campaign'}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Campaign Offering / Product / Service</label>
                <input
                  value={newCampaign.offering}
                  onChange={(e) => setNewCampaign({ ...newCampaign, offering: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder={getOfferingPlaceholder(newCampaign.industry)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Passed to the AI agent as <code className="text-primary font-mono text-[10px]">&#123;&#123;offering&#125;&#125;</code> variable.</p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { Download, MoreHorizontal, Phone, Search, Upload, Loader2, Plus, X, User, MapPin, Home, Briefcase, Sparkles, MessageSquare, Clock, ArrowRight, Trash2, CircleDollarSign } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi, getAuthToken, API_BASE_URL } from '@/lib/api'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { INDUSTRY_CONFIGS, IndustryKey } from '@/lib/industry'

function LeadsContent() {
  const { user } = useAuth()
  const activeIndustry = (user?.industry as IndustryKey) || 'bfsi'

  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [range, setRange] = useState('All Time')
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [uploading, setUploading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showQuickCallModal, setShowQuickCallModal] = useState(false)
  const [quickCallNumber, setQuickCallNumber] = useState('')
  const [quickCallName, setQuickCallName] = useState('')
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
  
  // Initialize campaignId from search params directly
  const [campaignId, setCampaignId] = useState<string | null>(searchParams.get('campaign_id'))

  useEffect(() => {
    // If the URL changes (e.g. user clicks "Clear"), keep state in sync
    setCampaignId(searchParams.get('campaign_id'))
  }, [searchParams])

  const loadLeads = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.append('range', range)
      if (campaignId) qs.append('campaign_id', campaignId)
      
      const data = await fetchApi(`/api/v1/leads?${qs.toString()}`)
      setLeads(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [range, campaignId])

  const loadRecoveryAnalytics = async () => {
    try {
      const data = await fetchApi('/api/v1/collections/recovery-analytics')
      setRecoveryAnalytics(data)
    } catch (e) {
      setRecoveryAnalytics(null)
    }
  }

  useEffect(() => {
    loadRecoveryAnalytics()
  }, [])

  const showCollectionsUI = activeIndustry === 'collections' || leads.some(l => l.industry === 'collections')

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

  const visibleLeads = leads
    .filter((l) => l.name?.toLowerCase().includes(query.toLowerCase()) || String(l.phone || '').includes(query))
    .filter((l) => filterStatus ? (l.status || '').toLowerCase() === filterStatus.toLowerCase() : true)
    .filter((l) => {
      if (industryFilter === 'all') return true
      if (industryFilter === 'active') return l.industry === activeIndustry
      return l.industry === industryFilter
    })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await fetchApi('/api/v1/leads', {
        method: 'POST',
        body: JSON.stringify(newLead)
      })
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
    if (!quickCallName.trim()) {
      alert('Please enter the customer name')
      return
    }
    setCalling(true)
    try {
      await fetchApi('/api/v1/calls/trigger', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: quickCallNumber,
          customer_name: quickCallName.trim(),
          lead_id: 'quick-call-' + Date.now(),
          campaign_language: 'Hinglish',
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

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDeleteSelected = async () => {
    if (selectedLeads.length === 0) return alert('Please select at least one lead to delete.')
    if (!confirm(`Are you sure you want to delete ${selectedLeads.length} selected lead(s)? This cannot be undone.`)) return
    try {
      await fetchApi('/api/v1/leads/delete-bulk', { 
        method: 'POST',
        body: JSON.stringify({ lead_ids: selectedLeads })
      })
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

  const handleRepaymentUploadClick = () => {
    repaymentFileInputRef.current?.click()
  }

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
      // Only English/Hindi/Hinglish have an actual Indian-accented voice
      // (Sarvam) behind them - any other value here would silently fall
      // back to a foreign-accented voice for the whole call, so a CSV-
      // uploaded lead with an unsupported language value never reaches the
      // backend as-is.
      const SARVAM_SUPPORTED_LANGUAGES = ['english', 'hindi', 'hinglish']
      const leadLanguage = (lead.language || '').trim()
      const safeLanguage = SARVAM_SUPPORTED_LANGUAGES.includes(leadLanguage.toLowerCase()) ? leadLanguage : 'Hinglish'
      alert(`Initiating call to ${lead.name || 'Lead'} (${lead.phone})...`)
      await fetchApi('/api/v1/calls/trigger', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: lead.phone,
          customer_name: lead.name,
          lead_id: lead.lead_id || 'manual-lead',
          campaign_language: safeLanguage,
          industry: lead.industry || 'general_sales',
          offering: lead.offering || lead.property || '',
          location: lead.location || ''
        })
      })
      alert('Call dispatched successfully!')
    } catch (e: any) {
      alert(`Failed to dispatch call: ${e.message}`)
    }
  }

  const handleDownload = () => {
    if (leads.length === 0) return alert("No data to download")
    const csv = ["Name,Phone,Offering,Location,Status,AI Score"]
    leads.forEach(l => csv.push(`${l.name},${l.phone},${l.offering || l.property || ''},${l.location || ''},${l.status},${l.aiScore}`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_export.csv'
    a.click()
  }

  return (
    <AppLayout title="Leads">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Workspace / Leads</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Lead Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage and filter your AI contacted leads.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDeleteSelected} className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
            <Trash2 size={15} />Delete Selected
          </button>
          <button onClick={() => setShowQuickCallModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
            <Phone size={15} />Quick Call
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
            <Plus size={15} />Add Lead
          </button>
          <input type="file" accept=".csv,.xlsx" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <button onClick={handleUploadClick} disabled={uploading} className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? 'Uploading...' : 'Upload Leads'}
          </button>
          {showCollectionsUI && (
            <>
              <input type="file" accept=".csv,.xlsx" className="hidden" ref={repaymentFileInputRef} onChange={handleRepaymentFileChange} />
              <button onClick={handleRepaymentUploadClick} disabled={repaymentUploading} title="Upload a CSV/Excel of repayments actually received, to reconcile against Promise-to-Pay commitments" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50">
                {repaymentUploading ? <Loader2 size={15} className="animate-spin" /> : <CircleDollarSign size={15} />}
                {repaymentUploading ? 'Uploading...' : 'Upload Repayments'}
              </button>
            </>
          )}
        </div>
      </section>

      {showCollectionsUI && recoveryAnalytics && (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Overdue Accounts</span>
            <div className="mt-1 text-2xl font-bold text-foreground">{recoveryAnalytics.overdue_accounts}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PTPs Secured</span>
            <div className="mt-1 text-2xl font-bold text-foreground">{recoveryAnalytics.ptp_secured}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PTP Kept Rate</span>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{recoveryAnalytics.ptp_kept_rate_pct}%</div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PTP Broken</span>
            <div className="mt-1 text-2xl font-bold text-rose-500">{recoveryAnalytics.ptp_broken}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amount Due</span>
            <div className="mt-1 text-2xl font-bold text-foreground">₹{recoveryAnalytics.total_amount_due?.toLocaleString('en-IN')}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recovery Rate</span>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{recoveryAnalytics.recovery_rate_pct}% <span className="text-xs font-medium text-muted-foreground">(₹{recoveryAnalytics.total_amount_recovered?.toLocaleString('en-IN')})</span></div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col flex-wrap justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-primary" size={14} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads" className="h-9 w-44 rounded-lg border border-primary ring-1 ring-primary/20 bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring">
              <option>Today</option>
              <option>7 Days</option>
              <option>30 Days</option>
              <option>All Time</option>
            </select>
            <select
              value={filterStatus || 'All Statuses'}
              onChange={(e) => setFilterStatus(e.target.value === 'All Statuses' ? null : e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="All Statuses">All Statuses</option>
              <option value="New">New</option>
              <option value="Interested">Interested</option>
              <option value="Qualified">Qualified</option>
              <option value="Converted">Converted</option>
              <option value="Not Interested">Not Interested</option>
            </select>
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Sectors ({leads.length})</option>
              <option value="active">{INDUSTRY_CONFIGS[activeIndustry]?.shortLabel || 'Active Sector'} ({leads.filter(l => l.industry === activeIndustry).length})</option>
              <option value="real_estate">Real Estate ({leads.filter(l => l.industry === 'real_estate').length})</option>
              <option value="bfsi">BFSI & Lending ({leads.filter(l => l.industry === 'bfsi').length})</option>
              <option value="healthcare">Healthcare ({leads.filter(l => l.industry === 'healthcare').length})</option>
              <option value="edtech">EdTech ({leads.filter(l => l.industry === 'edtech').length})</option>
              <option value="collections">Collections ({leads.filter(l => l.industry === 'collections').length})</option>
            </select>
            {campaignId && (
              <button 
                onClick={() => {
                  setCampaignId(null)
                  router.push('/leads')
                }}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                Clear Campaign Filter <X size={14} />
              </button>
            )}
            <button onClick={handleDownload} className="rounded-lg border border-border bg-muted/50 p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Download size={15} /></button>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 hidden sm:flex">
            {['Today', '7 Days', '30 Days', 'All Time'].map((item) => (
              <button key={item} onClick={() => setRange(item)} className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${range === item ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                {item}
              </button>
            ))}
          </div>
        </div>
        
        {/* Mobile filter view */}
        <div className="mt-3 flex items-center gap-1 rounded-lg bg-muted/60 p-1 sm:hidden overflow-x-auto">
          {['Today', '7 Days', '30 Days', 'All Time'].map((item) => (
            <button key={item} onClick={() => setRange(item)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${range === item ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
              {item}
            </button>
          ))}
        </div>
        
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-border text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                <th className="pb-3 pl-4 font-semibold w-10">
                  <input 
                    type="checkbox" 
                    checked={visibleLeads.length > 0 && selectedLeads.length === visibleLeads.length}
                    onChange={(e) => setSelectedLeads(e.target.checked ? visibleLeads.map((l: any) => l.lead_id) : [])}
                    className="rounded border-border accent-primary cursor-pointer w-3.5 h-3.5"
                  />
                </th>
                <th className="pb-3 font-semibold">Lead</th>
                <th className="pb-3 font-semibold">Phone</th>
                <th className="pb-3 font-semibold">Offering / Details</th>
                <th className="pb-3 font-semibold">Location</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">AI Score</th>
                <th className="pb-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Loading leads...</td></tr>
              ) : visibleLeads.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No leads found.</td></tr>
              ) : (
                visibleLeads.map((lead, idx) => (
                  <tr key={`${lead._id || lead.lead_id || 'lead'}-${idx}`} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                    <td className="py-4 pl-4">
                      <input 
                        type="checkbox" 
                        checked={selectedLeads.includes(lead.lead_id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLeads([...selectedLeads, lead.lead_id])
                          else setSelectedLeads(selectedLeads.filter(id => id !== lead.lead_id))
                        }}
                        className="rounded border-border accent-primary cursor-pointer w-3.5 h-3.5"
                      />
                    </td>
                    <td className="py-4 font-semibold text-sm">{lead.name}</td>
                    <td className="py-4 text-xs font-medium text-muted-foreground">{lead.phone}</td>
                    <td className="py-4 text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{lead.offering || lead.property || '-'}</span>
                        {lead.industry && (
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            {INDUSTRY_CONFIGS[lead.industry as IndustryKey]?.shortLabel || lead.industry}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 text-xs">{lead.location || '-'}</td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{lead.aiScore || 0}</span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleCall(lead)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Phone size={14} />
                        </button>
                        <button onClick={() => setSelectedLead(lead)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold">Add New Lead</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Lead Name</label>
                <input required value={newLead.name} onChange={(e) => setNewLead({...newLead, name: e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="e.g. John Doe" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                <input required value={newLead.phone} onChange={(e) => setNewLead({...newLead, phone: e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="e.g. +1 555-0123" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Offering / Product / Service (Optional)</label>
                <input value={newLead.property} onChange={(e) => setNewLead({...newLead, property: e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="e.g. Full-Stack Web Dev / Villa / Dental Checkup" />
              </div>
              <button disabled={creating} className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {creating ? <Loader2 size={16} className="animate-spin" /> : 'Add Lead'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showQuickCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h2 className="text-lg font-bold">Quick Call</h2>
                <p className="text-xs text-muted-foreground mt-0.5">TalklyAI will greet this customer by name during the call.</p>
              </div>
              <button onClick={() => setShowQuickCallModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleQuickCall} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Customer Name</label>
                <input 
                  required 
                  value={quickCallName} 
                  onChange={(e) => setQuickCallName(e.target.value)} 
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" 
                  placeholder="e.g. Rahul Sharma" 
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                <input 
                  required 
                  value={quickCallNumber} 
                  onChange={(e) => setQuickCallNumber(e.target.value)} 
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" 
                  placeholder="e.g. +91 9876543210" 
                />
              </div>
              <button disabled={calling} className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {calling ? <Loader2 size={16} className="animate-spin" /> : 'Call Now'}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header Section */}
            <div className="relative border-b border-border/50 bg-muted/30 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm">
                  <User size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">{selectedLead.name || 'Unknown Lead'}</h2>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Phone size={14} />
                    <span className="font-medium">{selectedLead.phone}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLead(null)} 
                className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    <Briefcase size={14} className="text-primary" /> Offering
                  </div>
                  <div className="text-sm font-medium line-clamp-2">{selectedLead.offering || selectedLead.property || '-'}</div>
                </div>
                
                <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    <MapPin size={14} className="text-primary" /> Location
                  </div>
                  <div className="text-sm font-medium line-clamp-2">{selectedLead.location || '-'}</div>
                </div>
                
                <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    <Sparkles size={14} className="text-amber-500" /> AI Score
                  </div>
                  <div className="flex items-baseline gap-1 text-xl font-bold text-foreground">
                    {selectedLead.aiScore} <span className="text-xs font-normal text-muted-foreground">/ 100</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    <Clock size={14} className="text-emerald-500" /> Status
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                    selectedLead.status === 'Converted' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                    selectedLead.status === 'Qualified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    selectedLead.status === 'Interested' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {selectedLead.status}
                  </span>
                </div>
              </div>

              {/* Custom CSV Fields */}
              {selectedLead.custom_fields && Object.keys(selectedLead.custom_fields).length > 0 && (
                <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-primary" /> Custom Lead Data (CSV)
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(selectedLead.custom_fields).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-muted/40 p-2.5 border border-border/40">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">{k.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-medium text-foreground truncate block mt-0.5">{String(v || '-')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Promise to Pay - collections calls only; this field exists on every
                  call's analysis now, but only means something for a collections call */}
              {selectedCall?.industry === 'collections' && selectedCall?.analysis?.promise_to_pay && (
                <div className={`rounded-xl border p-4 shadow-sm ${selectedCall.analysis.promise_to_pay.promised ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/50 bg-card'}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    <CircleDollarSign size={14} className={selectedCall.analysis.promise_to_pay.promised ? 'text-emerald-500' : 'text-muted-foreground'} /> Promise to Pay
                  </div>
                  {selectedCall.analysis.promise_to_pay.promised ? (
                    <>
                      <div className="text-sm font-bold text-foreground">
                        Committed to pay {selectedCall.analysis.promise_to_pay.amount || 'an unspecified amount'} by {selectedCall.analysis.promise_to_pay.date || 'an unspecified date'}
                      </div>
                      {selectedLead?.collections_status && (
                        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                          selectedLead.collections_status === 'kept' ? 'bg-emerald-500/10 text-emerald-600' :
                          selectedLead.collections_status === 'kept_late' ? 'bg-amber-500/10 text-amber-600' :
                          selectedLead.collections_status === 'partial' ? 'bg-amber-500/10 text-amber-600' :
                          selectedLead.collections_status === 'broken' ? 'bg-rose-500/10 text-rose-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {selectedLead.collections_status.replace('_', ' ')}
                          {selectedLead.collections_total_paid > 0 && ` · ₹${selectedLead.collections_total_paid.toLocaleString('en-IN')} received`}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm font-medium text-muted-foreground">
                      No confirmed commitment yet - the customer did not give a clear amount and date during this call.
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Extracted Fields from AI Analysis */}
              {selectedCall?.analysis && Object.keys(selectedCall.analysis).filter(k => !['summary', 'action_items', 'lead_score', 'lead_temperature', 'conversion_probability', 'customer_name', 'customer_id', 'sentiment', 'status', 'promise_to_pay'].includes(k)).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.keys(selectedCall.analysis)
                    .filter(k => !['summary', 'action_items', 'lead_score', 'lead_temperature', 'conversion_probability', 'customer_name', 'customer_id', 'sentiment', 'status', 'promise_to_pay'].includes(k))
                    .map(key => (
                      <div key={key} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:shadow-md">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          <Sparkles size={14} className="text-primary" /> {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm font-medium line-clamp-2 overflow-y-auto max-h-[80px]">
                          {typeof selectedCall.analysis[key] === 'boolean' 
                            ? (selectedCall.analysis[key] ? 'Yes' : 'No') 
                            : typeof selectedCall.analysis[key] === 'object' && selectedCall.analysis[key] !== null
                              ? (Array.isArray(selectedCall.analysis[key]) ? selectedCall.analysis[key].join(', ') : JSON.stringify(selectedCall.analysis[key]))
                            : String(selectedCall.analysis[key] || '-')}
                        </div>
                      </div>
                  ))}
                </div>
              )}

              {/* Chat Transcript Section */}
              <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-border/50 bg-muted/30 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MessageSquare size={16} className="text-primary" />
                    Call Transcript
                  </div>
                  {loadingCall && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                </div>
                
                <div className="p-4 bg-[#f8fafc] dark:bg-[#0f172a] min-h-[250px] max-h-[350px] overflow-y-auto space-y-4">
                  {loadingCall ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 size={24} className="animate-spin text-primary/50" />
                        Fetching AI conversation log...
                      </div>
                    </div>
                  ) : selectedCall && selectedCall.transcript ? (
                    <div className="flex flex-col space-y-3">
                      {selectedCall.transcript.split('\n').filter((l: string) => l.trim().length > 0).map((line: string, i: number) => {
                        const lower = line.toLowerCase();
                        const isUser = lower.startsWith('user:') || lower.startsWith('customer:') || lower.startsWith('caller:');
                        const isAssistant = lower.startsWith('assistant:') || lower.startsWith('ai:') || lower.startsWith('agent:');
                        
                        if (!isUser && !isAssistant) {
                          return <div key={i} className="text-xs text-center text-muted-foreground/70 my-2">{line}</div>;
                        }
                        
                        const content = line.replace(/^(user:|customer:|caller:|assistant:|ai:|agent:)\s*/i, '');
                        
                        return (
                          <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                              isUser 
                                ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                                : 'bg-white dark:bg-slate-800 text-foreground border border-border/50 rounded-tl-sm'
                            }`}>
                              {content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm italic opacity-70">
                      No call transcript available for this lead yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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

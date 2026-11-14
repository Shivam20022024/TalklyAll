'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Clock, Coins, CreditCard, Crown, Info, Layers, PhoneCall, Plus, RefreshCw, Search, Wallet } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi } from '@/lib/api'
import { InlineNote } from '@/components/ui/Panel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Alert } from '@/components/ui/Alert'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { formatDateTime } from '@/lib/format'

interface DashboardData {
  balance: number
  currency: string
  plan_name: string
  is_trial: boolean
  minutes_used: number
  minutes_included: number
  minutes_remaining: number
  total_spending: number
  breakdown?: {
    outbound?: { minutes: number; spending: number }
    inbound?: { minutes: number; spending: number }
    [key: string]: { minutes: number; spending: number } | undefined
  }
  total_calls: number
  completed_calls: number
  rate_per_minute: number
  company_name: string
  billing_period: string
}

interface UsageRecord {
  id?: string
  call_id?: string
  customer_name?: string
  phone?: string
  duration_seconds?: number
  billed_minutes?: number
  customer_cost?: number
  service_type?: string
  status?: string
  created_at?: string
}

interface Transaction {
  id: string
  type: 'CREDIT' | 'DEBIT'
  amount: number
  currency: string
  payment_provider: string
  provider_transaction_id?: string
  description?: string
  status: string
  created_at: string
}

/** Donut of outbound vs inbound minutes (SVG, no chart library). Display only. */
function UsageDonut({ outbound, inbound }: { outbound: number; inbound: number }) {
  const total = outbound + inbound
  const r = 62
  const c = 2 * Math.PI * r
  const outLen = total > 0 ? (outbound / total) * c : 0
  const inLen = total > 0 ? (inbound / total) * c : 0
  const label = Number.isInteger(total) ? String(total) : total.toFixed(1)
  return (
    <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`${label} minutes: ${outbound} outbound, ${inbound} inbound`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" strokeWidth="18" className="stroke-slate-100" />
        {outLen > 0 && <circle cx="80" cy="80" r={r} fill="none" strokeWidth="18" strokeDasharray={`${outLen} ${c - outLen}`} className="stroke-ds-primary" />}
        {inLen > 0 && <circle cx="80" cy="80" r={r} fill="none" strokeWidth="18" strokeDasharray={`${inLen} ${c - inLen}`} strokeDashoffset={-outLen} className="stroke-ds-accent" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[28px] font-bold leading-none tabular-nums text-ds-ink">{label}</span>
        <span className="mt-1 text-[14px] text-ds-ink-2">Minutes</span>
      </div>
    </div>
  )
}

export default function BillingPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [usage, setUsage] = useState<UsageRecord[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Presentation-only: true while the latest load attempt failed.
  const [loadFailed, setLoadFailed] = useState(false)
  const [activeTab, setActiveTab] = useState<'usage' | 'transactions'>('usage')
  
  // Top-Up Modal State
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [topupAmount, setTopupAmount] = useState<number>(500)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [toppingUp, setToppingUp] = useState(false)

  useEffect(() => {
    if (document.getElementById('razorpay-checkout-js')) return
    const script = document.createElement('script')
    script.id = 'razorpay-checkout-js'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
  }, [])

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [dashRes, usageRes, txRes] = await Promise.all([
        fetchApi('/api/v1/billing/wallet'),
        fetchApi('/api/v1/billing/usage'),
        fetchApi('/api/v1/billing/transactions')
      ])

      setDashboard(dashRes)
      setUsage(usageRes || [])
      setTransactions(txRes || [])
      setLoadFailed(false)
    } catch (err) {
      console.error('Failed to load billing data', err)
      setLoadFailed(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountToCharge = customAmount ? parseFloat(customAmount) : topupAmount
    if (!amountToCharge || amountToCharge <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (typeof (window as any).Razorpay === 'undefined') {
      alert('Payment gateway is still loading, please try again in a moment.')
      return
    }

    setToppingUp(true)
    try {
      const { order } = await fetchApi('/api/v1/billing/wallet/razorpay/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount: amountToCharge, currency: 'INR' })
      })

      const rzp = new (window as any).Razorpay({
        key: order.key_id,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'TalklyAI',
        description: 'Wallet Recharge',
        prefill: dashboard?.company_name ? { name: dashboard.company_name } : undefined,
        theme: { color: '#000000' },
        handler: async (response: any) => {
          try {
            await fetchApi('/api/v1/billing/wallet/razorpay/verify-payment', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            })
            alert(`₹${amountToCharge.toFixed(2)} credited successfully to your TalklyAI wallet!`)
            setShowTopupModal(false)
            setCustomAmount('')
            loadData(true)
          } catch (err: any) {
            alert(`Payment succeeded but wallet credit failed - contact support: ${err.message}`)
          } finally {
            setToppingUp(false)
          }
        },
        modal: {
          ondismiss: () => setToppingUp(false)
        }
      })
      rzp.on('payment.failed', (resp: any) => {
        alert(`Payment failed: ${resp.error?.description || 'Please try again.'}`)
        setToppingUp(false)
      })
      rzp.open()
    } catch (e: any) {
      alert(`Recharge failed: ${e.message}`)
      setToppingUp(false)
    }
  }

  const balance = dashboard?.balance ?? 0
  const ratePerMin = dashboard?.rate_per_minute ?? 12.0
  const estimatedMinsLeft = balance > 0 ? Math.floor(balance / ratePerMin) : 0
  const minutesUsed = dashboard?.minutes_used ?? 0
  const minutesIncluded = dashboard?.minutes_included ?? 10
  const usagePercentage = minutesIncluded > 0 
    ? Math.min(100, Math.round((minutesUsed / minutesIncluded) * 100)) 
    : 100

  // ---- Presentation helpers (display only) ----
  const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const hasLimit = !!dashboard && dashboard.minutes_included > 0
  const LATEST = 50 // the API returns at most this many usage rows / transactions per request
  const tabLabels = [`Call usage (${usage.length})`, `Wallet transactions (${transactions.length})`]
  const activeTabLabel = activeTab === 'usage' ? tabLabels[0] : tabLabels[1]
  const activeCount = activeTab === 'usage' ? usage.length : transactions.length
  const topupEffective = customAmount ? parseFloat(customAmount) || 0 : topupAmount

  const closeTopup = () => setShowTopupModal(false)

  // ── presentation-only helpers (no request, calculation or handler is changed) ──
  const [historyQuery, setHistoryQuery] = useState('')
  const q = historyQuery.trim().toLowerCase()
  const usageShown = usage.filter((u) => !q || [u.customer_name, u.phone, u.call_id].some((v) => String(v || '').toLowerCase().includes(q)))
  const txShown = transactions.filter((t) => !q || [t.description, t.payment_provider, t.type, t.status].some((v) => String(v || '').toLowerCase().includes(q)))
  const outMin = dashboard?.breakdown?.outbound?.minutes ?? 0
  const inMin = dashboard?.breakdown?.inbound?.minutes ?? 0
  const outCost = dashboard?.breakdown?.outbound?.spending ?? 0
  const inCost = dashboard?.breakdown?.inbound?.spending ?? 0
  const card = 'rounded-2xl border border-ds-line bg-ds-bg p-5 shadow-sm sm:p-6'
  const headBtn =
    'inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-60'
  const initialsOf = (name?: string) => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '—'
  const AVATAR_TONES = ['bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-orange-100 text-orange-700']
  const avatarTone = (name?: string) => AVATAR_TONES[[...String(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TONES.length]
  const dirBadge = (d: string) =>
    d ? (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold capitalize ${d === 'inbound' ? 'bg-blue-50 text-blue-700' : d === 'outbound' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>{d}</span>
    ) : (
      <span className="text-ds-ink-3">—</span>
    )
  const durationText = (secs?: number) => (typeof secs === 'number' ? (secs >= 60 ? `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s` : `${Math.round(secs)}s`) : '—')
  const th = 'px-3 py-3 text-[13px] font-semibold tracking-wide text-ds-ink-2'
  const kpi = (label: string, value: string, hint: string, Icon: any, wrap: string, tile: string) => (
    <article key={label} className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${wrap}`}>
      <div className="flex items-center gap-3.5">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`} aria-hidden="true"><Icon size={23} strokeWidth={1.75} /></span>
        <p className="min-w-0 text-[15px] font-medium leading-snug text-ds-ink-2">{label}</p>
      </div>
      <p className={`mt-3 font-bold leading-tight tracking-tight text-ds-ink tabular-nums ${value.length > 12 ? 'text-[24px] sm:text-[26px]' : 'text-[28px] sm:text-[30px]'}`}>{value}</p>
      <p className="mt-2 text-[14px] leading-snug text-ds-ink-2">{hint}</p>
    </article>
  )
  const tabBtn = (active: boolean) =>
    `inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold transition-colors ${active ? 'border-ds-primary bg-ds-primary text-white shadow-md shadow-blue-600/20' : 'border-ds-line bg-ds-bg text-ds-ink hover:bg-ds-surface'}`

  return (
    <AppLayout title="Billing & Usage">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 text-violet-700 shadow-sm" aria-hidden="true"><Wallet size={26} strokeWidth={1.75} /></span>
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Billing &amp; Usage</h1>
            <p className="mt-1 text-[16px] text-ds-ink-2">Your wallet balance, plan, minute usage and payment history.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
          <button type="button" onClick={() => loadData(true)} disabled={refreshing} className={headBtn}>
            <RefreshCw size={17} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setShowTopupModal(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ds-primary px-5 text-[15px] font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-ds-primary-hover active:scale-[0.98]"
          >
            <Plus size={18} strokeWidth={2} />
            Add Credits
          </button>
        </div>
      </header>

      {loading && !dashboard ? (
        <LoadingState label="Loading billing…">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-ds-line bg-ds-bg" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </LoadingState>
      ) : !dashboard ? (
        <div className={card}>
          <ErrorState
            title="Billing details couldn’t be loaded"
            description="The request for your wallet and plan failed. Nothing is shown rather than guessing your balance."
            action={
              <button type="button" onClick={() => loadData()} className={headBtn}>
                <RefreshCw size={16} strokeWidth={1.75} />
                Try again
              </button>
            }
          />
        </div>
      ) : (
        <>
          {loadFailed && (
            <Alert tone="warning" title="Couldn’t refresh billing data">
              The figures below are from the last successful load and may be out of date.
            </Alert>
          )}

          {dashboard.is_trial && (
            <Alert
              tone="info"
              title={`Free trial · ${dashboard.minutes_included} free minutes included`}
              action={
                <button type="button" onClick={() => setShowTopupModal(true)} className={buttonClass('outline', 'sm')}>
                  Recharge wallet
                </button>
              }
            >
              {dashboard.minutes_remaining} {dashboard.minutes_remaining === 1 ? 'minute' : 'minutes'} remaining. Inbound and outbound calls both count towards the allowance.
            </Alert>
          )}

          {/* KPI cards */}
          <section aria-label="Billing summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {kpi('Wallet Balance', inr(balance), balance > 0 ? `About ${estimatedMinsLeft} min of calling left at ${inr(ratePerMin)}/min` : 'Add credits to keep calling', Wallet, 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white', 'bg-blue-100 text-ds-primary')}
            {kpi('Current Plan', dashboard.plan_name || '—', `${inr(ratePerMin)}/min (${inr(ratePerMin / 60)}/sec)`, Crown, 'border-violet-100 bg-gradient-to-br from-violet-50 via-white to-white', 'bg-violet-100 text-violet-700')}
            {kpi('Minutes Used', String(minutesUsed), hasLimit ? `of ${minutesIncluded} included` : 'No included minutes on this plan', Clock, 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white', 'bg-emerald-100 text-emerald-600')}
            {kpi('Total Calls', String(dashboard.total_calls ?? 0), `${dashboard.completed_calls ?? 0} completed`, PhoneCall, 'border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white', 'bg-orange-100 text-orange-500')}
          </section>

          {/* Usage overview + included minutes */}
          <div className="grid items-stretch gap-5 xl:grid-cols-2">
            <section className={card} aria-labelledby="usage-overview-title">
              <div className="flex items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true"><BarChart3 size={21} strokeWidth={1.75} /></span>
                <div className="min-w-0">
                  <h2 id="usage-overview-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Usage Overview</h2>
                  <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">Call minutes and cost by direction.{dashboard.billing_period ? ` ${dashboard.billing_period}` : ''}</p>
                </div>
              </div>
              {dashboard.breakdown ? (
                <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
                  <UsageDonut outbound={outMin} inbound={inMin} />
                  <div className="w-full min-w-0 flex-1">
                    <dl className="divide-y divide-ds-line">
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3 text-[15px]">
                        <dt className="flex items-center gap-2.5 font-medium text-ds-ink"><i className="h-3 w-3 rounded-full bg-ds-primary" />Outbound</dt>
                        <dd className="tabular-nums text-ds-ink">{outMin} min</dd>
                        <dd className="w-24 text-right tabular-nums text-ds-ink-2">{inr(outCost)}</dd>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3 text-[15px]">
                        <dt className="flex items-center gap-2.5 font-medium text-ds-ink"><i className="h-3 w-3 rounded-full bg-ds-accent" />Inbound</dt>
                        <dd className="tabular-nums text-ds-ink">{inMin} min</dd>
                        <dd className="w-24 text-right tabular-nums text-ds-ink-2">{inr(inCost)}</dd>
                      </div>
                    </dl>
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3.5">
                      <span className="flex items-center gap-2.5 text-[16px] font-semibold text-ds-ink"><Coins size={19} strokeWidth={1.75} className="text-ds-primary" aria-hidden="true" />Total Spent</span>
                      <span className="text-[20px] font-bold tabular-nums text-ds-ink">{inr(dashboard.total_spending ?? 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5">
                  <InlineNote>No usage breakdown is available yet.</InlineNote>
                </div>
              )}
            </section>

            <section className={card} aria-labelledby="included-title">
              <div className="flex items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700" aria-hidden="true"><Layers size={21} strokeWidth={1.75} /></span>
                <div className="min-w-0">
                  <h2 id="included-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Included Minutes</h2>
                  <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">How much of your plan’s minute allowance you have used.</p>
                </div>
              </div>
              {hasLimit ? (
                <div className="mt-6">
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="text-ds-ink">{minutesUsed} of {minutesIncluded} minutes used</span>
                    <span className="font-semibold tabular-nums text-ds-ink">{usagePercentage}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-ds-surface" role="presentation">
                    <div className={`h-full rounded-full transition-[width] duration-500 ${usagePercentage > 90 ? 'bg-ds-warning' : 'bg-ds-primary'}`} style={{ width: `${usagePercentage}%` }} />
                  </div>
                  <p className="mt-3 text-[14px] text-ds-ink-2">{dashboard.minutes_remaining} {dashboard.minutes_remaining === 1 ? 'minute' : 'minutes'} remaining.</p>
                </div>
              ) : (
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-4">
                  <Info size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ds-primary" aria-hidden="true" />
                  <p className="text-[15px] leading-relaxed text-ds-ink">This plan has no included-minute allowance, so there is no limit to measure usage against. Calls are charged to your wallet.</p>
                </div>
              )}
            </section>
          </div>

          {/* History */}
          <section className="rounded-2xl border border-ds-line bg-ds-bg shadow-sm" aria-label="Billing history">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-line px-4 py-4 sm:px-6">
              <div role="tablist" aria-label="Billing history" className="flex flex-wrap gap-2.5">
                <button role="tab" type="button" aria-selected={activeTab === 'usage'} onClick={() => setActiveTab('usage')} className={tabBtn(activeTab === 'usage')}>
                  <PhoneCall size={17} strokeWidth={1.75} aria-hidden="true" />Call Usage ({usage.length})
                </button>
                <button role="tab" type="button" aria-selected={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} className={tabBtn(activeTab === 'transactions')}>
                  <CreditCard size={17} strokeWidth={1.75} aria-hidden="true" />Wallet Transactions ({transactions.length})
                </button>
              </div>
              {activeCount >= LATEST && <span className="inline-flex items-center rounded-full bg-ds-surface px-3 py-1 text-[14px] font-semibold text-ds-ink-2">Latest {LATEST} shown</span>}
            </div>

            <div className="px-4 pb-5 pt-4 sm:px-6">
              {(usage.length > 0 || transactions.length > 0) && (
                <div className="relative mb-4 w-full sm:max-w-md">
                  <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ds-ink-3" aria-hidden="true" />
                  <input
                    type="search"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder={activeTab === 'usage' ? 'Search by customer or phone number…' : 'Search by description or provider…'}
                    aria-label={activeTab === 'usage' ? 'Search call usage' : 'Search wallet transactions'}
                    className="h-11 w-full rounded-xl border border-ds-line bg-ds-bg pl-10 pr-3 text-[15px] text-ds-ink outline-none transition placeholder:text-ds-ink-3 focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20 [&::-webkit-search-cancel-button]:hidden"
                  />
                </div>
              )}

              {activeTab === 'usage' ? (
                usage.length === 0 ? (
                  <EmptyState
                    icon={<PhoneCall size={18} strokeWidth={1.75} />}
                    title="No billed calls yet"
                    description="Minutes appear here once calls are made. Start a call from Leads or a campaign."
                  />
                ) : usageShown.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-ds-line-strong px-4 py-8 text-center text-[15px] text-ds-ink-2">No call usage matches “{historyQuery}”.</p>
                ) : (
                  <>
                    <div role="region" aria-label="Call usage table" tabIndex={0} className="hidden overflow-x-auto outline-none focus-visible:outline-2 focus-visible:outline-ds-primary xl:block">
                      <table className="w-full border-collapse text-[15px]">
                        <thead>
                          <tr className="bg-slate-50 [&>th:first-child]:rounded-l-xl [&>th:last-child]:rounded-r-xl">
                            <th scope="col" className={`${th} pl-4 text-left`}>Customer</th>
                            <th scope="col" className={`${th} text-left`}>Direction</th>
                            <th scope="col" className={`${th} text-right`}>Duration</th>
                            <th scope="col" className={`${th} text-right`}>Billed Minutes</th>
                            <th scope="col" className={`${th} text-right`}>Cost</th>
                            <th scope="col" className={`${th} text-left`}>Status</th>
                            <th scope="col" className={`${th} pr-4 text-left`}>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usageShown.map((item, idx) => {
                            const direction = item.service_type ? item.service_type.replace('_call', '') : ''
                            return (
                              <tr key={item.id || item.call_id || idx} className="border-b border-slate-100 last:border-b-0 hover:bg-ds-surface/60">
                                <td className="py-3 pl-4 pr-3">
                                  <div className="flex items-center gap-3">
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${avatarTone(item.customer_name)}`} aria-hidden="true">{initialsOf(item.customer_name)}</span>
                                    <div className="min-w-0">
                                      <span className="block truncate text-[16px] font-semibold text-ds-ink">{item.customer_name || '—'}</span>
                                      <span className="block text-[14px] tabular-nums text-ds-ink-2">{item.phone || item.call_id || '—'}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3">{dirBadge(direction)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-ds-ink">{durationText(item.duration_seconds)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-ds-ink">{typeof item.billed_minutes === 'number' ? item.billed_minutes : '—'}</td>
                                <td className="px-3 py-3 text-right font-medium tabular-nums text-ds-ink">{typeof item.customer_cost === 'number' ? inr(item.customer_cost) : '—'}</td>
                                <td className="px-3 py-3"><StatusBadge status={item.status} className="px-3 py-1 text-[14px]" /></td>
                                <td className="whitespace-nowrap py-3 pl-3 pr-4 text-ds-ink-2">{formatDateTime(item.created_at)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <ul className="space-y-3 xl:hidden" aria-label="Call usage">
                      {usageShown.map((item, idx) => {
                        const direction = item.service_type ? item.service_type.replace('_call', '') : ''
                        return (
                          <li key={item.id || item.call_id || idx} className="rounded-xl border border-ds-line p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${avatarTone(item.customer_name)}`} aria-hidden="true">{initialsOf(item.customer_name)}</span>
                                <div className="min-w-0">
                                  <p className="truncate text-[16px] font-semibold text-ds-ink">{item.customer_name || '—'}</p>
                                  <p className="text-[14px] tabular-nums text-ds-ink-2">{item.phone || item.call_id || '—'}</p>
                                </div>
                              </div>
                              <StatusBadge status={item.status} className="shrink-0 px-2.5 py-0.5 text-[14px]" />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">{dirBadge(direction)}<span className="text-[14px] text-ds-ink-2">{formatDateTime(item.created_at)}</span></div>
                            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                              {[
                                ['Duration', durationText(item.duration_seconds)],
                                ['Billed min', typeof item.billed_minutes === 'number' ? String(item.billed_minutes) : '—'],
                                ['Cost', typeof item.customer_cost === 'number' ? inr(item.customer_cost) : '—'],
                              ].map(([k, v]) => (
                                <div key={k} className="rounded-lg bg-ds-surface px-1 py-2">
                                  <dt className="text-[13px] text-ds-ink-2">{k}</dt>
                                  <dd className="text-[15px] font-semibold tabular-nums text-ds-ink">{v}</dd>
                                </div>
                              ))}
                            </dl>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )
              ) : transactions.length === 0 ? (
                <EmptyState
                  icon={<Wallet size={18} strokeWidth={1.75} />}
                  title="No wallet transactions yet"
                  description="Top-ups and call deductions will be listed here."
                  action={
                    <button type="button" onClick={() => setShowTopupModal(true)} className={buttonClass('outline', 'sm')}>
                      Add credits
                    </button>
                  }
                />
              ) : txShown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-ds-line-strong px-4 py-8 text-center text-[15px] text-ds-ink-2">No transactions match “{historyQuery}”.</p>
              ) : (
                <>
                  <div role="region" aria-label="Wallet transactions table" tabIndex={0} className="hidden overflow-x-auto outline-none focus-visible:outline-2 focus-visible:outline-ds-primary xl:block">
                    <table className="w-full border-collapse text-[15px]">
                      <thead>
                        <tr className="bg-slate-50 [&>th:first-child]:rounded-l-xl [&>th:last-child]:rounded-r-xl">
                          <th scope="col" className={`${th} pl-4 text-left`}>Type</th>
                          <th scope="col" className={`${th} text-left`}>Description</th>
                          <th scope="col" className={`${th} text-left`}>Provider</th>
                          <th scope="col" className={`${th} text-right`}>Amount</th>
                          <th scope="col" className={`${th} text-left`}>Status</th>
                          <th scope="col" className={`${th} pr-4 text-left`}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txShown.map((tx) => (
                          <tr key={tx.id} className="border-b border-slate-100 last:border-b-0 hover:bg-ds-surface/60">
                            <td className="py-3.5 pl-4 pr-3">
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold ${tx.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{tx.type === 'CREDIT' ? 'Credit' : 'Debit'}</span>
                            </td>
                            <td className="px-3 py-3.5 text-ds-ink">{tx.description || '—'}</td>
                            <td className="px-3 py-3.5 capitalize text-ds-ink-2">{tx.payment_provider ? tx.payment_provider.replace('_', ' ') : '—'}</td>
                            <td className={`whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums ${tx.type === 'CREDIT' ? 'text-emerald-700' : 'text-ds-ink'}`}>
                              {tx.type === 'CREDIT' ? '+' : '−'}
                              {inr(Math.abs(tx.amount))}
                            </td>
                            <td className="px-3 py-3.5"><StatusBadge status={tx.status} className="px-3 py-1 text-[14px]" /></td>
                            <td className="whitespace-nowrap py-3.5 pl-3 pr-4 text-ds-ink-2">{formatDateTime(tx.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="space-y-3 xl:hidden" aria-label="Wallet transactions">
                    {txShown.map((tx) => (
                      <li key={tx.id} className="rounded-xl border border-ds-line p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold ${tx.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{tx.type === 'CREDIT' ? 'Credit' : 'Debit'}</span>
                            <p className="mt-2 text-[15px] text-ds-ink">{tx.description || '—'}</p>
                          </div>
                          <p className={`shrink-0 text-[17px] font-semibold tabular-nums ${tx.type === 'CREDIT' ? 'text-emerald-700' : 'text-ds-ink'}`}>{tx.type === 'CREDIT' ? '+' : '−'}{inr(Math.abs(tx.amount))}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-ds-ink-2">
                          <StatusBadge status={tx.status} className="px-2.5 py-0.5 text-[14px]" />
                          <span className="capitalize">{tx.payment_provider ? tx.payment_provider.replace('_', ' ') : '—'}</span>
                          <span>{formatDateTime(tx.created_at)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {/* Top-up dialog. Submits through the same handleTopup as before. */}
      <Dialog
        open={showTopupModal}
        onClose={closeTopup}
        title="Recharge wallet"
        description="Add credits for uninterrupted AI calling."
        footer={
          <>
            <button type="button" onClick={closeTopup} className={buttonClass('outline', 'md')}>
              Cancel
            </button>
            <button type="submit" form="topup-form" disabled={toppingUp} className={buttonClass('primary', 'md')}>
              {toppingUp ? 'Opening payment…' : 'Confirm recharge'}
            </button>
          </>
        }
      >
        <form id="topup-form" onSubmit={handleTopup} className="space-y-5">
          <fieldset>
            <legend className="text-[13px] font-medium text-ds-ink">Recharge amount</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[250, 500, 1000, 2500].map((amt) => {
                const selected = topupAmount === amt && !customAmount
                return (
                  <button
                    key={amt}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setTopupAmount(amt)
                      setCustomAmount('')
                    }}
                    className={`h-9 rounded-lg border text-[13px] font-medium tabular-nums transition-colors ${
                      selected ? 'border-ds-primary bg-ds-primary-soft text-ds-primary' : 'border-ds-line bg-ds-bg text-ds-ink hover:border-ds-line-strong hover:bg-ds-surface'
                    }`}
                  >
                    ₹{amt}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Field label="Or enter a custom amount (₹)" hint="Minimum ₹50.">
            <Input type="number" min="50" step="50" placeholder="Enter amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
          </Field>

          <div className="flex items-center justify-between rounded-lg bg-ds-surface px-3.5 py-3 text-[13px] text-ds-ink-2">
            <span>Estimated calling time</span>
            <span className="font-medium tabular-nums text-ds-ink">About {Math.floor(topupEffective / ratePerMin)} minutes</span>
          </div>
        </form>
      </Dialog>
    </AppLayout>
  )
}

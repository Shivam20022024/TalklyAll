'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi } from '@/lib/api'
import { 
  Wallet, 
  CreditCard, 
  PhoneCall, 
  Clock, 
  TrendingUp, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  ArrowDownLeft,
  ArrowUpRight,
  PhoneIncoming,
  PhoneOutgoing,
  X,
  Loader2, 
  Sparkles,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react'

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

export default function BillingPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [usage, setUsage] = useState<UsageRecord[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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
    } catch (err) {
      console.error('Failed to load billing data', err)
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
        name: 'Voice AI',
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
            alert(`₹${amountToCharge.toFixed(2)} credited successfully to your Voice AI wallet!`)
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

  return (
    <AppLayout title="Billing & Usage">
      {/* Page Header */}
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Management / Billing & Usage</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Billing & Usage</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor real-time voice AI minute consumption, live account balance, and transaction history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowTopupModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 transition-all"
          >
            <Plus size={15} />
            <span>Add Credits</span>
          </button>
        </div>
      </section>

      {/* Trial Alert Banner if in Trial Mode */}
      {dashboard?.is_trial && (
        <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                Free Trial Active • {dashboard.minutes_included} Free Minutes Included
              </p>
              <p className="text-xs text-muted-foreground">
                You get {dashboard.minutes_included} minutes of free AI calling (any mix of inbound/outbound) to test things out — {dashboard.minutes_remaining} remaining.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowTopupModal(true)}
            className="rounded-lg border border-primary bg-background px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
          >
            Recharge Wallet
          </button>
        </div>
      )}

      {/* Main KPI Cards Grid */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Available Wallet Balance */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Wallet Balance
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight ${balance <= 0 ? 'text-amber-500' : 'text-foreground'}`}>
              ₹{balance.toFixed(2)}
            </span>
            <span className="text-xs font-medium text-muted-foreground">INR</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <Zap size={13} className="text-primary" />
            <span>~<strong>{estimatedMinsLeft} mins</strong> call time remaining</span>
          </p>
        </div>

        {/* Card 2: Current Subscription Plan */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Current Plan
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {dashboard?.plan_name || 'Free Trial Starter'}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              Active
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Per-Second Rate: <strong>₹{(ratePerMin / 60).toFixed(2)}/sec</strong> (₹{ratePerMin.toFixed(2)}/min)
          </p>
        </div>

        {/* Card 3: Minute Consumption */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Minutes Consumed
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              {minutesUsed}
            </span>
            <span className="text-xs text-muted-foreground">
              / {minutesIncluded > 0 ? `${minutesIncluded} mins` : 'Unlimited'}
            </span>
          </div>
          {/* Progress Bar */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                usagePercentage > 90 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.max(5, usagePercentage)}%` }}
            />
          </div>
        </div>

        {/* Card 4: Total Calls & Spending */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Call Volume
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <PhoneCall size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              {dashboard?.total_calls ?? 0}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              calls ({dashboard?.completed_calls ?? 0} completed)
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Connected Calls: <strong>{dashboard?.completed_calls ?? 0} answered</strong>
          </p>
        </div>
      </section>

      {/* Inbound vs Outbound Breakdown */}
      {dashboard?.breakdown && (
        <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Outbound Calls
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PhoneOutgoing size={16} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">
                {dashboard.breakdown.outbound?.minutes ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">mins used</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ₹{(dashboard.breakdown.outbound?.spending ?? 0).toFixed(2)} spent • calls you placed
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Inbound Calls
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <PhoneIncoming size={16} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">
                {dashboard.breakdown.inbound?.minutes ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">mins used</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ₹{(dashboard.breakdown.inbound?.spending ?? 0).toFixed(2)} spent • calls customers placed to you
            </p>
          </div>
        </section>
      )}

      {/* Tabs & Detailed Tables Section */}
      <section className="mt-8 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('usage')}
              className={`pb-1 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'usage'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Call Usage & Consumption ({usage.length})
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`pb-1 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'transactions'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Wallet Transactions ({transactions.length})
            </button>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Billing Period: {dashboard?.billing_period}
          </span>
        </div>

        {/* Content Tab 1: Call Usage */}
        {activeTab === 'usage' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-3 pl-6 pr-4">Recipient / Customer</th>
                  <th className="py-3 px-4">Direction</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Billed Minutes</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 pr-6 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 size={18} className="animate-spin text-primary" />
                        <span>Loading usage records...</span>
                      </div>
                    </td>
                  </tr>
                ) : usage.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      No calls billed yet. Trigger a call from the Leads or Quick Call modal to see minute logs.
                    </td>
                  </tr>
                ) : (
                  usage.map((item, idx) => (
                    <tr key={item.id || item.call_id || idx} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 pl-6 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {item.customer_name || 'Valued Customer'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.phone || item.call_id || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary capitalize">
                          {item.service_type?.replace('_call', '') || 'outbound'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-medium">
                        {item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : '< 5s'}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {item.duration_seconds && item.duration_seconds >= 60
                              ? `${Math.floor(item.duration_seconds / 60)}m ${Math.round(item.duration_seconds % 60)}s`
                              : `${Math.round(item.duration_seconds || 0)}s`}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {item.billed_minutes ? `${item.billed_minutes} min` : `${((item.duration_seconds || 0) / 60).toFixed(2)} min`}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={13} />
                          <span>{item.status || 'Billed'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 pr-6 text-right text-xs text-muted-foreground">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : 'Recent'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Content Tab 2: Wallet Transactions */}
        {activeTab === 'transactions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-3 pl-6 pr-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Provider / Source</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 pr-6 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 size={18} className="animate-spin text-primary" />
                        <span>Loading transactions...</span>
                      </div>
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      No wallet transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 pl-6 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            tx.type === 'CREDIT'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {tx.type === 'CREDIT' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {tx.description || (tx.type === 'CREDIT' ? 'Wallet Top-up' : 'Call Minute Deduction')}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground capitalize">
                        {tx.payment_provider?.replace('_', ' ') || 'Wallet'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-sm">
                        <span className={tx.type === 'CREDIT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}>
                          {tx.type === 'CREDIT' ? '+' : '-'}₹{Math.abs(tx.amount).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground capitalize">
                          {tx.status?.toLowerCase() || 'completed'}
                        </span>
                      </td>
                      <td className="py-3.5 pr-6 text-right text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top-Up Recharge Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Recharge Wallet</h2>
                  <p className="text-xs text-muted-foreground">Add credits for uninterrupted AI calling</p>
                </div>
              </div>
              <button 
                onClick={() => setShowTopupModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTopup} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Select Recharge Amount
                </label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[250, 500, 1000, 2500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setTopupAmount(amt)
                        setCustomAmount('')
                      }}
                      className={`rounded-lg py-2.5 text-xs font-bold border transition-all ${
                        topupAmount === amt && !customAmount
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-foreground hover:bg-muted'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Or Custom Amount (₹)
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2.5 text-sm font-bold text-muted-foreground">₹</span>
                  <input
                    type="number"
                    min="50"
                    step="50"
                    placeholder="Enter custom amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-center justify-between">
                <span>Estimated Voice AI Minutes:</span>
                <span className="font-bold text-foreground">
                  ~{Math.floor((customAmount ? parseFloat(customAmount) || 0 : topupAmount) / ratePerMin)} Minutes
                </span>
              </div>

              <button
                type="submit"
                disabled={toppingUp}
                className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:opacity-95 disabled:opacity-50 transition-all"
              >
                {toppingUp ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Recharge'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

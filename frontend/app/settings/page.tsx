'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import {
  Building,
  Webhook,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  PhoneCall,
  Plus,
  X,
  ExternalLink,
  Check,
  ShieldCheck,
  Radio,
  Key
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'

type TelephonyProviderKey = 'twilio' | 'exotel' | 'plivo' | 'bolna'

interface ProviderMeta {
  id: TelephonyProviderKey
  unsupported?: boolean
  name: string
  tagline: string
  color: string
  badgeColor: string
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'twilio', name: 'Twilio', tagline: 'Global SMS & Voice Carrier', color: 'border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400', badgeColor: 'bg-red-500/10 text-red-600 dark:text-red-400', unsupported: true },
  { id: 'exotel', name: 'Exotel', tagline: "India's #1 Virtual Telecom Carrier", color: 'border-blue-500/40 bg-blue-500/5 text-blue-600 dark:text-blue-400', badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', unsupported: true },
  { id: 'plivo', name: 'Plivo', tagline: 'High-Volume Voice & SIP Trunking', color: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400', badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { id: 'bolna', name: 'Bolna Direct', tagline: 'Native Ultra-Low Latency SIP', color: 'border-purple-500/40 bg-purple-500/5 text-purple-600 dark:text-purple-400', badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' }
]

export default function SettingsPage() {
  const { refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [webhookSaveSuccess, setWebhookSaveSuccess] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null)

  // Company Profile State
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('general_sales')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [planType, setPlanType] = useState('trial')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Telephony State (Haira-inspired Call Settings)
  const [telephonyMode, setTelephonyMode] = useState<'shared' | 'custom'>('shared')
  const [sharedNumber, setSharedNumber] = useState('+918065535758')
  const [sharedLabel, setSharedLabel] = useState('+91 80 6553 5758 (Voice AI Plivo shared number)')
  const [connectedLine, setConnectedLine] = useState<any>(null)
  const [selectedProvider, setSelectedProvider] = useState<TelephonyProviderKey>('plivo')
  const [inboundRouting, setInboundRouting] = useState({ mode: 'ai_agent', fallback_number: '' })
  const [inboundWebhookUrl, setInboundWebhookUrl] = useState('')

  // WhatsApp Automation State (Meta WhatsApp Cloud API)
  const [whatsappEnabled, setWhatsappEnabled] = useState(true)
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('')
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('')
  const [whatsappHasToken, setWhatsappHasToken] = useState(false)
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)
  const [testingWhatsapp, setTestingWhatsapp] = useState(false)
  const [testWhatsappPhone, setTestWhatsappPhone] = useState('')
  const [whatsappSaveSuccess, setWhatsappSaveSuccess] = useState(false)
  const [whatsappTestResult, setWhatsappTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // LiveKit Cloud Settings
  const [livekitUrl, setLivekitUrl] = useState('')
  const [livekitApiKey, setLivekitApiKey] = useState('')
  const [livekitApiSecret, setLivekitApiSecret] = useState('')
  const [livekitHasSecret, setLivekitHasSecret] = useState(false)
  const [savingLivekit, setSavingLivekit] = useState(false)
  const [livekitSaveSuccess, setLivekitSaveSuccess] = useState(false)

  // Connect Line Modal State
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connectingLine, setConnectingLine] = useState(false)
  const [disconnectingLine, setDisconnectingLine] = useState(false)
  const [formPhone, setFormPhone] = useState('')
  const [formAccountSid, setFormAccountSid] = useState('')
  const [formAuthToken, setFormAuthToken] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formInboundMode, setFormInboundMode] = useState('ai_agent')
  const [formFallbackNumber, setFormFallbackNumber] = useState('')

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [compRes, telRes, waRes, lkRes] = await Promise.all([
          fetchApi('/api/v1/auth/company-settings'),
          fetchApi('/api/v1/telephony/settings').catch(() => null),
          fetchApi('/api/v1/whatsapp/settings').catch(() => null),
          fetchApi('/api/v1/livekit/settings').catch(() => null)
        ])

        if (compRes?.company) {
          setCompanyName(compRes.company.name || '')
          setIndustry(compRes.company.industry || 'general_sales')
          setWebhookUrl(compRes.company.webhook_url || '')
          setPlanType(compRes.company.plan_type || 'trial')
        }

        if (waRes?.config) {
          setWhatsappEnabled(Boolean(waRes.config.enabled))
          setWhatsappPhoneNumberId(waRes.config.phone_number_id || '')
          setWhatsappHasToken(Boolean(waRes.config.has_token))
          if (waRes.config.masked_token) {
            setWhatsappAccessToken(waRes.config.masked_token)
          }
        }

        if (lkRes?.config) {
          setLivekitUrl(lkRes.config.url || '')
          setLivekitApiKey(lkRes.config.api_key || '')
          setLivekitHasSecret(Boolean(lkRes.config.has_secret))
          if (lkRes.config.masked_secret) {
            setLivekitApiSecret(lkRes.config.masked_secret)
          }
        }

        if (telRes) {
          setTelephonyMode(telRes.mode || 'shared')
          setSharedNumber(telRes.shared_number || '+918031830100')
          setSharedLabel(telRes.shared_number_label || '+91 80 3183 0100 (Voice AI shared number)')
          setConnectedLine(telRes.connected_line || null)
          if (telRes.inbound_webhook_url) {
            setInboundWebhookUrl(telRes.inbound_webhook_url)
          }
          if (telRes.connected_line?.provider && PROVIDERS.some(p => p.id === telRes.connected_line.provider)) {
            setSelectedProvider(telRes.connected_line.provider as TelephonyProviderKey)
          }
          if (telRes.inbound_routing) {
            setInboundRouting(telRes.inbound_routing)
          }
        }
      } catch (e) {
        console.error('Failed to load company settings', e)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)
    try {
      await fetchApi('/api/v1/auth/company-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          name: companyName,
          industry,
          webhook_url: webhookUrl
        })
      })
      try {
        localStorage.setItem('talkly_selected_industry', industry)
      } catch { }
      await refreshUser()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e: any) {
      alert(e.message || 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingWhatsapp(true)
    setWhatsappSaveSuccess(false)
    try {
      await fetchApi('/api/v1/whatsapp/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: whatsappEnabled,
          phone_number_id: whatsappPhoneNumberId,
          access_token: whatsappAccessToken.startsWith('••••') ? undefined : whatsappAccessToken
        })
      })
      setWhatsappSaveSuccess(true)
      setWhatsappHasToken(Boolean(whatsappAccessToken))
      setTimeout(() => setWhatsappSaveSuccess(false), 3000)
    } catch (e: any) {
      alert(e.message || 'Failed to save WhatsApp settings')
    } finally {
      setSavingWhatsapp(false)
    }
  }

  const handleTestWhatsapp = async () => {
    if (!testWhatsappPhone) return alert('Please enter a WhatsApp phone number with country code (e.g. +919877082909)')
    setTestingWhatsapp(true)
    setWhatsappTestResult(null)
    try {
      if (whatsappPhoneNumberId && whatsappAccessToken && !whatsappAccessToken.startsWith('••••')) {
        await fetchApi('/api/v1/whatsapp/settings', {
          method: 'PATCH',
          body: JSON.stringify({
            enabled: whatsappEnabled,
            phone_number_id: whatsappPhoneNumberId,
            access_token: whatsappAccessToken
          })
        })
        setWhatsappHasToken(true)
      }

      const res = await fetchApi('/api/v1/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({
          phone: testWhatsappPhone,
          phone_number_id: whatsappPhoneNumberId,
          access_token: whatsappAccessToken.startsWith('••••') ? undefined : whatsappAccessToken
        })
      })
      setWhatsappTestResult({ success: true, message: res.message || 'Test message sent successfully!' })
    } catch (e: any) {
      setWhatsappTestResult({ success: false, message: e.message || 'Failed to send WhatsApp message' })
    } finally {
      setTestingWhatsapp(false)
    }
  }

  const handleSaveLivekit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingLivekit(true)
    setLivekitSaveSuccess(false)
    try {
      await fetchApi('/api/v1/livekit/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          url: livekitUrl,
          api_key: livekitApiKey,
          api_secret: livekitApiSecret.startsWith('••••') ? undefined : livekitApiSecret
        })
      })
      setLivekitSaveSuccess(true)
      setLivekitHasSecret(Boolean(livekitApiSecret))
      setTimeout(() => setLivekitSaveSuccess(false), 3000)
    } catch (e: any) {
      alert(e.message || 'Failed to save LiveKit settings')
    } finally {
      setSavingLivekit(false)
    }
  }

  const handleSaveWebhook = async () => {
    setSavingWebhook(true)
    setWebhookSaveSuccess(false)
    try {
      await fetchApi('/api/v1/auth/company-settings', {
        method: 'PATCH',
        body: JSON.stringify({ webhook_url: webhookUrl })
      })
      await refreshUser()
      setWebhookSaveSuccess(true)
      setTimeout(() => setWebhookSaveSuccess(false), 3000)
    } catch (e: any) {
      alert(e.message || 'Failed to save webhook settings')
    } finally {
      setSavingWebhook(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!webhookUrl) return alert('Please enter a webhook URL first.')
    setTestingWebhook(true)
    setWebhookTestResult(null)
    try {
      const res = await fetchApi('/api/v1/settings/test-webhook', {
        method: 'POST',
        body: JSON.stringify({ webhook_url: webhookUrl })
      })
      setWebhookTestResult(res.result)
      if (res.result?.success) {
        // Auto-persist successfully verified webhook URL
        try {
          await fetchApi('/api/v1/auth/company-settings', {
            method: 'PATCH',
            body: JSON.stringify({ webhook_url: webhookUrl })
          })
          await refreshUser()
          setWebhookSaveSuccess(true)
          setTimeout(() => setWebhookSaveSuccess(false), 3000)
        } catch { }
      }
    } catch (e: any) {
      setWebhookTestResult({ success: false, response_text: e.message || 'Network error' })
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleOpenConnectModal = (providerId?: TelephonyProviderKey) => {
    if (providerId) setSelectedProvider(providerId)
    setFormPhone('')
    setFormAccountSid('')
    setFormAuthToken('')
    setFormApiKey('')
    setFormInboundMode('ai_agent')
    setFormFallbackNumber('')
    setShowConnectModal(true)
  }

  const handleConnectLine = async (e: React.FormEvent) => {
    e.preventDefault()
    setConnectingLine(true)
    try {
      const res = await fetchApi('/api/v1/telephony/connect', {
        method: 'POST',
        body: JSON.stringify({
          provider: selectedProvider,
          phone_number: formPhone,
          account_sid: formAccountSid,
          auth_token: formAuthToken,
          api_key: formApiKey,
          inbound_mode: formInboundMode,
          fallback_number: formFallbackNumber
        })
      })

      if (res?.status === 'success') {
        setConnectedLine(res.line)
        setTelephonyMode('custom')
        setInboundRouting({ mode: formInboundMode, fallback_number: formFallbackNumber })
        setShowConnectModal(false)
      } else {
        throw new Error(res?.message || 'Failed to connect line')
      }
    } catch (err: any) {
      alert(err.message || 'Failed to connect phone line')
    } finally {
      setConnectingLine(false)
    }
  }

  const handleDisconnectLine = async () => {
    if (!confirm('Are you sure you want to disconnect this line and revert to the Voice AI shared number pool?')) return
    setDisconnectingLine(true)
    try {
      await fetchApi('/api/v1/telephony/disconnect', { method: 'POST' })
      setConnectedLine(null)
      setTelephonyMode('shared')
    } catch (err: any) {
      alert(err.message || 'Failed to disconnect line')
    } finally {
      setDisconnectingLine(false)
    }
  }

  const isCurrentProviderConnected = connectedLine && connectedLine.provider === selectedProvider

  return (
    <AppLayout title="Settings">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Management / Settings</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Workspace Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">Configure your company profile, default industry, call settings, and CRM webhooks.</p>
        </div>
      </section>

      {loading ? (
        <div className="mt-8 flex justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      ) : (
        <div className="mt-6 space-y-6 max-w-4xl">
          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={16} /> Workspace settings updated successfully!
            </div>
          )}

          {/* Company Profile & Industry Form */}
          <form onSubmit={handleSave} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-bold flex items-center gap-2 text-foreground mb-4">
              <Building size={18} className="text-primary" /> Company Profile & Use Case
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Company / Brand Name</label>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Acme Health Solutions"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Default Industry / Vertical</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="general_sales">B2B Sales & Outbound Services</option>
                  <option value="healthcare">Healthcare & Medical Clinics</option>
                  <option value="edtech">EdTech, Academies & Coaching</option>
                  <option value="bfsi">BFSI (Loans & Insurance Advisory)</option>
                  <option value="real_estate">Real Estate & Developers</option>
                  <option value="collections">Collections (Loan & EMI Recovery)</option>
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">Shapes AI persona, objection handling, and prompt recommendations.</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Account Plan: <strong className="uppercase text-foreground font-semibold">{planType}</strong></span>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>

          {/* ========================================================================= */}
          {/* CALL SETTINGS & DEDICATED PHONE NUMBERS (HAIRA-AI REFERENCE ARCHITECTURE) */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <PhoneCall size={20} className="text-primary" /> Call Settings
                </h2>
                {telephonyMode === 'custom' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Dedicated Carrier Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    Shared Pool Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose the number and phone provider used to call your leads. This is optional: with no provider connected, calls go out from the Voice AI shared number.
              </p>
            </div>

            {/* Current Caller ID Banner */}
            <div className="rounded-xl border border-border/80 bg-background/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Phone size={20} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {telephonyMode === 'custom' ? 'Your Dedicated Caller ID' : 'Active Caller ID'}
                  </div>
                  <div className="mt-0.5 text-base font-bold text-foreground">
                    Leads are called from <span className="font-mono text-primary">{telephonyMode === 'custom' && connectedLine ? connectedLine.phone_number : sharedLabel}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {telephonyMode === 'custom' && connectedLine ? (
                      `Connected via ${connectedLine.provider?.toUpperCase()} • Inbound calls route to ${inboundRouting.mode === 'ai_agent' ? '24/7 AI Receptionist' : 'Human Forwarding Number'}`
                    ) : (
                      'You have not connected a phone provider. Calls use the Voice AI shared number.'
                    )}
                  </div>
                </div>
              </div>

              {telephonyMode === 'custom' && (
                <button
                  type="button"
                  onClick={handleDisconnectLine}
                  disabled={disconnectingLine}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors self-start sm:self-center"
                >
                  {disconnectingLine ? 'Disconnecting...' : 'Switch to Shared Number'}
                </button>
              )}
            </div>

            {/* "Do you need your own line?" Educational Box (Matching Haira) */}
            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <h3 className="text-sm font-bold text-foreground mb-3">Do you need your own line?</h3>
              <div className="grid gap-6 md:grid-cols-2 text-xs">
                {/* Column 1: Keep Shared */}
                <div className="space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Keep the Voice AI shared number when:
                  </div>
                  <ul className="space-y-1.5 text-muted-foreground pl-3 list-disc">
                    <li>You are happy for leads to see a Voice AI shared number. There is nothing to set up.</li>
                    <li>You do not have an existing account with a telecom provider.</li>
                    <li>You want call minutes deducted simply from your Voice AI prepaid wallet (₹12/min).</li>
                  </ul>
                </div>

                {/* Column 2: Connect Own Line */}
                <div className="space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Connect your own line when:
                  </div>
                  <ul className="space-y-1.5 text-muted-foreground pl-3 list-disc">
                    <li>Leads should see your company's official registered number on Truecaller & Caller ID.</li>
                    <li>You want calls billed directly through your own telecom provider contract.</li>
                    <li>You call in India and want to show your existing company number. In India a call can only show a number owned by the provider that places it, so use the provider that owns the number.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Provider Selection Cards */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Telecom Carrier</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PROVIDERS.map((p) => {
                  const isSelected = selectedProvider === p.id
                  const hasLine = connectedLine && connectedLine.provider === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProvider(p.id)}
                      className={`flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-all ${isSelected
                        ? 'border-primary ring-1 ring-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:bg-muted/50'
                        }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-bold text-sm text-foreground">{p.name}</span>
                        {p.unsupported ? (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            Coming soon
                          </span>
                        ) : hasLine ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            1 line
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">No lines</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{p.tagline}</p>
                      {p.unsupported && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Can't place live calls yet - Plivo only</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Active Provider Lines Section */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    {PROVIDERS.find(p => p.id === selectedProvider)?.name} lines
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Phone lines registered with your {PROVIDERS.find(p => p.id === selectedProvider)?.name} account.
                  </p>
                </div>

                {!isCurrentProviderConnected && !PROVIDERS.find(p => p.id === selectedProvider)?.unsupported && (
                  <button
                    type="button"
                    onClick={() => handleOpenConnectModal(selectedProvider)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm"
                  >
                    <Plus size={14} /> Add {PROVIDERS.find(p => p.id === selectedProvider)?.name} line
                  </button>
                )}
              </div>

              {isCurrentProviderConnected ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/80 bg-background/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                        <PhoneCall size={18} />
                      </span>
                      <div>
                        <div className="font-mono text-sm font-bold text-foreground">{connectedLine.phone_number}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>Account: {connectedLine.account_sid_masked || 'Active'}</span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <Check size={12} /> Live for Outbound & Inbound
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisconnectLine}
                      disabled={disconnectingLine}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Disconnect Line
                    </button>
                  </div>

                  {inboundWebhookUrl && selectedProvider === 'plivo' && (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Plivo Inbound Webhook (Answer URL)</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(inboundWebhookUrl)
                            alert('Copied Inbound Webhook URL to clipboard!')
                          }}
                          className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                        >
                          Copy Answer URL
                        </button>
                      </div>
                      <code className="block rounded bg-background p-2 font-mono text-[11px] text-muted-foreground border border-border/50 break-all select-all">
                        {inboundWebhookUrl}
                      </code>
                      <p className="text-[11px] text-muted-foreground">
                        In your Plivo Console (Voice &gt; Applications), attach your phone number to an application with this URL set as the <strong>Primary Answer URL</strong> (HTTP POST) so customers who call back connect directly to your Voice AI Agent.
                      </p>
                    </div>
                  )}
                </div>
              ) : PROVIDERS.find(p => p.id === selectedProvider)?.unsupported ? (
                <div className="py-6 px-4 text-center border border-dashed border-amber-500/30 rounded-lg text-xs space-y-2 bg-amber-500/5">
                  <p className="font-semibold text-foreground">
                    {PROVIDERS.find(p => p.id === selectedProvider)?.name} integration is on the roadmap
                  </p>
                  <p className="text-muted-foreground max-w-md mx-auto text-[11px]">
                    Voice AI currently uses high-volume Plivo SIP trunking for sub-400ms bidirectional streaming and guaranteed Truecaller CLI across India. To connect your company's official registered Caller ID today, please select <strong>Plivo</strong> above.
                  </p>
                </div>
              ) : selectedProvider === 'bolna' ? (
                <div className="py-6 px-4 text-center border border-dashed border-purple-500/30 rounded-lg text-xs space-y-2 bg-purple-500/5">
                  <p className="font-semibold text-foreground">Bolna Direct Native SIP</p>
                  <p className="text-muted-foreground max-w-md mx-auto text-[11px]">
                    Bolna Direct is integrated with Voice AI's shared carrier infrastructure. To connect a custom company phone line with dedicated Caller ID, select <strong>Plivo</strong>.
                  </p>
                </div>
              ) : (
                <div className="py-6 text-center border border-dashed border-border rounded-lg text-xs text-muted-foreground space-y-1">
                  <p>No active lines connected for {PROVIDERS.find(p => p.id === selectedProvider)?.name}.</p>
                  <p className="text-[11px]">Click "Add Plivo line" above to enter your Auth ID, Auth Token, and dedicated phone number.</p>
                </div>
              )}
            </div>
          </div>

          {/* Outbound Webhook (CRM & Zapier Sync) */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                <Webhook size={18} className="text-primary" /> Outbound Webhook (CRM & Zapier Sync)
              </h2>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">Automated</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your webhook URL (Zapier, Make.com, HubSpot, Google Sheets, or custom backend). Every completed AI call will post lead data, call score, sentiment, and transcript in real-time.
            </p>

            {webhookSaveSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={15} /> Webhook destination URL saved successfully!
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Webhook Destination URL</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.zapier.com/hooks/catch/..."
                    className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSaveWebhook}
                    disabled={savingWebhook}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                    style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                  >
                    {savingWebhook ? <Loader2 size={14} className="animate-spin text-white" /> : <Save size={14} className="text-white" />}
                    <span>{savingWebhook ? 'Saving...' : 'Save Webhook'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook || !webhookUrl}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                  >
                    {testingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    <span>{testingWebhook ? 'Sending...' : 'Test Ping'}</span>
                  </button>
                </div>
              </div>

              {webhookTestResult && (
                <div className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${webhookTestResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                  {webhookTestResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                  <div>
                    <div className="font-semibold">{webhookTestResult.success ? `Webhook Responded HTTP ${webhookTestResult.status_code}` : 'Webhook Test Failed'}</div>
                    <div className="mt-1 opacity-80 font-mono text-[11px] truncate max-w-lg">{webhookTestResult.response_text || (webhookTestResult.success ? 'Success response received.' : 'Could not reach server')}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp Automation (Meta WhatsApp Cloud API) */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.02 18.09c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.106 8.106 0 01-1.24-4.32c0-4.5 3.66-8.16 8.16-8.16 2.18 0 4.23.85 5.77 2.39a8.103 8.103 0 012.39 5.77c-.01 4.5-3.67 8.16-8.16 8.16zm4.47-6.11c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.53.07-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.19 3.7.59.25 1.05.4 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.18-.47-.3z" />
                </svg>
                WhatsApp Automated Reminders (Meta Cloud API)
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                1,000 Free Msgs/mo Included
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              When a prospect agrees to attend a demo session, clinic consultation, or asks for WhatsApp details during an AI call, Voice AI automatically dispatches the confirmation, meeting link, and brochure directly to their WhatsApp.
            </p>

            {whatsappSaveSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={15} /> WhatsApp configuration saved successfully!
              </div>
            )}

            <form onSubmit={handleSaveWhatsapp} className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-background shadow-xs">
                <div>
                  <div className="text-sm font-bold text-foreground">Enable Automatic WhatsApp Dispatch</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Auto-send WhatsApp reminders immediately after calls conclude.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                  style={{ backgroundColor: whatsappEnabled ? '#059669' : '#9ca3af' }}
                >
                  <span
                    className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out"
                    style={{ transform: whatsappEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
                  />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-foreground">Meta Phone Number ID</label>
                  <input
                    type="text"
                    value={whatsappPhoneNumberId}
                    onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                    placeholder="e.g. 1406119645915680"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Found under WhatsApp &gt; API Setup on developers.facebook.com</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground">Meta Permanent Access Token</label>
                  <input
                    type="password"
                    value={whatsappAccessToken}
                    onChange={(e) => setWhatsappAccessToken(e.target.value)}
                    placeholder="EAAGxxxxxxxxxxxxxxxxxxxx"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{whatsappHasToken ? '✓ Token configured securely. Re-enter to overwrite.' : 'System User Token from Meta Business Manager.'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Need credentials? Get them in 2 minutes for free at <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-primary font-semibold underline">developers.facebook.com</a>.
                </span>
                <button
                  type="submit"
                  disabled={savingWhatsapp}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                  style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                >
                  {savingWhatsapp ? <Loader2 size={14} className="animate-spin text-white" /> : <Save size={14} className="text-white" />}
                  <span>{savingWhatsapp ? 'Saving...' : 'Save WhatsApp Settings'}</span>
                </button>
              </div>
            </form>

            {/* Test WhatsApp Ping Box */}
            <div className="mt-5 pt-4 border-t border-border">
              <label className="text-xs font-bold text-foreground block mb-1.5">
                Send a Live Test WhatsApp Message
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testWhatsappPhone}
                  onChange={(e) => setTestWhatsappPhone(e.target.value)}
                  placeholder="+919877082909"
                  className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-mono text-foreground outline-none focus:border-primary shadow-xs"
                />
                <button
                  type="button"
                  onClick={handleTestWhatsapp}
                  disabled={testingWhatsapp || !testWhatsappPhone}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                  style={{ backgroundColor: '#059669', color: '#ffffff' }}
                >
                  {testingWhatsapp ? <Loader2 size={14} className="animate-spin text-white" /> : <Send size={14} className="text-white" />}
                  <span>{testingWhatsapp ? 'Sending...' : 'Send Test WhatsApp'}</span>
                </button>
              </div>

              {whatsappTestResult && (
                <div
                  className="mt-3 p-3.5 rounded-lg border text-xs font-semibold flex items-start gap-2.5 shadow-xs"
                  style={
                    whatsappTestResult.success
                      ? { backgroundColor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }
                      : { backgroundColor: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }
                  }
                >
                  {whatsappTestResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-700" /> : <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-700" />}
                  <span>{whatsappTestResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* LiveKit Cloud Real-Time Voice Engine */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                <Radio size={18} className="text-primary" /> LiveKit Cloud (Real-Time Voice Engine)
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary border border-primary/20">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                10,000 Free Mins/mo Included
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Powers ultra-low-latency (&lt;300ms) WebRTC voice calls and in-browser testing with sub-50ms instant interruption (barge-in).
            </p>

            {livekitSaveSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={15} /> LiveKit configuration saved successfully!
              </div>
            )}

            <form onSubmit={handleSaveLivekit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground">LiveKit WebSocket Server URL</label>
                <input
                  type="text"
                  value={livekitUrl}
                  onChange={(e) => setLivekitUrl(e.target.value)}
                  placeholder="wss://your-project.livekit.cloud"
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">Found in LiveKit Cloud project settings at cloud.livekit.io</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-foreground">LiveKit API Key</label>
                  <input
                    type="text"
                    value={livekitApiKey}
                    onChange={(e) => setLivekitApiKey(e.target.value)}
                    placeholder="APIxxxxxxxxxxxx"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground">LiveKit API Secret</label>
                  <input
                    type="password"
                    value={livekitApiSecret}
                    onChange={(e) => setLivekitApiSecret(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{livekitHasSecret ? '✓ Secret configured securely.' : 'Generated in LiveKit Cloud Keys tab.'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Need a free LiveKit Cloud account? Get 10,000 free mins at <a href="https://cloud.livekit.io" target="_blank" rel="noreferrer" className="text-primary font-semibold underline">cloud.livekit.io</a>.
                </span>
                <button
                  type="submit"
                  disabled={savingLivekit}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                  style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                >
                  {savingLivekit ? <Loader2 size={14} className="animate-spin text-white" /> : <Save size={14} className="text-white" />}
                  <span>{savingLivekit ? 'Saving...' : 'Save LiveKit Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONNECT LINE MODAL                                                        */}
      {/* ========================================================================= */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Connect {PROVIDERS.find(p => p.id === selectedProvider)?.name} Line
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Register your carrier virtual number to use as your company's dedicated Caller ID.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConnectLine} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Dedicated Phone Number (E.164 with Country Code)
                </label>
                <input
                  required
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. +918069001234 or +15550123456"
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">The number purchased on your {PROVIDERS.find(p => p.id === selectedProvider)?.name} console.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    {selectedProvider === 'plivo' ? 'Auth ID' : 'Account SID'}
                  </label>
                  <input
                    required
                    type="text"
                    value={formAccountSid}
                    onChange={(e) => setFormAccountSid(e.target.value)}
                    placeholder={selectedProvider === 'twilio' ? 'ACxxxxxxxxxxxxxxxx' : 'Account Identifier'}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">
                    {selectedProvider === 'exotel' ? 'API Token' : 'Auth Token'}
                  </label>
                  <input
                    required
                    type="password"
                    value={formAuthToken}
                    onChange={(e) => setFormAuthToken(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {selectedProvider === 'exotel' && (
                <div>
                  <label className="text-xs font-semibold text-foreground">Exotel API Key</label>
                  <input
                    type="text"
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder="Exotel API Key"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* Inbound Call Routing Behavior */}
              <div className="pt-2 border-t border-border space-y-2">
                <label className="text-xs font-semibold text-foreground block">When Customers Call This Number Back (Inbound):</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${formInboundMode === 'ai_agent' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <input
                      type="radio"
                      name="inboundMode"
                      value="ai_agent"
                      checked={formInboundMode === 'ai_agent'}
                      onChange={() => setFormInboundMode('ai_agent')}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-xs font-bold text-foreground">AI Voice Agent (24/7 Intelligent Receptionist)</div>
                      <div className="text-[11px] text-muted-foreground">Voice AI answers immediately with your customized industry persona and qualifies the caller.</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${formInboundMode === 'forward_human' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <input
                      type="radio"
                      name="inboundMode"
                      value="forward_human"
                      checked={formInboundMode === 'forward_human'}
                      onChange={() => setFormInboundMode('forward_human')}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="w-full">
                      <div className="text-xs font-bold text-foreground">Forward Call to Human Executive</div>
                      <div className="text-[11px] text-muted-foreground">Directly forward incoming calls to an office landline or executive mobile.</div>
                      {formInboundMode === 'forward_human' && (
                        <input
                          type="text"
                          value={formFallbackNumber}
                          onChange={(e) => setFormFallbackNumber(e.target.value)}
                          placeholder="e.g. +919876543210"
                          className="mt-2 w-full rounded border border-border bg-background px-3 py-1.5 text-xs font-mono outline-none focus:border-primary"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectingLine}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {connectingLine ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {connectingLine ? 'Connecting...' : 'Verify & Connect Line'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

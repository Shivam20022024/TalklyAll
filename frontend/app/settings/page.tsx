'use client'

import { useEffect, useState } from 'react'
import { Building, Check, Loader2, MessageCircle, Phone, PhoneCall, Plus, Radio, Save, Send, Settings as SettingsIcon, UserRound, Webhook } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { getIndustryConfig } from '@/lib/industry'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { LoadingState, Skeleton } from '@/components/ui/States'
import { SettingsSection, FormFooter } from '@/components/settings/SettingsSection'
import { SectionNav } from '@/components/settings/SectionNav'
import { ConnectLineDialog } from '@/components/settings/ConnectLineDialog'

type TelephonyProviderKey = 'twilio' | 'exotel' | 'plivo' | 'bolna'

interface ProviderMeta {
  id: TelephonyProviderKey
  unsupported?: boolean
  name: string
  tagline: string
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'twilio', name: 'Twilio', tagline: 'Global SMS & voice carrier', unsupported: true },
  { id: 'exotel', name: 'Exotel', tagline: 'Virtual telecom carrier for India', unsupported: true },
  { id: 'plivo', name: 'Plivo', tagline: 'Voice & SIP trunking' },
  { id: 'bolna', name: 'Bolna Direct', tagline: 'Native SIP through the shared carrier' },
]

const INDUSTRY_OPTIONS: [string, string][] = [
  ['general_sales', 'B2B Sales & Outbound Services'],
  ['healthcare', 'Healthcare & Medical Clinics'],
  ['edtech', 'EdTech, Academies & Coaching'],
  ['bfsi', 'BFSI (Loans & Insurance Advisory)'],
  ['real_estate', 'Real Estate & Developers'],
  ['collections', 'Collections (Loan & EMI Recovery)'],
]

const SECTION_LINKS = [
  { id: 'workspace', label: 'Workspace', description: 'Company and industry details', icon: <Building size={21} strokeWidth={1.75} /> },
  { id: 'account', label: 'Account', description: 'Your account information', icon: <UserRound size={21} strokeWidth={1.75} /> },
  { id: 'calling', label: 'Phone & calling', description: 'Dedicated number and provider', icon: <PhoneCall size={21} strokeWidth={1.75} /> },
  { id: 'webhook', label: 'Outbound webhook', description: 'Send call data to your tools', icon: <Webhook size={21} strokeWidth={1.75} /> },
  { id: 'whatsapp', label: 'WhatsApp reminders', description: 'Automated WhatsApp messages', icon: <MessageCircle size={21} strokeWidth={1.75} /> },
  { id: 'livekit', label: 'LiveKit voice', description: 'Real-time voice engine settings', icon: <Radio size={21} strokeWidth={1.75} /> },
]

const ROLE_LABELS: Record<string, string> = { super_admin: 'Super admin', company_admin: 'Company admin' }

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  // Presentation-only: which sections' settings failed to load (shown as a warning).
  const [loadIssues, setLoadIssues] = useState<string[]>([])
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
  const [sharedLabel, setSharedLabel] = useState('+91 80 6553 5758 (Talkly Plivo shared number)')
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

        const issues: string[] = []
        if (!compRes?.company) issues.push('workspace profile')
        if (!telRes) issues.push('phone settings')
        if (!waRes?.config) issues.push('WhatsApp settings')
        if (!lkRes?.config) issues.push('LiveKit settings')
        setLoadIssues(issues)

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
          setSharedLabel(telRes.shared_number_label || '+91 80 3183 0100 (Talkly shared number)')
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
        setLoadIssues(['workspace profile', 'phone settings', 'WhatsApp settings', 'LiveKit settings'])
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
    if (!confirm('Are you sure you want to disconnect this line and revert to the Talkly shared number pool?')) return
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

  // ---- Presentation helpers (display only) ----
  const providerMeta = PROVIDERS.find((p) => p.id === selectedProvider)
  const providerName = providerMeta?.name ?? ''
  const phoneUnavailable = loadIssues.includes('phone settings')
  const industryKnown = INDUSTRY_OPTIONS.some(([value]) => value === industry)
  const roleText = user?.role ? ROLE_LABELS[user.role] ?? user.role.replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase()) : '—'

  // ── presentation-only button styles (no handler is changed) ──
  const btnBase = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'
  const btnPrimary = `${btnBase} h-11 bg-ds-primary px-5 text-white shadow-md shadow-blue-600/20 hover:bg-ds-primary-hover active:scale-[0.98]`
  const btnPrimarySm = `${btnBase} h-10 bg-ds-primary px-4 text-white shadow-sm hover:bg-ds-primary-hover`
  const btnOutline = `${btnBase} h-11 border border-ds-line bg-ds-bg px-4 text-ds-ink shadow-sm hover:bg-ds-surface`
  const btnDanger = `${btnBase} h-10 border border-red-200 bg-ds-bg px-4 text-ds-error-ink hover:bg-ds-error-soft`

  return (
    <AppLayout title="Settings">
      <header className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 text-ds-primary shadow-sm" aria-hidden="true"><SettingsIcon size={26} strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Settings</h1>
          <p className="mt-1 text-[16px] text-ds-ink-2">Manage your workspace, phone lines and integrations.</p>
        </div>
      </header>

      {loading ? (
        <LoadingState label="Loading settings…">
          <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="hidden xl:block" />
            <div className="space-y-4">
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          </div>
        </LoadingState>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <SectionNav links={SECTION_LINKS} />

          <div className="min-w-0 space-y-5">
            {loadIssues.length > 0 && (
              <Alert tone="warning" title="Some settings couldn’t be loaded">
                Couldn’t load: {loadIssues.join(', ')}. Those sections show default values, not what you have saved. Reload the page before changing them, or you could overwrite saved settings.
              </Alert>
            )}

            {/* ---------------- Workspace ---------------- */}
            <SettingsSection
              id="workspace"
              icon={<Building size={21} strokeWidth={1.75} />}
              title="Workspace"
              description="Your company name and the industry that shapes your AI agent’s persona, objection handling and prompt suggestions."
              badge={<Badge variant="neutral" className="px-3 py-1 text-[14px]">Plan: <span className="uppercase">{planType}</span></Badge>}
            >
              <form onSubmit={handleSave} aria-labelledby="workspace-title">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Company / brand name" required>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Health Solutions" />
                  </Field>
                  <Field label="Default industry" hint="Used for AI persona, objection handling and prompt recommendations.">
                    <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      {!industryKnown && industry && <option value={industry}>{getIndustryConfig(industry).label}</option>}
                      {INDUSTRY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {saveSuccess && (
                  <div className="mt-4">
                    <Alert tone="success">Workspace settings updated.</Alert>
                  </div>
                )}
                <FormFooter>
                  <button type="submit" disabled={saving} className={btnPrimary}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />}
                    {saving ? 'Saving…' : 'Save workspace'}
                  </button>
                </FormFooter>
              </form>
            </SettingsSection>

            {/* ---------------- Account (read only) ---------------- */}
            <SettingsSection
              id="account"
              icon={<UserRound size={21} strokeWidth={1.75} />}
              title="Account"
              description="The account you are signed in with. These details are read-only here."
            >
              {user ? (
                <dl className="grid gap-px overflow-hidden rounded-xl border border-ds-line bg-ds-line sm:grid-cols-2">
                  {[
                    ['Name', user.name || '—'],
                    ['Email', user.email || '—'],
                    ['Role', roleText],
                    ['Company', user.company_name || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-ds-bg px-4 py-3.5">
                      <dt className="text-[14px] text-ds-ink-2">{k}</dt>
                      <dd className="mt-0.5 break-words text-[16px] font-semibold text-ds-ink [overflow-wrap:anywhere]">
                        {k === 'Role' && v !== '—' ? <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-0.5 text-[14px] font-semibold text-blue-700">{v}</span> : v}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-[15px] text-ds-ink-2">Account details aren’t available right now.</p>
              )}
            </SettingsSection>

            {/* ---------------- Phone & calling ---------------- */}
            <SettingsSection
              id="calling"
              icon={<PhoneCall size={21} strokeWidth={1.75} />}
              title="Phone & calling"
              description="Choose the number and provider used to call your leads. This is optional: with no provider connected, calls go out from the Talkly shared number."
              badge={
                phoneUnavailable ? undefined : telephonyMode === 'custom' ? (
                  <Badge variant="success" className="px-3 py-1 text-[14px]">Dedicated line connected</Badge>
                ) : (
                  <Badge variant="primary" className="px-3 py-1 text-[14px]">Shared number</Badge>
                )
              }
            >
              <div className="space-y-5">
                {/* Current caller ID */}
                <div className="flex flex-col gap-3 rounded-xl border border-ds-line bg-ds-surface/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ds-primary-soft text-ds-primary" aria-hidden="true">
                      <Phone size={18} strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-ds-ink-3">{telephonyMode === 'custom' ? 'Your dedicated caller ID' : 'Active caller ID'}</p>
                      {phoneUnavailable ? (
                        <p className="mt-0.5 text-[15px] text-ds-ink-2">Your phone settings couldn’t be loaded, so the caller ID isn’t shown.</p>
                      ) : (
                        <>
                          <p className="mt-0.5 break-words text-[15px] font-semibold text-ds-ink">
                            Leads are called from{' '}
                            <span className="font-mono text-ds-primary">{telephonyMode === 'custom' && connectedLine ? connectedLine.phone_number : sharedLabel}</span>
                          </p>
                          <p className="mt-0.5 text-[14px] text-ds-ink-2">
                            {telephonyMode === 'custom' && connectedLine
                              ? `Connected via ${connectedLine.provider?.toUpperCase()} · Inbound calls go to ${inboundRouting.mode === 'ai_agent' ? 'your AI receptionist' : 'a human forwarding number'}`
                              : 'No phone provider is connected, so calls use the Talkly shared number.'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {telephonyMode === 'custom' && (
                    <button type="button" onClick={handleDisconnectLine} disabled={disconnectingLine} className={`${btnDanger} self-start sm:self-center`}>
                      {disconnectingLine ? 'Disconnecting…' : 'Switch to shared number'}
                    </button>
                  )}
                </div>

                {/* Guidance */}
                <div className="grid gap-4 rounded-xl border border-ds-line p-4 text-[14px] md:grid-cols-2">
                  <div>
                    <p className="font-medium text-ds-ink">Keep the Talkly shared number when</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-ds-ink-2">
                      <li>You are fine with leads seeing a Talkly shared number. There is nothing to set up.</li>
                      <li>You don’t have an account with a telecom provider.</li>
                      <li>You want call minutes deducted from your Talkly prepaid wallet.</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-ds-ink">Connect your own line when</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-ds-ink-2">
                      <li>Leads should see your company’s registered number as the caller ID.</li>
                      <li>You want calls billed through your own telecom provider contract.</li>
                      <li>You call in India: a call can only show a number owned by the provider placing it, so use the provider that owns the number.</li>
                    </ul>
                  </div>
                </div>

                {/* Provider selection */}
                <div>
                  <p className="text-[15px] font-medium text-ds-ink">Telecom provider</p>
                  <div role="group" aria-label="Telecom provider" className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {PROVIDERS.map((p) => {
                      const isSelected = selectedProvider === p.id
                      const hasLine = connectedLine && connectedLine.provider === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedProvider(p.id)}
                          className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors ${
                            isSelected ? 'border-ds-primary bg-ds-primary-soft/50 ring-1 ring-ds-primary' : 'border-ds-line bg-ds-bg hover:border-ds-line-strong hover:bg-ds-surface'
                          }`}
                        >
                          <span className="flex w-full flex-wrap items-center justify-between gap-1.5">
                            <span className="text-[15px] font-semibold text-ds-ink">{p.name}</span>
                            {p.unsupported ? <Badge variant="warning" className="px-3 py-1 text-[14px]">Coming soon</Badge> : hasLine ? <Badge variant="success" className="px-3 py-1 text-[14px]">1 line</Badge> : <Badge variant="neutral" className="px-3 py-1 text-[14px]">No lines</Badge>}
                          </span>
                          <span className="text-[14px] text-ds-ink-2">{p.tagline}</span>
                          {p.unsupported && <span className="text-[14px] text-ds-warning-ink">Can’t place live calls yet. Plivo only.</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Selected provider's lines */}
                <div className="rounded-xl border border-ds-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-semibold text-ds-ink">{providerName} lines</h3>
                      <p className="text-[14px] text-ds-ink-2">Phone lines registered with your {providerName} account.</p>
                    </div>
                    {!isCurrentProviderConnected && !providerMeta?.unsupported && (
                      <button type="button" onClick={() => handleOpenConnectModal(selectedProvider)} className={btnPrimarySm}>
                        <Plus size={14} strokeWidth={1.75} />
                        Add {providerName} line
                      </button>
                    )}
                  </div>

                  <div className="mt-4">
                    {isCurrentProviderConnected ? (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 rounded-lg border border-ds-line bg-ds-surface/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ds-success-soft text-ds-success-ink" aria-hidden="true">
                              <PhoneCall size={17} strokeWidth={1.75} />
                            </span>
                            <div className="min-w-0">
                              <p className="break-all font-mono text-[15px] font-semibold text-ds-ink">{connectedLine.phone_number}</p>
                              <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-ds-ink-2">
                                <span>Account: {connectedLine.account_sid_masked || 'Connected'}</span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 text-ds-success-ink">
                                  <Check size={12} strokeWidth={2} /> Outbound & inbound
                                </span>
                              </p>
                            </div>
                          </div>
                          <button type="button" onClick={handleDisconnectLine} disabled={disconnectingLine} className={btnDanger}>
                            Disconnect line
                          </button>
                        </div>

                        {inboundWebhookUrl && selectedProvider === 'plivo' && (
                          <div className="space-y-2 rounded-lg border border-ds-line p-3.5 text-[14px]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-ds-ink">Plivo inbound webhook (Answer URL)</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(inboundWebhookUrl)
                                  alert('Copied Inbound Webhook URL to clipboard!')
                                }}
                                className="font-medium text-ds-primary hover:underline"
                              >
                                Copy Answer URL
                              </button>
                            </div>
                            <code className="block select-all break-all rounded-md border border-ds-line bg-ds-surface p-2 font-mono text-[13px] text-ds-ink-2">{inboundWebhookUrl}</code>
                            <p className="text-ds-ink-2">
                              In your Plivo console (Voice &gt; Applications), attach your number to an application with this URL as the <strong>Primary Answer URL</strong> (HTTP POST), so customers who call back reach your AI agent.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : providerMeta?.unsupported ? (
                      <div className="rounded-lg border border-dashed border-ds-warning/40 bg-ds-warning-soft/50 px-4 py-5 text-center text-[14px]">
                        <p className="font-medium text-ds-ink">{providerName} isn’t supported yet</p>
                        <p className="mx-auto mt-1 max-w-md text-ds-ink-2">Only Plivo lines can be connected today. To use your company’s registered number as the caller ID, select Plivo above.</p>
                      </div>
                    ) : selectedProvider === 'bolna' ? (
                      <div className="rounded-lg border border-dashed border-ds-line px-4 py-5 text-center text-[14px]">
                        <p className="font-medium text-ds-ink">Bolna Direct</p>
                        <p className="mx-auto mt-1 max-w-md text-ds-ink-2">Bolna Direct works through Talkly’s shared carrier setup, so there are no lines to add here. To connect a dedicated company number, select Plivo.</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-ds-line px-4 py-5 text-center text-[14px] text-ds-ink-2">
                        <p>No lines are connected for {providerName}.</p>
                        <p className="mt-1">Use “Add {providerName} line” above to enter your Auth ID, Auth token and dedicated number.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SettingsSection>

            {/* ---------------- Outbound webhook ---------------- */}
            <SettingsSection
              id="webhook"
              icon={<Webhook size={21} strokeWidth={1.75} />}
              title="Outbound webhook"
              description="Send call results to your CRM or automation tool (Zapier, Make, HubSpot, Google Sheets or your own backend). Each completed AI call posts the lead data, score, sentiment and transcript."
            >
              <div className="space-y-3">
                <Field label="Webhook destination URL">
                  <Input className="font-mono" type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" />
                </Field>
                {webhookSaveSuccess && <Alert tone="success">Webhook URL saved.</Alert>}
                {webhookTestResult && (
                  <Alert
                    tone={webhookTestResult.success ? 'success' : 'error'}
                    urgent={!webhookTestResult.success}
                    title={webhookTestResult.success ? `Webhook responded with HTTP ${webhookTestResult.status_code}` : 'Webhook test failed'}
                  >
                    <span className="block break-all font-mono text-[14px]">{webhookTestResult.response_text || (webhookTestResult.success ? 'Success response received.' : 'Could not reach the server.')}</span>
                  </Alert>
                )}
              </div>
              <FormFooter note="A successful test also saves the URL.">
                <button type="button" onClick={handleTestWebhook} disabled={testingWebhook || !webhookUrl} className={btnOutline}>
                  {testingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={1.75} />}
                  {testingWebhook ? 'Sending…' : 'Send test ping'}
                </button>
                <button type="button" onClick={handleSaveWebhook} disabled={savingWebhook} className={btnPrimary}>
                  {savingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />}
                  {savingWebhook ? 'Saving…' : 'Save webhook'}
                </button>
              </FormFooter>
            </SettingsSection>

            {/* ---------------- WhatsApp ---------------- */}
            <SettingsSection
              id="whatsapp"
              icon={<MessageCircle size={21} strokeWidth={1.75} />}
              title="WhatsApp reminders"
              description="When a prospect agrees to a demo or consultation, or asks for details on a call, TalklyAI can send the confirmation, meeting link and brochure to their WhatsApp through the Meta Cloud API."
              badge={whatsappEnabled ? <Badge variant="success" className="px-3 py-1 text-[14px]">Enabled</Badge> : <Badge variant="neutral" className="px-3 py-1 text-[14px]">Disabled</Badge>}
            >
              <form onSubmit={handleSaveWhatsapp} className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-ds-line p-3.5">
                  <div className="min-w-0">
                    <p id="wa-enable-label" className="text-[15px] font-medium text-ds-ink">Send WhatsApp messages automatically</p>
                    <p className="text-[14px] text-ds-ink-2">Dispatch reminders right after a call ends.</p>
                  </div>
                  <Switch checked={whatsappEnabled} onChange={setWhatsappEnabled} aria-labelledby="wa-enable-label" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Meta phone number ID" hint="Found under WhatsApp > API Setup on developers.facebook.com.">
                    <Input className="font-mono" value={whatsappPhoneNumberId} onChange={(e) => setWhatsappPhoneNumberId(e.target.value)} placeholder="e.g. 1406119645915680" />
                  </Field>
                  <Field label="Meta permanent access token" hint={whatsappHasToken ? 'A token is saved. Enter a new one to replace it.' : 'System user token from Meta Business Manager.'}>
                    <Input className="font-mono" type="password" autoComplete="off" value={whatsappAccessToken} onChange={(e) => setWhatsappAccessToken(e.target.value)} placeholder="EAAG…" />
                  </Field>
                </div>

                {whatsappSaveSuccess && <Alert tone="success">WhatsApp settings saved.</Alert>}

                <FormFooter
                  note={
                    <>
                      Need credentials? Create them at{' '}
                      <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="font-medium text-ds-primary underline-offset-2 hover:underline">
                        developers.facebook.com
                      </a>
                      .
                    </>
                  }
                >
                  <button type="submit" disabled={savingWhatsapp} className={btnPrimary}>
                    {savingWhatsapp ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />}
                    {savingWhatsapp ? 'Saving…' : 'Save WhatsApp settings'}
                  </button>
                </FormFooter>
              </form>

              <div className="mt-5 border-t border-ds-line pt-4">
                <p className="text-[15px] font-medium text-ds-ink">Send a test message</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="font-mono sm:flex-1"
                    aria-label="WhatsApp number to send the test to"
                    value={testWhatsappPhone}
                    onChange={(e) => setTestWhatsappPhone(e.target.value)}
                    placeholder="+919877082909"
                  />
                  <button type="button" onClick={handleTestWhatsapp} disabled={testingWhatsapp || !testWhatsappPhone} className={btnOutline}>
                    {testingWhatsapp ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={1.75} />}
                    {testingWhatsapp ? 'Sending…' : 'Send test message'}
                  </button>
                </div>
                <p className="mt-1.5 text-[14px] text-ds-ink-3">Include the country code. Unsaved credentials entered above are saved first.</p>
                {whatsappTestResult && (
                  <div className="mt-3">
                    <Alert tone={whatsappTestResult.success ? 'success' : 'error'} urgent={!whatsappTestResult.success}>
                      {whatsappTestResult.message}
                    </Alert>
                  </div>
                )}
              </div>
            </SettingsSection>

            {/* ---------------- LiveKit ---------------- */}
            <SettingsSection
              id="livekit"
              icon={<Radio size={21} strokeWidth={1.75} />}
              title="LiveKit voice"
              description="Real-time voice engine used for in-browser voice tests and WebRTC calls. Enter your LiveKit Cloud project details."
              badge={livekitHasSecret ? <Badge variant="success" className="px-3 py-1 text-[14px]">Secret saved</Badge> : <Badge variant="neutral" className="px-3 py-1 text-[14px]">Not configured</Badge>}
            >
              <form onSubmit={handleSaveLivekit} className="space-y-4">
                <Field label="WebSocket server URL" hint="Found in your project settings at cloud.livekit.io.">
                  <Input className="font-mono" value={livekitUrl} onChange={(e) => setLivekitUrl(e.target.value)} placeholder="wss://your-project.livekit.cloud" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="API key">
                    <Input className="font-mono" value={livekitApiKey} onChange={(e) => setLivekitApiKey(e.target.value)} placeholder="APIxxxxxxxxxxxx" />
                  </Field>
                  <Field label="API secret" hint={livekitHasSecret ? 'A secret is saved. Enter a new one to replace it.' : 'Generated on the Keys tab in LiveKit Cloud.'}>
                    <Input className="font-mono" type="password" autoComplete="off" value={livekitApiSecret} onChange={(e) => setLivekitApiSecret(e.target.value)} placeholder="••••••••••••••••" />
                  </Field>
                </div>

                {livekitSaveSuccess && <Alert tone="success">LiveKit settings saved.</Alert>}

                <FormFooter
                  note={
                    <>
                      No account yet? Create one at{' '}
                      <a href="https://cloud.livekit.io" target="_blank" rel="noreferrer" className="font-medium text-ds-primary underline-offset-2 hover:underline">
                        cloud.livekit.io
                      </a>
                      .
                    </>
                  }
                >
                  <button type="submit" disabled={savingLivekit} className={btnPrimary}>
                    {savingLivekit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />}
                    {savingLivekit ? 'Saving…' : 'Save LiveKit settings'}
                  </button>
                </FormFooter>
              </form>
            </SettingsSection>
          </div>
        </div>
      )}

      <ConnectLineDialog
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        providerId={selectedProvider}
        providerName={providerName}
        onSubmit={handleConnectLine}
        connecting={connectingLine}
        phone={formPhone}
        setPhone={setFormPhone}
        accountSid={formAccountSid}
        setAccountSid={setFormAccountSid}
        authToken={formAuthToken}
        setAuthToken={setFormAuthToken}
        apiKey={formApiKey}
        setApiKey={setFormApiKey}
        inboundMode={formInboundMode}
        setInboundMode={setFormInboundMode}
        fallbackNumber={formFallbackNumber}
        setFallbackNumber={setFormFallbackNumber}
      />
    </AppLayout>
  )
}

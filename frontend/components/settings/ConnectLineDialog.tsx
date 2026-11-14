'use client'

import { Check, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

type InboundMode = 'ai_agent' | 'forward_human' | string

/** Connect-a-phone-line form. Submits through the page's existing handleConnectLine. */
export function ConnectLineDialog(props: {
  open: boolean
  onClose: () => void
  providerId: string
  providerName: string
  onSubmit: (e: React.FormEvent) => void
  connecting: boolean
  phone: string
  setPhone: (v: string) => void
  accountSid: string
  setAccountSid: (v: string) => void
  authToken: string
  setAuthToken: (v: string) => void
  apiKey: string
  setApiKey: (v: string) => void
  inboundMode: InboundMode
  setInboundMode: (v: InboundMode) => void
  fallbackNumber: string
  setFallbackNumber: (v: string) => void
}) {
  const { providerId, providerName } = props
  const modes: { value: InboundMode; title: string; body: string }[] = [
    { value: 'ai_agent', title: 'AI voice agent', body: 'Your AI agent answers right away with your industry persona and qualifies the caller.' },
    { value: 'forward_human', title: 'Forward to a person', body: 'Incoming calls are forwarded to an office landline or a mobile number.' },
  ]

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      size="lg"
      title={`Connect ${providerName} line`}
      description="Register your carrier number to use as your company’s dedicated caller ID."
      footer={
        <>
          <button type="button" onClick={props.onClose} className={buttonClass('outline', 'md')}>
            Cancel
          </button>
          <button type="submit" form="connect-line-form" disabled={props.connecting} className={buttonClass('primary', 'md')}>
            {props.connecting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={1.75} />}
            {props.connecting ? 'Connecting…' : 'Verify & connect line'}
          </button>
        </>
      }
    >
      <form id="connect-line-form" onSubmit={props.onSubmit} className="space-y-4">
        <Field label="Dedicated phone number" required hint={`E.164 format with the country code. The number you bought in your ${providerName} console.`}>
          <Input className="font-mono" value={props.phone} onChange={(e) => props.setPhone(e.target.value)} placeholder="e.g. +918069001234" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={providerId === 'plivo' ? 'Auth ID' : 'Account SID'} required>
            <Input
              className="font-mono"
              value={props.accountSid}
              onChange={(e) => props.setAccountSid(e.target.value)}
              placeholder={providerId === 'twilio' ? 'ACxxxxxxxxxxxxxxxx' : 'Account identifier'}
            />
          </Field>
          <Field label={providerId === 'exotel' ? 'API token' : 'Auth token'} required>
            <Input className="font-mono" type="password" value={props.authToken} onChange={(e) => props.setAuthToken(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" />
          </Field>
        </div>

        {providerId === 'exotel' && (
          <Field label="Exotel API key">
            <Input className="font-mono" value={props.apiKey} onChange={(e) => props.setApiKey(e.target.value)} placeholder="Exotel API key" />
          </Field>
        )}

        <fieldset className="space-y-2 border-t border-ds-line pt-4">
          <legend className="text-[13px] font-medium text-ds-ink">When customers call this number back</legend>
          {modes.map((m) => {
            const selected = props.inboundMode === m.value
            return (
              <label
                key={m.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${selected ? 'border-ds-primary bg-ds-primary-soft/50' : 'border-ds-line hover:border-ds-line-strong'}`}
              >
                <input type="radio" name="inboundMode" value={m.value} checked={selected} onChange={() => props.setInboundMode(m.value)} className="mt-0.5 accent-ds-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ds-ink">{m.title}</span>
                  <span className="block text-xs text-ds-ink-2">{m.body}</span>
                  {m.value === 'forward_human' && selected && (
                    <Input
                      className="mt-2 font-mono"
                      aria-label="Number to forward calls to"
                      value={props.fallbackNumber}
                      onChange={(e) => props.setFallbackNumber(e.target.value)}
                      placeholder="e.g. +919876543210"
                    />
                  )}
                </span>
              </label>
            )
          })}
        </fieldset>
      </form>
    </Dialog>
  )
}

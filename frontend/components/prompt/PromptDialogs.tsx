'use client'

import { ArrowLeft, ArrowRight, CheckCircle2, FileText, LayoutGrid, Loader2, Paperclip, Phone, Sparkles, Zap } from 'lucide-react'
import type { RefObject } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { buttonClass } from '@/components/ui/button'
import { VarTag } from './PromptSection'

/* --------------------------------------------------------------------------
 * Test call (phone)
 * ------------------------------------------------------------------------ */
export function TestCallDialog(props: {
  open: boolean
  onClose: () => void
  templateName: string
  offeringPlaceholder: string
  onSubmit: (e: React.FormEvent) => void
  testPhone: string
  setTestPhone: (v: string) => void
  testCustomerName: string
  setTestCustomerName: (v: string) => void
  testOffering: string
  setTestOffering: (v: string) => void
  testLocation: string
  setTestLocation: (v: string) => void
  testLanguage: string
  setTestLanguage: (v: string) => void
}) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={`Test ${props.templateName} agent`} description="Places a real phone call to you using this template's saved prompt.">
      <form onSubmit={props.onSubmit} className="space-y-4">
        <Field label="Your phone number" required>
          <Input data-autofocus type="tel" value={props.testPhone} onChange={(e) => props.setTestPhone(e.target.value)} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Test lead name" hint="The name the agent will greet you by.">
          <Input value={props.testCustomerName} onChange={(e) => props.setTestCustomerName(e.target.value)} placeholder="e.g. Rahul" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={<>Test offering <VarTag>{'{{offering}}'}</VarTag></>}>
            <Input value={props.testOffering} onChange={(e) => props.setTestOffering(e.target.value)} placeholder={props.offeringPlaceholder} />
          </Field>
          <Field label={<>Test location <VarTag>{'{{location}}'}</VarTag></>}>
            <Input value={props.testLocation} onChange={(e) => props.setTestLocation(e.target.value)} placeholder="e.g. Gurgaon / Delhi" />
          </Field>
        </div>
        <Field label="Call voice language">
          <Select value={props.testLanguage} onChange={(e) => props.setTestLanguage(e.target.value)}>
            <option value="Hindi">Hindi (Urban Indian Accent)</option>
            <option value="Hinglish">Hinglish (Code-mixed Hindi + English)</option>
            <option value="English">Indian English</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={props.onClose} className={buttonClass('outline', 'md')}>Cancel</button>
          <button type="submit" className={buttonClass('primary', 'md')}><Phone size={15} strokeWidth={1.75} />Call me now</button>
        </div>
      </form>
    </Dialog>
  )
}

/* --------------------------------------------------------------------------
 * "How do you want to start?"
 * ------------------------------------------------------------------------ */
export function StartChoiceDialog({ open, onClose, onAutoBuild, onBrowseTemplates }: { open: boolean; onClose: () => void; onAutoBuild: () => void; onBrowseTemplates: () => void }) {
  const option = 'flex h-full flex-col rounded-xl border p-4 text-left transition-colors'
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="How do you want to start?" description="You can change everything later. This only decides where you begin.">
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={onAutoBuild} className={`${option} border-ds-primary/40 bg-ds-primary-soft/50 hover:border-ds-primary`}>
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ds-primary text-white" aria-hidden="true"><Zap size={17} strokeWidth={1.75} /></span>
            <span className="rounded-full bg-ds-bg px-2 py-0.5 text-[11px] font-medium text-ds-primary">Recommended</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-ds-ink">Auto Build</p>
          <p className="mt-1 text-[13px] text-ds-ink-2">Answer a few questions or paste a brief, and Talkly generates the voice agent for you.</p>
          <p className="mt-auto pt-3 text-xs text-ds-ink-3">About 3 minutes · upload optional</p>
        </button>
        <button type="button" onClick={onBrowseTemplates} className={`${option} border-ds-line hover:border-ds-line-strong hover:bg-ds-surface`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ds-surface text-ds-ink-2" aria-hidden="true"><LayoutGrid size={17} strokeWidth={1.75} /></span>
          <p className="mt-3 text-sm font-semibold text-ds-ink">Start from a template</p>
          <p className="mt-1 text-[13px] text-ds-ink-2">Pick a ready-made template for your industry and adjust it.</p>
          <p className="mt-auto pt-3 text-xs text-ds-ink-3">About 1 minute</p>
        </button>
      </div>
      <div className="mt-4 text-center">
        <button type="button" onClick={onClose} className="text-xs text-ds-ink-3 underline-offset-2 hover:text-ds-ink hover:underline">No thanks, I&apos;ll start from scratch</button>
      </div>
    </Dialog>
  )
}

/* --------------------------------------------------------------------------
 * Auto Build wizard (3 steps)
 * ------------------------------------------------------------------------ */
export interface WizardFields {
  agentName: string; setAgentName: (v: string) => void
  companyName: string; setCompanyName: (v: string) => void
  industry: string; setIndustry: (v: string) => void
  designation: string; setDesignation: (v: string) => void
  language: string; setLanguage: (v: string) => void
  voiceTone: string; setVoiceTone: (v: string) => void
  sopText: string; setSopText: (v: string) => void
  primaryObjective: string; setPrimaryObjective: (v: string) => void
  mustAskQuestions: string; setMustAskQuestions: (v: string) => void
  offeringsUsps: string; setOfferingsUsps: (v: string) => void
  objections: string; setObjections: (v: string) => void
  knowledgeBase: string; setKnowledgeBase: (v: string) => void
  closingCta: string; setClosingCta: (v: string) => void
}

const STEPS = ['Identity', 'Conversation', 'Closing'] as const
const STEP_COPY: Record<number, [string, string]> = {
  1: ['Who is your agent?', 'Tell us about the agent, its voice, and tone. Or paste a brief and we will fill it in.'],
  2: ["What is your agent's conversation flow?", 'Define the key qualification questions, offerings, and common objections.'],
  3: ['Closing & call wrap-up', 'Set the call-to-action and generate your voice agent.'],
}

export function AutoBuildWizard(props: {
  open: boolean
  onClose: () => void
  step: number
  setStep: (fn: (prev: number) => number) => void
  generating: boolean
  progress: string
  onGenerate: () => void
  f: WizardFields
  fallbackCompanyName: string
  knowledgeFileInputRef: RefObject<HTMLInputElement | null>
  onKnowledgeFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadingKnowledgeFile: boolean
}) {
  const { f, step } = props
  // Quick-fill blueprints: user-triggered sample answers (unchanged content).
  const fillDoctor = () => {
    f.setAgentName('Priya')
    f.setCompanyName('Apollo Clinic')
    f.setIndustry('Healthcare & Clinic')
    f.setDesignation('Appointment Coordinator')
    f.setLanguage('Hindi / Hinglish')
    f.setVoiceTone('Empathetic, calm, respectful')
    f.setSopText('Doctor Appointment Reminder Call: Call patient to confirm their scheduled doctor appointment tomorrow at 11 AM with Dr. Mehta. If patient says "हाँ, पर थोड़ा लेट हो सकता हूँ" (Yes, but might be a little late), politely acknowledge and reassure that clinic will hold the slot for 15 minutes. If they confirm on time, advise reaching 15 mins early with previous prescription/reports. If reschedule, ask for alternate day. If cancel, politely cancel without pressure.')
    f.setPrimaryObjective('कल के डॉक्टर अपॉइंटमेंट की पुष्टि करना, संभावित देरी (लेट होना) को नोट करना, और आवश्यक होने पर रीशेड्यूल करना।')
    f.setMustAskQuestions('1. क्या आप कल सुबह 11 बजे डॉ. मेहता के अपॉइंटमेंट के लिए आ रहे हैं?\n2. क्या आपको क्लीनिक की लोकेशन या पते की जानकारी चाहिए?')
    f.setOfferingsUsps('डॉ. मेहता (सीनियर फिजिशियन), आधुनिक क्लीनिक सुविधाएं, ऑन-टाइम कंसल्टेशन।')
    f.setObjections('यदि मरीज कहे कि थोड़ा लेट हो जाएगा -> विनम्रता से आश्वस्त करें कि 15 मिनट स्लॉट होल्ड रहेगा।\nयदि रीशेड्यूल करना चाहे -> परसों या वीकेंड का समय पूछें।\nयदि कैंसल करना चाहे -> विनम्रता से कैंसल करें और डॉक्टर का स्लॉट फ्री करें।')
    f.setClosingCta('समय की पुष्टि करें, 15 मिनट पहले रिपोर्ट्स के साथ आने की सलाह दें, धन्यवाद कहें और कॉल समाप्त करें।')
  }
  const fillCod = () => {
    f.setAgentName('Kavya')
    f.setCompanyName('Snapdeal Fashion')
    f.setIndustry('E-commerce & D2C')
    f.setDesignation('Order Verification Executive')
    f.setLanguage('Hindi / Hinglish')
    f.setVoiceTone('Warm, consultative, professional')
    f.setSopText('E-commerce Cash-on-Delivery (COD) Order Confirmation: Confirm customer order for ₹2,199, verify delivery address and landmark, remind about 3-4 day delivery with cash/UPI readiness, and cancel immediately if customer ordered by mistake.')
    f.setPrimaryObjective('COD ऑर्डर की पुष्टि करना, डिलीवरी एड्रेस वेरिफाई करना, और RTO रोकना।')
    f.setMustAskQuestions('1. क्या मैं आपका ₹2,199 का COD ऑर्डर कन्फर्म कर दूँ?\n2. क्या आपका डिलीवरी एड्रेस और पिनकोड सही है?')
    f.setOfferingsUsps('फास्ट 3-4 दिन डिलीवरी, फ्री शिपिंग, आसान कैश व UPI पेमेंट।')
    f.setObjections('यदि कैंसल करना चाहे -> तुरंत बिना बहस के कैंसल करें ताकि पार्सल डिस्पैच न हो।\nयदि डिलीवरी समय पूछे -> बताएं 3-4 दिनों में कूरियर पहुंचेगा।')
    f.setClosingCta('ऑर्डर डिस्पैच की पुष्टि करें, कैश/UPI तैयार रखने का आग्रह करें, धन्यवाद कहें और कॉल समाप्त करें।')
  }

  const footer = props.generating ? undefined : (
    <div className="flex w-full items-center justify-between">
      <button type="button" onClick={() => props.setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1} className={buttonClass('outline', 'md')}>
        <ArrowLeft size={15} />Back
      </button>
      {step < 3 ? (
        <button type="button" onClick={() => props.setStep((prev) => Math.min(3, prev + 1))} className={buttonClass('primary', 'md')}>
          Continue<ArrowRight size={15} />
        </button>
      ) : (
        <button type="button" onClick={props.onGenerate} className={buttonClass('primary', 'md')}>
          <Sparkles size={15} strokeWidth={1.75} />Generate voice agent
        </button>
      )}
    </div>
  )

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      size="lg"
      title="Auto Build custom agent"
      description={
        <div className="mt-2">
          <ol className="flex items-center gap-2 text-xs" aria-label="Wizard progress">
            {STEPS.map((s, i) => {
              const n = i + 1
              const state = step === n ? 'current' : step > n ? 'done' : 'todo'
              return (
                <li key={s} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${state === 'todo' ? 'bg-ds-surface text-ds-ink-3' : 'bg-ds-primary text-white'}`}>{state === 'done' ? '✓' : n}</span>
                  <span className={state === 'current' ? 'font-medium text-ds-ink' : 'text-ds-ink-3'}>{s}</span>
                  {n < 3 && <span className="h-px w-5 bg-ds-line" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
          {!props.generating && (
            <div className="mt-3">
              <p className="text-sm font-medium text-ds-ink">{STEP_COPY[step][0]}</p>
              <p className="text-xs text-ds-ink-3">{STEP_COPY[step][1]}</p>
            </div>
          )}
        </div>
      }
      footer={footer}
    >
      {props.generating ? (
        <div role="status" aria-live="polite" className="flex flex-col items-center py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ds-primary-soft text-ds-primary"><Loader2 size={22} className="animate-spin" /></span>
          <p className="mt-4 text-sm font-medium text-ds-ink">Generating your voice agent</p>
          <p className="mt-1 text-xs text-ds-ink-3">{props.progress || 'Crafting prompt architecture…'}</p>
        </div>
      ) : (
        <>
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-ds-line bg-ds-surface p-3">
                <p className="mb-2 text-xs text-ds-ink-2"><span className="font-medium text-ds-ink">Quick fill:</span> load a sample answer set into all three steps</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={fillDoctor} className={buttonClass('outline', 'sm')}>Doctor appointment reminder</button>
                  <button type="button" onClick={fillCod} className={buttonClass('outline', 'sm')}>COD order confirmation</button>
                </div>
              </div>

              <Field label={<span className="inline-flex items-center gap-1.5"><FileText size={14} className="text-ds-ink-3" />Brief, brochure, or SOP</span>} hint="Optional. Paste any text, product catalogue, pitch, or training notes and the AI extracts the details.">
                <Textarea
                  data-autofocus
                  rows={3}
                  className="font-mono text-xs"
                  value={f.sopText}
                  onChange={(e) => f.setSopText(e.target.value)}
                  placeholder="e.g. We are Tata Solar. We offer 3kW-10kW residential solar panel installations across Pune & Mumbai with 40% PM Surya Ghar subsidy..."
                />
              </Field>

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-ds-line" /><span className="text-[11px] font-medium text-ds-ink-3">or fill in manually</span><span className="h-px flex-1 bg-ds-line" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Agent spoken name" required><Input value={f.agentName} onChange={(e) => f.setAgentName(e.target.value)} placeholder="e.g. Saanvi / Priya / Rahul" /></Field>
                <Field label="Company / brand name" required><Input value={f.companyName} onChange={(e) => f.setCompanyName(e.target.value)} placeholder="e.g. Tata Power Solar / My Clinic" /></Field>
                <Field label="Industry / vertical" required><Input value={f.industry} onChange={(e) => f.setIndustry(e.target.value)} placeholder="e.g. Solar energy, Logistics, Clinic" /></Field>
                <Field label="Agent designation / role" required><Input value={f.designation} onChange={(e) => f.setDesignation(e.target.value)} placeholder="e.g. Admissions Advisor" /></Field>
                <Field label="Spoken language">
                  <Select value={f.language} onChange={(e) => f.setLanguage(e.target.value)}>
                    <option value="Hindi / Hinglish">Hindi / Hinglish (Code-mixed Natural Indian)</option>
                    <option value="Indian English">Indian English (Professional & Fluent)</option>
                    <option value="Pure Hindi">Pure Hindi (Polite & Traditional)</option>
                    <option value="Tamil">Tamil (Urban Native)</option>
                    <option value="Telugu">Telugu (Urban Native)</option>
                  </Select>
                </Field>
                <Field label="Voice personality & tone">
                  <Select value={f.voiceTone} onChange={(e) => f.setVoiceTone(e.target.value)}>
                    <option value="Warm, consultative, professional">Warm, Consultative & Professional</option>
                    <option value="Confident, persuasive, energetic">Confident, Persuasive & Energetic (Sales)</option>
                    <option value="Empathetic, calm, respectful">Empathetic, Calm & Respectful (Support/Clinic)</option>
                    <option value="Direct, concise, firm">Direct & Polite (Finance / Collections)</option>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label="Primary call objective" required hint="What must this call achieve before it ends?">
                <Input data-autofocus value={f.primaryObjective} onChange={(e) => f.setPrimaryObjective(e.target.value)} placeholder="e.g. Qualify roof ownership and electricity bill, then book a free site survey." />
              </Field>
              <Field label="Must-ask qualification questions" required hint="The agent asks these one at a time to qualify the lead.">
                <Textarea rows={3} className="font-mono text-xs" value={f.mustAskQuestions} onChange={(e) => f.setMustAskQuestions(e.target.value)} placeholder={'e.g.\n1. Do you own an independent house or rooftop?\n2. What is your average monthly electricity bill?'} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Key offerings, pricing & USPs">
                  <Textarea rows={3} value={f.offeringsUsps} onChange={(e) => f.setOfferingsUsps(e.target.value)} placeholder="e.g. 40% government subsidy, ₹0 upfront financing, 25-year warranty." />
                </Field>
                <Field label="Common objections & playbook">
                  <Textarea rows={3} value={f.objections} onChange={(e) => f.setObjections(e.target.value)} placeholder="e.g. If too expensive -> explain ₹0 down payment EMI. If busy -> offer a callback tomorrow." />
                </Field>
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-ds-ink">Knowledge base & verified FAQs <span className="font-normal text-ds-ink-3">(optional)</span></span>
                  <input type="file" ref={props.knowledgeFileInputRef} onChange={props.onKnowledgeFile} accept=".pdf,.xlsx,.xls,.csv,.txt" className="hidden" />
                  <button type="button" onClick={() => props.knowledgeFileInputRef.current?.click()} disabled={props.uploadingKnowledgeFile} className={buttonClass('outline', 'sm')} title="Upload PDF or Excel document">
                    {props.uploadingKnowledgeFile ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} strokeWidth={1.75} />}
                    {props.uploadingKnowledgeFile ? 'Reading…' : 'Upload PDF / Excel'}
                  </button>
                </div>
                <Textarea aria-label="Wizard knowledge base" rows={3} className="font-mono text-xs" value={f.knowledgeBase} onChange={(e) => f.setKnowledgeBase(e.target.value)} placeholder={'Paste FAQs, specs, pricing, warranties, or refund policies.\ne.g. Q: What is the refund policy? A: Full refund within 7 days.'} />
                <p className="text-xs text-ds-ink-3">The agent uses these facts to answer caller questions without guessing.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Field label="Closing call-to-action & agreement" required>
                <Input data-autofocus value={f.closingCta} onChange={(e) => f.setClosingCta(e.target.value)} placeholder="e.g. Propose two timeslots for a free site visit this weekend, confirm, say goodbye, and end the call." />
              </Field>
              <div className="rounded-lg border border-ds-line bg-ds-surface p-4">
                <p className="text-xs font-medium text-ds-ink-3">Agent summary</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-2">
                  <div><dt className="inline text-ds-ink-3">Agent: </dt><dd className="inline font-medium text-ds-ink">{f.agentName} ({f.designation})</dd></div>
                  <div><dt className="inline text-ds-ink-3">Company: </dt><dd className="inline font-medium text-ds-ink">{f.companyName || props.fallbackCompanyName || 'Talkly'}</dd></div>
                  <div><dt className="inline text-ds-ink-3">Industry: </dt><dd className="inline font-medium text-ds-ink">{f.industry || 'Custom'}</dd></div>
                  <div><dt className="inline text-ds-ink-3">Language: </dt><dd className="inline font-medium text-ds-ink">{f.language}</dd></div>
                  <div className="sm:col-span-2"><dt className="inline text-ds-ink-3">Goal: </dt><dd className="inline font-medium text-ds-ink">{f.primaryObjective || 'Consultative qualification'}</dd></div>
                </dl>
                {f.knowledgeBase.trim() && (
                  <p className="mt-2 flex items-center gap-1.5 border-t border-ds-line pt-2 text-xs text-ds-success-ink">
                    <CheckCircle2 size={14} />Knowledge base attached ({f.knowledgeBase.trim().split('\n').filter(Boolean).length} entries)
                  </p>
                )}
              </div>
              <p className="flex items-start gap-2 text-xs text-ds-ink-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ds-primary" />
                Generating creates a new custom agent with its greeting, rules, variables, and system prompt. You can edit everything afterwards.
              </p>
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}

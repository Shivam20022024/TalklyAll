'use client'

import type { RefObject } from 'react'
import { BookOpen, Eye, EyeOff, Loader2, MessageSquareQuote, Paperclip, Workflow } from 'lucide-react'
import FlowBuilder from '@/components/prompt/FlowBuilder'
import { HighlightedTextarea } from '@/components/prompt/HighlightedTextarea'
import { PanelHeading } from './PromptSection'

type Direction = 'outbound' | 'inbound'

/** Tags offered as one-click insertions into the greeting (same rules as before the redesign). */
export function greetingTags(template: any): string[] {
  const tagList: string[] = ['{{company_name}}', '{{customer_name}}', '{{offering}}', '{{location}}']
  const rawVars = template?.variables
  if (Array.isArray(rawVars)) {
    rawVars.forEach((v: any) => {
      if (typeof v === 'string') tagList.push(v)
    })
  } else if (rawVars && typeof rawVars === 'object') {
    Object.keys(rawVars).forEach((k: string) => {
      const clean = k.replace(/^\{\{|\}\}$/g, '')
      tagList.push(`{{${clean}}}`)
    })
  }
  if (Array.isArray(template?.specific_variables)) {
    template.specific_variables.forEach((sv: any) => {
      if (sv?.key) {
        const clean = sv.key.replace(/^\{\{|\}\}$/g, '')
        tagList.push(`{{${clean}}}`)
      }
    })
  }
  return Array.from(new Set(tagList))
}

/** Conversation Flow tab: call direction, greeting, and the prompt editor (Flow Builder / Raw Text). */
export function ConversationFlowPanel(props: {
  selectedIndustry: string
  activeDirection: Direction
  setActiveDirection: (d: Direction) => void
  showLivePreview: boolean
  setShowLivePreview: (v: boolean) => void
  previewText: string
  sampleCustomerName: string
  sampleCompanyName: string
  welcomeMessage: string
  setWelcomeMessage: (v: string) => void
  inboundWelcomeMessage: string
  setInboundWelcomeMessage: (v: string) => void
  promptText: string
  setPromptText: (v: string) => void
  inboundPromptText: string
  setInboundPromptText: (v: string) => void
  activeTextareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  const outbound = props.activeDirection === 'outbound'
  const dirBtn = (active: boolean) =>
    `inline-flex h-10 items-center rounded-lg px-4 text-[15px] font-semibold transition-colors ${active ? 'border border-ds-primary/50 bg-ds-bg text-ds-primary shadow-sm' : 'border border-transparent text-ds-ink-2 hover:text-ds-ink'}`

  return (
    <div className="space-y-6">
      {/* Direction switch applies to both the greeting and the conversation flow below */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-ds-line bg-ds-surface/60 px-4 py-3">
        <div role="group" aria-label="Call direction" className="inline-flex rounded-xl border border-ds-line bg-ds-bg p-1">
          <button type="button" aria-pressed={outbound} onClick={() => props.setActiveDirection('outbound')} className={dirBtn(outbound)}>Outbound</button>
          <button type="button" aria-pressed={!outbound} onClick={() => props.setActiveDirection('inbound')} className={dirBtn(!outbound)}>Inbound</button>
        </div>
        <p className="min-w-0 flex-1 basis-[240px] text-[14px] text-ds-ink-2">
          {outbound ? 'You call the customer.' : 'The customer calls your number.'} Greeting and flow are kept separately for each direction.
        </p>
      </div>

      <section aria-labelledby="greeting-title">
        <PanelHeading
          id="greeting-title"
          icon={<MessageSquareQuote size={21} strokeWidth={1.75} />}
          title={outbound ? 'Greeting' : 'Inbound greeting'}
          description={outbound ? 'The first sentence your agent speaks when the customer answers.' : 'The opening line spoken when someone calls your inbound number.'}
          action={
            <button
              type="button"
              onClick={() => props.setShowLivePreview(!props.showLivePreview)}
              aria-pressed={props.showLivePreview}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm hover:bg-ds-surface"
            >
              {props.showLivePreview ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              {props.showLivePreview ? 'Hide preview' : 'Preview'}
            </button>
          }
        />
        {props.showLivePreview && (
          <div className="mt-4 rounded-xl border border-ds-primary/20 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <span className="font-semibold text-ds-primary">What the customer will hear</span>
              <span className="text-ds-ink-2">Sample values: {props.sampleCustomerName} · {props.sampleCompanyName}</span>
            </div>
            <p className="mt-2 rounded-lg border border-ds-line bg-ds-bg p-3.5 text-[16px] leading-relaxed text-ds-ink">&ldquo;{props.previewText}&rdquo;</p>
          </div>
        )}
        <div className="mt-4">
          <HighlightedTextarea
            textareaRef={props.activeTextareaRef}
            ariaLabel={outbound ? 'Greeting' : 'Inbound greeting'}
            value={outbound ? props.welcomeMessage : props.inboundWelcomeMessage}
            onChange={(v) => (outbound ? props.setWelcomeMessage(v) : props.setInboundWelcomeMessage(v))}
            placeholder="e.g. नमस्ते {{customer_name}}, मैं {{company_name}} की तरफ से बोल रहा हूँ..."
            minHeight={110}
            showCount
          />
        </div>
      </section>

      <section aria-labelledby="flow-title" className="border-t border-ds-line pt-6">
        <FlowBuilder
          key={`${props.selectedIndustry}-${props.activeDirection}`}
          value={outbound ? props.promptText : props.inboundPromptText}
          onChange={(next) => (outbound ? props.setPromptText(next) : props.setInboundPromptText(next))}
          placeholderRole={`You are a professional representative for {{company_name}}, handling ${outbound ? 'outbound' : 'inbound'} calls.`}
          heading={
            <PanelHeading
              id="flow-title"
              icon={<Workflow size={21} strokeWidth={1.75} />}
              title={outbound ? 'Conversation Flow & Instructions' : 'Inbound Conversation Flow & Instructions'}
              description="The agent's identity, rules, and step-by-step flow for qualification, objection handling and closing."
            />
          }
        />
      </section>
    </div>
  )
}

/** Knowledge Base tab: verified facts the agent answers from, plus the PDF / Excel upload. */
export function KnowledgePanel(props: {
  knowledgeBase: string
  setKnowledgeBase: (v: string) => void
  knowledgeFileInputRef: RefObject<HTMLInputElement | null>
  onKnowledgeFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadingKnowledgeFile: boolean
}) {
  return (
    <section aria-labelledby="kb-title" className="space-y-4">
      <PanelHeading
        id="kb-title"
        icon={<BookOpen size={21} strokeWidth={1.75} />}
        title="Knowledge Base & verified FAQs"
        description="Pricing, policies, and product facts the agent uses to answer questions instead of guessing. Shared by both directions; used on calls once saved."
        action={
          <>
            <input type="file" ref={props.knowledgeFileInputRef} onChange={props.onKnowledgeFile} accept=".pdf,.xlsx,.xls,.csv,.txt" className="hidden" />
            <button
              type="button"
              onClick={() => props.knowledgeFileInputRef.current?.click()}
              disabled={props.uploadingKnowledgeFile}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-60"
              title="Upload a PDF brochure, Excel pricing/FAQ sheet, CSV, or text file"
            >
              {props.uploadingKnowledgeFile ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} strokeWidth={1.75} />}
              {props.uploadingKnowledgeFile ? 'Extracting…' : 'Upload PDF / Excel'}
            </button>
          </>
        }
      />
      <div className="overflow-hidden rounded-xl border border-ds-line bg-ds-bg transition-colors focus-within:border-ds-primary focus-within:ring-2 focus-within:ring-ds-primary/20 hover:border-ds-line-strong">
        <textarea
          aria-label="Knowledge base"
          value={props.knowledgeBase}
          onChange={(e) => props.setKnowledgeBase(e.target.value)}
          rows={12}
          className="block min-h-[320px] w-full resize-y bg-transparent px-4 py-3.5 text-[16px] leading-[1.75] text-ds-ink outline-none placeholder:text-ds-ink-3"
          placeholder={`e.g.\nQ: What is the refund or cancellation policy?\nA: We offer a 100% full refund within 7 days of purchase.\n\nQ: What are the office or store timings?\nA: Monday to Saturday from 9:30 AM to 7:00 PM. Sunday closed.`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ds-line bg-ds-surface/60 px-4 py-2.5 text-[14px] text-ds-ink-2">
          <span>Simple Q&amp;A pairs, bullet points, or policies. The agent answers naturally in the call&apos;s language.</span>
          <span className="tabular-nums">{props.knowledgeBase.length.toLocaleString()} characters</span>
        </div>
      </div>
    </section>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus, Eye, EyeOff, Code2, ListChecks } from 'lucide-react'
import { HighlightedTextarea } from './HighlightedTextarea'

export interface FlowStep {
  id: string
  title: string
  instruction: string
}

interface ParsedFlow {
  role: string
  steps: FlowStep[]
}

const HEADER_RE = /\n(?:Key Objectives|Key Questions and Flow to ask in order)\s*:\s*\n/i
const ITEM_RE = /(\d+)\.\s*([^:\n]+):\s*([\s\S]*?)(?=\n\s*\d+\.\s|$)/g

let idCounter = 0
function nextId() {
  idCounter += 1
  return `step-${Date.now()}-${idCounter}`
}

/** Best-effort parse of the "role paragraph(s) + numbered Key Objectives list"
 * shape every industry template (and anything saved by this builder) uses.
 * Returns null for free-form text that doesn't match - callers should fall
 * back to the raw textarea rather than forcing a bad parse into the builder. */
function parseFlow(text: string): ParsedFlow | null {
  if (!text || !text.trim()) return null
  const headerMatch = text.match(HEADER_RE)
  if (!headerMatch || headerMatch.index === undefined) return null

  const role = text.slice(0, headerMatch.index).trim()
  const stepsBlock = text.slice(headerMatch.index + headerMatch[0].length)

  const steps: FlowStep[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(ITEM_RE)
  while ((m = re.exec(stepsBlock)) !== null) {
    const title = m[2].trim()
    const instruction = m[3].trim()
    if (!title && !instruction) continue
    steps.push({ id: nextId(), title, instruction })
  }
  if (steps.length === 0) return null
  return { role, steps }
}

function compileFlow(role: string, steps: FlowStep[]): string {
  const body = steps
    .map((s, i) => `${i + 1}. ${s.title.trim() || `Step ${i + 1}`}: ${s.instruction.trim()}`)
    .join('\n')
  return `${role.trim()}\n\nKey Objectives:\n${body}`
}

interface FlowBuilderProps {
  value: string
  onChange: (next: string) => void
  placeholderRole?: string
  /** Optional heading drawn to the left of the Flow Builder / Raw Text switch. */
  heading?: ReactNode
}

export default function FlowBuilder({ value, onChange, placeholderRole, heading }: FlowBuilderProps) {
  const [mode, setMode] = useState<'builder' | 'raw'>('raw')
  const [role, setRole] = useState('')
  const [steps, setSteps] = useState<FlowStep[]>([])
  const [unparseable, setUnparseable] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const lastEmitted = useRef<string | null>(null)

  // Re-derive the builder's structured view whenever the underlying prompt
  // text changes from outside this component (initial load, template
  // applied, direction tab switched) - but skip it right after this
  // component's own onChange, so editing doesn't fight itself.
  useEffect(() => {
    if (value === lastEmitted.current) return
    const parsed = parseFlow(value)
    if (parsed) {
      setRole(parsed.role)
      setSteps(parsed.steps)
      setUnparseable(false)
      setMode('builder')
    } else {
      setUnparseable(true)
      setMode('raw')
    }
    lastEmitted.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (nextRole: string, nextSteps: FlowStep[]) => {
    const compiled = compileFlow(nextRole, nextSteps)
    lastEmitted.current = compiled
    onChange(compiled)
  }

  const updateRole = (v: string) => {
    setRole(v)
    emit(v, steps)
  }

  const updateStep = (id: string, field: 'title' | 'instruction', v: string) => {
    const next = steps.map(s => (s.id === id ? { ...s, [field]: v } : s))
    setSteps(next)
    emit(role, next)
  }

  const addStep = () => {
    const next = [...steps, { id: nextId(), title: '', instruction: '' }]
    setSteps(next)
    emit(role, next)
  }

  const removeStep = (id: string) => {
    const next = steps.filter(s => s.id !== id)
    setSteps(next)
    emit(role, next)
  }

  const moveStep = (id: string, dir: -1 | 1) => {
    const idx = steps.findIndex(s => s.id === id)
    const swapWith = idx + dir
    if (idx < 0 || swapWith < 0 || swapWith >= steps.length) return
    const next = [...steps]
    ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
    setSteps(next)
    emit(role, next)
  }

  const startFromScratch = () => {
    const freshRole = placeholderRole || 'You are a professional representative for {{company_name}}.'
    const freshSteps: FlowStep[] = [{ id: nextId(), title: 'Warm Greeting', instruction: 'Greet the customer and confirm they have a moment to talk.' }]
    setRole(freshRole)
    setSteps(freshSteps)
    setUnparseable(false)
    setMode('builder')
    emit(freshRole, freshSteps)
  }

  const ctrl = 'w-full rounded-xl border border-ds-line bg-ds-bg text-[15px] text-ds-ink outline-none transition-colors placeholder:text-ds-ink-3 hover:border-ds-line-strong focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20'
  const tab = (active: boolean) => `flex h-10 items-center gap-2 rounded-lg px-4 text-[15px] font-semibold transition-colors ${active ? 'border border-ds-primary/50 bg-ds-bg text-ds-primary shadow-sm' : 'border border-transparent text-ds-ink-2 hover:text-ds-ink'}`

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        {heading && <div className="min-w-0 flex-1 basis-[260px]">{heading}</div>}
        <div role="group" aria-label="Editor mode" className="inline-flex shrink-0 rounded-xl border border-ds-line bg-ds-surface p-1">
          <button type="button" aria-pressed={mode === 'builder'} onClick={() => setMode('builder')} className={tab(mode === 'builder')}>
            <ListChecks size={16} strokeWidth={1.75} /> Flow Builder
          </button>
          <button type="button" aria-pressed={mode === 'raw'} onClick={() => setMode('raw')} className={tab(mode === 'raw')}>
            <Code2 size={16} strokeWidth={1.75} /> Raw Text
          </button>
        </div>
      </div>

      {mode === 'raw' ? (
        <>
          {unparseable && (
            <p className="mb-3 rounded-lg bg-ds-warning-soft px-3.5 py-2.5 text-[14px] text-ds-warning-ink">
              This prompt doesn&apos;t match the Flow Builder&apos;s step format, so it&apos;s shown as text. You can keep editing it here, or start a fresh flow below (this replaces the current text).
            </p>
          )}
          <HighlightedTextarea
            ariaLabel="System prompt"
            value={value}
            onChange={(next) => { lastEmitted.current = next; onChange(next) }}
            placeholder="Enter your system prompt here..."
            minHeight={320}
            expandable
            showCount
          />
          <button type="button" onClick={startFromScratch} className="mt-2.5 text-[14px] font-semibold text-ds-primary hover:underline">
            Start a flow from scratch instead →
          </button>
        </>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="flow-role" className="text-[15px] font-semibold text-ds-ink">Agent role / identity</label>
            <p className="text-[14px] text-ds-ink-2">Who the agent is and the rules it always follows.</p>
            <textarea
              id="flow-role"
              value={role}
              onChange={(e) => updateRole(e.target.value)}
              className={`${ctrl} min-h-[110px] resize-y p-3.5 leading-relaxed`}
              placeholder="e.g. You are a professional sales consultant representing {{company_name}}."
            />
          </div>

          <div>
            <p className="text-[15px] font-semibold text-ds-ink">Call steps <span className="font-normal text-ds-ink-2">(in order)</span></p>
            <p className="mb-3 text-[14px] text-ds-ink-2">Objective, qualification questions, objection handling, and closing, one step at a time.</p>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="flex gap-3 rounded-xl border border-ds-line bg-ds-surface/70 p-3.5">
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[14px] font-semibold text-ds-primary">{i + 1}</span>
                    <button type="button" onClick={() => moveStep(s.id, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`} className="flex h-7 w-7 items-center justify-center rounded text-ds-ink-3 hover:bg-ds-bg hover:text-ds-ink disabled:opacity-30">
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" onClick={() => moveStep(s.id, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`} className="flex h-7 w-7 items-center justify-center rounded text-ds-ink-3 hover:bg-ds-bg hover:text-ds-ink disabled:opacity-30">
                      <ArrowDown size={15} />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      aria-label={`Step ${i + 1} name`}
                      value={s.title}
                      onChange={(e) => updateStep(s.id, 'title', e.target.value)}
                      placeholder="Step name (e.g. Discovery question)"
                      className={`${ctrl} h-10 px-3 font-semibold`}
                    />
                    <textarea
                      aria-label={`Step ${i + 1} instruction`}
                      value={s.instruction}
                      onChange={(e) => updateStep(s.id, 'instruction', e.target.value)}
                      placeholder="What should the agent say or ask in this step?"
                      className={`${ctrl} min-h-[84px] resize-y px-3 py-2.5 leading-relaxed`}
                    />
                  </div>
                  <button type="button" onClick={() => removeStep(s.id)} aria-label={`Remove step ${i + 1}`} className="flex h-8 w-8 items-center justify-center self-start rounded-lg text-ds-ink-3 hover:bg-ds-error-soft hover:text-ds-error-ink">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" onClick={addStep} className="mt-3 flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-ds-line-strong px-4 text-[15px] font-semibold text-ds-ink-2 hover:border-ds-primary hover:text-ds-primary">
              <Plus size={16} /> Add step
            </button>
          </div>

          <div>
            <button type="button" onClick={() => setShowPreview(v => !v)} aria-pressed={showPreview} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-semibold text-ds-ink-2 hover:bg-ds-surface hover:text-ds-ink">
              {showPreview ? <EyeOff size={15} /> : <Eye size={15} />} {showPreview ? 'Hide' : 'View'} generated prompt
            </button>
            {showPreview && (
              <div className="mt-2">
                <p className="mb-1.5 text-[15px] font-semibold text-ds-ink">Generated prompt <span className="font-normal text-ds-ink-2">(this is what gets saved)</span></p>
                <pre className="w-full whitespace-pre-wrap rounded-xl border border-ds-line bg-ds-surface p-3.5 font-mono text-[13px] leading-relaxed text-ds-ink-2">{compileFlow(role, steps)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

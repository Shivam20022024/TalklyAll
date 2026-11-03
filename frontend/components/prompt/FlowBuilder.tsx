'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus, Eye, EyeOff, Code2, ListChecks } from 'lucide-react'

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
}

export default function FlowBuilder({ value, onChange, placeholderRole }: FlowBuilderProps) {
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode('builder')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${mode === 'builder' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ListChecks size={13} /> Flow Builder
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${mode === 'raw' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Code2 size={13} /> Raw Text
          </button>
        </div>
        {mode === 'builder' && (
          <button
            type="button"
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />} {showPreview ? 'Hide' : 'View'} generated prompt
          </button>
        )}
      </div>

      {mode === 'raw' ? (
        <>
          {unparseable && (
            <p className="mb-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              This prompt doesn't match the Flow Builder's step format, so it's shown as text. You can keep editing it here, or start a fresh flow below (this replaces the current text).
            </p>
          )}
          <textarea
            value={value}
            onChange={(e) => { lastEmitted.current = e.target.value; onChange(e.target.value) }}
            className="w-full h-[420px] resize-none rounded-lg border border-border bg-background p-4 text-sm font-mono outline-none focus:ring-2 focus:ring-primary leading-relaxed"
            placeholder="Enter your system prompt here..."
          />
          <button
            type="button"
            onClick={startFromScratch}
            className="mt-2 text-xs font-semibold text-primary hover:underline"
          >
            Start a Flow from scratch instead →
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-foreground">Agent Role / Identity</label>
            <textarea
              value={role}
              onChange={(e) => updateRole(e.target.value)}
              className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary leading-relaxed min-h-[70px]"
              placeholder="e.g. You are a professional sales consultant representing {{company_name}}."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-foreground">Call Steps (in order)</label>
            <div className="space-y-2.5">
              {steps.map((s, i) => (
                <div key={s.id} className="flex gap-2 rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
                    <button type="button" onClick={() => moveStep(s.id, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveStep(s.id, 1)} disabled={i === steps.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={s.title}
                      onChange={(e) => updateStep(s.id, 'title', e.target.value)}
                      placeholder="Step name (e.g. Discovery Question)"
                      className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary"
                    />
                    <textarea
                      value={s.instruction}
                      onChange={(e) => updateStep(s.id, 'instruction', e.target.value)}
                      placeholder="What should the agent say or ask in this step?"
                      className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary min-h-[56px]"
                    />
                  </div>
                  <button type="button" onClick={() => removeStep(s.id)} className="self-start text-muted-foreground hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStep}
              className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus size={14} /> Add Step
            </button>
          </div>

          {showPreview && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-foreground">Generated prompt (this is what gets saved)</label>
              <pre className="w-full whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono leading-relaxed text-muted-foreground">{compileFlow(role, steps)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

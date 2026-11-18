'use client'

import { useState, type Ref } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

const PLACEHOLDER_RE = /(\{\{[^{}\n]+\}\})/g

/** Splits text so every {{placeholder}} can be drawn with its own colour. Display only. */
function tokens(text: string) {
  return text.split(PLACEHOLDER_RE).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[4px] bg-blue-50 text-ds-primary [box-decoration-break:clone]">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

/**
 * A normal <textarea> (it owns the value, caret, selection and typing) laid over a
 * mirror of its own text, so {{placeholders}} read as blue chips without changing the
 * stored text. The mirror and the textarea share one grid cell, so they always wrap
 * identically and only the outer frame scrolls.
 */
export function HighlightedTextarea({
  value,
  onChange,
  ariaLabel,
  placeholder,
  minHeight = 280,
  expandable = false,
  showCount = false,
  textareaRef,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  placeholder?: string
  minHeight?: number
  expandable?: boolean
  showCount?: boolean
  textareaRef?: Ref<HTMLTextAreaElement>
}) {
  const [expanded, setExpanded] = useState(false)
  const textCls = 'px-4 py-3.5 text-[16px] leading-[1.75] [overflow-wrap:break-word] [tab-size:4]'

  return (
    <div className="overflow-hidden rounded-xl border border-ds-line bg-ds-bg transition-colors focus-within:border-ds-primary focus-within:ring-2 focus-within:ring-ds-primary/20 hover:border-ds-line-strong">
      <div className={`overflow-auto ${expanded ? 'max-h-[80vh]' : 'max-h-[460px]'}`}>
        <div className="relative grid" style={{ minHeight }}>
          <div aria-hidden="true" className={`pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap text-ds-ink ${textCls}`}>
            {tokens(value)}
            {'\n'}
          </div>
          <textarea
            ref={textareaRef}
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            className={`col-start-1 row-start-1 block h-full w-full resize-none overflow-hidden bg-transparent text-transparent caret-ds-ink outline-none selection:bg-blue-200/70 placeholder:text-ds-ink-3 ${textCls}`}
          />
        </div>
      </div>
      {(showCount || expandable) && (
        <div className="flex items-center justify-between gap-3 border-t border-ds-line bg-ds-surface/60 px-4 py-2.5 text-[14px] text-ds-ink-2">
          <span className="tabular-nums">{value.length.toLocaleString()} characters</span>
          {expandable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              aria-label={expanded ? 'Shrink editor' : 'Expand editor'}
              title={expanded ? 'Shrink editor' : 'Expand editor'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ds-ink-2 hover:bg-ds-bg hover:text-ds-primary"
            >
              {expanded ? <Minimize2 size={16} strokeWidth={1.75} /> : <Maximize2 size={16} strokeWidth={1.75} />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

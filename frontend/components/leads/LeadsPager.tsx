'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

/**
 * Numbered pager for a list that is already loaded in full. Presentation only:
 * it reports the page the user picked and the page itself owns the slicing.
 */
export function LeadsPager({
  page,
  pageSize,
  total,
  onChange,
  noun = 'leads',
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  noun?: string
}) {
  if (total === 0) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)

  // Up to five page numbers, centred on the current page.
  const windowSize = Math.min(5, pages)
  const start = Math.min(Math.max(0, page - Math.floor(windowSize / 2)), pages - windowSize)
  const numbers = Array.from({ length: windowSize }, (_, i) => start + i)

  const base =
    'flex h-10 w-10 items-center justify-center rounded-lg border text-[15px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const idle = 'border-ds-line bg-ds-bg text-ds-ink-2 hover:bg-ds-surface hover:text-ds-ink disabled:hover:bg-ds-bg'

  return (
    <nav aria-label="Pagination" className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <p className="text-[15px] text-ds-ink-2 tabular-nums">
        Showing <span className="font-medium text-ds-ink">{from}</span> to <span className="font-medium text-ds-ink">{to}</span> of{' '}
        <span className="font-medium text-ds-ink">{total}</span> {noun}
      </p>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={`${base} ${idle} max-sm:hidden`} onClick={() => onChange(0)} disabled={page === 0} aria-label="First page">
            <ChevronsLeft size={17} />
          </button>
          <button type="button" className={`${base} ${idle}`} onClick={() => onChange(page - 1)} disabled={page === 0} aria-label="Previous page">
            <ChevronLeft size={17} />
          </button>
          {numbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`Page ${n + 1}`}
              aria-current={n === page ? 'page' : undefined}
              className={`${base} ${n === page ? 'border-ds-primary bg-ds-primary text-white' : idle}`}
            >
              {n + 1}
            </button>
          ))}
          <button type="button" className={`${base} ${idle}`} onClick={() => onChange(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
            <ChevronRight size={17} />
          </button>
          <button type="button" className={`${base} ${idle} max-sm:hidden`} onClick={() => onChange(pages - 1)} disabled={page >= pages - 1} aria-label="Last page">
            <ChevronsRight size={17} />
          </button>
        </div>
      )}
    </nav>
  )
}

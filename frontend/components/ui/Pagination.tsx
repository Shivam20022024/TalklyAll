'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Client-side pager for lists already loaded in full. */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  noun = 'items',
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-ds-line bg-ds-bg text-ds-ink-2 hover:bg-ds-surface hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ds-bg';
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ds-ink-2">
      <p className="tabular-nums">
        {from}–{to} of {total} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => onChange(page - 1)} disabled={page === 0} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">
            Page {page + 1} of {pages}
          </span>
          <button type="button" className={btn} onClick={() => onChange(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}

/** "Load more" control for lists the API pages on the server. */
export function LoadMore({ onClick, loading, label = 'Load more' }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="h-9 rounded-lg border border-ds-line bg-ds-bg px-4 text-[13px] font-medium text-ds-ink hover:bg-ds-surface disabled:opacity-50"
      >
        {loading ? 'Loading…' : label}
      </button>
    </div>
  );
}

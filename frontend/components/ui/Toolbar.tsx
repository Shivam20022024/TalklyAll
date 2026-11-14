'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { Search, X } from 'lucide-react';

/** Row above a table or list: search on the left, filters/actions after it. Wraps on small screens. */
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

/** Pushes the following toolbar items to the right edge on wide screens. */
export function ToolbarSpacer() {
  return <div className="hidden flex-1 sm:block" aria-hidden="true" />;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  return (
    <div className={`relative w-full sm:w-64 ${className}`}>
      <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ds-ink-3" />
      <input
        {...rest}
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-ds-line bg-ds-bg pl-9 pr-8 text-[13px] text-ds-ink outline-none transition-colors placeholder:text-ds-ink-3 hover:border-ds-line-strong focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ds-ink-3 hover:bg-ds-surface hover:text-ds-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

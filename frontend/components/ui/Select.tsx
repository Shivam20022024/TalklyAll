import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

/** Native select with a consistent trigger style. Keeps native a11y and mobile pickers. */
export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`h-9 w-full appearance-none rounded-lg border border-ds-line bg-ds-bg py-0 pl-3 pr-8 text-[13px] text-ds-ink outline-none transition-colors hover:border-ds-line-strong focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20 ${className}`}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ds-ink-3" />
    </div>
  );
}

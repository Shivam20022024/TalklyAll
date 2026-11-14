import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

// Literal class names so Tailwind's scanner can see them (no `text-${align}`).
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * Semantic table primitives for CRM-style lists (Leads, Calls, Campaigns, Admin).
 * Plain <table> markup so screen readers and keyboard users get real table
 * semantics; the wrapper scrolls horizontally on narrow screens instead of
 * overflowing the page.
 */
export function Table({
  children,
  className = '',
  minWidth,
  message,
  label,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
  /**
   * Short name of the data ("Leads"). It becomes the accessible name of the scrollable region
   * ("Leads table"), so it never duplicates the heading of the section that contains the table.
   */
  label?: string;
  /**
   * Empty / loading / error content. Rendered below the scrolling table at the
   * card's visible width, so on phones it stays centred on screen instead of
   * being centred across a table that is wider than the viewport.
   */
  message?: ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-ds-line bg-ds-bg ${className}`}>
      {/* `relative` makes this scroller the containing block for absolutely
          positioned descendants (e.g. visually-hidden sr-only labels in header
          cells). Without it they resolve against the page and, sitting at the
          far edge of a wide table, stretch the whole document horizontally. */}
      {/* Focusable + named so keyboard users can scroll a table that is wider than the screen. */}
      <div role="region" aria-label={label ? `${label} table` : 'Data table'} tabIndex={0} className="relative overflow-x-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ds-primary">
        <table className="w-full border-collapse text-left text-[13px]" style={minWidth ? { minWidth } : undefined}>
          {children}
        </table>
      </div>
      {message && <div className="border-t border-ds-line">{message}</div>}
    </div>
  );
}

export function THead({ children, sticky = false }: { children: ReactNode; sticky?: boolean }) {
  return (
    <thead className={`border-b border-ds-line bg-ds-surface ${sticky ? 'sticky top-0 z-10' : ''}`}>{children}</thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-ds-line">{children}</tbody>;
}

export function TR({ children, className = '', selected = false, ...rest }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      {...rest}
      aria-selected={selected || undefined}
      className={`transition-colors ${selected ? 'bg-ds-primary-soft/50' : 'hover:bg-ds-surface'} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TH({ children, className = '', align = 'left', ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      {...rest}
      className={`h-10 whitespace-nowrap px-4 text-xs font-medium text-ds-ink-3 ${ALIGN[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export type SortDir = 'asc' | 'desc';

/** Column header that toggles sorting; exposes aria-sort for screen readers. */
export function SortTH({
  children,
  active,
  dir,
  onSort,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`h-10 whitespace-nowrap px-4 text-xs font-medium ${ALIGN[align]} ${className}`}
    >
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-1 rounded hover:text-ds-ink ${active ? 'text-ds-ink' : 'text-ds-ink-3'}`}
      >
        {children}
        <span aria-hidden="true" className={`text-[10px] ${active ? 'opacity-100' : 'opacity-30'}`}>
          {active && dir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  );
}

export function TD({ children, className = '', align = 'left', ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td {...rest} className={`px-4 py-3 align-middle text-ds-ink ${ALIGN[align]} ${className}`}>
      {children}
    </td>
  );
}


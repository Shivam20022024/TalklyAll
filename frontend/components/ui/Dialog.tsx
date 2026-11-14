'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal behaviour: focus moves into the panel on open and returns to the
 * trigger on close, Tab stays inside the panel, Escape closes, and the page
 * behind does not scroll.
 */
function useModal(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, panelRef]);
}

function Header({ titleId, title, description, onClose, children }: { titleId: string; title: ReactNode; description?: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ds-line px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-base font-semibold text-ds-ink">
          {title}
        </h2>
        {description && <div className="mt-0.5 text-[13px] text-ds-ink-2">{description}</div>}
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ds-ink-3 hover:bg-ds-surface hover:text-ds-ink"
      >
        <X size={17} />
      </button>
    </div>
  );
}

/** Centred dialog for short forms and confirmations. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(open, onClose, panelRef);
  if (!open) return null;
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ds-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-xl border border-ds-line bg-ds-bg shadow-ds-pop outline-none sm:rounded-xl`}
      >
        <Header titleId={titleId} title={title} description={description} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ds-line bg-ds-surface px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Right-hand side sheet for record details (lead, call). Full width on phones. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  headerExtra,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(open, onClose, panelRef);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ds-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col border-l border-ds-line bg-ds-bg shadow-ds-pop outline-none sm:max-w-xl"
      >
        <Header titleId={titleId} title={title} description={description} onClose={onClose}>
          {headerExtra}
        </Header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/** Label/value grid used inside detail sheets. */
export function DetailGrid({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ds-line bg-ds-line">
      {items.map((it, i) => (
        <div key={i} className="min-w-0 bg-ds-bg px-3.5 py-3">
          <dt className="text-xs text-ds-ink-3">{it.label}</dt>
          <dd className="mt-0.5 break-words text-[13px] font-medium text-ds-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Titled block inside a detail sheet. */
export function SheetSection({ title, icon, action, children }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ds-ink">
          {icon && <span className="text-ds-ink-3">{icon}</span>}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

'use client';

import type { KeyboardEvent } from 'react';

/**
 * Underlined tab strip with proper tab semantics (role="tablist" / "tab",
 * arrow-key navigation). Give the content below it role="tabpanel" with
 * id={`${idPrefix}-panel`} and aria-labelledby={`${idPrefix}-tab-${value}`}.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  idPrefix: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.indexOf(value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next]);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${tabs[next]}`)?.focus());
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-ds-line">
      {tabs.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            id={`${idPrefix}-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t)}
            className={`-mb-px h-10 shrink-0 whitespace-nowrap border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ds-primary ${
              active ? 'border-ds-primary text-ds-primary' : 'border-transparent text-ds-ink-2 hover:text-ds-ink'
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

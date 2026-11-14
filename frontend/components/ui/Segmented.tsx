'use client';

/** Compact single-choice button group (range selectors, view switches). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-lg border border-ds-line bg-ds-surface p-0.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`h-7 rounded-md px-3 text-xs font-medium transition-colors ${
              active ? 'bg-ds-bg text-ds-ink shadow-[0_0_0_1px_var(--color-ds-line)]' : 'text-ds-ink-2 hover:text-ds-ink'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

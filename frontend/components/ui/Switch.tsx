'use client';

/**
 * Accessible on/off switch (role="switch"). Always pass a label: either
 * `aria-label` or `aria-labelledby` pointing at visible text.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  ...aria
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...aria}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-ds-primary' : 'bg-ds-line-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

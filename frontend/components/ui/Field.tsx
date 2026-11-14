'use client';

import { cloneElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';

/** The props Field reads from / injects into its single control child. */
type ControlProps = {
  id?: string;
  required?: boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
};

const CONTROL =
  'w-full rounded-lg border border-ds-line bg-ds-bg text-[13px] text-ds-ink outline-none transition-colors placeholder:text-ds-ink-3 hover:border-ds-line-strong focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/20 disabled:cursor-not-allowed disabled:bg-ds-surface disabled:text-ds-ink-3 aria-[invalid=true]:border-ds-error aria-[invalid=true]:focus-visible:ring-ds-error/20';

// React 19 passes `ref` to function components as a regular prop, so declaring
// it here lets callers attach refs; it is forwarded via the props spread.
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...props} className={`h-9 px-3 ${CONTROL} ${className}`} />;
}

export function Textarea({ className = '', rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea rows={rows} {...props} className={`px-3 py-2 leading-relaxed ${CONTROL} ${className}`} />;
}

/** Native checkbox with brand styling. Always give it an aria-label when it has no visible label. */
export function Checkbox({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="checkbox" {...props} className={`h-4 w-4 cursor-pointer rounded border-ds-line accent-ds-primary max-md:h-6 max-md:w-6 ${className}`} />;
}

export function Label({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-ds-ink">
      {children}
      {required && (
        <span className="ml-0.5 text-ds-error-ink" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

/**
 * Label + control + hint/error, wired for accessibility: the control receives
 * a generated id, aria-describedby pointing at the hint/error, and
 * aria-invalid when an error is shown. Pass exactly one control as the child.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<ControlProps>;
  className?: string;
}) {
  const id = useId();
  const childProps = children.props;
  const controlId = childProps.id ?? id;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const control = cloneElement(children, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : childProps['aria-invalid'],
    required: required ?? childProps.required,
  });

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={controlId} required={required}>
        {label}
      </Label>
      {control}
      {error ? (
        <p id={errorId} className="text-xs text-ds-error-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ds-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

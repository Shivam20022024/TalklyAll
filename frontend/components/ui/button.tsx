import React from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
/** `icon` is a square 36px button; give it an aria-label. */
type Size = 'sm' | 'md' | 'lg' | 'icon';

const BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ds-primary text-white hover:bg-ds-primary-hover border border-transparent',
  secondary: 'bg-ds-primary-soft text-ds-primary hover:bg-ds-primary-soft/70 border border-transparent',
  outline: 'bg-ds-bg text-ds-ink border border-ds-line hover:bg-ds-surface hover:border-ds-line-strong',
  ghost: 'bg-transparent text-ds-ink-2 border border-transparent hover:bg-ds-surface hover:text-ds-ink',
  danger: 'bg-ds-bg text-ds-error-ink border border-ds-line hover:bg-ds-error-soft hover:border-ds-error/30',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3.5 text-[13px]',
  lg: 'h-10 px-4 text-sm',
  icon: 'h-9 w-9 p-0',
};

/** Class string for styling links (next/link) as buttons without nesting elements. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', children, className = '', ...props }) => {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
};

export default Button;

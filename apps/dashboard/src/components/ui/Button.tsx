import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
  link: 'text-primary underline-offset-4 hover:underline',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-9 gap-2 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Disables the button and swaps in a spinner, so one click cannot become two. */
  isPending?: boolean;
  icon?: ReactNode;
}

/**
 * The one place a dashboard action gets its shape.
 *
 * Every page used to spell its own out, which is why the same action could be a filled
 * button on one screen and bare red text on another.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isPending, icon, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || isPending}
      aria-busy={isPending || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'link' ? 'h-auto p-0' : SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {/* Grows the tap area to the 44px minimum on touch, without moving the visual box. */}
      {variant !== 'link' && (
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
          aria-hidden="true"
        />
      )}
      {isPending ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export default Button;

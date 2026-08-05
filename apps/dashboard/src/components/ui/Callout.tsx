import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { BadgeTone } from './Badge';

const TONES: Record<BadgeTone, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive',
  info: 'border-info/40 bg-info/10 text-info',
  neutral: 'border-border bg-muted text-muted-foreground',
};

/**
 * The boxed aside that explains a setting or warns about one.
 *
 * The pages wrote these as `bg-amber-50 border-amber-200 text-amber-800`, a palette with
 * no dark counterpart, so each one stayed a pale wash on a near-black card. Same shape,
 * held in tokens.
 */
export default function Callout({
  tone = 'neutral',
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('rounded-md border p-4 text-sm', TONES[tone], className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && 'mt-1', 'opacity-90')}>{children}</div>}
    </div>
  );
}

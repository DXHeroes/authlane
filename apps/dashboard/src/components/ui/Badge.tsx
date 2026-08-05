import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<BadgeTone, string> = {
  success: 'bg-success/10 text-success ring-success/25',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  danger: 'bg-destructive/10 text-destructive ring-destructive/25',
  info: 'bg-info/10 text-info ring-info/25',
  neutral: 'bg-muted text-muted-foreground ring-border',
};

/**
 * Status colour, held in tokens rather than in `bg-green-100` on six different pages.
 * The literal Tailwind palette those pages used has no dark counterpart, so every badge
 * stayed a pale wash on a near-black card.
 */
export default function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** The shared reading of a connection's state, so one page cannot disagree with another. */
export function connectionTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
    case 'connected':
      return 'success';
    case 'expired':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

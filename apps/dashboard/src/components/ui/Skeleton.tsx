// biome-ignore-all lint/suspicious/noArrayIndexKey: Placeholders have no identity to key on;
// the list never reorders, it is replaced wholesale the moment the data lands.
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden="true" />;
}

/**
 * Placeholders are sized like the thing they stand in for. A centred "Loading..."
 * costs a full relayout the moment the data lands.
 */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex gap-4 border-b border-border px-6 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 px-6 py-4">
            {Array.from({ length: columns }, (_, index) => (
              <Skeleton key={index} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Wraps a loading region so assistive tech is told to wait rather than read a blank. */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

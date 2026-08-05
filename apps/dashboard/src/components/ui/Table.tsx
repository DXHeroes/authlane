import type { HTMLAttributes, ReactNode, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * A table needs a name for anyone not looking at the heading above it, and the header
 * row needs to stay put once the body is longer than the viewport.
 */
export function Table({
  caption,
  className,
  children,
}: {
  caption: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap bg-card px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-6 py-4 text-sm', className)} {...props}>
      {children}
    </td>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 border-b border-border">{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-accent/50', className)} {...props}>
      {children}
    </tr>
  );
}

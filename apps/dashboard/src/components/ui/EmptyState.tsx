import type { ComponentType, ReactNode } from 'react';

/**
 * An empty screen is an invitation to act, so this always has room for the next step
 * rather than stopping at "nothing here".
 */
export default function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5 fill-current" aria-hidden={true} />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {children && (
        <div className="mt-2 max-w-md text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline">
          {children}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

import { cn } from '@/lib/utils';

/**
 * The one control that turns a thing on.
 *
 * Services and MCP Servers both offer a catalogue the tenant switches on entry by entry, and each
 * had written its own toggle out by hand. Two copies of a control is two chances for them to
 * disagree about what "on" looks like, and the label is the part that matters most: the accessible
 * name has to say which entry is being switched, because "Enabled" on its own tells a screen reader
 * nothing about what it belongs to.
 */
export default function Switch({
  checked,
  label,
  disabled,
  onToggle,
  className,
}: {
  checked: boolean;
  /** What is being switched. Becomes "Enable Linear" / "Disable Linear". */
  label: string;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${checked ? 'Disable' : 'Enable'} ${label}`}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'group flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
          'transition-colors duration-200 ease-in-out',
          checked ? 'bg-success' : 'bg-muted-foreground/35'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg',
            'ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </span>
      <span
        className={cn('text-sm', checked ? 'font-medium text-success' : 'text-muted-foreground')}
      >
        {checked ? 'Enabled' : 'Disabled'}
      </span>
    </button>
  );
}

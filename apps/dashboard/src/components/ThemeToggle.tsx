import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/16/solid';
import { type Theme, useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof SunIcon }> = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: ComputerDesktopIcon },
];

/**
 * Three states rather than a switch: "system" is the honest default, and a two-way
 * toggle cannot express it.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          title={label}
          className={cn(
            'relative grid h-7 flex-1 place-items-center rounded-[5px] transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            theme === value
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
            aria-hidden="true"
          />
          <Icon className="size-4 fill-current" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </fieldset>
  );
}

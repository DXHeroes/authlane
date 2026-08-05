import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from '@/components/ThemeToggle';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

function setSystemPrefersDark(prefersDark: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  );
}

function CurrentTheme() {
  const { theme, resolvedTheme } = useTheme();
  return <span data-testid="state">{`${theme}/${resolvedTheme}`}</span>;
}

/**
 * The dark tokens existed in the stylesheet from the start; nothing ever put the class on
 * the document, which is what left the theme half-built.
 */
describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    setSystemPrefersDark(false);
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('follows the operating system until someone picks a side', () => {
    setSystemPrefersDark(true);
    render(
      <ThemeProvider>
        <CurrentTheme />
      </ThemeProvider>
    );

    expect(screen.getByTestId('state')).toHaveTextContent('system/dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('puts the class on the document when dark is chosen', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('takes the class off again when light is chosen', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await user.click(screen.getByRole('button', { name: 'Light' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  // The inline script in index.html reads this key before the first paint. If the
  // provider stopped writing it, the theme would flash light on every reload.
  it('remembers the choice under the key the pre-paint script reads', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(localStorage.getItem('authlane:theme')).toBe('dark');
  });

  it('restores a remembered choice over the operating system preference', () => {
    localStorage.setItem('authlane:theme', 'dark');
    setSystemPrefersDark(false);

    render(
      <ThemeProvider>
        <CurrentTheme />
      </ThemeProvider>
    );

    expect(screen.getByTestId('state')).toHaveTextContent('dark/dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

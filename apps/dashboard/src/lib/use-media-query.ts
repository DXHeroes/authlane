import { useEffect, useState } from 'react';

/**
 * Switches which markup renders, rather than hiding one copy with CSS.
 *
 * A six-column table and a card list both in the DOM would be read twice by a screen
 * reader and matched twice by any query for a cell's text. Only one exists at a time.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', handleChange);
    return () => list.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/** Tailwind's `sm` breakpoint, so the switch happens where the utility classes do. */
export function useIsCompact(): boolean {
  return !useMediaQuery('(min-width: 640px)');
}

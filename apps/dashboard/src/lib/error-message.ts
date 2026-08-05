/**
 * Reads the parts of a failure a person needs to see.
 *
 * Deliberately duck-typed rather than narrowing on `DashboardApiError`: this is imported
 * by every page's mutation handlers, and an `instanceof` check would make each of their
 * tests restate the class in its module mock.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** The message the API meant to be read, whatever shape the failure arrived in. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (typeof error === 'string' && error) return error;
  const message = asRecord(error)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/** The API's own advice on what to do next, when it offered any. */
export function errorHint(error: unknown): string | undefined {
  const hint = asRecord(error)?.hint;
  return typeof hint === 'string' && hint ? hint : undefined;
}

/**
 * The origin an OAuth provider is told to redirect back to.
 *
 * Every redirect URI Authlane hands out has to come from here. The authorize step builds one, the
 * token exchange resends the same string, a dynamically registered client is registered with it,
 * and the dashboard shows it to a tenant to paste into their own application. If any two of those
 * disagree the provider rejects the redirect, and the failure surfaces at the provider with
 * nothing in our logs to explain it.
 *
 * `APP_URL` is deliberately not consulted: it points at the dashboard, which in development is a
 * different origin (`localhost:5173`) from the API (`localhost:3000`), and a callback registered
 * there would never be reached.
 */
export function publicApiBase(requestUrl: string): string {
  return process.env.BETTER_AUTH_URL || new URL(requestUrl).origin;
}

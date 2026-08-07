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

/**
 * The redirect URI for one service, built the one way.
 *
 * The authorize step sends this to the provider, the token exchange resends it, dynamic client
 * registration registers it, and both dashboard pages show it to the owner to paste into a
 * provider console. A second spelling anywhere in that set produces a redirect the provider
 * rejects, with the failure surfacing at the provider and nothing here to explain it — which is
 * exactly why a service owner could not previously work the URI out by hand.
 *
 * `serviceId` is a built-in catalog id or a tenant MCP server id; both callbacks are the same
 * route.
 */
export function oauthCallbackUrl(apiBaseUrl: string, serviceId: string): string {
  return new URL(`/api/v1/oauth/${serviceId}/callback`, apiBaseUrl).toString();
}

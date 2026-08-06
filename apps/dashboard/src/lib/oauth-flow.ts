/**
 * The dashboard's half of better-auth's OAuth 2.1 authorization flow.
 *
 * When a downstream app sends a browser to `/api/auth/oauth2/authorize` without a session, the
 * oidc-provider plugin parks the whole request — it stores the query in a signed `oidc_login_prompt`
 * cookie and redirects to `loginPage` with the same query string appended. Two things then have to
 * be true for the user to end up back in the flow rather than on the dashboard home:
 *
 *  1. The login page has to recognise that it is standing in the middle of an authorization, and
 *  2. whatever finishes the sign-in has to hand the browser back to the authorization endpoint.
 *
 * The plugin's own `after` hook resumes the request from the cookie, but only on a response that
 * both carries that cookie and establishes a session. A magic link opened on a phone while the flow
 * started on a laptop has no such cookie, and the hook answers a browser `fetch` with a
 * `{redirect, url}` JSON body rather than a redirect the browser follows. Carrying the request
 * ourselves works in both cases, and re-entering `/oauth2/authorize` with a live session is
 * idempotent — the endpoint re-evaluates and lands on consent or on the client's redirect URI.
 */

const AUTHORIZE_PATH = '/api/auth/oauth2/authorize';
const CONSENT_PATH = '/oauth/consent';

/** Where a parked request waits out a detour through a page that cannot carry it in the URL. */
const STASH_KEY = 'authlane.oauth.parked_request';

/**
 * How long a parked request stays usable, matching the ten minutes better-auth gives the
 * `oidc_login_prompt` cookie. Without an expiry, an abandoned OAuth sign-in would sit in session
 * storage and hijack the next unrelated trip through two-factor.
 */
const STASH_MAX_AGE_MS = 600_000;

function rawQuery(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search;
}

/**
 * Which of somebody else's requests is parked on this page.
 *
 * Only the kind and the query are ever stored — never a built URL. Whatever takes the request back
 * turns the kind into a path through a fixed map of its own, so nothing that survives a round trip
 * through storage can decide where the browser goes.
 */
export type ParkedRequestKind = 'authorize' | 'consent';

export interface ParkedRequest {
  kind: ParkedRequestKind;
  query: string;
}

const PARKED_REQUEST_KINDS: readonly ParkedRequestKind[] = ['authorize', 'consent'];

/**
 * The parked authorization carried on this page's query string, or `null` when the page was
 * reached normally.
 *
 * Returns the query **exactly as it arrived** rather than a re-serialised copy. Handing it through
 * `URLSearchParams` would rewrite it — form encoding turns `%20` into `+` and re-escapes reserved
 * characters by its own rules — and `state`, `nonce` and `code_challenge` are compared downstream
 * by exact string equality. Nothing here needs to read the values, only to know they are present,
 * so nothing here decodes them.
 */
export function pendingAuthorizeQuery(search: string): string | null {
  const query = rawQuery(search);
  if (!query) return null;

  // Presence is read from a throwaway copy; the string returned is still the original.
  const params = new URLSearchParams(query);
  const isAuthorizeRequest =
    params.has('client_id') && params.has('redirect_uri') && params.has('response_type');

  return isAuthorizeRequest ? query : null;
}

/**
 * Whether the login page is standing in a **re-authentication** prompt.
 *
 * `prompt=login` and an expired `max_age` take a different exit out of the oidc-provider plugin's
 * authorize handler — its `requireLogin` branch. The user already has a session, so instead of the
 * full query the plugin forwards only `client_id`, `code` and `state`. That shape is not replayable
 * — it is missing `redirect_uri` and `response_type` — which is why {@link pendingAuthorizeQuery}
 * rightly returns null for it and nothing here tries to rebuild an authorize URL.
 *
 * It still has to be recognised. Without this, an authenticated user hitting the login page in this
 * shape is sent straight to the dashboard and the parked authorization dies silently, leaving the
 * application that asked waiting forever. Recognising it renders the sign-in form instead; the
 * plugin's `after` hook then resumes from its own cookie and strips `login` from the prompt itself,
 * so there is nothing for this side to rewrite.
 */
export function isReauthenticationPrompt(search: string): boolean {
  const params = new URLSearchParams(rawQuery(search));
  // `code_challenge` does not match: URLSearchParams.has is an exact name comparison.
  return params.has('client_id') && params.has('code') && params.has('state');
}

/**
 * The consent request carried on a query string, or null when there is none.
 *
 * The consent screen requires a session, and one can lapse between the authorization endpoint
 * issuing the redirect and the screen rendering. Carrying the request through the sign-in is what
 * lets the user come back to it rather than landing on the dashboard with the application still
 * waiting.
 */
export function pendingConsentQuery(search: string): string | null {
  const query = rawQuery(search);
  if (!query) return null;
  const params = new URLSearchParams(query);
  return params.has('consent_code') && params.has('client_id') ? query : null;
}

/**
 * Whether this query string parks somebody else's sign-in on the page reading it.
 *
 * The three shapes are checked together because they are one question — "is the login page allowed
 * to send this visitor to the dashboard?" — and answering it in two places is how a fourth shape
 * would end up handled in one of them and silently dropped by the other.
 */
export function parksAnAuthorization(search: string): boolean {
  return (
    pendingAuthorizeQuery(search) !== null ||
    pendingConsentQuery(search) !== null ||
    isReauthenticationPrompt(search)
  );
}

/** Where to send the browser to resume a parked authorization. */
export function authorizeUrl(query: string): string {
  return `${AUTHORIZE_PATH}?${query}`;
}

/** Where to send the browser to return to a consent screen. */
export function consentUrl(query: string): string {
  return `${CONSENT_PATH}?${query}`;
}

/**
 * Holds a parked request across a detour that cannot carry it in the URL.
 *
 * Two-factor is that detour: the request arrives on the login page, but the sign-in that follows
 * lands on /two-factor, which has no idea anything is in flight. The plugin's own cookie cannot
 * cover the gap — its `after` hook fires on the verify response, expires the cookie, and answers a
 * browser `fetch` with a redirect body, so the request is spent rather than merely missed by the
 * time anything else could act on it.
 */
export function stashParkedRequest(kind: ParkedRequestKind, query: string): void {
  try {
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ kind, query, at: Date.now() }));
  } catch {
    // Session storage can be unavailable (private mode, blocked storage). The flow still works
    // wherever the request survives in the URL; only the two-factor detour loses it.
  }
}

/**
 * Takes back a parked request, removing it. Returns null when there is none, when it cannot be
 * read, or when it has outlived the authorization it belongs to.
 */
export function takeParkedRequest(): ParkedRequest | null {
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STASH_KEY);

    const stashed = JSON.parse(raw) as { kind?: unknown; query?: unknown; at?: unknown };
    if (typeof stashed.query !== 'string' || typeof stashed.at !== 'number') return null;
    if (!PARKED_REQUEST_KINDS.includes(stashed.kind as ParkedRequestKind)) return null;
    if (Date.now() - stashed.at > STASH_MAX_AGE_MS) return null;

    return { kind: stashed.kind as ParkedRequestKind, query: stashed.query };
  } catch {
    return null;
  }
}

/** Drops a parked request that has been resumed by other means, or that no longer applies. */
export function clearParkedRequest(): void {
  try {
    window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    // Nothing to do: an unreadable store is also an unwritable one.
  }
}

/**
 * Whether a URL the server handed back is safe to navigate to.
 *
 * Every redirect URI is validated at registration and matched exactly at authorize time, so this
 * should never fail. It is here because the value ends up in `window.location`, and the one input
 * that must never reach it is a `javascript:` URL — a check that costs a line and closes the whole
 * category rather than trusting that no future code path relaxes the registration rules.
 */
export function isNavigableUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value, window.location.origin);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

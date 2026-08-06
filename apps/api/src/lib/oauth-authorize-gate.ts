/**
 * The membership gate in front of Authlane's OAuth authorization endpoint.
 *
 * The oidc-provider plugin authenticates the user but knows nothing about Authlane workspaces: a
 * signed-in user who belongs to no workspace of the client's organization would otherwise reach the
 * consent screen and receive a token whose `workspace` claim cannot be filled in. The gate turns
 * that into the OAuth error the downstream SaaS expects, at the point where a redirect is still
 * safe.
 *
 * Everything the gate cannot positively decide it passes through to the plugin, which owns the
 * error responses for unknown clients, disabled clients, bad redirect URIs and missing sessions.
 * That ordering is deliberate: the gate never redirects to a URI it has not itself matched against
 * the client's registered list.
 *
 * There are two ways into the authorization endpoint, and both are gated:
 *
 *  1. A direct `GET /api/auth/oauth2/authorize` — {@link evaluateOAuthAuthorizeRequest}.
 *  2. A sign-in that resumes a pending authorization. When authorize runs without a session the
 *     plugin stores the query in an `oidc_login_prompt` cookie, and a global `after` hook re-runs
 *     the authorization in-process on whatever response next establishes a session — a
 *     `POST /api/auth/sign-in/email`, not the authorize path. A path-scoped check alone would miss
 *     it, so {@link guardResumedOAuthAuthorize} inspects the outgoing response instead.
 *
 * Denying the resumed case takes more than swapping the redirect. By the time the response exists
 * the plugin has already minted an authorization code: it wrote a `verification` row and handed the
 * browser an `oidc_consent_prompt` cookie holding that code. `POST /oauth2/consent` accepts the code
 * from that cookie with only a session behind it, so a denial that copied the cookie through would
 * leave the user one request away from the code the denial exists to withhold. The denial therefore
 * also revokes what the plugin minted — see {@link guardResumedOAuthAuthorize}.
 */

import { and, type Database, eq, member, oauthApplication, verification } from '@authlane/database';

export interface AuthorizeGateAuth {
  api: {
    getSession(options: { headers: Headers }): Promise<{ session: { userId: string } } | null>;
  };
}

const NOT_A_MEMBER_DESCRIPTION = 'User is not a member of this AuthLane workspace';
const REFUSED_SCOPE = 'offline_access';
const REFUSED_SCOPE_DESCRIPTION = 'offline_access is not available';
const REPEATED_SCOPE_DESCRIPTION = 'scope must be provided exactly once';
const LOGIN_PROMPT_COOKIE = 'oidc_login_prompt';
const CONSENT_PROMPT_COOKIE = 'oidc_consent_prompt';
const SESSION_COOKIE_SUFFIX = 'session_token';
/** The plugin mints codes with `generateRandomString(32, 'a-z', 'A-Z', '0-9')`. */
const AUTHORIZATION_CODE = /^[A-Za-z0-9]{32}$/;

interface AuthorizeQuery {
  clientId: string | null;
  redirectUri: string | null;
  state: string | null;
  /** Every `scope` parameter as sent. More than one is a malformed request, not a scope list. */
  scope: string[];
}

function errorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null
): string {
  const target = new URL(redirectUri);
  target.searchParams.set('error', error);
  target.searchParams.set('error_description', description);
  if (state !== null) target.searchParams.set('state', state);
  return target.toString();
}

/**
 * Builds the error redirect for a request the gate must turn away, or `null` when the request is
 * none of the gate's business.
 *
 * The redirect URI is matched against the client's registered list here rather than trusted from
 * the request, so a caller can hand this function an unvalidated URI safely.
 */
async function denialTarget(
  db: Database,
  userId: string | null,
  query: AuthorizeQuery
): Promise<string | null> {
  const { clientId, redirectUri, state } = query;
  if (!clientId || !redirectUri) return null;

  const [client] = await db
    .select({
      organizationId: oauthApplication.organizationId,
      redirectUrls: oauthApplication.redirectUrls,
      disabled: oauthApplication.disabled,
    })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1);
  if (!client || client.disabled) return null;

  // The registered list is one comma-separated string, the shape the plugin reads and writes.
  // Matching is exact, as the plugin's own check is.
  if (!client.redirectUrls.split(',').includes(redirectUri)) return null;

  // A repeated `scope` parameter is malformed, and the plugin handles it by calling `.split` on an
  // array and returning a 500. Rejecting it here keeps the answer an OAuth error, and closes the
  // reading where `scope=openid&scope=offline_access` hides the refused scope behind the first value.
  if (query.scope.length > 1) {
    return errorRedirect(redirectUri, 'invalid_request', REPEATED_SCOPE_DESCRIPTION, state);
  }

  // Pairing is one-shot: Authlane issues no refresh tokens. The plugin unions `offline_access` into
  // its allowed scopes no matter what the config says (`authorize.mjs` rebuilds the list as
  // ["openid","profile","email","offline_access", ...options.scopes]), so refusing it here is the
  // only way to make that guarantee true. This runs before the session check on purpose — a scope
  // the server will never grant should not cost the user a trip through the login page first.
  if (query.scope[0]?.split(' ').includes(REFUSED_SCOPE)) {
    return errorRedirect(redirectUri, 'invalid_scope', REFUSED_SCOPE_DESCRIPTION, state);
  }

  if (!userId) return null;

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, client.organizationId)))
    .limit(1);
  if (membership) return null;

  return errorRedirect(redirectUri, 'access_denied', NOT_A_MEMBER_DESCRIPTION, state);
}

/**
 * Decides whether a direct authorize request must be turned away before it reaches the plugin.
 *
 * @returns the absolute URL to redirect the browser to, or `null` to let the plugin handle it.
 */
export async function evaluateOAuthAuthorizeRequest(
  db: Database,
  auth: AuthorizeGateAuth,
  request: Request
): Promise<string | null> {
  const query = new URL(request.url).searchParams;
  const session = await auth.api.getSession({ headers: request.headers });
  return denialTarget(db, session?.session.userId ?? null, {
    clientId: query.get('client_id'),
    redirectUri: query.get('redirect_uri'),
    state: query.get('state'),
    scope: query.getAll('scope'),
  });
}

function cookieValue(header: string | null, name: string): string | null {
  for (const pair of header?.split(';') ?? []) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}

/**
 * Reads the pending authorization query the plugin parked in a cookie.
 *
 * The cookie is signed, and the signature is not checked here: every field is re-validated against
 * the database before it is used, so a forged cookie can at worst name a client the user is not a
 * member of and be redirected to that client's own registered URI.
 */
function pendingAuthorization(request: Request): AuthorizeQuery | null {
  const raw = cookieValue(request.headers.get('cookie'), LOGIN_PROMPT_COOKIE);
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // The signature is appended after the JSON object, and the object's own values contain dots.
  const end = decoded.lastIndexOf('}');
  if (end < 0) return null;

  try {
    const query = JSON.parse(decoded.slice(0, end + 1)) as Record<string, unknown>;
    return {
      clientId: typeof query.client_id === 'string' ? query.client_id : null,
      redirectUri: typeof query.redirect_uri === 'string' ? query.redirect_uri : null,
      state: typeof query.state === 'string' ? query.state : null,
      // better-auth parks `ctx.query` verbatim, so a repeated parameter arrives here as an array.
      scope: Array.isArray(query.scope)
        ? query.scope.filter((value): value is string => typeof value === 'string')
        : typeof query.scope === 'string'
          ? [query.scope]
          : [],
    };
  } catch {
    return null;
  }
}

function setCookieValue(response: Response, name: string): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    if (value) return value;
  }
  return null;
}

/** Whether a URL is the redirect URI of the authorization being denied, ignoring its query. */
function isDeniedRedirect(candidate: string, redirectUri: string): boolean {
  try {
    const target = new URL(candidate, 'http://authlane.invalid');
    const expected = new URL(redirectUri);
    return target.origin === expected.origin && target.pathname === expected.pathname;
  } catch {
    return false;
  }
}

function codeFromRedirect(candidate: string, redirectUri: string): string | null {
  if (!isDeniedRedirect(candidate, redirectUri)) return null;
  const code = new URL(candidate, 'http://authlane.invalid').searchParams.get('code') ?? '';
  return AUTHORIZATION_CODE.test(code) ? code : null;
}

/**
 * Every authorization code the plugin may have minted while producing this response.
 *
 * The plugin has three endings, and each carries the code differently: a consent screen puts it in
 * the `oidc_consent_prompt` cookie, an already-consented client gets it on the redirect URI in the
 * `Location` header, and the same case answered to a browser `fetch` returns it in a
 * `{redirect, url}` JSON body with no Location at all.
 *
 * These candidates are NOT all server-minted. `POST /sign-in/email` takes a `callbackURL` that
 * better-auth echoes into the Location, so anyone signing in can put a string of their choosing
 * there. Both URL-bearing shapes are therefore accepted only when they point at the redirect URI
 * this denial already validated against the client's registered list, and every candidate is checked
 * against the stored authorization before it is deleted — see {@link revokeMintedAuthorizations}.
 */
async function mintedAuthorizationCodes(
  response: Response,
  redirectUri: string
): Promise<string[]> {
  const codes: string[] = [];

  const consentCookie = setCookieValue(response, CONSENT_PROMPT_COOKIE);
  if (consentCookie) {
    // The signed cookie is `<code>.<signature>`, and the code itself is alphanumeric.
    const code = decodeURIComponent(consentCookie).split('.')[0] ?? '';
    if (AUTHORIZATION_CODE.test(code)) codes.push(code);
  }

  const location = response.headers.get('location');
  if (location) {
    const code = codeFromRedirect(location, redirectUri);
    if (code) codes.push(code);
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await response.clone().json()) as { url?: unknown };
      if (typeof body.url === 'string') {
        const code = codeFromRedirect(body.url, redirectUri);
        if (code) codes.push(code);
      }
    } catch {
      // A body that will not parse carries no code to revoke.
    }
  }
  return codes;
}

/**
 * Deletes the authorization codes this denial withheld.
 *
 * A code is deleted only when the stored verification row names the very client and user this
 * denial is about. Without that check the guard would be an arbitrary delete against a table that
 * also holds password-reset, magic-link and email-verification tokens, reachable by anyone who
 * could put a known identifier into the response — which `callbackURL` allows.
 *
 * The shape check alone would not be enough: a magic-link identifier is also 32 alphanumerics and
 * its value is also JSON, just without these two fields. Ownership is what saves it.
 *
 * BEFORE ENABLING better-auth's MCP plugin, revisit this. That plugin writes a byte-identical
 * `{clientId, userId, …}` value under the same `oidc_login_prompt` cookie name, so this predicate
 * could not tell its codes from the oidc-provider's and would revoke one the MCP flow just minted.
 */
async function revokeMintedAuthorizations(
  db: Database,
  response: Response,
  query: AuthorizeQuery,
  userId: string
): Promise<void> {
  if (!query.redirectUri) return;

  for (const code of await mintedAuthorizationCodes(response, query.redirectUri)) {
    const [row] = await db
      .select({ value: verification.value })
      .from(verification)
      .where(eq(verification.identifier, code))
      .limit(1);
    if (!row) continue;

    let authorization: { clientId?: unknown; userId?: unknown };
    try {
      authorization = JSON.parse(row.value);
    } catch {
      // Not one of the plugin's authorization codes, whatever else it may be.
      continue;
    }
    if (authorization.clientId !== query.clientId || authorization.userId !== userId) continue;

    await db.delete(verification).where(eq(verification.identifier, code));
  }
}

function establishedSessionCookie(response: Response): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name.endsWith(SESSION_COOKIE_SUFFIX) && value) return `${name}=${value}`;
  }
  return null;
}

/**
 * Replaces a resumed authorization with the access_denied redirect when the user who just signed in
 * is not a member of the client's workspace.
 *
 * The plugin answers a resumed authorization the same way it answers a direct one: a JSON body for
 * a browser `fetch`, a 302 otherwise. The denial mirrors whichever shape applies, and carries the
 * original response's session cookies so the user stays signed in.
 *
 * It does NOT carry the `oidc_consent_prompt` cookie through, and deletes the verification rows
 * behind any code the plugin minted. Without both, a denied user could still post the cookie to
 * `/oauth2/consent` — which authenticates with a session and nothing else — and walk away with the
 * authorization code.
 */
export async function guardResumedOAuthAuthorize(
  db: Database,
  auth: AuthorizeGateAuth,
  request: Request,
  response: Response
): Promise<Response> {
  const pending = pendingAuthorization(request);
  if (!pending) return response;

  // Mirrors the plugin's own trigger: it only resumes on a response that establishes a session.
  const sessionCookie = establishedSessionCookie(response);
  if (!sessionCookie) return response;

  const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });
  if (!session) return response;

  const url = await denialTarget(db, session.session.userId, pending);
  if (!url) return response;

  // Revoke first: if this throws, the request fails closed with no cookies rather than answering a
  // denial that still has a redeemable code behind it.
  await revokeMintedAuthorizations(db, response, pending, session.session.userId);

  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) {
    if (cookie.split('=')[0]?.trim() === CONSENT_PROMPT_COOKIE) continue;
    headers.append('set-cookie', cookie);
  }
  // Same attributes the plugin sets it with, so the browser matches and drops the existing cookie.
  headers.append(
    'set-cookie',
    `${CONSENT_PROMPT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; HttpOnly`
  );

  if (request.headers.get('sec-fetch-mode') === 'cors') {
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify({ redirect: true, url }), { status: 200, headers });
  }
  headers.set('location', url);
  return new Response(null, { status: 302, headers });
}

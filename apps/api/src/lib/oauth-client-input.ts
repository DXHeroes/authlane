/**
 * What a workspace may submit when it registers a downstream OAuth client.
 *
 * Redirect URIs are the whole security surface of this endpoint: whatever is stored here is where
 * Authlane will hand an authorization code, and both better-auth's plugin and Authlane's own
 * authorize gate compare the request's `redirect_uri` to the stored list by exact string equality.
 * A value that survives validation is therefore a value that can receive codes, so the parsing is
 * deliberately narrow — anything ambiguous is rejected rather than normalised.
 *
 * Every result here is a discriminated union rather than a nullable pair, so a caller cannot read
 * the parsed value without having checked that parsing succeeded. That is the whole point of the
 * module: it would be a poor boundary that needed a cast to cross.
 */

/** `oauth_application.redirect_urls` is one comma-separated string, the shape the plugin reads. */
const REDIRECT_URL_SEPARATOR = ',';

const MAX_NAME_LENGTH = 120;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;

export type RedirectUriReason =
  | 'empty'
  | 'too-many'
  | 'not-a-string'
  | 'too-long'
  | 'malformed'
  | 'not-canonical'
  | 'insecure-scheme'
  | 'fragment'
  | 'wildcard'
  | 'comma'
  | 'credentials'
  | 'duplicate';

export interface RedirectUriRejection {
  reason: RedirectUriReason;
  /** The offending URI, when one value is to blame rather than the list as a whole. */
  value?: string;
  /** For `not-canonical`, the spelling that would have been accepted. */
  expected?: string;
}

export type RedirectUriCheck = { ok: true } | ({ ok: false } & RedirectUriRejection);

export interface OAuthClientRegistration {
  name: string;
  redirectUris: string[];
}

/**
 * Whether plaintext http is acceptable for this URL.
 *
 * Only loopback, and only outside production — the same rule the connect-session origin check
 * applies, so a developer's callback works and a deployed one cannot be plaintext.
 */
function isLocalDevelopmentUrl(url: URL): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

/**
 * Validates one redirect URI.
 *
 * The rejections are named rather than boolean so the endpoint can tell a workspace which rule its
 * URI broke; a bare "invalid redirect URI" sends people hunting for a typo that is not there.
 */
export function checkRedirectUri(value: string): RedirectUriCheck {
  if (value.length > MAX_REDIRECT_URI_LENGTH) return { ok: false, reason: 'too-long' };

  // Checked on the raw string, before parsing: a comma would be stored verbatim and then split
  // into two registered URIs on the way back out, so one submitted value could smuggle in a second
  // callback that nobody reviewed.
  if (value.includes(REDIRECT_URL_SEPARATOR)) return { ok: false, reason: 'comma', value };
  // A wildcard never matches anything under exact comparison, so accepting one only ever means a
  // workspace believes it registered a pattern that will silently never be honoured.
  if (value.includes('*')) return { ok: false, reason: 'wildcard', value };
  // Rejected on the raw string too: `new URL('https://a.test/cb#')` has an empty `hash`, and the
  // stored value would still differ from what a provider sends back.
  if (value.includes('#')) return { ok: false, reason: 'fragment', value };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'malformed', value };
  }
  // Relative inputs never parse, so anything here is absolute. What is left to refuse is a scheme
  // that is not https, except loopback http while developing.
  if (url.protocol !== 'https:' && !isLocalDevelopmentUrl(url)) {
    return { ok: false, reason: 'insecure-scheme', value };
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials', value };
  // A URL that does not round-trip would be stored in one spelling and compared against another.
  // Uppercase hosts, a default port written out, a missing trailing slash: all invisible in the
  // string the workspace pasted, so the canonical spelling is handed back rather than described.
  if (url.toString() !== value) {
    return { ok: false, reason: 'not-canonical', value, expected: url.toString() };
  }

  return { ok: true };
}

export type RedirectUriListResult =
  | { ok: true; redirectUris: string[] }
  | ({ ok: false } & RedirectUriRejection);

/** Validates the whole list a request supplies, preserving the order it was sent in. */
export function parseRedirectUris(value: unknown): RedirectUriListResult {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, reason: 'empty' };
  if (value.length > MAX_REDIRECT_URIS) return { ok: false, reason: 'too-many' };

  const redirectUris: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') return { ok: false, reason: 'not-a-string' };

    const check = checkRedirectUri(candidate);
    if (!check.ok) return check;
    if (seen.has(candidate)) return { ok: false, reason: 'duplicate', value: candidate };

    seen.add(candidate);
    redirectUris.push(candidate);
  }

  return { ok: true, redirectUris };
}

/** Human-readable reason, returned as the validation error's hint. */
function describeRedirectUriRejection(rejection: RedirectUriRejection): string {
  const suffix = rejection.value ? `: ${rejection.value}` : '';
  switch (rejection.reason) {
    case 'empty':
      return 'redirectUris must be a non-empty array of absolute URLs';
    case 'too-many':
      return `redirectUris accepts at most ${MAX_REDIRECT_URIS} URLs`;
    case 'not-a-string':
      return 'Every redirect URI must be a string';
    case 'too-long':
      return `A redirect URI may not exceed ${MAX_REDIRECT_URI_LENGTH} characters`;
    case 'malformed':
      return `A redirect URI must be an absolute URL${suffix}`;
    case 'not-canonical':
      return `A redirect URI must be sent in canonical form; expected ${rejection.expected}`;
    case 'insecure-scheme':
      return `A redirect URI must use https, or http on localhost outside production${suffix}`;
    case 'fragment':
      return `A redirect URI may not contain a fragment${suffix}`;
    case 'wildcard':
      return `A redirect URI may not contain a wildcard; matching is exact${suffix}`;
    case 'comma':
      return `A redirect URI may not contain a comma${suffix}`;
    case 'credentials':
      return `A redirect URI may not embed credentials${suffix}`;
    case 'duplicate':
      return `A redirect URI was listed twice${suffix}`;
  }
}

export type OAuthClientRegistrationResult =
  | { ok: true; registration: OAuthClientRegistration }
  | { ok: false; error: string; hint?: string };

/** Validates a client registration request body. */
export function parseOAuthClientRegistration(body: unknown): OAuthClientRegistrationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: 'A client name is required',
      hint: `Provide a name of 1 to ${MAX_NAME_LENGTH} characters`,
    };
  }

  const redirectUris = parseRedirectUris(record.redirectUris);
  if (!redirectUris.ok) {
    return {
      ok: false,
      error: 'Invalid redirect URI',
      hint: describeRedirectUriRejection(redirectUris),
    };
  }

  return { ok: true, registration: { name, redirectUris: redirectUris.redirectUris } };
}

export interface OAuthClientUpdate {
  redirectUris?: string[];
  disabled?: boolean;
  name?: string;
}

export type OAuthClientUpdateResult =
  | { ok: true; update: OAuthClientUpdate }
  | { ok: false; error: string; hint?: string };

/** Validates an update to an already registered client. */
export function parseOAuthClientUpdate(body: unknown): OAuthClientUpdateResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;

  const update: OAuthClientUpdate = {};

  if (record.name !== undefined) {
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH) {
      return {
        ok: false,
        error: 'Invalid client name',
        hint: `Provide a name of 1 to ${MAX_NAME_LENGTH} characters`,
      };
    }
    update.name = name;
  }

  if (record.disabled !== undefined) {
    if (typeof record.disabled !== 'boolean') {
      return { ok: false, error: 'disabled must be a boolean when provided' };
    }
    update.disabled = record.disabled;
  }

  if (record.redirectUris !== undefined) {
    const redirectUris = parseRedirectUris(record.redirectUris);
    if (!redirectUris.ok) {
      return {
        ok: false,
        error: 'Invalid redirect URI',
        hint: describeRedirectUriRejection(redirectUris),
      };
    }
    update.redirectUris = redirectUris.redirectUris;
  }

  if (Object.keys(update).length === 0) {
    return {
      ok: false,
      error: 'No fields to update',
      hint: 'At least one of: name, redirectUris, disabled must be provided',
    };
  }

  return { ok: true, update };
}

/** Splits the stored comma-separated column back into the list a client registered. */
export function redirectUrisFromStorage(stored: string): string[] {
  return stored.split(REDIRECT_URL_SEPARATOR).filter(Boolean);
}

/** Joins a validated list into the column format the plugin reads. */
export function redirectUrisToStorage(redirectUris: readonly string[]): string {
  return redirectUris.join(REDIRECT_URL_SEPARATOR);
}

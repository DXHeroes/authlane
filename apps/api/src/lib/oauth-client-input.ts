/**
 * What a workspace may submit when it registers a downstream OAuth client.
 *
 * Redirect URIs are the whole security surface of this endpoint: whatever is stored here is where
 * Authlane will hand an authorization code, and both better-auth's plugin and Authlane's own
 * authorize gate compare the request's `redirect_uri` to the stored list by exact string equality.
 * A value that survives validation is therefore a value that can receive codes, so the parsing is
 * deliberately narrow — anything ambiguous is rejected rather than normalised.
 */

/** `oauth_application.redirect_urls` is one comma-separated string, the shape the plugin reads. */
const REDIRECT_URL_SEPARATOR = ',';

const MAX_NAME_LENGTH = 120;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;

export type RedirectUriRejection =
  | 'empty'
  | 'too-many'
  | 'not-a-string'
  | 'too-long'
  | 'malformed'
  | 'insecure-scheme'
  | 'fragment'
  | 'wildcard'
  | 'comma'
  | 'credentials'
  | 'duplicate';

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
 * Validates one redirect URI, returning why it was refused.
 *
 * The rejections are named rather than boolean so the endpoint can tell a workspace which rule its
 * URI broke; a bare "invalid redirect URI" sends people hunting for a typo that is not there.
 */
export function checkRedirectUri(value: unknown): RedirectUriRejection | null {
  if (typeof value !== 'string') return 'not-a-string';
  if (value.length > MAX_REDIRECT_URI_LENGTH) return 'too-long';

  // Checked on the raw string, before parsing: a comma would be stored verbatim and then split
  // into two registered URIs on the way back out, so one submitted value could smuggle in a second
  // callback that nobody reviewed.
  if (value.includes(REDIRECT_URL_SEPARATOR)) return 'comma';
  // A wildcard never matches anything under exact comparison, so accepting one only ever means a
  // workspace believes it registered a pattern that will silently never be honoured.
  if (value.includes('*')) return 'wildcard';
  // Rejected on the raw string too: `new URL('https://a.test/cb#')` has an empty `hash`, and the
  // stored value would still differ from what a provider sends back.
  if (value.includes('#')) return 'fragment';

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'malformed';
  }
  // Relative inputs never parse, so anything here is absolute. What is left to refuse is a scheme
  // that is not https, except loopback http while developing.
  if (url.protocol !== 'https:' && !isLocalDevelopmentUrl(url)) return 'insecure-scheme';
  if (url.username || url.password) return 'credentials';
  // A URL that does not round-trip would be stored in one spelling and compared against another.
  if (url.toString() !== value) return 'malformed';

  return null;
}

export interface RedirectUriListResult {
  redirectUris: string[] | null;
  rejection: { reason: RedirectUriRejection; value?: string } | null;
}

/** Validates the whole list a request supplies, preserving the order it was sent in. */
export function parseRedirectUris(value: unknown): RedirectUriListResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { redirectUris: null, rejection: { reason: 'empty' } };
  }
  if (value.length > MAX_REDIRECT_URIS) {
    return { redirectUris: null, rejection: { reason: 'too-many' } };
  }

  const seen = new Set<string>();
  for (const candidate of value) {
    const rejection = checkRedirectUri(candidate);
    if (rejection) {
      return {
        redirectUris: null,
        rejection: {
          reason: rejection,
          value: typeof candidate === 'string' ? candidate : undefined,
        },
      };
    }
    if (seen.has(candidate as string)) {
      return { redirectUris: null, rejection: { reason: 'duplicate', value: candidate as string } };
    }
    seen.add(candidate as string);
  }

  return { redirectUris: value as string[], rejection: null };
}

/** Human-readable reason, returned as the validation error's hint. */
export function describeRedirectUriRejection(rejection: {
  reason: RedirectUriRejection;
  value?: string;
}): string {
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
      return `A redirect URI must be an absolute URL in its canonical form${suffix}`;
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

export interface OAuthClientRegistrationResult {
  registration: OAuthClientRegistration | null;
  error: string | null;
  hint?: string;
}

/** Validates a client registration request body. */
export function parseOAuthClientRegistration(body: unknown): OAuthClientRegistrationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { registration: null, error: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return {
      registration: null,
      error: 'A client name is required',
      hint: `Provide a name of 1 to ${MAX_NAME_LENGTH} characters`,
    };
  }

  const { redirectUris, rejection } = parseRedirectUris(record.redirectUris);
  if (!redirectUris) {
    return {
      registration: null,
      error: 'Invalid redirect URI',
      hint: describeRedirectUriRejection(rejection as { reason: RedirectUriRejection }),
    };
  }

  return { registration: { name, redirectUris }, error: null };
}

export interface OAuthClientUpdate {
  redirectUris?: string[];
  disabled?: boolean;
  name?: string;
}

export interface OAuthClientUpdateResult {
  update: OAuthClientUpdate | null;
  error: string | null;
  hint?: string;
}

/** Validates an update to an already registered client. */
export function parseOAuthClientUpdate(body: unknown): OAuthClientUpdateResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { update: null, error: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;

  const update: OAuthClientUpdate = {};

  if (record.name !== undefined) {
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH) {
      return {
        update: null,
        error: 'Invalid client name',
        hint: `Provide a name of 1 to ${MAX_NAME_LENGTH} characters`,
      };
    }
    update.name = name;
  }

  if (record.disabled !== undefined) {
    if (typeof record.disabled !== 'boolean') {
      return { update: null, error: 'disabled must be a boolean when provided' };
    }
    update.disabled = record.disabled;
  }

  if (record.redirectUris !== undefined) {
    const { redirectUris, rejection } = parseRedirectUris(record.redirectUris);
    if (!redirectUris) {
      return {
        update: null,
        error: 'Invalid redirect URI',
        hint: describeRedirectUriRejection(rejection as { reason: RedirectUriRejection }),
      };
    }
    update.redirectUris = redirectUris;
  }

  if (Object.keys(update).length === 0) {
    return {
      update: null,
      error: 'No fields to update',
      hint: 'At least one of: name, redirectUris, disabled must be provided',
    };
  }

  return { update, error: null };
}

/** Splits the stored comma-separated column back into the list a client registered. */
export function redirectUrisFromStorage(stored: string): string[] {
  return stored.split(REDIRECT_URL_SEPARATOR).filter(Boolean);
}

/** Joins a validated list into the column format the plugin reads. */
export function redirectUrisToStorage(redirectUris: readonly string[]): string {
  return redirectUris.join(REDIRECT_URL_SEPARATOR);
}

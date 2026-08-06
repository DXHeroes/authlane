/**
 * What a workspace is allowed to register as a redirect URI.
 *
 * Everything that survives this parser is somewhere Authlane will deliver an authorization code, so
 * each rejection here is a class of callback that must never reach `oauth_application`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRedirectUri,
  parseOAuthClientRegistration,
  parseOAuthClientUpdate,
  parseRedirectUris,
  type RedirectUriReason,
  redirectUrisFromStorage,
  redirectUrisToStorage,
} from '../../src/lib/oauth-client-input.js';

const environment = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = environment;
});

/** The reason a URI was refused, or null when it was accepted. */
function refusal(value: string): RedirectUriReason | null {
  const check = checkRedirectUri(value);
  return check.ok ? null : check.reason;
}

describe('redirect URI validation', () => {
  it('accepts an https callback', () => {
    expect(refusal('https://smartstaff.io/api/integrations/authlane/callback')).toBeNull();
  });

  it('accepts http on localhost outside production', () => {
    expect(refusal('http://localhost:3000/api/integrations/authlane/callback')).toBeNull();
    expect(refusal('http://127.0.0.1:3000/callback')).toBeNull();
  });

  it('refuses http on localhost in production', () => {
    process.env.NODE_ENV = 'production';

    expect(refusal('http://localhost:3000/callback')).toBe('insecure-scheme');
    expect(refusal('https://smartstaff.io/callback')).toBeNull();
  });

  it('refuses plaintext http on any other host', () => {
    expect(refusal('http://smartstaff.io/callback')).toBe('insecure-scheme');
    expect(refusal('http://localhost.attacker.test/callback')).toBe('insecure-scheme');
  });

  it('refuses a scheme that is neither http nor https', () => {
    expect(refusal('javascript:alert(1)')).toBe('insecure-scheme');
    expect(refusal('ftp://smartstaff.io/callback')).toBe('insecure-scheme');
    expect(refusal('smartstaff://callback')).toBe('insecure-scheme');
  });

  it('refuses a fragment, including an empty one', () => {
    expect(refusal('https://smartstaff.io/callback#token')).toBe('fragment');
    expect(refusal('https://smartstaff.io/callback#')).toBe('fragment');
  });

  it('refuses a wildcard, because matching is exact', () => {
    expect(refusal('https://*.smartstaff.io/callback')).toBe('wildcard');
    expect(refusal('https://smartstaff.io/*')).toBe('wildcard');
  });

  it('refuses a comma, which the stored column would split into two callbacks', () => {
    expect(refusal('https://smartstaff.io/cb,https://attacker.test/cb')).toBe('comma');
  });

  it('refuses embedded credentials', () => {
    expect(refusal('https://user:pass@smartstaff.io/callback')).toBe('credentials');
  });

  it('refuses a relative or unparseable URI', () => {
    expect(refusal('/api/integrations/authlane/callback')).toBe('malformed');
    expect(refusal('not a url')).toBe('malformed');
  });

  it('hands back the canonical spelling of a URI it will not store verbatim', () => {
    // Stored verbatim and compared verbatim, so a spelling the browser will normalise away is a
    // callback that silently never matches. Case, a default port and a missing trailing slash are
    // all invisible in the string the workspace pasted, so the fix has to be shown rather than
    // described.
    const check = checkRedirectUri('HTTPS://SmartStaff.io/callback');

    expect(check).toEqual({
      ok: false,
      reason: 'not-canonical',
      value: 'HTTPS://SmartStaff.io/callback',
      expected: 'https://smartstaff.io/callback',
    });

    expect(checkRedirectUri('https://smartstaff.io:443/cb')).toMatchObject({
      reason: 'not-canonical',
      expected: 'https://smartstaff.io/cb',
    });
    expect(checkRedirectUri('https://smartstaff.io')).toMatchObject({
      reason: 'not-canonical',
      expected: 'https://smartstaff.io/',
    });
  });
});

/** The reason a list was refused, or null when it was accepted. */
function listRefusal(value: unknown): RedirectUriReason | null {
  const result = parseRedirectUris(value);
  return result.ok ? null : result.reason;
}

describe('redirect URI lists', () => {
  it('refuses an empty list', () => {
    expect(listRefusal([])).toBe('empty');
    expect(listRefusal(undefined)).toBe('empty');
    expect(listRefusal('https://smartstaff.io/cb')).toBe('empty');
  });

  it('refuses an entry that is not a string', () => {
    expect(listRefusal([42])).toBe('not-a-string');
    expect(listRefusal([null])).toBe('not-a-string');
    expect(listRefusal(['https://smartstaff.io/cb', ['https://smartstaff.io/b']])).toBe(
      'not-a-string'
    );
  });

  it('refuses duplicates', () => {
    expect(listRefusal(['https://smartstaff.io/cb', 'https://smartstaff.io/cb'])).toBe('duplicate');
  });

  it('keeps the order it was given', () => {
    const uris = ['https://smartstaff.io/b', 'https://smartstaff.io/a'];
    const result = parseRedirectUris(uris);

    expect(result.ok && result.redirectUris).toEqual(uris);
  });

  it('refuses more than ten', () => {
    const uris = Array.from({ length: 11 }, (_, index) => `https://smartstaff.io/cb${index}`);

    expect(listRefusal(uris)).toBe('too-many');
  });
});

describe('registration body', () => {
  it('accepts a name and one URI', () => {
    const result = parseOAuthClientRegistration({
      name: '  SmartStaff  ',
      redirectUris: ['https://smartstaff.io/cb'],
    });

    expect(result.ok && result.registration).toEqual({
      name: 'SmartStaff',
      redirectUris: ['https://smartstaff.io/cb'],
    });
  });

  it('requires a name', () => {
    for (const body of [
      { redirectUris: ['https://smartstaff.io/cb'] },
      { name: '   ', redirectUris: ['https://smartstaff.io/cb'] },
    ]) {
      const result = parseOAuthClientRegistration(body);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toBe('A client name is required');
    }
  });

  it('explains which redirect rule was broken', () => {
    const result = parseOAuthClientRegistration({
      name: 'SmartStaff',
      redirectUris: ['https://smartstaff.io/cb#'],
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('Invalid redirect URI');
    expect(!result.ok && result.hint).toContain('fragment');
  });

  it('names the canonical spelling in the hint, so the fix is copyable', () => {
    const result = parseOAuthClientRegistration({
      name: 'SmartStaff',
      redirectUris: ['HTTPS://SmartStaff.io/callback'],
    });

    expect(!result.ok && result.hint).toBe(
      'A redirect URI must be sent in canonical form; expected https://smartstaff.io/callback'
    );
  });

  it('refuses a body that is not an object', () => {
    for (const body of [[], null, 'string']) {
      const result = parseOAuthClientRegistration(body);
      expect(!result.ok && result.error).toBe('Request body must be a JSON object');
    }
  });
});

describe('update body', () => {
  it('accepts redirect URIs and the disabled flag', () => {
    const result = parseOAuthClientUpdate({
      redirectUris: ['https://smartstaff.io/cb'],
      disabled: true,
    });

    expect(result.ok && result.update).toEqual({
      redirectUris: ['https://smartstaff.io/cb'],
      disabled: true,
    });
  });

  it('accepts a name on its own', () => {
    const result = parseOAuthClientUpdate({ name: '  Renamed  ' });

    expect(result.ok && result.update).toEqual({ name: 'Renamed' });
  });

  it('refuses an empty update', () => {
    const result = parseOAuthClientUpdate({});

    expect(!result.ok && result.error).toBe('No fields to update');
  });

  it('refuses a non-boolean disabled', () => {
    const result = parseOAuthClientUpdate({ disabled: 'yes' });

    expect(!result.ok && result.error).toBe('disabled must be a boolean when provided');
  });

  it('applies the same redirect rules as registration', () => {
    const result = parseOAuthClientUpdate({ redirectUris: ['http://attacker.test/cb'] });

    expect(!result.ok && result.hint).toContain('https');
  });
});

describe('the stored column format', () => {
  it('round-trips through the comma-separated column the plugin reads', () => {
    const uris = ['https://smartstaff.io/a', 'https://smartstaff.io/b'];

    expect(redirectUrisFromStorage(redirectUrisToStorage(uris))).toEqual(uris);
  });

  it('reads a single-URI column back as one entry', () => {
    expect(redirectUrisFromStorage('https://smartstaff.io/a')).toEqual(['https://smartstaff.io/a']);
  });
});

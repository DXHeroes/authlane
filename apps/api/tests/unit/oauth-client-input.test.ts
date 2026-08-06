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
  redirectUrisFromStorage,
  redirectUrisToStorage,
} from '../../src/lib/oauth-client-input.js';

const environment = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = environment;
});

describe('redirect URI validation', () => {
  it('accepts an https callback', () => {
    expect(checkRedirectUri('https://smartstaff.io/api/integrations/authlane/callback')).toBeNull();
  });

  it('accepts http on localhost outside production', () => {
    expect(checkRedirectUri('http://localhost:3000/api/integrations/authlane/callback')).toBeNull();
    expect(checkRedirectUri('http://127.0.0.1:3000/callback')).toBeNull();
  });

  it('refuses http on localhost in production', () => {
    process.env.NODE_ENV = 'production';

    expect(checkRedirectUri('http://localhost:3000/callback')).toBe('insecure-scheme');
    expect(checkRedirectUri('https://smartstaff.io/callback')).toBeNull();
  });

  it('refuses plaintext http on any other host', () => {
    expect(checkRedirectUri('http://smartstaff.io/callback')).toBe('insecure-scheme');
    expect(checkRedirectUri('http://localhost.attacker.test/callback')).toBe('insecure-scheme');
  });

  it('refuses a scheme that is neither http nor https', () => {
    expect(checkRedirectUri('javascript:alert(1)')).toBe('insecure-scheme');
    expect(checkRedirectUri('ftp://smartstaff.io/callback')).toBe('insecure-scheme');
    expect(checkRedirectUri('smartstaff://callback')).toBe('insecure-scheme');
  });

  it('refuses a fragment, including an empty one', () => {
    expect(checkRedirectUri('https://smartstaff.io/callback#token')).toBe('fragment');
    expect(checkRedirectUri('https://smartstaff.io/callback#')).toBe('fragment');
  });

  it('refuses a wildcard, because matching is exact', () => {
    expect(checkRedirectUri('https://*.smartstaff.io/callback')).toBe('wildcard');
    expect(checkRedirectUri('https://smartstaff.io/*')).toBe('wildcard');
  });

  it('refuses a comma, which the stored column would split into two callbacks', () => {
    expect(checkRedirectUri('https://smartstaff.io/cb,https://attacker.test/cb')).toBe('comma');
  });

  it('refuses embedded credentials', () => {
    expect(checkRedirectUri('https://user:pass@smartstaff.io/callback')).toBe('credentials');
  });

  it('refuses a relative or unparseable URI', () => {
    expect(checkRedirectUri('/api/integrations/authlane/callback')).toBe('malformed');
    expect(checkRedirectUri('not a url')).toBe('malformed');
  });

  it('refuses a URI that is not in its canonical form', () => {
    // Stored verbatim and compared verbatim, so a spelling the browser will normalise away is a
    // callback that silently never matches.
    expect(checkRedirectUri('HTTPS://SmartStaff.io/callback')).toBe('malformed');
  });

  it('refuses a non-string', () => {
    expect(checkRedirectUri(42)).toBe('not-a-string');
    expect(checkRedirectUri(null)).toBe('not-a-string');
  });
});

describe('redirect URI lists', () => {
  it('refuses an empty list', () => {
    expect(parseRedirectUris([]).rejection?.reason).toBe('empty');
    expect(parseRedirectUris(undefined).rejection?.reason).toBe('empty');
    expect(parseRedirectUris('https://smartstaff.io/cb').rejection?.reason).toBe('empty');
  });

  it('refuses duplicates', () => {
    const result = parseRedirectUris(['https://smartstaff.io/cb', 'https://smartstaff.io/cb']);

    expect(result.redirectUris).toBeNull();
    expect(result.rejection?.reason).toBe('duplicate');
  });

  it('keeps the order it was given', () => {
    const uris = ['https://smartstaff.io/b', 'https://smartstaff.io/a'];

    expect(parseRedirectUris(uris).redirectUris).toEqual(uris);
  });

  it('refuses more than ten', () => {
    const uris = Array.from({ length: 11 }, (_, index) => `https://smartstaff.io/cb${index}`);

    expect(parseRedirectUris(uris).rejection?.reason).toBe('too-many');
  });
});

describe('registration body', () => {
  it('accepts a name and one URI', () => {
    const { registration } = parseOAuthClientRegistration({
      name: '  SmartStaff  ',
      redirectUris: ['https://smartstaff.io/cb'],
    });

    expect(registration).toEqual({
      name: 'SmartStaff',
      redirectUris: ['https://smartstaff.io/cb'],
    });
  });

  it('requires a name', () => {
    expect(parseOAuthClientRegistration({ redirectUris: ['https://smartstaff.io/cb'] }).error).toBe(
      'A client name is required'
    );
    expect(
      parseOAuthClientRegistration({ name: '   ', redirectUris: ['https://smartstaff.io/cb'] })
        .error
    ).toBe('A client name is required');
  });

  it('explains which redirect rule was broken', () => {
    const { error, hint } = parseOAuthClientRegistration({
      name: 'SmartStaff',
      redirectUris: ['https://smartstaff.io/cb#'],
    });

    expect(error).toBe('Invalid redirect URI');
    expect(hint).toContain('fragment');
  });

  it('refuses a body that is not an object', () => {
    expect(parseOAuthClientRegistration([]).error).toBe('Request body must be a JSON object');
    expect(parseOAuthClientRegistration(null).error).toBe('Request body must be a JSON object');
  });
});

describe('update body', () => {
  it('accepts redirect URIs and the disabled flag', () => {
    const { update } = parseOAuthClientUpdate({
      redirectUris: ['https://smartstaff.io/cb'],
      disabled: true,
    });

    expect(update).toEqual({ redirectUris: ['https://smartstaff.io/cb'], disabled: true });
  });

  it('refuses an empty update', () => {
    expect(parseOAuthClientUpdate({}).error).toBe('No fields to update');
  });

  it('refuses a non-boolean disabled', () => {
    expect(parseOAuthClientUpdate({ disabled: 'yes' }).error).toBe(
      'disabled must be a boolean when provided'
    );
  });

  it('applies the same redirect rules as registration', () => {
    expect(parseOAuthClientUpdate({ redirectUris: ['http://attacker.test/cb'] }).hint).toContain(
      'https'
    );
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

import { beforeEach, describe, expect, it } from 'vitest';
import {
  authorizeUrl,
  clearParkedRequest,
  consentUrl,
  isNavigableUrl,
  isReauthenticationPrompt,
  parksAnAuthorization,
  pendingAuthorizeQuery,
  pendingConsentQuery,
  stashParkedRequest,
  takeParkedRequest,
} from '@/lib/oauth-flow';

const AUTHORIZE_QUERY =
  'client_id=nDq1V2h7&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&response_type=code' +
  '&scope=openid%20email&state=st%2Fate%2B1&code_challenge=E9Melhoa2Ow&code_challenge_method=S256';

describe('pendingAuthorizeQuery', () => {
  it('returns the query untouched, so nothing is re-encoded on the way back out', () => {
    expect(pendingAuthorizeQuery(`?${AUTHORIZE_QUERY}`)).toBe(AUTHORIZE_QUERY);
    expect(authorizeUrl(AUTHORIZE_QUERY)).toBe(`/api/auth/oauth2/authorize?${AUTHORIZE_QUERY}`);
  });

  it('needs all three parameters that make a query replayable', () => {
    expect(pendingAuthorizeQuery('?client_id=a&redirect_uri=b')).toBeNull();
    expect(pendingAuthorizeQuery('?error=invalid_token')).toBeNull();
    expect(pendingAuthorizeQuery('')).toBeNull();
  });

  it('rejects the re-authentication shape, which cannot be replayed', () => {
    expect(pendingAuthorizeQuery('?client_id=a&code=b&state=c')).toBeNull();
  });
});

describe('isReauthenticationPrompt', () => {
  it('recognises the prompt=login redirect', () => {
    expect(isReauthenticationPrompt('?client_id=a&code=b&state=c')).toBe(true);
  });

  it('does not mistake code_challenge for code', () => {
    expect(isReauthenticationPrompt(`?${AUTHORIZE_QUERY}`)).toBe(false);
  });

  it('is false for an ordinary visit', () => {
    expect(isReauthenticationPrompt('')).toBe(false);
    expect(isReauthenticationPrompt('?error=invalid_token')).toBe(false);
  });
});

describe('pendingConsentQuery', () => {
  it('returns the query when a consent request is present', () => {
    const query = 'consent_code=cc1&client_id=nDq1V2h7&scope=openid%20email';
    expect(pendingConsentQuery(`?${query}`)).toBe(query);
  });

  it('is null without both identifiers', () => {
    expect(pendingConsentQuery('?consent_code=cc1')).toBeNull();
    expect(pendingConsentQuery('?client_id=a')).toBeNull();
    expect(pendingConsentQuery('')).toBeNull();
  });
});

describe('the parked request stash', () => {
  const STASH_KEY = 'authlane.oauth.parked_request';

  beforeEach(() => clearParkedRequest());

  it('hands the request back exactly once, with the kind it was stored under', () => {
    stashParkedRequest('authorize', AUTHORIZE_QUERY);

    expect(takeParkedRequest()).toEqual({ kind: 'authorize', query: AUTHORIZE_QUERY });
    expect(takeParkedRequest()).toBeNull();
  });

  it('carries a consent request too, so it survives the same detour', () => {
    stashParkedRequest('consent', 'consent_code=cc1&client_id=a');

    expect(takeParkedRequest()).toEqual({
      kind: 'consent',
      query: 'consent_code=cc1&client_id=a',
    });
  });

  it('stores no URL, so nothing in storage can choose a destination', () => {
    stashParkedRequest('authorize', AUTHORIZE_QUERY);

    const stored = window.sessionStorage.getItem(STASH_KEY) ?? '';
    expect(stored).not.toContain('/api/auth');
    expect(stored).not.toContain('/oauth/consent');
  });

  it('expires with the authorization it belongs to', () => {
    window.sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({ kind: 'authorize', query: AUTHORIZE_QUERY, at: Date.now() - 600_001 })
    );

    expect(takeParkedRequest()).toBeNull();
  });

  it('survives nothing it cannot trust', () => {
    window.sessionStorage.setItem(STASH_KEY, 'not json');
    expect(takeParkedRequest()).toBeNull();

    window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ kind: 'authorize', query: 7 }));
    expect(takeParkedRequest()).toBeNull();

    // A kind nobody handles would index the resume map with an unknown key.
    window.sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({ kind: 'elsewhere', query: AUTHORIZE_QUERY, at: Date.now() })
    );
    expect(takeParkedRequest()).toBeNull();
  });
});

describe('parksAnAuthorization', () => {
  it('is true for every shape that parks somebody else’s sign-in', () => {
    expect(parksAnAuthorization(`?${AUTHORIZE_QUERY}`)).toBe(true);
    expect(parksAnAuthorization('?client_id=a&code=b&state=c')).toBe(true);
    expect(parksAnAuthorization('?consent_code=cc1&client_id=a')).toBe(true);
  });

  it('is false for an ordinary visit, which is what lets the dashboard redirect happen', () => {
    expect(parksAnAuthorization('')).toBe(false);
    expect(parksAnAuthorization('?error=invalid_token')).toBe(false);
  });
});

describe('consentUrl', () => {
  it('returns to the consent screen with the request intact', () => {
    expect(consentUrl('consent_code=cc1&client_id=a&scope=openid%20email')).toBe(
      '/oauth/consent?consent_code=cc1&client_id=a&scope=openid%20email'
    );
  });
});

describe('isNavigableUrl', () => {
  it('accepts the schemes a redirect URI is allowed to use', () => {
    expect(isNavigableUrl('https://app.example.com/cb?code=1')).toBe(true);
    expect(isNavigableUrl('http://localhost:3000/cb')).toBe(true);
  });

  it('refuses anything that could execute', () => {
    expect(isNavigableUrl('javascript:alert(1)')).toBe(false);
    // The URL parser lowercases the scheme and strips leading control characters and whitespace,
    // so the usual disguises collapse to the same answer.
    expect(isNavigableUrl('JavaScript:alert(1)')).toBe(false);
    expect(isNavigableUrl('java\tscript:alert(1)')).toBe(false);
    expect(isNavigableUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
});

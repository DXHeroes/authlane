import { describe, expect, it } from 'vitest';
import { resolveMcpAuthorization } from '../../src/lib/oauth-provider-resolution.js';

function config(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mcp-1',
    authType: 'oauth2',
    enabled: true,
    oauthClientId: 'client-123',
    oauthClientSecretId: 'secret-1',
    authorizationEndpoint: 'https://mcp.example.com/authorize',
    tokenEndpoint: 'https://mcp.example.com/token',
    ...overrides,
  };
}

describe('resolveMcpAuthorization', () => {
  it('resolves a discovered server', () => {
    expect(resolveMcpAuthorization(config())).toEqual({
      ok: true,
      authorizationEndpoint: 'https://mcp.example.com/authorize',
      oauthClientId: 'client-123',
      oauthClientSecretId: 'secret-1',
    });
  });

  it('refuses a server that has never been reached', () => {
    // enabled turns true only after discovery succeeds, so this is a server nobody can connect to.
    expect(resolveMcpAuthorization(config({ enabled: false }))).toEqual({
      ok: false,
      reason: 'not_ready',
    });
  });

  it('refuses a server missing an authorization endpoint', () => {
    expect(resolveMcpAuthorization(config({ authorizationEndpoint: null }))).toEqual({
      ok: false,
      reason: 'not_ready',
    });
  });

  it('refuses a server with no registered client', () => {
    expect(resolveMcpAuthorization(config({ oauthClientId: null }))).toEqual({
      ok: false,
      reason: 'not_ready',
    });
  });

  it('refuses an api_key server on the OAuth path', () => {
    // An API-key server is connected by the user pasting a key, not by an authorization redirect.
    expect(resolveMcpAuthorization(config({ authType: 'api_key' }))).toEqual({
      ok: false,
      reason: 'not_oauth',
    });
  });

  it('refuses a missing server', () => {
    expect(resolveMcpAuthorization(null)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('never re-reads the endpoint from the server at connect time', () => {
    // The endpoint comes from metadata validated at discovery. A plaintext or off-domain value
    // cannot appear here because discovery refused to store it, but the guard is kept so a
    // hand-edited row cannot slip one through.
    expect(
      resolveMcpAuthorization(config({ authorizationEndpoint: 'http://mcp.example.com/authorize' }))
    ).toEqual({ ok: false, reason: 'not_ready' });
  });
});

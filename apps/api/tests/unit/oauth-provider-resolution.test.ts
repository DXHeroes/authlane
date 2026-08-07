import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  connectabilityOf,
  resolveBuiltInAuthorization,
  resolveMcpAuthorization,
} from '../../src/lib/oauth-provider-resolution.js';

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
      reason: 'disabled',
    });
  });

  it('refuses a server missing an authorization endpoint', () => {
    expect(resolveMcpAuthorization(config({ authorizationEndpoint: null }))).toEqual({
      ok: false,
      reason: 'missing_authorization_url',
    });
  });

  it('refuses a server with no registered client', () => {
    expect(resolveMcpAuthorization(config({ oauthClientId: null }))).toEqual({
      ok: false,
      reason: 'missing_oauth_client',
    });
  });

  it('refuses an api_key server on the OAuth path', () => {
    // An API-key server is connected by the user pasting a key, not by an authorization redirect.
    expect(resolveMcpAuthorization(config({ authType: 'api_key' }))).toEqual({
      ok: false,
      reason: 'not_oauth',
    });
  });

  it('names the switch, not the auth type, for a disabled api_key server', () => {
    /*
     * `enabled` is settled before `authType` so this reads "turned off" rather than "not an OAuth
     * server". The order is what lets the catalogue treat `not_oauth` as "connectable by API key"
     * without having to re-check the switch for itself.
     */
    expect(resolveMcpAuthorization(config({ authType: 'api_key', enabled: false }))).toEqual({
      ok: false,
      reason: 'disabled',
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
    ).toEqual({ ok: false, reason: 'missing_authorization_url' });
  });
});

describe('resolveBuiltInAuthorization', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  function builtIn(overrides: Record<string, unknown> = {}) {
    return {
      serviceId: 'github',
      authType: 'oauth2',
      enabled: true,
      config: { authorization_url: 'https://github.com/login/oauth/authorize' },
      tenantOAuthClientId: 'tenant-client',
      ...overrides,
    };
  }

  it('prefers an application the organization registered itself', () => {
    process.env.AUTHLANE_OAUTH_GITHUB_CLIENT_ID = 'platform-client';

    expect(resolveBuiltInAuthorization(builtIn())).toEqual({
      ok: true,
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      oauthClientId: 'tenant-client',
    });
  });

  it('falls back to the platform application', () => {
    process.env.AUTHLANE_OAUTH_GITHUB_CLIENT_ID = 'platform-client';

    expect(resolveBuiltInAuthorization(builtIn({ tenantOAuthClientId: null }))).toEqual({
      ok: true,
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      oauthClientId: 'platform-client',
    });
  });

  it('refuses a service no application exists for', () => {
    // biome-ignore lint/performance/noDelete: getPlatformOAuthCredentials reads process.env.
    delete process.env.AUTHLANE_OAUTH_GITHUB_CLIENT_ID;

    expect(resolveBuiltInAuthorization(builtIn({ tenantOAuthClientId: null }))).toEqual({
      ok: false,
      reason: 'missing_oauth_client',
    });
  });

  it('separates a missing authorization URL from a missing application', () => {
    // Both once produced the same 409, so an owner could not tell a catalog defect from their own
    // half-finished setup.
    expect(resolveBuiltInAuthorization(builtIn({ config: {} }))).toEqual({
      ok: false,
      reason: 'missing_authorization_url',
    });
  });

  it('refuses a service the organization switched off', () => {
    expect(resolveBuiltInAuthorization(builtIn({ enabled: false }))).toEqual({
      ok: false,
      reason: 'disabled',
    });
  });

  it('refuses a service that is not connected over OAuth', () => {
    expect(resolveBuiltInAuthorization(builtIn({ authType: 'api_key' }))).toEqual({
      ok: false,
      reason: 'not_oauth',
    });
  });
});

describe('connectabilityOf', () => {
  it('reports a resolvable service as connectable with no reason', () => {
    expect(connectabilityOf({ ok: true })).toEqual({ connectable: true });
  });

  it('leaves an API-key service connectable on its own terms', () => {
    // Its connect path is POST /connect/:serviceId/api-key, which asks for no OAuth application.
    // Reporting `missing_oauth_client` would send its owner to a console it need never visit.
    expect(connectabilityOf({ ok: false, reason: 'not_oauth' })).toEqual({ connectable: true });
  });

  it.each(['missing_oauth_client', 'missing_authorization_url', 'disabled'] as const)(
    'passes %s through as the published reason',
    (reason) => {
      expect(connectabilityOf({ ok: false, reason })).toEqual({
        connectable: false,
        notConnectableReason: reason,
      });
    }
  );
});

describe('authorize wiring for tenant MCP servers', () => {
  it('routes an mcp- id away from the built-in catalog', () => {
    // The authorize handler branches on this before it queries `services`, which has no row for
    // a tenant server. If the branch were removed the request would 404 instead.
    const source = readFileSync(new URL('../../src/routes/oauth.ts', import.meta.url), 'utf8');
    const authorizeBlock = source.slice(
      source.indexOf("router.post('/connect/:serviceId/authorize'")
    );
    const mcpBranch = authorizeBlock.indexOf('isMcpServerId(serviceId)');
    const catalogQuery = authorizeBlock.indexOf('.from(services)');

    expect(mcpBranch).toBeGreaterThan(-1);
    expect(catalogQuery).toBeGreaterThan(-1);
    expect(mcpBranch).toBeLessThan(catalogQuery);
  });

  it('mints PKCE through one shared implementation', () => {
    // Two copies of the verifier and transaction logic would be two places to get wrong.
    const source = readFileSync(new URL('../../src/routes/oauth.ts', import.meta.url), 'utf8');
    expect(source.split('generatePKCE()').length - 1).toBe(1);
    expect(source.split("purpose: 'oauth_pkce_verifier',").length - 1).toBe(1);
  });
});

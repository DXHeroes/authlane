import { describe, expect, it, vi } from 'vitest';
import { Authlane } from '../src/client.js';

describe('control-plane SDK', () => {
  it('uses a scoped bearer key and exposes capability snapshots', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            externalUserId: 'user_1',
            format: 'mcp',
            version: 'cafebabe',
            services: [],
          },
          error: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const client = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn,
    });

    const result = await client.capabilities.get({ externalUserId: 'user_1', format: 'mcp' });

    expect(result.error).toBeNull();
    expect(fetchFn).toHaveBeenCalledWith(
      'https://authlane.test/api/v1/users/user_1/capabilities?format=mcp',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ak_server_secret' }),
      })
    );
  });

  it('creates a short-lived connect session for browser handoff', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { token: 'acs_token', url: 'https://authlane.test/connect?session=acs_token' },
          error: null,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      )
    );
    const client = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn,
    });

    const result = await client.connectSessions.create({
      externalUserId: 'user_1',
      allowedServices: ['github'],
      allowedOrigin: 'https://saas.test',
    });

    expect(result.data?.token).toBe('acs_token');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://authlane.test/api/v1/connect-sessions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('issues credential leases through POST and has no credential GET helper', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            type: 'oauth2',
            leaseId: 'lease_1',
            accessToken: 'provider-access-token',
            tokenType: 'Bearer',
            scopes: ['repo'],
            expiresAt: '2026-06-01T01:00:00.000Z',
          },
          error: null,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      )
    );
    const client = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn,
    });

    const result = await client.credentialLeases.create({
      externalUserId: 'user_1',
      serviceId: 'github',
    });

    expect(result.data).toMatchObject({ type: 'oauth2', leaseId: 'lease_1' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://authlane.test/api/v1/users/user_1/connections/github/credential-leases',
      expect.objectContaining({ method: 'POST' })
    );
    expect(
      (client.connections as ConnectionsWithLegacyCredentialGetter).getCredentials
    ).toBeUndefined();
  });
});

interface ConnectionsWithLegacyCredentialGetter {
  getCredentials?: unknown;
}

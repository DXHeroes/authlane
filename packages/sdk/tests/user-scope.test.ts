import { describe, expect, it, vi } from 'vitest';
import { Authlane, type UserScope } from '../src/index.js';

const connection = {
  serviceId: 'github',
  status: 'connected',
  connected: true,
  expiresAt: null,
  connectedAt: '2026-07-17T12:00:00.000Z',
  lastCheckedAt: '2026-07-17T12:00:00.000Z',
  errorCode: null,
};

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    let data: unknown = {};

    if (url.endsWith('/connections')) {
      data = [connection];
    } else if (url.endsWith('/catalog/services')) {
      data = [];
    } else if (url.includes('/capabilities?')) {
      data = {
        externalUserId: 'ignored-by-test',
        format: 'mcp',
        version: 'version-1',
        services: [],
      };
    } else if (url.includes('/tools?')) {
      data = { tools: [], version: 'version-1' };
    } else if (url.endsWith('/credential-leases')) {
      data = {
        type: 'oauth2',
        leaseId: 'lease-1',
        accessToken: 'access-token',
        tokenType: 'Bearer',
        scopes: ['repo'],
        expiresAt: null,
      };
    }

    return new Response(JSON.stringify({ data, error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('user-scoped SDK facade', () => {
  it('binds exactly one encoded external user ID across existing resources', async () => {
    const fetchFn = createFetch();
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test/',
      fetch: fetchFn as typeof fetch,
    });
    const currentUser = { id: 'tenant/user?region=eu' };

    const user: UserScope = authlane.user(currentUser.id);
    await user.connections.list();
    await user.connections.get('github');
    await user.capabilities.get({ format: 'openai', externalUserId: 'other-user' } as never);
    await user.tools.list({ format: 'mcp', externalUserId: 'other-user' } as never);
    await user.credentialLeases.create({
      serviceId: 'github',
      externalUserId: 'other-user',
    } as never);

    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      'https://authlane.test/api/v1/users/tenant%2Fuser%3Fregion%3Deu/connections',
      'https://authlane.test/api/v1/users/tenant%2Fuser%3Fregion%3Deu/connections',
      'https://authlane.test/api/v1/users/tenant%2Fuser%3Fregion%3Deu/capabilities?format=openai',
      'https://authlane.test/api/v1/users/tenant%2Fuser%3Fregion%3Deu/tools?format=mcp',
      'https://authlane.test/api/v1/users/tenant%2Fuser%3Fregion%3Deu/connections/github/credential-leases',
    ]);
    expect(fetchFn.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('does not issue a credential lease during connection, capability, or tool reads', async () => {
    const fetchFn = createFetch();
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn as typeof fetch,
    });
    const user = authlane.user('user_123');

    await user.connections.list();
    await user.connections.get('github');
    await user.capabilities.get();
    await user.tools.list();

    expect(fetchFn.mock.calls.map(([url]) => String(url))).not.toContainEqual(
      expect.stringContaining('/credential-leases')
    );
    expect(fetchFn.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true);
  });

  it('caches one validation error across invalid-scope operations without fetching or throwing', async () => {
    const fetchFn = createFetch();
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn as typeof fetch,
    });
    const user = authlane.user('');

    const results = await Promise.all([
      user.connections.list(),
      user.connections.get('github'),
      user.capabilities.get({ format: 'mcp' }),
      user.tools.list({ format: 'openai' }),
      user.credentialLeases.create({ serviceId: 'github' }),
    ]);

    expect(results[0]).toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid external user ID',
        statusCode: 400,
        hint: 'Provide a non-empty external user ID with no more than 255 characters.',
        docUrl: 'https://authlane.io/docs/sdk/typescript',
      },
    });
    for (const result of results.slice(1)) {
      expect(result.data).toBeNull();
      expect(result.error).toBe(results[0]?.error);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['whitespace', '   '],
    ['slash and path punctuation', '../users/admin?role=owner#fragment'],
    ['ordinary punctuation', 'tenant:user@example.com + customer'],
    ['the 255-character maximum', 'u'.repeat(255)],
  ])('follows the shared validator and encodes %s IDs', async (_label, externalUserId) => {
    const fetchFn = createFetch();
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn as typeof fetch,
    });

    const result = await authlane.user(externalUserId).connections.list();

    expect(result.error).toBeNull();
    expect(fetchFn).toHaveBeenCalledWith(
      `https://authlane.test/api/v1/users/${encodeURIComponent(externalUserId)}/connections`,
      expect.any(Object)
    );
  });

  it('rejects IDs above the shared validator length limit', async () => {
    const fetchFn = createFetch();
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn as typeof fetch,
    });

    const result = await authlane.user('u'.repeat(256)).tools.list();

    expect(result).toMatchObject({ data: null, error: { code: 'VALIDATION_ERROR' } });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the app host by default while preserving bearer authorization', async () => {
    const fetchFn = createFetch();
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      fetch: fetchFn as typeof fetch,
    });

    await authlane.services.list();

    expect(fetchFn).toHaveBeenCalledWith(
      'https://app.authlane.io/api/v1/catalog/services',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ak_server_secret' }),
      })
    );
  });

  it('preserves non-throwing network and API error results', async () => {
    const networkFetch = vi.fn().mockRejectedValue(new TypeError('socket closed'));
    const networkClient = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: networkFetch as typeof fetch,
    });
    const apiFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          error: { message: 'Request rejected', code: 'VALIDATION_ERROR' },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    );
    const apiClient = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: apiFetch as typeof fetch,
    });

    const networkResult = await networkClient.user('user_123').tools.list();
    const apiResult = await apiClient.user('user_123').capabilities.get();

    expect(networkResult).toMatchObject({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'socket closed' },
    });
    expect(apiResult).toEqual({
      data: null,
      error: {
        message: 'Request rejected',
        code: 'VALIDATION_ERROR',
        hint: undefined,
        docUrl: undefined,
        statusCode: undefined,
      },
    });
  });

  it('does not add framework-specific tool members', () => {
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      fetch: createFetch() as typeof fetch,
    });
    const tools = authlane.user('user_123').tools as {
      forUser?: unknown;
      userTools?: unknown;
      vercelAI?: unknown;
    };

    expect(tools.forUser).toBeUndefined();
    expect(tools.userTools).toBeUndefined();
    expect(tools.vercelAI).toBeUndefined();
  });
});

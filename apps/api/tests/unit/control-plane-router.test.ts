import type { SecretStore } from '@authlane/database';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  type ControlPlaneRepository,
  createControlPlaneRouter,
} from '../../src/routes/control-plane.js';
import { assertOpenApiResponse } from '../helpers/openapi-response.js';

const services = [
  { id: 'github', name: 'GitHub', authType: 'oauth2', enabled: true, config: {} },
  { id: 'slack', name: 'Slack', authType: 'oauth2', enabled: true, config: {} },
];

function repository(overrides: Partial<ControlPlaneRepository> = {}): ControlPlaneRepository {
  return {
    listTenantServices: vi.fn().mockResolvedValue(services),
    listConnections: vi.fn().mockResolvedValue([
      {
        id: 'connection_1',
        serviceId: 'github',
        status: 'connected',
        credentialSecretId: 'secret_1',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastCheckedAt: null,
        lastErrorCode: null,
      },
    ]),
    getConnection: vi.fn(),
    auditCredentialAccess: vi.fn(),
    ...overrides,
  };
}

function secretStore(value: unknown): SecretStore {
  return {
    put: vi.fn(),
    read: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(value))),
    rewrap: vi.fn(),
  };
}

function appFor(
  repo: ControlPlaneRepository,
  options: {
    now?: () => Date;
    secretStore?: SecretStore;
    scopes?: string[];
  } = {}
) {
  const registry = {
    getTools: vi.fn(async (serviceIds: string[], format: 'mcp' | 'openai') =>
      format === 'mcp'
        ? {
            tools: serviceIds.map((id) => ({
              name: `${id}_tool`,
              description: id,
              inputSchema: { type: 'object', properties: {} },
            })),
          }
        : {
            functions: serviceIds.map((id) => ({
              name: `${id}_tool`,
              description: id,
              parameters: { type: 'object', properties: {} },
            })),
          }
    ),
    getVersion: vi.fn().mockResolvedValue('cafebabe'),
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('principal', {
      kind: 'api_key',
      organizationId: 'org_1',
      apiKeyId: 'key_1',
      scopes: options.scopes ?? ['catalog:read', 'connections:read', 'credentials:issue'],
    });
    await next();
  });
  app.route(
    '/api/v1',
    createControlPlaneRouter(
      repo,
      registry,
      options.secretStore ?? secretStore({ access_token: 'default' }),
      { now: options.now ?? (() => new Date('2026-06-01T00:00:00Z')) }
    )
  );
  return app;
}

describe('control-plane read API', () => {
  it('returns one capability snapshot including disconnected services', async () => {
    const response = await appFor(repository()).request(
      '/api/v1/users/user_1/capabilities?format=mcp'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        externalUserId: 'user_1',
        format: 'mcp',
        version: 'cafebabe',
        services: [
          {
            serviceId: 'github',
            status: 'connected',
            connected: true,
            expiresAt: '2027-01-01T00:00:00.000Z',
            tools: [
              {
                name: 'github_tool',
                description: 'github',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
          {
            serviceId: 'slack',
            status: 'disconnected',
            connected: false,
            expiresAt: null,
            tools: [],
          },
        ],
      },
      error: null,
    });
  });

  it('computes expiration at request time', async () => {
    const response = await appFor(repository(), {
      now: () => new Date('2028-01-01T00:00:00Z'),
    }).request('/api/v1/users/user_1/connections');
    const body = await response.json();

    expect(body.data[0].status).toBe('expired');
    expect(body.data[0].connected).toBe(false);
  });

  it('does not expose credentials through a cacheable GET route', async () => {
    const response = await appFor(repository()).request(
      '/api/v1/users/user_1/connections/github/credentials'
    );

    expect(response.status).toBe(404);
  });

  it.each([
    ['mcp', 'tools'],
    ['openai', 'functions'],
  ] as const)('keeps the %s tools payload valid against OpenAPI', async (format, definitionKey) => {
    const response = await appFor(repository()).request(
      `/api/v1/users/user_1/tools?format=${format}`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      [definitionKey]: [
        expect.objectContaining({
          name: 'github_tool',
          description: 'github',
        }),
      ],
      version: 'cafebabe',
    });
    expect(body.data).not.toHaveProperty('externalUserId');
    expect(body.data).not.toHaveProperty('format');
    assertOpenApiResponse('/api/v1/users/{externalUserId}/tools', 'get', 200, body);
  });
});

describe('credential leases', () => {
  it('issues only a short-lived OAuth access-token lease through POST', async () => {
    const repo = repository({
      getConnection: vi.fn().mockResolvedValue({
        id: 'connection_1',
        serviceId: 'github',
        status: 'connected',
        credentialSecretId: 'secret_1',
        expiresAt: new Date('2026-06-01T01:00:00.000Z'),
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastCheckedAt: null,
        lastErrorCode: null,
      }),
    });
    const store = secretStore({
      access_token: 'access-token',
      refresh_token: 'must-never-leave-the-server',
      id_token: 'must-never-leave-the-server',
      token_type: 'Bearer',
      scope: 'repo user:email',
      expires_at: '2026-06-01T01:00:00.000Z',
    });

    const response = await appFor(repo, { secretStore: store }).request(
      '/api/v1/users/user_1/connections/github/credential-leases',
      { method: 'POST' }
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(body).toEqual({
      data: {
        type: 'oauth2',
        leaseId: expect.any(String),
        accessToken: 'access-token',
        tokenType: 'Bearer',
        scopes: ['repo', 'user:email'],
        expiresAt: '2026-06-01T01:00:00.000Z',
      },
      error: null,
    });
    expect(JSON.stringify(body)).not.toContain('refresh');
    expect(JSON.stringify(body)).not.toContain('id_token');
    expect(store.read).toHaveBeenCalledWith('secret_1', 'org_1', 'connection_credentials');
    expect(repo.auditCredentialAccess).toHaveBeenCalledWith({
      organizationId: 'org_1',
      externalUserId: 'user_1',
      serviceId: 'github',
      apiKeyId: 'key_1',
      ipAddress: null,
      userAgent: null,
    });
  });

  it('requires the credentials:issue scope', async () => {
    const response = await appFor(repository(), {
      scopes: ['connections:read'],
    }).request('/api/v1/users/user_1/connections/github/credential-leases', {
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      data: null,
      error: { code: 'INSUFFICIENT_SCOPE' },
    });
  });

  it('issues an allowlisted provider API origin with the access-only lease', async () => {
    const repo = repository({
      getConnection: vi.fn(async () => ({
        id: 'connection_1',
        serviceId: 'pipedrive',
        status: 'connected',
        credentialSecretId: 'secret_1',
        expiresAt: null,
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastCheckedAt: null,
        lastErrorCode: null,
      })),
    });
    const store = secretStore({
      access_token: 'access-token',
      token_type: 'Bearer',
      provider_context: { apiBaseUrl: 'https://acme.pipedrive.com' },
    });

    const response = await appFor(repo, { secretStore: store }).request(
      '/api/v1/users/user_1/connections/pipedrive/credential-leases',
      { method: 'POST' }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { providerContext: { apiBaseUrl: 'https://acme.pipedrive.com' } },
      error: null,
    });
  });

  it('issues an API key only with an explicit provider placement', async () => {
    const repo = repository({
      getConnection: vi.fn().mockResolvedValue({
        id: 'connection_1',
        serviceId: 'stripe',
        status: 'connected',
        credentialSecretId: 'secret_1',
        expiresAt: null,
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastCheckedAt: null,
        lastErrorCode: null,
      }),
    });

    const response = await appFor(repo, {
      secretStore: secretStore({
        api_key: 'provider-key',
        api_secret: 'must-never-leave-the-server',
        placement: { type: 'header', name: 'Authorization', prefix: 'Bearer ' },
      }),
    }).request('/api/v1/users/user_1/connections/stripe/credential-leases', {
      method: 'POST',
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      type: 'api_key',
      value: 'provider-key',
      placement: { type: 'header', name: 'Authorization', prefix: 'Bearer ' },
      expiresAt: null,
    });
    expect(JSON.stringify(body)).not.toContain('api_secret');
  });

  it('fails closed for malformed decrypted credential data and clears its buffer', async () => {
    const repo = repository({
      getConnection: vi.fn().mockResolvedValue({
        id: 'connection_1',
        serviceId: 'github',
        status: 'connected',
        credentialSecretId: 'secret_1',
        expiresAt: null,
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastCheckedAt: null,
        lastErrorCode: null,
      }),
    });
    const plaintext = Buffer.from('null');
    const store: SecretStore = {
      put: vi.fn(),
      read: vi.fn().mockResolvedValue(plaintext),
      rewrap: vi.fn(),
    };

    const response = await appFor(repo, { secretStore: store }).request(
      '/api/v1/users/user_1/connections/github/credential-leases',
      { method: 'POST' }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      data: null,
      error: { code: 'ENCRYPTION_ERROR' },
    });
    expect(plaintext.equals(Buffer.alloc(plaintext.length))).toBe(true);
    expect(repo.auditCredentialAccess).not.toHaveBeenCalled();
  });
});

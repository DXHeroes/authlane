import { encrypt } from '@authlane/crypto';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  type ControlPlaneRepository,
  createControlPlaneRouter,
} from '../../src/routes/control-plane.js';

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
        credentialsEnc: 'encrypted',
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

function appFor(repo: ControlPlaneRepository, now = () => new Date('2026-06-01T00:00:00Z')) {
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
      scopes: ['catalog:read', 'connections:read', 'credentials:read'],
    });
    await next();
  });
  app.route('/api/v1', createControlPlaneRouter(repo, registry, { now }));
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
    const response = await appFor(repository(), () => new Date('2028-01-01T00:00:00Z')).request(
      '/api/v1/users/user_1/connections'
    );
    const body = await response.json();

    expect(body.data[0].status).toBe('expired');
    expect(body.data[0].connected).toBe(false);
  });

  it('returns only access credentials, disables caching, and audits access', async () => {
    const previousKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const encrypted = encrypt(
      JSON.stringify({
        access_token: 'access',
        refresh_token: 'must-not-leave-authlane',
        token_type: 'Bearer',
        scope: 'repo read:user',
        expires_at: '2027-01-01T00:00:00.000Z',
      }),
      process.env.ENCRYPTION_KEY
    );
    const auditCredentialAccess = vi.fn();
    const repo = repository({
      getConnection: vi.fn().mockResolvedValue({
        id: 'connection_1',
        serviceId: 'github',
        status: 'connected',
        credentialsEnc: encrypted,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        connectedAt: new Date(),
        lastCheckedAt: null,
        lastErrorCode: null,
      }),
      auditCredentialAccess,
    });

    const response = await appFor(repo).request(
      '/api/v1/users/user_1/connections/github/credentials'
    );
    if (previousKey) process.env.ENCRYPTION_KEY = previousKey;
    else delete process.env.ENCRYPTION_KEY;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: {
        type: 'oauth2',
        accessToken: 'access',
        tokenType: 'Bearer',
        scopes: ['repo', 'read:user'],
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
      error: null,
    });
    expect(auditCredentialAccess).toHaveBeenCalledOnce();
  });
});

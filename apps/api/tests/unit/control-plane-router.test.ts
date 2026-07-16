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
      scopes: ['catalog:read', 'connections:read', 'credentials:issue'],
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

  it('does not expose credentials through a cacheable GET route', async () => {
    const response = await appFor(repository()).request(
      '/api/v1/users/user_1/connections/github/credentials'
    );

    expect(response.status).toBe(404);
  });
});

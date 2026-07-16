import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { ApiPrincipal } from '../../src/lib/api-principal.js';
import { MemoryCacheStore } from '../../src/lib/cache.js';
import { createApiRouter } from '../../src/routes/index.js';

function appFor(principal: ApiPrincipal) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('principal', principal);
    c.set('organization', { id: principal.organizationId } as never);
    c.set('user', principal.kind === 'session' ? ({ id: 'user_1' } as never) : null);
    c.set('session', principal.kind === 'session' ? ({ id: 'session_1' } as never) : null);
    c.set('apiKey', null);
    await next();
  });
  app.route('/api/v1', createApiRouter({} as never, new MemoryCacheStore()));
  return app;
}

describe('API router identity boundaries', () => {
  it('rejects API keys from dashboard routes before executing a query', async () => {
    const response = await appFor({
      kind: 'api_key',
      organizationId: 'org_1',
      apiKeyId: 'key_1',
      scopes: ['catalog:read'],
    }).request('/api/v1/dashboard/stats');

    expect(response.status).toBe(403);
  });

  it('rejects dashboard sessions from machine control-plane routes', async () => {
    const response = await appFor({
      kind: 'session',
      organizationId: 'org_1',
      apiKeyId: null,
      scopes: [],
    }).request('/api/v1/catalog/services');

    expect(response.status).toBe(403);
  });

  it('does not mount dashboard routes at the API root', async () => {
    const response = await appFor({
      kind: 'session',
      organizationId: 'org_1',
      apiKeyId: null,
      scopes: [],
    }).request('/api/v1/connections');

    expect(response.status).toBe(404);
  });
});

/**
 * A newly configured service has to become connectable immediately.
 *
 * The catalogue is cached for five minutes, and it now carries `connectable`. So an owner who
 * pastes in the OAuth client ID that was missing would, if the cache survived the write, keep
 * being told for another five minutes that the service cannot be connected — while the authorize
 * route, which reads no cache, would happily connect it. Slow staleness is bad; staleness that
 * contradicts the rest of the API is worse.
 *
 * These tests drive the real cache through the real repository and the real routes, so the key the
 * catalogue reads and the key each write path drops are compared rather than assumed.
 */

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from '../../src/lib/cache.js';
import {
  CachedControlPlaneRepository,
  tenantServicesCacheKey,
} from '../../src/lib/control-plane-repository.js';
import type { ControlPlaneRepository } from '../../src/routes/control-plane.js';
import { createDashboardRouter } from '../../src/routes/dashboard.js';

const CATALOG = [
  {
    id: 'github',
    name: 'GitHub',
    authType: 'oauth2',
    kind: 'service' as const,
    enabled: true,
    connectable: false,
    notConnectableReason: 'missing_oauth_client' as const,
    toolAccessPolicy: 'read_only' as const,
    config: {},
  },
];

function sourceRepository() {
  return {
    listTenantServices: vi.fn().mockResolvedValue(CATALOG),
    listConnections: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn(),
    auditCredentialAccess: vi.fn(),
  } satisfies ControlPlaneRepository;
}

/** Minimal drizzle stand-in for the settings routes: they read one row and upsert one row. */
function fakeDb() {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [] }),
      }),
    }),
    insert: () => ({
      values: () =>
        Object.assign(Promise.resolve(), {
          onConflictDoUpdate: async () => undefined,
        }),
    }),
  };
  return db as never;
}

function appWith(cache: MemoryCacheStore) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('organization', { id: 'org_1' } as never);
    await next();
  });
  app.route(
    '/',
    createDashboardRouter(fakeDb(), cache, {
      put: vi.fn(),
      read: vi.fn(),
      rewrap: vi.fn(),
    } as never)
  );
  return app;
}

async function put(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('configuring a service drops the cached catalogue', () => {
  it('caches the catalogue under the key the write paths delete', async () => {
    // The one fact both sides depend on. Written out separately in three files until now.
    const cache = new MemoryCacheStore();
    const repository = new CachedControlPlaneRepository(sourceRepository(), cache);

    await repository.listTenantServices('org_1');

    expect(await cache.get(tenantServicesCacheKey('org_1'))).toEqual(CATALOG);
  });

  it('serves a freshly configured OAuth client rather than the stale verdict', async () => {
    const cache = new MemoryCacheStore();
    const source = sourceRepository();
    const repository = new CachedControlPlaneRepository(source, cache);

    // A caller reads the catalogue and is told GitHub has no OAuth application.
    const before = await repository.listTenantServices('org_1');
    expect(before[0]).toMatchObject({ connectable: false });

    // Its owner supplies one.
    const response = await put(appWith(cache), '/organization/services/github/config', {
      customClientId: 'client-123',
      customClientSecret: 'shhh',
    });
    expect(response.status).toBe(200);

    // The next read reaches the database again instead of repeating the old answer.
    source.listTenantServices.mockResolvedValue([
      { ...CATALOG[0], connectable: true, notConnectableReason: undefined },
    ]);
    const after = await repository.listTenantServices('org_1');

    expect(source.listTenantServices).toHaveBeenCalledTimes(2);
    expect(after[0]).toMatchObject({ connectable: true });
  });

  it('drops the catalogue when a service is switched on or off', async () => {
    // `enabled` is published too, so the same staleness applies to the toggle.
    const cache = new MemoryCacheStore();
    const source = sourceRepository();
    const repository = new CachedControlPlaneRepository(source, cache);

    await repository.listTenantServices('org_1');
    const response = await put(appWith(cache), '/organization/services/github', { enabled: false });
    expect(response.status).toBe(200);

    expect(await cache.get(tenantServicesCacheKey('org_1'))).toBeUndefined();
  });
});

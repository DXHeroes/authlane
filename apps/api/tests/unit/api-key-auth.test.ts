import { hashApiKey } from '@authlane/shared';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { authMiddleware } from '../../src/middleware/auth.js';

function fakeDatabase(row: Record<string, unknown> | undefined) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return { db: { select } as never, select, from, where, limit };
}

describe('API key authentication', () => {
  it('loads the complete active organization for dashboard sessions', async () => {
    const activeOrganization = {
      id: 'org_1',
      name: 'Acme',
      slug: 'acme',
      logo: null,
      metadata: '{"webhookUrl":"https://example.com/hooks/authlane"}',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { db } = fakeDatabase(activeOrganization);
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: 'user_1', name: 'Owner', email: 'owner@example.com', image: null },
          session: { id: 'session_1', activeOrganizationId: 'org_1' },
        }),
      },
    };
    const app = new Hono();
    app.use('*', authMiddleware(db, auth as never));
    app.get('/', (c) => c.json(c.get('organization')));

    const response = await app.request('/');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'org_1',
      name: 'Acme',
      slug: 'acme',
      metadata: activeOrganization.metadata,
    });
  });

  it('loads a scoped organization principal from api_keys', async () => {
    const rawKey = 'ak_live_secret';
    const { db } = fakeDatabase({
      id: 'key_1',
      organizationId: 'org_1',
      keyHash: hashApiKey(rawKey),
      scopes: ['connections:read', 'credentials:issue'],
      enabled: true,
      expiresAt: null,
    });
    const app = new Hono();
    app.use('*', authMiddleware(db));
    app.get('/', (c) => c.json(c.get('principal')));

    const response = await app.request('/', {
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: 'api_key',
      organizationId: 'org_1',
      apiKeyId: 'key_1',
      scopes: ['connections:read', 'credentials:issue'],
    });
  });

  it('rejects an expired key', async () => {
    const { db } = fakeDatabase({
      id: 'key_1',
      organizationId: 'org_1',
      scopes: ['catalog:read'],
      enabled: true,
      expiresAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const app = new Hono();
    app.use('*', authMiddleware(db, undefined, { now: () => new Date('2026-01-01') }));
    app.get('/', (c) => c.json(c.get('principal')));

    const response = await app.request('/', {
      headers: { authorization: 'Bearer ak_expired' },
    });

    expect(response.status).toBe(401);
  });

  it('rechecks key revocation in PostgreSQL on every request', async () => {
    const rawKey = 'ak_live_revocable';
    const row = {
      id: 'key_1',
      organizationId: 'org_1',
      keyHash: hashApiKey(rawKey),
      scopes: ['connections:read'],
      enabled: true,
      expiresAt: null,
    };
    const limit = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
      })),
    } as never;
    const app = new Hono();
    app.use('*', authMiddleware(db));
    app.get('/', (c) => c.json(c.get('principal')));

    const first = await app.request('/', {
      headers: { authorization: `Bearer ${rawKey}` },
    });
    const afterRevocation = await app.request('/', {
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(first.status).toBe(200);
    expect(afterRevocation.status).toBe(401);
    expect(limit).toHaveBeenCalledTimes(2);
  });
});

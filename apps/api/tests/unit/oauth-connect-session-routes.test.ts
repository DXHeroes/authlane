import type { SecretStore } from '@authlane/database';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createOAuthRouter } from '../../src/routes/oauth.js';

interface FakeDatabaseOptions {
  selectResults?: unknown[][];
  deleteResults?: unknown[][];
}

function thenableQuery(result: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are PromiseLike.
  query.then = (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function fakeDatabase(options: FakeDatabaseOptions = {}) {
  const selectResults = [...(options.selectResults ?? [])];
  const deleteResults = [...(options.deleteResults ?? [])];
  const insertedValues: unknown[] = [];
  const db: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(() => thenableQuery(selectResults.shift() ?? [])),
    insert: vi.fn(() => {
      const query = {
        values: vi.fn((value: unknown) => {
          insertedValues.push(value);
          return query;
        }),
        returning: vi.fn(async () => [{ id: 'session_1' }]),
      };
      return query;
    }),
    update: vi.fn(() => {
      const query = thenableQuery([]) as Record<string, unknown>;
      query.set = vi.fn(() => query);
      return query;
    }),
    delete: vi.fn(() => {
      const result = deleteResults.shift() ?? [];
      const query = thenableQuery(result) as Record<string, unknown>;
      query.returning = vi.fn(async () => result);
      return query;
    }),
    transaction: vi.fn(async (operation: (transaction: unknown) => Promise<unknown>) =>
      operation(db)
    ),
  };
  return { db, insertedValues };
}

const secretStore: SecretStore = {
  put: vi.fn(),
  read: vi.fn(),
  rewrap: vi.fn(),
};

function appFor(db: unknown) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('principal', {
      kind: 'api_key',
      organizationId: 'org_1',
      apiKeyId: 'key_1',
      scopes: ['connect-sessions:create'],
    });
    await next();
  });
  app.route('/api/v1', createOAuthRouter(db as never, secretStore));
  return app;
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session_1',
    organizationId: 'org_1',
    externalUserId: 'user_1',
    tokenHash: 'unused',
    allowedServices: ['github', 'slack'],
    allowedOrigin: 'https://saas.example',
    expiresAt: new Date(Date.now() + 60_000),
    destructiveActionExpiresAt: null,
    createdAt: new Date(),
    revokedAt: null,
    ...overrides,
  };
}

describe('POST /api/v1/connect-sessions', () => {
  it('stores an empty allowlist as a concrete deterministic enabled-service snapshot', async () => {
    const { db, insertedValues } = fakeDatabase({
      selectResults: [[{ serviceId: 'slack' }, { serviceId: 'github' }]],
    });

    const response = await appFor(db).request('/api/v1/connect-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        externalUserId: 'user_1',
        allowedServices: [],
        allowedOrigin: 'https://saas.example',
      }),
    });

    expect(response.status).toBe(201);
    expect(insertedValues[0]).toMatchObject({ allowedServices: ['github', 'slack'] });
  });

  it('accepts duplicate explicit IDs and stores each service once', async () => {
    const { db, insertedValues } = fakeDatabase({
      selectResults: [[{ serviceId: 'github' }]],
    });

    const response = await appFor(db).request('/api/v1/connect-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        externalUserId: 'user_1',
        allowedServices: ['github', 'github'],
        allowedOrigin: 'https://saas.example',
      }),
    });

    expect(response.status).toBe(201);
    expect(insertedValues[0]).toMatchObject({ allowedServices: ['github'] });
  });

  it.each([
    ['missing', undefined],
    ['non-array', 'github'],
  ])('rejects a %s allowedServices value', async (_label, allowedServices) => {
    const { db, insertedValues } = fakeDatabase({
      selectResults: [[{ serviceId: 'github' }]],
    });
    const body: Record<string, unknown> = {
      externalUserId: 'user_1',
      allowedOrigin: 'https://saas.example',
    };
    if (allowedServices !== undefined) body.allowedServices = allowedServices;

    const response = await appFor(db).request('/api/v1/connect-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(insertedValues).toEqual([]);
  });

  it('rejects an explicit service that is not currently enabled', async () => {
    const { db, insertedValues } = fakeDatabase({
      selectResults: [[{ serviceId: 'github' }]],
    });

    const response = await appFor(db).request('/api/v1/connect-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        externalUserId: 'user_1',
        allowedServices: ['github', 'slack'],
        allowedOrigin: 'https://saas.example',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation error: These services are not currently enabled: slack',
    });
    expect(insertedValues).toEqual([]);
  });

  it('fails closed when an empty allowlist resolves to zero services', async () => {
    const { db } = fakeDatabase({ selectResults: [[]] });

    const response = await appFor(db).request('/api/v1/connect-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        externalUserId: 'user_1',
        allowedServices: [],
        allowedOrigin: 'https://saas.example',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      hint: 'Enable at least one service before creating a connect session',
    });
  });
});

describe('connect-session service availability after snapshot creation', () => {
  it('hides a later-disabled service from hosted session data', async () => {
    const { db } = fakeDatabase({
      selectResults: [[session()], [{ id: 'github', name: 'GitHub', authType: 'oauth2' }], []],
    });

    const response = await appFor(db).request('/api/v1/connect/session', {
      method: 'POST',
      headers: {
        authorization: 'ConnectSession acs_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentOrigin: 'https://saas.example' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { services: [{ id: 'github' }] },
      error: null,
    });
  });

  it('rejects a new authorization for a later-disabled service', async () => {
    const { db } = fakeDatabase({ selectResults: [[session()], [], []] });

    const response = await appFor(db).request('/api/v1/connect/slack/authorize', {
      method: 'POST',
      headers: {
        authorization: 'ConnectSession acs_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentOrigin: 'https://saas.example' }),
    });

    expect(response.status).toBe(404);
  });

  it('still allows disconnect for a snapshotted service after it is disabled', async () => {
    const { db } = fakeDatabase({
      selectResults: [
        [
          session({
            destructiveActionExpiresAt: new Date(Date.now() + 60_000),
          }),
        ],
      ],
      deleteResults: [[]],
    });

    const response = await appFor(db).request('/api/v1/connect/slack', {
      method: 'DELETE',
      headers: {
        authorization: 'ConnectSession acs_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentOrigin: 'https://saas.example' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { disconnected: false }, error: null });
  });
});

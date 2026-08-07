/**
 * What a tenant's runtime is told about the services it may use.
 *
 * Two separate promises live in this response. The first: a credential without an address is not
 * usable, so every entry carries the MCP endpoint its tools are reached at. The second, and the
 * reason most of this file exists: an entry says whether connecting to it would actually work.
 *
 * It did not used to. A service with no OAuth application and a fully configured one came back
 * byte-identical, so a downstream SaaS could only find out by offering the service to a user and
 * watching POST /connect/:serviceId/authorize answer 409. The catalogue now decides that by
 * handing the row to the same resolver that route calls, which is the invariant the last describe
 * block pins down.
 */

import type { SecretStore } from '@authlane/database';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

const listEnabledMcpServers = vi.fn();
const readMcpServerConnectConfig = vi.fn();

vi.mock('@authlane/database', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@authlane/database');
  return { ...actual, listEnabledMcpServers, readMcpServerConnectConfig };
});

const { DrizzleControlPlaneRepository } = await import('../../src/lib/control-plane-repository.js');
const { createOAuthRouter } = await import('../../src/routes/oauth.js');

/** An MCP server row as `listEnabledMcpServers` now returns it: a whole connect config. */
function mcpServer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mcp-1',
    name: 'Slack',
    authType: 'oauth2',
    serverUrl: 'https://mcp.slack.com/mcp',
    enabled: true,
    oauthClientId: 'client-123',
    oauthClientSecretId: 'secret-1',
    authorizationEndpoint: 'https://mcp.slack.com/authorize',
    tokenEndpoint: 'https://mcp.slack.com/token',
    authorizationRequired: false,
    ...overrides,
  };
}

/** A row of the catalog's left join between `services` and this organization's settings. */
function builtInRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'github',
    name: 'GitHub',
    authType: 'oauth2',
    enabled: true,
    oauthClientId: 'tenant-client',
    toolAccessPolicy: 'read_only',
    config: { authorization_url: 'https://github.com/login/oauth/authorize' },
    ...overrides,
  };
}

function dbReturning(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({ leftJoin: () => ({ where: async () => rows }) }),
    }),
  } as never;
}

/** Returns no built-in services, so a case is only about the tenant's own servers. */
function dbWithNoBuiltIns() {
  return dbReturning([]);
}

async function catalog(db: unknown) {
  return new DrizzleControlPlaneRepository(db as never).listTenantServices('org_1');
}

function endpointOf(entry: { config: unknown }): string | undefined {
  const config = entry.config as
    | { execution?: { provider_mcp?: { endpoint?: string } } }
    | undefined;
  return config?.execution?.provider_mcp?.endpoint;
}

describe('a tenant MCP server in the service catalog', () => {
  it('carries the address its tools are reached at', async () => {
    listEnabledMcpServers.mockResolvedValue([mcpServer()]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry.id).toBe('mcp-1');
    expect(endpointOf(entry)).toBe('https://mcp.slack.com/mcp');
  });

  /**
   * The shape matters as much as the value: a consumer that has to branch on which kind of service
   * it is holding will get the branch wrong for whichever kind it was not written against.
   */
  it('uses the same shape a built-in service already uses', async () => {
    listEnabledMcpServers.mockResolvedValue([mcpServer()]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry.config).toEqual({
      execution: {
        preferred: 'provider_mcp',
        provider_mcp: { endpoint: 'https://mcp.slack.com/mcp' },
      },
    });
  });

  it('leaves per-tool judgement to the contract rather than the service policy', async () => {
    listEnabledMcpServers.mockResolvedValue([mcpServer()]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry.toolAccessPolicy).toBe('full');
  });

  it('is labelled as a server the organization registered', async () => {
    listEnabledMcpServers.mockResolvedValue([mcpServer()]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry.kind).toBe('mcp_server');
  });
});

describe('whether a listed service can be connected', () => {
  it('offers a built-in service the organization registered an application for', async () => {
    listEnabledMcpServers.mockResolvedValue([]);

    const [entry] = await catalog(dbReturning([builtInRow()]));

    expect(entry).toMatchObject({ kind: 'service', connectable: true });
    expect(entry).not.toHaveProperty('notConnectableReason');
  });

  it('names the missing application for a built-in service with no client id', async () => {
    // The bug this whole change exists for: this entry used to be indistinguishable from the one
    // above, and the only way to discover the difference was a 409 in front of a user.
    listEnabledMcpServers.mockResolvedValue([]);

    const [entry] = await catalog(dbReturning([builtInRow({ oauthClientId: null })]));

    expect(entry).toMatchObject({
      connectable: false,
      notConnectableReason: 'missing_oauth_client',
    });
  });

  it('counts platform credentials as an application', async () => {
    // Authlane can authorize these on its own, so requiring a tenant client id here would mark
    // every out-of-the-box service unconnectable.
    listEnabledMcpServers.mockResolvedValue([]);
    process.env.AUTHLANE_OAUTH_GITHUB_CLIENT_ID = 'platform-client';

    try {
      const [entry] = await catalog(dbReturning([builtInRow({ oauthClientId: null })]));
      expect(entry.connectable).toBe(true);
    } finally {
      // biome-ignore lint/performance/noDelete: the resolver reads process.env at call time.
      delete process.env.AUTHLANE_OAUTH_GITHUB_CLIENT_ID;
    }
  });

  it('names a catalog row with no authorization URL separately', async () => {
    listEnabledMcpServers.mockResolvedValue([]);

    const [entry] = await catalog(dbReturning([builtInRow({ config: {} })]));

    expect(entry).toMatchObject({
      connectable: false,
      notConnectableReason: 'missing_authorization_url',
    });
  });

  it('offers an MCP server that has an OAuth client', async () => {
    listEnabledMcpServers.mockResolvedValue([mcpServer()]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry.connectable).toBe(true);
  });

  it('names the missing client for an MCP server registration never completed for', async () => {
    listEnabledMcpServers.mockResolvedValue([mcpServer({ oauthClientId: null })]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry).toMatchObject({
      connectable: false,
      notConnectableReason: 'missing_oauth_client',
    });
  });

  it('reports a disabled server as disabled rather than as missing a client', async () => {
    /*
     * `listEnabledMcpServers` filters these out, so this row cannot reach a live catalogue — but
     * the authorize route reads a server by id without that filter and does see one. The reason
     * has to be right there, and it is the same resolver producing it.
     */
    listEnabledMcpServers.mockResolvedValue([mcpServer({ enabled: false, oauthClientId: null })]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry).toMatchObject({ enabled: false, notConnectableReason: 'disabled' });
  });

  it('leaves an API-key server connectable on its own terms', async () => {
    // It connects through POST /connect/:serviceId/api-key, which wants no OAuth application at
    // all. Marking it unconnectable for lacking one would hide a service that works.
    listEnabledMcpServers.mockResolvedValue([
      mcpServer({ authType: 'api_key', oauthClientId: null, authorizationEndpoint: null }),
    ]);

    const [entry] = await catalog(dbWithNoBuiltIns());

    expect(entry).toMatchObject({ authType: 'api_key', connectable: true });
    expect(entry).not.toHaveProperty('notConnectableReason');
  });

  it('reads enabled from the row rather than asserting it', async () => {
    /*
     * Both branches used to return a hardcoded `true`. The built-in branch even selected the real
     * column and then overwrote it, so the field agreed with the query by luck and would have gone
     * on agreeing silently after the query changed.
     */
    listEnabledMcpServers.mockResolvedValue([mcpServer({ enabled: false })]);

    const [builtIn, server] = await catalog(dbReturning([builtInRow({ enabled: false })]));

    expect(builtIn.enabled).toBe(false);
    expect(server.enabled).toBe(false);
  });

  it('treats an unconfigured platform-default service as on', async () => {
    // A left join leaves `enabled` null for a service the organization never touched, and the
    // where clause only admits those when the platform can authorize them.
    listEnabledMcpServers.mockResolvedValue([]);

    const [entry] = await catalog(dbReturning([builtInRow({ enabled: null })]));

    expect(entry.enabled).toBe(true);
  });
});

/**
 * The invariant the shared resolvers exist to hold.
 *
 * Both readiness decisions used to be written out at the authorize route only. A catalogue that
 * re-implemented them would agree on the day it was written and drift the first time either
 * condition moved — and a catalogue that has drifted is worse than one that says nothing, because
 * a downstream SaaS believes it.
 */
describe('the catalogue and the authorize route agree', () => {
  const secretStore: SecretStore = {
    put: vi.fn(async () => 'sec_1'),
    read: vi.fn(),
    rewrap: vi.fn(),
  };

  function connectSession() {
    return {
      id: 'session_1',
      organizationId: 'org_1',
      externalUserId: 'user_1',
      tokenHash: 'unused',
      allowedServices: ['github', 'mcp-1'],
      allowedOrigin: 'https://saas.example',
      expiresAt: new Date(Date.now() + 60_000),
      destructiveActionExpiresAt: null,
      createdAt: new Date(),
      revokedAt: null,
    };
  }

  /**
   * A Drizzle-shaped stub that hands back one prepared result per `select()`.
   *
   * It accepts writes as well as reads so a service that passes the readiness check goes on to
   * answer 200. Without that the happy path would fail somewhere later and still not be a 409,
   * and the comparison below would hold for the wrong reason.
   */
  function authorizeDb(selectResults: unknown[][]) {
    const remaining = [...selectResults];
    const db: Record<string, unknown> = {
      select: () => {
        const result = remaining.shift() ?? [];
        const query: Record<string, unknown> = {};
        for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
          query[method] = () => query;
        }
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are PromiseLike.
        query.then = (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(result).then(resolve);
        return query;
      },
      insert: () => {
        const query: Record<string, unknown> = {};
        for (const method of ['values', 'onConflictDoUpdate', 'onConflictDoNothing']) {
          query[method] = () => query;
        }
        query.returning = async () => [{ id: 'connection_1' }];
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are PromiseLike.
        query.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
        return query;
      },
      transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation(db),
    };
    return db;
  }

  async function authorizeStatus(serviceId: string, db: unknown) {
    const app = new Hono();
    app.route('/api/v1', createOAuthRouter(db as never, secretStore));
    const response = await app.request(`/api/v1/connect/${serviceId}/authorize`, {
      method: 'POST',
      headers: {
        authorization: 'ConnectSession acs_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentOrigin: 'https://saas.example' }),
    });
    return response.status;
  }

  const builtInCases = [
    { name: 'an organization application', row: builtInRow(), status: 200 },
    { name: 'no application at all', row: builtInRow({ oauthClientId: null }), status: 409 },
    { name: 'no authorization URL', row: builtInRow({ config: {} }), status: 409 },
  ];

  it.each(builtInCases)(
    'answers consistently for a built-in service with $name',
    async ({ row, status: expected }) => {
      listEnabledMcpServers.mockResolvedValue([]);
      const [entry] = await catalog(dbReturning([row]));

      // The authorize route reads the session, then the catalog row, then this organization's
      // settings for it.
      const status = await authorizeStatus(
        'github',
        authorizeDb([
          [connectSession()],
          [{ id: row.id, authType: row.authType, config: row.config, enabled: true }],
          [
            {
              enabled: true,
              toolAccessPolicy: row.toolAccessPolicy,
              oauthClientId: row.oauthClientId,
              oauthClientSecretId: null,
              customScopes: null,
            },
          ],
        ])
      );

      // Pinned both ways: the statuses are asserted outright so the comparison cannot pass because
      // every case happened to fail somewhere other than the readiness check.
      expect(status).toBe(expected);
      expect(entry.connectable).toBe(status !== 409);
    }
  );

  const mcpCases = [
    { name: 'a registered client', server: mcpServer(), status: 200 },
    { name: 'no registered client', server: mcpServer({ oauthClientId: null }), status: 409 },
    {
      name: 'no authorization endpoint',
      server: mcpServer({ authorizationEndpoint: null }),
      status: 409,
    },
  ];

  it.each(mcpCases)(
    'answers consistently for an MCP server with $name',
    async ({ server, status: expected }) => {
      listEnabledMcpServers.mockResolvedValue([server]);
      readMcpServerConnectConfig.mockResolvedValue(server);

      const [entry] = await catalog(dbWithNoBuiltIns());
      const status = await authorizeStatus('mcp-1', authorizeDb([[connectSession()]]));

      expect(status).toBe(expected);
      expect(entry.connectable).toBe(status !== 409);
    }
  );

  it('gives each refusal its own message', async () => {
    /*
     * Both branches once answered "OAuth error: OAuth provider is not configured" and nothing
     * else, so a caller holding a 409 could not tell which kind of service had failed or what to
     * go and fix. The wording follows the reason the catalogue publishes for the same service.
     */
    listEnabledMcpServers.mockResolvedValue([]);
    readMcpServerConnectConfig.mockResolvedValue(mcpServer({ oauthClientId: null }));

    const app = new Hono();
    app.route(
      '/api/v1',
      createOAuthRouter(authorizeDb([[connectSession()]]) as never, secretStore)
    );
    const response = await app.request('/api/v1/connect/mcp-1/authorize', {
      method: 'POST',
      headers: {
        authorization: 'ConnectSession acs_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentOrigin: 'https://saas.example' }),
    });
    const body = (await response.json()) as { error: { message: string; hint?: string } };

    expect(response.status).toBe(409);
    expect(body.error.message).toContain('MCP server has no OAuth client');
    expect(body.error.hint).toBeTruthy();
  });
});

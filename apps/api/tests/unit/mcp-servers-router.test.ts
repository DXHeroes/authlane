import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { McpDiscoveryDeps } from '../../src/lib/mcp-discovery-run.js';
import { createMcpServersRouter } from '../../src/routes/mcp-servers.js';

const DISCOVERY_OK: McpDiscoveryDeps = {
  resolveHost: async () => ['93.184.216.34'],
  fetchJson: async () => ({}),
  callRpc: async () => ({
    status: 200,
    sessionId: null,
    challenge: null,
    payload: { tools: [{ name: 'search', inputSchema: {} }] },
  }),
};

/** Minimal drizzle stand-in: enough shape for the router, no database. */
function fakeDb(rows: unknown[] = []) {
  const calls: string[] = [];
  const db = {
    calls,
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ orderBy: async () => rows }) }),
        // `limit` is how the org-scoped single-row reads end; without it the delete route,
        // which now looks up the client secret before dropping the row, throws.
        where: () => ({ orderBy: async () => rows, limit: async () => rows.slice(0, 1) }),
      }),
    }),
    // Drizzle's insert builder is awaitable and also exposes onConflictDoUpdate, so the fake is a
    // real promise carrying that method rather than a hand-rolled thenable.
    insert: () => ({
      values: () => {
        calls.push('insert');
        return Object.assign(Promise.resolve(), {
          onConflictDoUpdate: async () => undefined,
        });
      },
    }),
    update: () => ({ set: () => ({ where: async () => calls.push('update') }) }),
    delete: () => ({ where: async () => calls.push('delete') }),
  };
  return db as unknown as Parameters<typeof createMcpServersRouter>[0] & { calls: string[] };
}

function fakeCache() {
  return {
    get: async () => undefined,
    set: async () => undefined,
    delete: vi.fn(async () => undefined),
  };
}

function appWith(
  db: ReturnType<typeof fakeDb>,
  deps: McpDiscoveryDeps = DISCOVERY_OK,
  cache?: ReturnType<typeof fakeCache>
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('organization', { id: 'org_1' } as never);
    await next();
  });
  app.route('/', createMcpServersRouter(db, deps, cache));
  return app;
}

async function post(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('MCP server registration route', () => {
  it('registers a server and reports the discovered tool count', async () => {
    const db = fakeDb();
    const response = await post(appWith(db), '/organization/mcp-servers', {
      name: 'Support desk',
      serverUrl: 'https://mcp.example.com',
      authType: 'oauth2',
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { id: string; enabled: boolean } };
    expect(payload.data.id.startsWith('mcp-')).toBe(true);
    expect(payload.data.enabled).toBe(true);
  });

  it('enables a server that will not list its tools until a user authorizes', async () => {
    // The shape every OAuth-protected server answers with. Registration has to succeed: the tool
    // list arrives once somebody authorizes, and refusing here leaves the tenant nothing to click.
    const db = fakeDb();
    const response = await post(
      appWith(db, {
        resolveHost: async () => ['93.184.216.34'],
        fetchJson: async (url) =>
          url.endsWith('/oauth-protected-resource')
            ? { authorization_servers: ['https://mcp.example.com'] }
            : {
                issuer: 'https://mcp.example.com',
                authorization_endpoint: 'https://mcp.example.com/authorize',
                token_endpoint: 'https://mcp.example.com/token',
              },
        callRpc: async () => ({
          status: 401,
          sessionId: null,
          challenge:
            'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
          payload: null,
        }),
      }),
      '/organization/mcp-servers',
      { name: 'Linear', serverUrl: 'https://mcp.example.com', authType: 'oauth2' }
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { enabled: boolean; tools: number; authorizationRequired: boolean };
      error: unknown;
    };
    expect(payload.error).toBeNull();
    expect(payload.data.enabled).toBe(true);
    expect(payload.data.tools).toBe(0);
    expect(payload.data.authorizationRequired).toBe(true);
  });

  it('rejects a plaintext URL without touching the network', async () => {
    const callRpc = vi.fn();
    const response = await post(
      appWith(fakeDb(), {
        resolveHost: async () => ['93.184.216.34'],
        fetchJson: async () => ({}),
        callRpc,
      }),
      '/organization/mcp-servers',
      { name: 'x', serverUrl: 'http://mcp.example.com', authType: 'oauth2' }
    );

    expect(response.status).toBe(400);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('creates the server disabled when discovery fails, and says why', async () => {
    const response = await post(
      appWith(fakeDb(), {
        resolveHost: async () => ['10.0.0.1'],
        fetchJson: async () => ({}),
        callRpc: async () => ({
          status: 200,
          sessionId: null,
          challenge: null,
          payload: { tools: [] },
        }),
      }),
      '/organization/mcp-servers',
      { name: 'internal', serverUrl: 'https://internal.example.com', authType: 'api_key' }
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { enabled: boolean };
      error: { code: string };
    };
    expect(payload.data.enabled).toBe(false);
    expect(payload.error.code).toBe('MCP_DISCOVERY_BLOCKED_HOST');
  });

  it('refuses a body that is not JSON', async () => {
    const app = appWith(fakeDb());
    const response = await app.request('/organization/mcp-servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });
});

describe('MCP tool judgement route', () => {
  it('accepts lowering a tool to read', async () => {
    const app = appWith(fakeDb());
    const response = await app.request('/organization/mcp-servers/mcp-1/tools/search', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ risk: 'read' }),
    });
    expect(response.status).toBe(200);
  });

  it('rejects an invented risk level', async () => {
    const app = appWith(fakeDb());
    const response = await app.request('/organization/mcp-servers/mcp-1/tools/search', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ risk: 'harmless' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('MCP routes without an organization', () => {
  it('refuses every route when no organization is in context', async () => {
    const app = new Hono();
    app.route('/', createMcpServersRouter(fakeDb(), DISCOVERY_OK));

    for (const [method, path] of [
      ['GET', '/organization/mcp-servers'],
      ['POST', '/organization/mcp-servers'],
      ['GET', '/organization/mcp-servers/mcp-1/tools'],
      ['DELETE', '/organization/mcp-servers/mcp-1'],
    ] as const) {
      const response = await app.request(path, { method });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe('service catalog cache', () => {
  it('drops the cached catalog after a registration, so the server is visible at once', async () => {
    const cache = fakeCache();
    const response = await post(
      appWith(fakeDb(), DISCOVERY_OK, cache),
      '/organization/mcp-servers',
      { name: 'Support desk', serverUrl: 'https://mcp.example.com', authType: 'oauth2' }
    );

    expect(response.status).toBe(201);
    expect(cache.delete).toHaveBeenCalledWith('control-plane:tenant-services:org_1');
  });

  it('drops it again on delete, so a removed server stops being offered', async () => {
    const cache = fakeCache();
    const app = appWith(fakeDb(), DISCOVERY_OK, cache);

    const response = await app.request('/organization/mcp-servers/mcp-1', { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(cache.delete).toHaveBeenCalledWith('control-plane:tenant-services:org_1');
  });

  it('leaves a failed discovery alone — nothing became visible to invalidate', async () => {
    const cache = fakeCache();
    const response = await post(
      appWith(
        fakeDb(),
        { resolveHost: async () => ['127.0.0.1'], fetchJson: async () => ({}) },
        cache
      ),
      '/organization/mcp-servers',
      { name: 'Support desk', serverUrl: 'https://mcp.example.com', authType: 'oauth2' }
    );

    // The row exists but stays disabled, so nothing became visible to invalidate.
    const payload = (await response.json()) as { data: { enabled: boolean } };
    expect(payload.data.enabled).toBe(false);
    expect(cache.delete).not.toHaveBeenCalled();
  });
});

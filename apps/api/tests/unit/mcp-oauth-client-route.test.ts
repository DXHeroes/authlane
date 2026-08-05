/**
 * The route that lets a tenant bring their own OAuth application.
 *
 * Without it, a server that publishes no registration endpoint — Slack — or that publishes one on
 * a host other than its own — Attio — answers every user with the same 409 forever, and nothing in
 * the product can change that.
 */

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { McpDiscoveryDeps } from '../../src/lib/mcp-discovery-run.js';
import { createMcpServersRouter } from '../../src/routes/mcp-servers.js';

const DISCOVERY: McpDiscoveryDeps = {
  resolveHost: async () => ['93.184.216.34'],
  fetchJson: async () => ({}),
  callRpc: async () => ({ status: 200, sessionId: null, challenge: null, payload: { tools: [] } }),
};

interface ServerRow {
  id: string;
  authType: string;
  enabled: boolean;
  oauthClientId: string | null;
  oauthClientSecretId: string | null;
  oauthClientSource: string | null;
  serverUrl?: string;
  oauthMetadata?: unknown;
}

/**
 * Stands in for the two reads the route makes: the org-scoped server row, and the connect config
 * it re-resolves afterwards to report readiness. Both come off the same record.
 */
function fakeDb(server: ServerRow | null, connections: unknown[] = []) {
  const writes: Array<{ kind: string; value?: unknown }> = [];
  // The route saves the client and then re-reads the server to report readiness, so the fake has
  // to reflect its own writes — otherwise `ready` would always be false for a reason no product
  // code is responsible for.
  let current = server ? { ...server } : null;
  let selectCall = 0;

  const db = {
    writes,
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ orderBy: async () => [] }) }),
        where: (..._args: unknown[]) => {
          selectCall += 1;
          // The connection sweep awaits the builder directly, with no limit or orderBy, so the
          // fake has to be thenable — as Drizzle's own builders are, for the same reason.
          const rows = () => (current ? [current] : []);
          return Object.assign(Promise.resolve(selectCall > 1 ? connections : []), {
            orderBy: async () => rows(),
            limit: async () => rows(),
          });
        },
      }),
    }),
    insert: () => ({
      values: () => Object.assign(Promise.resolve(), { onConflictDoUpdate: async () => undefined }),
    }),
    update: () => ({
      set: (value: unknown) => ({
        where: async () => {
          writes.push({ kind: 'update', value });
          const patch = value as Partial<ServerRow>;
          if (current && 'oauthClientId' in patch) {
            current = { ...current, ...patch };
          }
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        writes.push({ kind: 'delete' });
      },
    }),
  };
  return db as unknown as Parameters<typeof createMcpServersRouter>[0] & {
    writes: typeof writes;
  };
}

function fakeSecretStore() {
  return {
    put: vi.fn(async () => 'secret_new'),
    read: vi.fn(async () => Buffer.from('')),
    rewrap: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
}

function appWith(
  db: ReturnType<typeof fakeDb>,
  secretStore: ReturnType<typeof fakeSecretStore>,
  cache?: {
    get: () => Promise<undefined>;
    set: () => Promise<undefined>;
    delete: () => Promise<undefined>;
  }
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('organization', { id: 'org_1' } as never);
    await next();
  });
  app.route('/', createMcpServersRouter(db, DISCOVERY, cache as never, secretStore as never));
  return app;
}

const OAUTH_SERVER: ServerRow = {
  id: 'mcp-1',
  authType: 'oauth2',
  enabled: true,
  oauthClientId: null,
  oauthClientSecretId: null,
  oauthClientSource: null,
  serverUrl: 'https://mcp.slack.com/mcp',
  oauthMetadata: {
    authorizationEndpoint: 'https://slack.com/oauth/v2/authorize',
    tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
  },
};

function put(app: Hono, body: unknown, serverId = 'mcp-1') {
  return app.request(`/organization/mcp-servers/${serverId}/oauth-client`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('storing a tenant-supplied OAuth client', () => {
  it('seals the secret against the organization that owns the server', async () => {
    const secretStore = fakeSecretStore();
    const response = await put(appWith(fakeDb(OAUTH_SERVER), secretStore), {
      clientId: '1234.5678',
      clientSecret: 'xoxb-secret',
    });

    expect(response.status).toBe(200);
    expect(secretStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', purpose: 'oauth_client_secret' })
    );
  });

  it('never sends the secret back', async () => {
    const response = await put(appWith(fakeDb(OAUTH_SERVER), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: 'xoxb-secret',
    });

    const body = await response.text();
    expect(body).not.toContain('xoxb-secret');
    expect(JSON.parse(body).data.hasClientSecret).toBe(true);
  });

  it('accepts a public client, which is what PKCE-only providers issue', async () => {
    const response = await put(appWith(fakeDb(OAUTH_SERVER), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: null,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.hasClientSecret).toBe(false);
  });

  it('reports readiness, so a tenant is not left to find out through a user', async () => {
    const response = await put(appWith(fakeDb(OAUTH_SERVER), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: 'xoxb-secret',
    });

    expect((await response.json()).data.ready).toBe(true);
  });

  it('says a server is not ready when discovery has found no authorization endpoint', async () => {
    const undiscovered = { ...OAUTH_SERVER, oauthMetadata: null };
    const response = await put(appWith(fakeDb(undiscovered), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: 'xoxb-secret',
    });

    expect((await response.json()).data.ready).toBe(false);
  });

  it('hands back the redirect URI the authorize step will send', async () => {
    const response = await put(appWith(fakeDb(OAUTH_SERVER), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: 'xoxb-secret',
    });

    expect((await response.json()).data.redirectUri).toContain('/api/v1/oauth/mcp-1/callback');
  });

  it('refuses a client id carrying whitespace, which would travel mangled', async () => {
    const response = await put(appWith(fakeDb(OAUTH_SERVER), fakeSecretStore()), {
      clientId: '1234 5678',
      clientSecret: 'xoxb-secret',
    });

    expect(response.status).toBe(400);
  });

  it('refuses to pair a stored secret with a different client id', async () => {
    const existing = { ...OAUTH_SERVER, oauthClientId: 'old-id', oauthClientSecretId: 'secret_1' };
    const response = await put(appWith(fakeDb(existing), fakeSecretStore()), {
      clientId: 'new-id',
    });

    expect(response.status).toBe(400);
  });

  it('refuses a server that authorizes with an API key', async () => {
    const apiKeyServer = { ...OAUTH_SERVER, authType: 'api_key' };
    const response = await put(appWith(fakeDb(apiKeyServer), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: 'x',
    });

    expect(response.status).toBe(400);
  });

  it('answers 404 for a server another organization owns', async () => {
    const response = await put(appWith(fakeDb(null), fakeSecretStore()), {
      clientId: '1234.5678',
      clientSecret: 'x',
    });

    expect(response.status).toBe(404);
  });
});

describe('what a changed client does to existing connections', () => {
  const connectedUser = [{ externalUserId: 'user_1', credentialSecretId: 'cred_1' }];

  it('expires them when the client id changes, because their tokens are the old client’s', async () => {
    const existing = { ...OAUTH_SERVER, oauthClientId: 'old-id', oauthClientSecretId: 'secret_1' };
    const secretStore = fakeSecretStore();
    const db = fakeDb(existing, connectedUser);

    await put(appWith(db, secretStore), { clientId: 'new-id', clientSecret: 'fresh' });

    expect(secretStore.delete).toHaveBeenCalledWith('cred_1', 'org_1', 'connection_credentials');
  });

  /**
   * The case a careless implementation gets wrong. Rotating a secret leaves the tokens valid — they
   * belong to the same client — so expiring here would make every user of the server reconnect for
   * nothing.
   */
  it('leaves them alone when only the secret rotates', async () => {
    const existing = { ...OAUTH_SERVER, oauthClientId: 'same-id', oauthClientSecretId: 'secret_1' };
    const secretStore = fakeSecretStore();

    await put(appWith(fakeDb(existing, connectedUser), secretStore), {
      clientId: 'same-id',
      clientSecret: 'rotated',
    });

    expect(secretStore.delete).not.toHaveBeenCalledWith(
      'cred_1',
      'org_1',
      'connection_credentials'
    );
  });
});

describe('removing a tenant-supplied OAuth client', () => {
  function remove(app: Hono) {
    return app.request('/organization/mcp-servers/mcp-1/oauth-client', { method: 'DELETE' });
  }

  it('refuses to remove one Authlane registered itself', async () => {
    // Clearing it would leave the client live at the provider, and the next rediscovery would
    // register a second one beside it.
    const registered = {
      ...OAUTH_SERVER,
      oauthClientId: 'dcr-id',
      oauthClientSource: 'dynamic',
    };
    const response = await remove(appWith(fakeDb(registered), fakeSecretStore()));

    expect(response.status).toBe(400);
  });

  it('removes a pasted one and drops its secret record', async () => {
    const manual = {
      ...OAUTH_SERVER,
      oauthClientId: 'manual-id',
      oauthClientSecretId: 'secret_1',
      oauthClientSource: 'manual',
    };
    const secretStore = fakeSecretStore();
    const response = await remove(appWith(fakeDb(manual), secretStore));

    expect(response.status).toBe(200);
    expect(secretStore.delete).toHaveBeenCalledWith('secret_1', 'org_1', 'oauth_client_secret');
  });
});

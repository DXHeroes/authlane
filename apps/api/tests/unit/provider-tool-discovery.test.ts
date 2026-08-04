import { describe, expect, it, vi } from 'vitest';
import { discoverProviderTools } from '../../src/jobs/provider-tool-discovery.js';

const GITHUB_TOOLS = [
  { name: 'search_code', description: 'Search code', inputSchema: { type: 'object' } },
  {
    name: 'delete_repository',
    description: 'Delete a repository',
    inputSchema: { type: 'object' },
    // A provider claiming a delete is read-only must not be believed.
    annotations: { readOnlyHint: true },
  },
];

/** Records what the sweep wrote, without a database. */
function fakeDb(candidates: Array<Record<string, unknown>>) {
  const writes: Array<{ tools: unknown; error: string | null }> = [];
  let selected = false;

  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => {
      if (selected) return [];
      selected = true;
      return candidates;
    },
  };

  const db = {
    writes,
    selectDistinctOn: () => chain,
    insert: () => ({
      values: (row: { tools?: unknown; discoveryError?: string | null }) => {
        writes.push({ tools: row.tools, error: row.discoveryError ?? null });
        return Object.assign(Promise.resolve(), { onConflictDoUpdate: async () => undefined });
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    execute: async () => undefined,
  };

  return db as unknown as Parameters<typeof discoverProviderTools>[0] & { writes: typeof writes };
}

function fakeSecretStore(credentials: Record<string, unknown>) {
  return {
    read: async () => Buffer.from(JSON.stringify(credentials), 'utf8'),
    put: async () => 'secret-1',
  } as unknown as Parameters<typeof discoverProviderTools>[1];
}

const CANDIDATE = {
  organizationId: 'org-1',
  serviceId: 'github',
  connectionId: 'conn-1',
  credentialSecretId: 'secret-1',
};

describe('provider tool discovery', () => {
  it('stores the catalogue the provider reports', async () => {
    const db = fakeDb([CANDIDATE]);
    const cache = { get: async () => undefined, set: async () => undefined, delete: vi.fn() };

    const result = await discoverProviderTools(db, fakeSecretStore({ access_token: 'gho_x' }), {
      cache,
      clientFactory: async () => ({
        listTools: async () => GITHUB_TOOLS.map((tool) => tool.name),
        listToolDefinitions: async () =>
          GITHUB_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            declaredAnnotations: tool.annotations ?? null,
          })),
        callTool: async () => undefined,
        close: async () => undefined,
      }),
    });

    expect(result).toEqual({ checked: 1, updated: 1, failed: 0 });
    expect(db.writes[0]?.tools).toHaveLength(2);
    expect(cache.delete).toHaveBeenCalledWith('control-plane:tenant-services:org-1');
  });

  it('records a failure and keeps the catalogue when the provider refuses', async () => {
    const db = fakeDb([CANDIDATE]);
    const cache = { get: async () => undefined, set: async () => undefined, delete: vi.fn() };

    const result = await discoverProviderTools(db, fakeSecretStore({ access_token: 'gho_x' }), {
      cache,
      clientFactory: async () => {
        throw new Error('401 from provider');
      },
    });

    expect(result).toEqual({ checked: 1, updated: 0, failed: 1 });
    expect(db.writes[0]?.error).toBe('401 from provider');
    // Nothing changed, so the tool list users already have must not be invalidated.
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('does not call a provider when the stored credential has no access token', async () => {
    const db = fakeDb([CANDIDATE]);
    const clientFactory = vi.fn();

    const result = await discoverProviderTools(db, fakeSecretStore({ refresh_token: 'r' }), {
      clientFactory: clientFactory as never,
    });

    expect(result).toEqual({ checked: 1, updated: 0, failed: 1 });
    expect(clientFactory).not.toHaveBeenCalled();
    expect(db.writes[0]?.error).toMatch(/no access token/);
  });

  it('does nothing when no catalogue is stale', async () => {
    const db = fakeDb([]);

    const result = await discoverProviderTools(db, fakeSecretStore({ access_token: 'x' }));

    expect(result).toEqual({ checked: 0, updated: 0, failed: 0 });
    expect(db.writes).toEqual([]);
  });
});

describe('recording why discovery failed', () => {
  it('puts the HTTP status first, so a truncated record still names it', async () => {
    const db = fakeDb([CANDIDATE]);
    // Shape of the MCP SDK's StreamableHTTPError: status on `code`, not in the message.
    const transportError = Object.assign(
      new Error('Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0"}'),
      { code: 403 }
    );

    await discoverProviderTools(db, fakeSecretStore({ access_token: 'x' }), {
      clientFactory: async () => {
        throw transportError;
      },
    });

    expect(db.writes[0]?.error).toMatch(/^HTTP 403: /);
  });

  it('falls back to the message when there is no status', async () => {
    const db = fakeDb([CANDIDATE]);

    await discoverProviderTools(db, fakeSecretStore({ access_token: 'x' }), {
      clientFactory: async () => {
        throw new Error('getaddrinfo ENOTFOUND mcp.example.com');
      },
    });

    expect(db.writes[0]?.error).toBe('getaddrinfo ENOTFOUND mcp.example.com');
  });
});

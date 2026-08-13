import { describe, expect, it, vi } from 'vitest';
import { rediscoverStaleMcpServers } from '../../src/jobs/mcp-discovery.js';
import type { McpDiscoveryDeps } from '../../src/lib/mcp-discovery-run.js';

const REACHABLE: McpDiscoveryDeps = {
  resolveHost: async () => ['93.184.216.34'],
  fetchJson: async () => ({}),
  callRpc: async () => ({
    status: 200,
    sessionId: null,
    challenge: null,
    payload: { tools: [{ name: 'search', inputSchema: {} }] },
  }),
};

const UNREACHABLE: McpDiscoveryDeps = {
  resolveHost: async () => ['93.184.216.34'],
  fetchJson: async () => {
    throw new Error('connection refused');
  },
  callRpc: async () => {
    throw new Error('connection refused');
  },
};

/** Records which servers were written back, and how. */
function fakeDb(servers: Array<{ id: string; organizationId: string; serverUrl: string }>) {
  const updates: Array<{ id: string; kind: 'success' | 'failure' }> = [];
  let selected = false;

  const db = {
    updates,
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              // saveDiscoverySuccess does not select, so the first select is the sweep's own.
              if (selected) return [];
              selected = true;
              return servers;
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push({
            id: 'unknown',
            kind: values.discoveryError ? 'failure' : 'success',
          });
        },
      }),
    }),
    insert: () => ({
      values: () => Object.assign(Promise.resolve(), { onConflictDoUpdate: async () => undefined }),
    }),
  };

  return db as unknown as Parameters<typeof rediscoverStaleMcpServers>[0] & {
    updates: typeof updates;
  };
}

describe('scheduled MCP rediscovery', () => {
  it('refreshes a stale server and drops its catalog entry', async () => {
    const db = fakeDb([
      { id: 'mcp-1', organizationId: 'org-1', serverUrl: 'https://mcp.example.com' },
    ]);
    const cache = { get: async () => undefined, set: async () => undefined, delete: vi.fn() };

    const result = await rediscoverStaleMcpServers(db, REACHABLE, { cache });

    expect(result).toEqual({ checked: 1, updated: 1, failed: 0, registered: 0 });
    expect(cache.delete).toHaveBeenCalledWith('control-plane:tenant-services:org-1');
  });

  it('keeps the last known contract when a server is unreachable', async () => {
    const db = fakeDb([
      { id: 'mcp-1', organizationId: 'org-1', serverUrl: 'https://mcp.example.com' },
    ]);
    const cache = { get: async () => undefined, set: async () => undefined, delete: vi.fn() };

    const result = await rediscoverStaleMcpServers(db, UNREACHABLE, { cache });

    expect(result).toEqual({ checked: 1, updated: 0, failed: 1, registered: 0 });
    expect(db.updates).toEqual([{ id: 'unknown', kind: 'failure' }]);
    // Nothing changed, so nothing needs invalidating — and the users keep their tools.
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('does nothing when no server is due', async () => {
    const db = fakeDb([]);

    const result = await rediscoverStaleMcpServers(db, REACHABLE);

    expect(result).toEqual({ checked: 0, updated: 0, failed: 0, registered: 0 });
    expect(db.updates).toEqual([]);
  });
});

/**
 * The step that lets a server stop waiting.
 *
 * An OAuth-protected server refuses an uncredentialed `tools/list`, so discovery records an empty
 * contract and sets `authorization_required`. Nothing ever asked again, which made
 * "registered and waiting for the first user to authorize it" a state with no exit: the tenant did
 * everything right, a user authorized, and the tool list stayed empty forever.
 */

import { describe, expect, it, vi } from 'vitest';
import type { McpDiscoveryDeps } from '../../src/lib/mcp-discovery-run.js';

const readMcpServerConnectConfig = vi.fn();
const saveDiscoverySuccess = vi.fn();

vi.mock('@authlane/database', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@authlane/database');
  return { ...actual, readMcpServerConnectConfig, saveDiscoverySuccess };
});

const { discoverAfterFirstAuthorization } = await import(
  '../../src/lib/mcp-first-authorization.js'
);

const SERVER = { id: 'mcp-1', serverUrl: 'https://mcp.slack.com/mcp' };

/** Answers a credentialed call with tools and an uncredentialed one with 401, as a real one does. */
function depsRequiringAuthorization(tools: Array<{ name: string }>): McpDiscoveryDeps {
  return {
    resolveHost: async () => ['93.184.216.34'],
    fetchJson: async () => ({}),
    callRpc: async (_url, _message, session) => {
      if (!session?.accessToken) {
        return { status: 401, sessionId: null, challenge: null, payload: null };
      }
      return {
        status: 200,
        sessionId: null,
        challenge: null,
        payload: { result: { tools: tools.map((tool) => ({ ...tool, inputSchema: {} })) } },
      };
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    serverId: 'mcp-1',
    organizationId: 'org_1',
    accessToken: 'user-token',
    authorizationRequired: true,
    ...overrides,
  };
}

describe('discovery after the first authorization', () => {
  it('reads the contract a server would only show to a credential', async () => {
    vi.clearAllMocks();
    readMcpServerConnectConfig.mockResolvedValue(SERVER);

    const recorded = await discoverAfterFirstAuthorization(
      {} as never,
      depsRequiringAuthorization([{ name: 'search' }, { name: 'post' }]),
      undefined,
      input()
    );

    expect(recorded).toBe(2);
    expect(saveDiscoverySuccess).toHaveBeenCalledWith(
      {},
      'mcp-1',
      expect.objectContaining({ authorizationRequired: false })
    );
  });

  /**
   * Every later user would re-read the same contract with their own permissions — a request per
   * authorization for an answer already stored, and one that could quietly narrow the tool list to
   * whatever the newest user happens to see.
   */
  it('does not ask again once a contract has arrived', async () => {
    vi.clearAllMocks();
    readMcpServerConnectConfig.mockResolvedValue(SERVER);

    const recorded = await discoverAfterFirstAuthorization(
      {} as never,
      depsRequiringAuthorization([{ name: 'search' }]),
      undefined,
      input({ authorizationRequired: false })
    );

    expect(recorded).toBeNull();
    expect(saveDiscoverySuccess).not.toHaveBeenCalled();
  });

  it('leaves the connection alone when the server is unreachable', async () => {
    vi.clearAllMocks();
    readMcpServerConnectConfig.mockResolvedValue(SERVER);
    const unreachable: McpDiscoveryDeps = {
      resolveHost: async () => ['93.184.216.34'],
      fetchJson: async () => ({}),
      callRpc: async () => {
        throw new Error('connection refused');
      },
    };

    // The user has already authorized and their credential is stored. A server having a bad
    // moment must not turn that into a failed connection.
    await expect(
      discoverAfterFirstAuthorization({} as never, unreachable, undefined, input())
    ).resolves.toBeNull();
    expect(saveDiscoverySuccess).not.toHaveBeenCalled();
  });

  it('swallows a database failure rather than costing the user their authorization', async () => {
    vi.clearAllMocks();
    readMcpServerConnectConfig.mockRejectedValue(new Error('connection pool exhausted'));

    await expect(
      discoverAfterFirstAuthorization(
        {} as never,
        depsRequiringAuthorization([{ name: 'search' }]),
        undefined,
        input()
      )
    ).resolves.toBeNull();
  });

  it('drops the cached catalog so the new contract is visible at once', async () => {
    vi.clearAllMocks();
    readMcpServerConnectConfig.mockResolvedValue(SERVER);
    const cache = { get: vi.fn(), set: vi.fn(), delete: vi.fn(async () => undefined) };

    await discoverAfterFirstAuthorization(
      {} as never,
      depsRequiringAuthorization([{ name: 'search' }]),
      cache as never,
      input()
    );

    expect(cache.delete).toHaveBeenCalledWith('control-plane:tenant-services:org_1');
  });
});

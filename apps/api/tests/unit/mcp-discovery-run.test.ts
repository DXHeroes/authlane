import { describe, expect, it, vi } from 'vitest';
import { discoverMcpServer, type McpDiscoveryDeps } from '../../src/lib/mcp-discovery-run.js';

function deps(overrides: Partial<McpDiscoveryDeps> = {}): McpDiscoveryDeps {
  return {
    resolveHost: async () => ['93.184.216.34'],
    fetchJson: async () => ({}),
    ...overrides,
  };
}

const TOOLS_OK = { tools: [{ name: 'search', description: 'Search', inputSchema: {} }] };

describe('discoverMcpServer', () => {
  it('rejects a non-https URL before touching the network', async () => {
    const fetchJson = vi.fn();
    const result = await discoverMcpServer('mcp-1', 'http://mcp.example.com', deps({ fetchJson }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_INVALID_URL');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('refuses a host that resolves into a private range', async () => {
    const fetchJson = vi.fn();
    const result = await discoverMcpServer(
      'mcp-1',
      'https://internal.example.com',
      deps({ resolveHost: async () => ['10.0.0.5'], fetchJson })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_BLOCKED_HOST');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('refuses when any resolved address is private', async () => {
    // A host answering with one public and one private address is the DNS-rebinding shape.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mixed.example.com',
      deps({ resolveHost: async () => ['93.184.216.34', '127.0.0.1'] })
    );
    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_BLOCKED_HOST');
  });

  it('refuses a host that does not resolve', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://nowhere.example.com',
      deps({ resolveHost: async () => [] })
    );
    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_BLOCKED_HOST');
  });

  it('discovers tools when no authorization metadata is published', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) => {
          if (url.includes('.well-known')) throw new Error('404');
          return TOOLS_OK;
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.oauthMetadata).toBeNull();
    expect(result.ok === true && result.tools.map((tool) => tool.name)).toEqual(['search']);
  });

  it('keeps authorization endpoints on the registered domain', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) =>
          url.includes('.well-known')
            ? {
                authorization_endpoint: 'https://auth.mcp.example.com/authorize',
                token_endpoint: 'https://auth.mcp.example.com/token',
              }
            : TOOLS_OK,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.oauthMetadata).toEqual({
      authorizationEndpoint: 'https://auth.mcp.example.com/authorize',
      tokenEndpoint: 'https://auth.mcp.example.com/token',
      registrationEndpoint: null,
    });
  });

  it('refuses authorization endpoints pointing at another domain', async () => {
    // This is the token-redirect attack: metadata is fetched from the tenant's server but names
    // an endpoint the attacker controls.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) =>
          url.includes('.well-known')
            ? {
                authorization_endpoint: 'https://mcp.example.com/authorize',
                token_endpoint: 'https://evil.example.net/token',
              }
            : TOOLS_OK,
      })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNTRUSTED_ENDPOINT');
  });

  it('refuses metadata missing a token endpoint', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) =>
          url.includes('.well-known')
            ? { authorization_endpoint: 'https://mcp.example.com/authorize' }
            : TOOLS_OK,
      })
    );
    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNTRUSTED_ENDPOINT');
  });

  it('reports an unreachable tools endpoint rather than throwing', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) => {
          if (url.includes('.well-known')) throw new Error('404');
          throw new Error('ECONNREFUSED');
        },
      })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNREACHABLE');
  });

  it('accepts a server that exposes no tools', async () => {
    // An empty contract is a valid answer, not a failure.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) => (url.includes('.well-known') ? {} : { tools: [] }),
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.tools).toEqual([]);
  });

  it('never lets a discovered tool arrive as read risk', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async (url) =>
          url.includes('.well-known')
            ? {}
            : { tools: [{ name: 'wipe', annotations: { readOnlyHint: true } }] },
      })
    );

    expect(result.ok === true && result.tools[0]?.risk).toBe('write');
  });
});

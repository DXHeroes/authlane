import { describe, expect, it, vi } from 'vitest';
import {
  discoverMcpServer,
  type McpDiscoveryDeps,
  type McpRpcResponse,
} from '../../src/lib/mcp-discovery-run.js';

const TOOLS_OK = { tools: [{ name: 'search', description: 'Search', inputSchema: {} }] };

/** A server that answers every JSON-RPC call with the same result. */
function answers(payload: unknown): McpDiscoveryDeps['callRpc'] {
  return async () => ({ status: 200, sessionId: null, challenge: null, payload });
}

function deps(overrides: Partial<McpDiscoveryDeps> = {}): McpDiscoveryDeps {
  return {
    resolveHost: async () => ['93.184.216.34'],
    fetchJson: async () => ({}),
    callRpc: answers(TOOLS_OK),
    ...overrides,
  };
}

/** The refusal an OAuth-protected server answers an uncredentialed call with. */
const UNAUTHORIZED: McpRpcResponse = {
  status: 401,
  sessionId: null,
  challenge:
    'Bearer realm="OAuth", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
  payload: { error: 'invalid_token' },
};

describe('discoverMcpServer', () => {
  it('rejects a non-https URL before touching the network', async () => {
    const callRpc = vi.fn();
    const result = await discoverMcpServer('mcp-1', 'http://mcp.example.com', deps({ callRpc }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_INVALID_URL');
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('refuses a host that resolves into a private range', async () => {
    const callRpc = vi.fn();
    const result = await discoverMcpServer(
      'mcp-1',
      'https://internal.example.com',
      deps({ resolveHost: async () => ['10.0.0.5'], callRpc })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_BLOCKED_HOST');
    expect(callRpc).not.toHaveBeenCalled();
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
        fetchJson: async () => {
          throw new Error('404');
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.oauthMetadata).toBeNull();
    expect(result.ok === true && result.tools.map((tool) => tool.name)).toEqual(['search']);
    expect(result.ok === true && result.authorizationRequired).toBe(false);
  });

  it('keeps authorization endpoints on the registered domain', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async () => ({
          authorization_endpoint: 'https://auth.mcp.example.com/authorize',
          token_endpoint: 'https://auth.mcp.example.com/token',
        }),
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.oauthMetadata).toEqual({
      authorizationEndpoint: 'https://auth.mcp.example.com/authorize',
      tokenEndpoint: 'https://auth.mcp.example.com/token',
      registrationEndpoint: null,
      // Reached without an issuer naming them, so they get the narrower treatment later.
      issuer: null,
      endpointTrust: 'server-host',
    });
  });

  it('refuses authorization endpoints pointing at another domain', async () => {
    // This is the token-redirect attack: metadata is fetched from the tenant's server but names
    // an endpoint the attacker controls.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async () => ({
          authorization_endpoint: 'https://mcp.example.com/authorize',
          token_endpoint: 'https://evil.example.net/token',
        }),
      })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNTRUSTED_ENDPOINT');
  });

  it('refuses metadata missing a token endpoint', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        fetchJson: async () => ({ authorization_endpoint: 'https://mcp.example.com/authorize' }),
      })
    );
    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNTRUSTED_ENDPOINT');
  });

  it('reports an unreachable tools endpoint rather than throwing', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => {
          throw new Error('ECONNREFUSED');
        },
      })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNREACHABLE');
  });

  it('reports a server that answers the handshake with an error status', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => ({ status: 500, sessionId: null, challenge: null, payload: null }),
      })
    );

    expect(result.ok === false && result.code).toBe('MCP_DISCOVERY_UNREACHABLE');
  });

  it('accepts a server that exposes no tools', async () => {
    // An empty contract is a valid answer, not a failure.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({ callRpc: answers({ tools: [] }) })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.tools).toEqual([]);
  });

  it('reads the result out of a JSON-RPC envelope', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({ callRpc: answers({ jsonrpc: '2.0', id: 2, result: TOOLS_OK }) })
    );

    expect(result.ok === true && result.tools.map((tool) => tool.name)).toEqual(['search']);
  });

  it('never lets a discovered tool arrive as read risk', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({ callRpc: answers({ tools: [{ name: 'wipe', annotations: { readOnlyHint: true } }] }) })
    );

    expect(result.ok === true && result.tools[0]?.risk).toBe('write');
  });
});

describe('a server that requires authorization before it will list anything', () => {
  it('registers it as awaiting authorization rather than unreachable', async () => {
    // Every verified server in the catalogue refuses an uncredentialed tools/list. Calling that
    // unreachable is what made Linear impossible to register at all.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => UNAUTHORIZED,
        fetchJson: async (url) => {
          if (url.endsWith('/oauth-protected-resource/mcp')) {
            return { authorization_servers: ['https://mcp.example.com'] };
          }
          return {
            issuer: 'https://mcp.example.com',
            authorization_endpoint: 'https://mcp.example.com/authorize',
            token_endpoint: 'https://mcp.example.com/token',
            registration_endpoint: 'https://mcp.example.com/register',
          };
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.authorizationRequired).toBe(true);
    // Nothing is known about the contract yet, and inventing an empty one would be a lie.
    expect(result.ok === true && result.tools).toEqual([]);
    expect(result.ok === true && result.oauthMetadata?.registrationEndpoint).toBe(
      'https://mcp.example.com/register'
    );
  });

  it('reads the authorization server from the challenge instead of guessing a path', async () => {
    const fetched: string[] = [];
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => ({
          ...UNAUTHORIZED,
          challenge:
            'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
        }),
        fetchJson: async (url) => {
          fetched.push(url);
          if (url.endsWith('/oauth-protected-resource/mcp')) {
            return { authorization_servers: ['https://issuer.mcp.example.com'] };
          }
          return {
            issuer: 'https://issuer.mcp.example.com',
            authorization_endpoint: 'https://issuer.mcp.example.com/authorize',
            token_endpoint: 'https://issuer.mcp.example.com/token',
          };
        },
      })
    );

    expect(result.ok).toBe(true);
    // The guessed path is never fetched when the server says where its document lives.
    expect(fetched).not.toContain('https://mcp.example.com/.well-known/oauth-authorization-server');
    expect(fetched).toContain(
      'https://issuer.mcp.example.com/.well-known/oauth-authorization-server'
    );
  });

  it('falls back to the constructed path when the refusal carries no pointer', async () => {
    const fetched: string[] = [];
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => ({ ...UNAUTHORIZED, challenge: 'Bearer realm="OAuth"' }),
        fetchJson: async (url) => {
          fetched.push(url);
          return {
            authorization_endpoint: 'https://mcp.example.com/authorize',
            token_endpoint: 'https://mcp.example.com/token',
          };
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(fetched).toContain('https://mcp.example.com/.well-known/oauth-authorization-server');
  });
});

describe('the handshake discovery performs before listing tools', () => {
  it('opens a session and carries it into tools/list', async () => {
    // Session-managing servers answer anything but initialize with "No valid session ID provided".
    const calls: Array<{ method: string; sessionId: string | null }> = [];
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async (_url, message, session) => {
          const method = (message as { method: string }).method;
          calls.push({ method, sessionId: session?.sessionId ?? null });
          return {
            status: method === 'initialize' ? 200 : 200,
            sessionId: method === 'initialize' ? 'session-1' : null,
            challenge: null,
            payload: method === 'tools/list' ? TOOLS_OK : {},
          };
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
    ]);
    expect(calls.at(-1)?.sessionId).toBe('session-1');
  });

  it('still lists tools from a server that will not handshake', async () => {
    // Some servers answer tools/list on an open endpoint and reject initialize outright; refusing
    // them for a failed handshake would lose a contract that is right there.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async (_url, message) => {
          const method = (message as { method: string }).method;
          if (method === 'initialize') {
            return { status: 400, sessionId: null, challenge: null, payload: null };
          }
          return { status: 200, sessionId: null, challenge: null, payload: TOOLS_OK };
        },
      })
    );

    expect(result.ok === true && result.tools.map((tool) => tool.name)).toEqual(['search']);
  });
});

describe('an authorization server the resource document declares', () => {
  /** The chain most vendors publish: the pointer is on their MCP host, the issuer is beside it. */
  function siblingIssuer(overrides: { issuer?: string; document?: Record<string, unknown> } = {}) {
    const issuer = overrides.issuer ?? 'https://app.example.com';
    return async (url: string) => {
      if (url.endsWith('/oauth-protected-resource/mcp')) {
        return { authorization_servers: [issuer] };
      }
      return (
        overrides.document ?? {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`,
        }
      );
    };
  }

  it('accepts endpoints beside the MCP host when the server itself named that issuer', async () => {
    // Attio publishes app.attio.com for mcp.attio.com, Vercel vercel.com for mcp.vercel.com. The
    // pointer that names them is served from the MCP host, so the server is declaring its own
    // authorization server rather than a third party redirecting it.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({ callRpc: async () => UNAUTHORIZED, fetchJson: siblingIssuer() })
    );

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.oauthMetadata).toEqual({
      authorizationEndpoint: 'https://app.example.com/authorize',
      tokenEndpoint: 'https://app.example.com/token',
      registrationEndpoint: 'https://app.example.com/register',
      // Recorded so registration and the token exchange can honour the same decision made here,
      // rather than re-imposing "same host as the server" on endpoints this server itself named.
      issuer: 'https://app.example.com',
      endpointTrust: 'issuer-declared',
    });
  });

  it('ignores a pointer that does not live on the registered server', async () => {
    // The whole chain rests on this step: a server free to name any document could name one an
    // attacker wrote, and every check after it would be reading the attacker's answer.
    const fetched: string[] = [];
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => ({
          ...UNAUTHORIZED,
          challenge: 'Bearer resource_metadata="https://evil.example.net/oauth-protected-resource"',
        }),
        fetchJson: async (url) => {
          fetched.push(url);
          return {
            authorization_endpoint: 'https://mcp.example.com/authorize',
            token_endpoint: 'https://mcp.example.com/token',
          };
        },
      })
    );

    expect(fetched).not.toContain('https://evil.example.net/oauth-protected-resource');
    // Falls back to the guessed path, where endpoints must be on the server's own host.
    expect(result.ok === true && result.oauthMetadata?.tokenEndpoint).toBe(
      'https://mcp.example.com/token'
    );
  });

  it('refuses a metadata document that names an issuer it was not fetched from', async () => {
    // RFC 8414 requires the document to name the issuer it was requested for. Without that check
    // the issuer identifier is decoration and the document binds to nothing.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => UNAUTHORIZED,
        fetchJson: siblingIssuer({
          document: {
            issuer: 'https://somewhere.example.org',
            authorization_endpoint: 'https://app.example.com/authorize',
            token_endpoint: 'https://app.example.com/token',
          },
        }),
      })
    );

    expect(result).toMatchObject({ ok: false, code: 'MCP_DISCOVERY_UNTRUSTED_ENDPOINT' });
  });

  it('inserts the well-known segment before an issuer path', async () => {
    // RFC 8414 puts the segment before the issuer's path; Atlassian and Stripe are only reachable
    // that way. Appending it is tried second because some servers do publish it there.
    const fetched: string[] = [];
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => UNAUTHORIZED,
        fetchJson: async (url) => {
          fetched.push(url);
          if (url.endsWith('/oauth-protected-resource/mcp')) {
            return { authorization_servers: ['https://access.example.com/mcp'] };
          }
          if (url === 'https://access.example.com/.well-known/oauth-authorization-server/mcp') {
            return {
              issuer: 'https://access.example.com/mcp',
              authorization_endpoint: 'https://access.example.com/authorize',
              token_endpoint: 'https://access.example.com/token',
            };
          }
          throw new Error('404');
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(fetched).toContain(
      'https://access.example.com/.well-known/oauth-authorization-server/mcp'
    );
  });

  it('refuses an endpoint the declared issuer publishes over plain http', async () => {
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: async () => UNAUTHORIZED,
        fetchJson: siblingIssuer({
          document: {
            issuer: 'https://app.example.com',
            authorization_endpoint: 'http://app.example.com/authorize',
            token_endpoint: 'https://app.example.com/token',
          },
        }),
      })
    );

    expect(result).toMatchObject({ ok: false, code: 'MCP_DISCOVERY_UNTRUSTED_ENDPOINT' });
  });
});

describe('without a declared issuer the endpoint rule stays a suffix check', () => {
  it('rejects an authorization server on a sibling subdomain', async () => {
    // A server that publishes no RFC 9728 pointer has declared nothing, so the only thing left to
    // trust is the host the tenant registered.
    const result = await discoverMcpServer(
      'mcp-1',
      'https://mcp.example.com',
      deps({
        callRpc: answers({ tools: [] }),
        fetchJson: async () => ({
          authorization_endpoint: 'https://app.example.com/authorize',
          token_endpoint: 'https://app.example.com/token',
        }),
      })
    );

    expect(result).toMatchObject({ ok: false, code: 'MCP_DISCOVERY_UNTRUSTED_ENDPOINT' });
  });
});

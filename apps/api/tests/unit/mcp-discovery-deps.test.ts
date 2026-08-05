import { describe, expect, it, vi } from 'vitest';
import { createMcpDiscoveryDeps } from '../../src/lib/mcp-discovery-deps.js';

const TOOLS_MESSAGE = {
  jsonrpc: '2.0',
  id: 1,
  result: { tools: [{ name: 'search', inputSchema: {} }] },
};

function headersOf(call: [string, RequestInit]): Record<string, string> {
  return (call[1].headers ?? {}) as Record<string, string>;
}

describe('the Streamable HTTP transport discovery speaks', () => {
  it('asks for both a JSON body and an event stream', async () => {
    // Servers on the reference transport answer 406 to a client that accepts only JSON, so a
    // request missing text/event-stream never reaches tools/list at all.
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(TOOLS_MESSAGE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    await createMcpDiscoveryDeps({ fetchImpl }).callRpc('https://mcp.example.com/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    const accept = headersOf(fetchImpl.mock.calls[0] as never).accept;
    expect(accept).toContain('application/json');
    expect(accept).toContain('text/event-stream');
  });

  it('reads the JSON-RPC message out of an event stream', async () => {
    // A 200 arrives framed as SSE far more often than as bare JSON.
    const body = `event: message\ndata: ${JSON.stringify(TOOLS_MESSAGE)}\n\n`;
    const fetchImpl = vi.fn(
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    );

    const response = await createMcpDiscoveryDeps({ fetchImpl }).callRpc(
      'https://mcp.example.com/mcp',
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual(TOOLS_MESSAGE);
  });

  it('reports a refusal and its challenge instead of throwing', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'www-authenticate':
              'Bearer realm="OAuth", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
          },
        })
    );

    const response = await createMcpDiscoveryDeps({ fetchImpl }).callRpc(
      'https://mcp.example.com/mcp',
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    );

    expect(response.status).toBe(401);
    expect(response.challenge).toContain('resource_metadata=');
  });

  it('carries the session the server assigned into the next request', async () => {
    // Session-managing servers answer anything but initialize with "No valid session ID provided".
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(TOOLS_MESSAGE), {
          status: 200,
          headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' },
        })
    );
    const deps = createMcpDiscoveryDeps({ fetchImpl });

    const opened = await deps.callRpc('https://mcp.example.com/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    expect(opened.sessionId).toBe('session-1');

    await deps.callRpc(
      'https://mcp.example.com/mcp',
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { sessionId: opened.sessionId }
    );

    expect(headersOf(fetchImpl.mock.calls[1] as never)['mcp-session-id']).toBe('session-1');
  });

  it('answers with no payload when the server acknowledges a notification', async () => {
    // notifications/initialized is answered with 202 and an empty body.
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));

    const response = await createMcpDiscoveryDeps({ fetchImpl }).callRpc(
      'https://mcp.example.com/mcp',
      { jsonrpc: '2.0', method: 'notifications/initialized' }
    );

    expect(response.status).toBe(202);
    expect(response.payload).toBeNull();
  });

  it('refuses to follow a redirect onto another host', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));

    await createMcpDiscoveryDeps({ fetchImpl }).callRpc('https://mcp.example.com/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', redirect: 'error' });
  });
});

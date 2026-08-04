import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureMcpOAuthClient,
  mcpCallbackUrl,
  registerMcpOAuthClient,
} from '../../src/lib/mcp-client-registration.js';
import { createMcpDiscoveryDeps } from '../../src/lib/mcp-discovery-deps.js';
import type { McpDiscoveryDeps } from '../../src/lib/mcp-discovery-run.js';

/**
 * Coverage is split on purpose.
 *
 * The transport is exercised against a real HTTP server, because the questions that matter about it
 * cannot be answered by a stub inspecting its own arguments: is the body really sent as JSON, is a
 * 201 accepted rather than only a 200, does a 4xx surface as a failure. Those are properties of
 * `fetch` and of the server, not of our code.
 *
 * The registration logic is then driven through an injected `deps`, because
 * `isSameRegistrableDomain` requires https and a locally generated certificate would make the suite
 * depend on openssl being installed. What that leaves uncovered is only the wiring between two
 * halves that are each fully covered.
 */
let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

interface RecordedRequest {
  method: string;
  contentType: string | undefined;
  body: unknown;
}

async function startServer(
  respond: () => { status: number; body: unknown }
): Promise<{ url: string; requests: RecordedRequest[] }> {
  const requests: RecordedRequest[] = [];
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk as Buffer));
    request.on('end', () => {
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        body = null;
      }
      requests.push({
        method: request.method ?? '',
        contentType: request.headers['content-type'],
        body,
      });
      const reply = respond();
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });

  const listening = server;
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
  const { port } = listening.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/register`, requests };
}

/** Injected transport that records what the registration asked for. */
function recordingDeps(reply: unknown | (() => never)): McpDiscoveryDeps & {
  calls: Array<{ url: string; body: unknown }>;
} {
  const calls: Array<{ url: string; body: unknown }> = [];
  return {
    calls,
    resolveHost: async () => ['93.184.216.34'],
    fetchJson: async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      if (typeof reply === 'function') return (reply as () => never)();
      return reply;
    },
  };
}

function fakeStore() {
  const stored: string[] = [];
  return {
    stored,
    put: async ({ plaintext }: { plaintext: Buffer }) => {
      stored.push(plaintext.toString('utf8'));
      return 'secret-1';
    },
    read: async () => Buffer.alloc(0),
    rewrap: async () => undefined,
  } as unknown as Parameters<typeof ensureMcpOAuthClient>[1] & { stored: string[] };
}

function fakeDb() {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
  } as unknown as Parameters<typeof ensureMcpOAuthClient>[0] & {
    updates: Array<Record<string, unknown>>;
  };
}

describe('the transport discovery registers over', () => {
  it('POSTs JSON and accepts a 201', async () => {
    const target = await startServer(() => ({ status: 201, body: { client_id: 'abc123' } }));

    const payload = await createMcpDiscoveryDeps().fetchJson(target.url, {
      method: 'POST',
      body: JSON.stringify({ client_name: 'Authlane' }),
    });

    expect(payload).toEqual({ client_id: 'abc123' });
    expect(target.requests[0]?.method).toBe('POST');
    expect(target.requests[0]?.contentType).toContain('application/json');
    expect(target.requests[0]?.body).toEqual({ client_name: 'Authlane' });
  });

  it('turns a refusal into a throw the caller can report', async () => {
    const target = await startServer(() => ({
      status: 400,
      body: { error: 'invalid_redirect_uri' },
    }));

    await expect(
      createMcpDiscoveryDeps().fetchJson(target.url, { method: 'POST', body: '{}' })
    ).rejects.toThrow(/400/);
  });
});

describe('dynamic client registration', () => {
  it('asks for exactly what RFC 7591 needs, at the callback the authorize step will use', async () => {
    const deps = recordingDeps({ client_id: 'abc123', client_secret: 'shhh' });

    const result = await registerMcpOAuthClient('mcp-1', 'https://mcp.example.com/register', {
      host: 'mcp.example.com',
      apiBaseUrl: 'https://app.authlane.io',
      deps,
    });

    expect(result).toEqual({ ok: true, client: { clientId: 'abc123', clientSecret: 'shhh' } });
    expect(deps.calls[0]?.body).toMatchObject({
      client_name: 'Authlane',
      // A mismatch here registers cleanly and then fails at authorize time.
      redirect_uris: ['https://app.authlane.io/api/v1/oauth/mcp-1/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  it('accepts a public client that answers without a secret', async () => {
    const result = await registerMcpOAuthClient('mcp-1', 'https://mcp.example.com/register', {
      host: 'mcp.example.com',
      apiBaseUrl: 'https://app.authlane.io',
      deps: recordingDeps({ client_id: 'public-client' }),
    });

    expect(result).toEqual({ ok: true, client: { clientId: 'public-client', clientSecret: null } });
  });

  it('treats a response with no client_id as a failure', async () => {
    const result = await registerMcpOAuthClient('mcp-1', 'https://mcp.example.com/register', {
      host: 'mcp.example.com',
      apiBaseUrl: 'https://app.authlane.io',
      deps: recordingDeps({ note: 'nope' }),
    });

    expect(result).toEqual({ ok: false, message: 'Client registration returned no client_id' });
  });

  it('sends nothing when the endpoint is outside the registered domain', async () => {
    const deps = recordingDeps({ client_id: 'x' });

    const result = await registerMcpOAuthClient('mcp-1', 'https://evil.example.net/register', {
      host: 'mcp.example.com',
      apiBaseUrl: 'https://app.authlane.io',
      deps,
    });

    expect(result.ok).toBe(false);
    // The check has to precede the request, not judge the answer.
    expect(deps.calls).toEqual([]);
  });

  it('sends nothing to a plaintext endpoint', async () => {
    const deps = recordingDeps({ client_id: 'x' });

    const result = await registerMcpOAuthClient('mcp-1', 'http://mcp.example.com/register', {
      host: 'mcp.example.com',
      apiBaseUrl: 'https://app.authlane.io',
      deps,
    });

    expect(result.ok).toBe(false);
    expect(deps.calls).toEqual([]);
  });
});

describe('registering once and only once', () => {
  it('stores the client id and seals the secret', async () => {
    const db = fakeDb();
    const store = fakeStore();

    const outcome = await ensureMcpOAuthClient(db, store, {
      serverId: 'mcp-1',
      organizationId: 'org-1',
      host: 'mcp.example.com',
      authType: 'oauth2',
      registrationEndpoint: 'https://mcp.example.com/register',
      existingClientId: null,
      apiBaseUrl: 'https://app.authlane.io',
      deps: recordingDeps({ client_id: 'abc123', client_secret: 'shhh' }),
    });

    expect(outcome.registered).toBe(true);
    expect(store.stored).toEqual(['shhh']);
    expect(db.updates[0]).toMatchObject({
      oauthClientId: 'abc123',
      oauthClientSecretId: 'secret-1',
    });
  });

  it('does not register again for a server that already has a client', async () => {
    const deps = recordingDeps({ client_id: 'second' });

    const outcome = await ensureMcpOAuthClient(fakeDb(), fakeStore(), {
      serverId: 'mcp-1',
      organizationId: 'org-1',
      host: 'mcp.example.com',
      authType: 'oauth2',
      registrationEndpoint: 'https://mcp.example.com/register',
      existingClientId: 'already-registered',
      apiBaseUrl: 'https://app.authlane.io',
      deps,
    });

    expect(outcome.registered).toBe(false);
    // Otherwise every refresh abandons a client in the provider's account.
    expect(deps.calls).toEqual([]);
  });

  it('skips an api_key server entirely', async () => {
    const deps = recordingDeps({ client_id: 'x' });

    const outcome = await ensureMcpOAuthClient(fakeDb(), fakeStore(), {
      serverId: 'mcp-1',
      organizationId: 'org-1',
      host: 'mcp.example.com',
      authType: 'api_key',
      registrationEndpoint: 'https://mcp.example.com/register',
      existingClientId: null,
      apiBaseUrl: 'https://app.authlane.io',
      deps,
    });

    expect(outcome.registered).toBe(false);
    expect(deps.calls).toEqual([]);
  });

  it('keeps the discovered tools when registration is refused', async () => {
    const db = fakeDb();

    const outcome = await ensureMcpOAuthClient(db, fakeStore(), {
      serverId: 'mcp-1',
      organizationId: 'org-1',
      host: 'mcp.example.com',
      authType: 'oauth2',
      registrationEndpoint: 'https://mcp.example.com/register',
      existingClientId: null,
      apiBaseUrl: 'https://app.authlane.io',
      deps: recordingDeps(() => {
        throw new Error('403 from provider');
      }),
    });

    expect(outcome.registered).toBe(false);
    expect(outcome.message).toMatch(/403/);
    // Nothing written, and crucially no throw: the server keeps its tool list.
    expect(db.updates).toEqual([]);
  });

  it('refuses to guess a redirect URI when no base URL is configured', async () => {
    const deps = recordingDeps({ client_id: 'x' });

    const outcome = await ensureMcpOAuthClient(fakeDb(), fakeStore(), {
      serverId: 'mcp-1',
      organizationId: 'org-1',
      host: 'mcp.example.com',
      authType: 'oauth2',
      registrationEndpoint: 'https://mcp.example.com/register',
      existingClientId: null,
      apiBaseUrl: null,
      deps,
    });

    expect(outcome.registered).toBe(false);
    expect(deps.calls).toEqual([]);
  });
});

describe('callback URL', () => {
  it('matches the path the authorize step builds', () => {
    expect(mcpCallbackUrl('https://app.authlane.io', 'mcp-abc')).toBe(
      'https://app.authlane.io/api/v1/oauth/mcp-abc/callback'
    );
  });
});

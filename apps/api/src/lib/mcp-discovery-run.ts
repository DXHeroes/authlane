import {
  type DiscoveredTool,
  isPrivateAddress,
  isSameHostOrSubdomain,
  type McpEndpointTrust,
  normalizeDiscoveredTools,
  parseServerUrl,
} from '@authlane/shared';

/**
 * One discovery run against a tenant's MCP server.
 *
 * Network access is injected so the rules can be tested without a socket, and so the host check
 * runs against the addresses this process would actually dial.
 */
export interface McpDiscoveryDeps {
  /** Resolves a hostname to every address it answers with. */
  resolveHost: (host: string) => Promise<string[]>;
  /** Reads a plain JSON document, throwing on any non-2xx. Used for the metadata documents. */
  fetchJson: (url: string, init?: { method?: string; body?: string }) => Promise<unknown>;
  /**
   * Sends one JSON-RPC message over the Streamable HTTP transport.
   *
   * Unlike `fetchJson` this does not throw on a non-2xx: a server that requires authorization
   * refuses with 401 and names its metadata document in the same response, and that refusal is the
   * most useful thing discovery learns about it.
   */
  callRpc: (
    url: string,
    message: unknown,
    session?: { sessionId: string | null; accessToken?: string | null }
  ) => Promise<McpRpcResponse>;
}

/** What a server answered one JSON-RPC message with. */
export interface McpRpcResponse {
  status: number;
  /** The session the server assigned, when it manages sessions. */
  sessionId: string | null;
  /** The `WWW-Authenticate` challenge, when the server sent one. */
  challenge: string | null;
  /** The JSON-RPC message it answered with, or null when it sent no body. */
  payload: unknown;
}

/** The protocol revision discovery speaks. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

export interface McpOAuthMetadata {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  /** The issuer that declared these endpoints, or null when they came from the guessed path. */
  issuer: string | null;
  /**
   * How these endpoints were established.
   *
   * Stored beside them because every later step — registering a client, redirecting a user,
   * exchanging a code — has to make the same judgement discovery made, and by then the evidence
   * (a challenge header, a document fetched once) is gone. Re-deriving it there is what produced
   * the split where an endpoint good enough to store was not good enough to use.
   */
  endpointTrust: McpEndpointTrust;
}

export type McpDiscoveryFailureCode =
  | 'MCP_DISCOVERY_INVALID_URL'
  | 'MCP_DISCOVERY_BLOCKED_HOST'
  | 'MCP_DISCOVERY_UNTRUSTED_ENDPOINT'
  | 'MCP_DISCOVERY_UNREACHABLE';

export type McpDiscoveryResult =
  | {
      ok: true;
      serverUrl: string;
      oauthMetadata: McpOAuthMetadata | null;
      tools: DiscoveredTool[];
      /**
       * The server refused to list anything without a credential.
       *
       * Not a failure: it is the correct behaviour of every OAuth-protected server, and the tool
       * list arrives once a user has authorized. Carried so the tenant is told that rather than
       * shown an empty contract.
       */
      authorizationRequired: boolean;
    }
  | { ok: false; code: McpDiscoveryFailureCode; message: string };

function failure(code: McpDiscoveryFailureCode, message: string): McpDiscoveryResult {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

/**
 * Reads RFC 8414 metadata, accepting an endpoint only where `isTrusted` says so.
 *
 * What counts as trusted depends on how the document was found, and the two cases are genuinely
 * different. A document fetched from a path guessed on the server's own host has declared nothing,
 * so its endpoints must stay on that host. One fetched from an issuer the server itself named is
 * that issuer speaking about itself, and an authorization server may legitimately publish its
 * authorize page and its token endpoint on different hosts — Dropbox uses www.dropbox.com and
 * api.dropboxapi.com — so there https is the only structural requirement left.
 */
function readOAuthMetadata(
  payload: unknown,
  source: {
    isTrusted: (endpoint: string) => boolean;
    issuer: string | null;
    trust: McpEndpointTrust;
  }
): McpOAuthMetadata | 'untrusted' | null {
  if (!isRecord(payload)) return null;
  const authorization = payload.authorization_endpoint;
  const token = payload.token_endpoint;
  if (typeof authorization !== 'string' && typeof token !== 'string') return null;

  if (typeof authorization !== 'string' || typeof token !== 'string') return 'untrusted';
  if (!source.isTrusted(authorization)) return 'untrusted';
  if (!source.isTrusted(token)) return 'untrusted';

  const registration = payload.registration_endpoint;
  if (typeof registration === 'string' && !source.isTrusted(registration)) return 'untrusted';

  return {
    authorizationEndpoint: authorization,
    tokenEndpoint: token,
    registrationEndpoint: typeof registration === 'string' ? registration : null,
    issuer: source.issuer,
    endpointTrust: source.trust,
  };
}

/**
 * Finds a server's authorization server metadata and reads it.
 *
 * Two routes, tried in that order. The first is the chain the specifications describe: the refusal
 * names a protected-resource document (RFC 9728), that document names an issuer, and the issuer's
 * own metadata (RFC 8414) says where to authorize. It is what makes the vendors who run their
 * authorization server beside their MCP host usable at all. The second is a guess at
 * `${url}/.well-known/oauth-authorization-server`, kept because plenty of servers publish nothing
 * else and it costs one request.
 */
async function readAuthorizationMetadata(
  server: { host: string; url: string },
  challenge: string | null,
  deps: McpDiscoveryDeps
): Promise<McpOAuthMetadata | 'untrusted' | null> {
  const issuer = await resolveDeclaredIssuer(server.host, challenge, deps);
  if (issuer) {
    const document = await readIssuerMetadata(issuer, deps);
    if (document !== null) {
      // RFC 8414 requires the document to name the issuer it was fetched for. Without this the
      // issuer identifier binds to nothing and the chain above it proves nothing either.
      const declared = isRecord(document) ? document.issuer : undefined;
      if (typeof declared !== 'string' || withoutTrailingSlash(declared) !== issuer) {
        return 'untrusted';
      }
      return readOAuthMetadata(document, {
        isTrusted: isHttpsUrl,
        issuer,
        trust: 'issuer-declared',
      });
    }
  }

  const guessed = await deps.fetchJson(`${server.url}/.well-known/oauth-authorization-server`);
  return readOAuthMetadata(guessed, {
    isTrusted: (endpoint) => isSameHostOrSubdomain(server.host, endpoint),
    // Nothing declared this document; it was found by constructing a path. There is no issuer to
    // record, and its endpoints never earn more than the host they were found on.
    issuer: null,
    trust: 'server-host',
  });
}

/**
 * The issuer a server declares for itself through RFC 9728.
 *
 * The pointer has to live on the registered server's own host. Everything downstream is trusted
 * because the server said it, so a server free to name any document could name one an attacker
 * wrote and every later check would be reading the attacker's answer.
 */
async function resolveDeclaredIssuer(
  serverHost: string,
  challenge: string | null,
  deps: McpDiscoveryDeps
): Promise<string | null> {
  const resourceMetadata = challenge?.match(/resource_metadata="?([^",\s]+)"?/)?.[1];
  if (!resourceMetadata) return null;
  if (!isSameHostOrSubdomain(serverHost, resourceMetadata)) return null;

  let resource: unknown;
  try {
    resource = await deps.fetchJson(resourceMetadata);
  } catch {
    return null;
  }
  if (!isRecord(resource) || !Array.isArray(resource.authorization_servers)) return null;

  const [issuer] = resource.authorization_servers;
  if (typeof issuer !== 'string' || !isHttpsUrl(issuer)) return null;
  return withoutTrailingSlash(issuer);
}

/**
 * Reads an issuer's RFC 8414 document, or null when it publishes none.
 *
 * For an issuer carrying a path the specification inserts the well-known segment before it, which
 * is the only way Atlassian and Stripe answer. Appending it is tried second because some servers
 * publish it there instead; for a path-less issuer the two are the same URL and only one is tried.
 */
async function readIssuerMetadata(issuer: string, deps: McpDiscoveryDeps): Promise<unknown | null> {
  const parsed = new URL(issuer);
  const path = withoutTrailingSlash(parsed.pathname);
  const candidates = path
    ? [
        `${parsed.origin}/.well-known/oauth-authorization-server${path}`,
        `${parsed.origin}${path}/.well-known/oauth-authorization-server`,
      ]
    : [`${parsed.origin}/.well-known/oauth-authorization-server`];

  for (const candidate of candidates) {
    try {
      return await deps.fetchJson(candidate);
    } catch {
      // Try the next shape; the caller falls back to the guessed path if none answer.
    }
  }
  return null;
}

type ToolContract =
  | { state: 'tools'; payload: unknown; challenge: string | null }
  | { state: 'unauthorized'; challenge: string | null }
  | { state: 'unreachable' };

/**
 * Runs the MCP handshake and asks for the tool list.
 *
 * The handshake is not ceremony: a server that manages sessions answers everything but `initialize`
 * with "no valid session ID provided", so skipping it makes a healthy server look broken. A server
 * that refuses the handshake outright is still asked for its tools, because some answer `tools/list`
 * on an open endpoint and losing that contract would be worse than one wasted request.
 */
async function readToolContract(
  url: string,
  deps: McpDiscoveryDeps,
  accessToken: string | null = null
): Promise<ToolContract> {
  let sessionId: string | null = null;

  try {
    const opened = await deps.callRpc(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'authlane-discovery', version: '1.0' },
        },
      },
      { sessionId: null, accessToken }
    );

    if (opened.status === 401) return { state: 'unauthorized', challenge: opened.challenge };
    if (isSuccess(opened.status)) {
      sessionId = opened.sessionId;
      // Completes the handshake. A server that ignores the notification is none the worse for it,
      // so its outcome is not worth acting on.
      await deps
        .callRpc(
          url,
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { sessionId, accessToken }
        )
        .catch(() => undefined);
    }
  } catch {
    // The tools request below decides whether the server is reachable at all.
  }

  try {
    const listed = await deps.callRpc(
      url,
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { sessionId, accessToken }
    );
    if (listed.status === 401) return { state: 'unauthorized', challenge: listed.challenge };
    if (!isSuccess(listed.status)) return { state: 'unreachable' };
    return { state: 'tools', payload: listed.payload, challenge: listed.challenge };
  } catch {
    return { state: 'unreachable' };
  }
}

export async function discoverMcpServer(
  serverId: string,
  serverUrl: string,
  deps: McpDiscoveryDeps,
  /**
   * A user's access token, when one exists.
   *
   * Discovery asks without a credential by default, and deliberately: a server's refusal is what
   * names its authorization metadata, and that is how a server gets registered at all. But an
   * OAuth-protected server lists its tools to nobody else, so until a token is offered the
   * contract stays empty and `authorization_required` stays true forever.
   */
  options: { accessToken?: string | null } = {}
): Promise<McpDiscoveryResult> {
  const parsed = parseServerUrl(serverUrl);
  if (!parsed) {
    return failure(
      'MCP_DISCOVERY_INVALID_URL',
      'The server URL must be https and carry no credentials'
    );
  }

  // Resolved before any request, and again before each later refresh, so a host cannot answer
  // publicly at registration and privately afterwards.
  let addresses: string[];
  try {
    addresses = await deps.resolveHost(parsed.host);
  } catch {
    return failure('MCP_DISCOVERY_BLOCKED_HOST', 'The server hostname could not be resolved');
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return failure(
      'MCP_DISCOVERY_BLOCKED_HOST',
      'The server hostname does not resolve to a public address'
    );
  }

  const contract = await readToolContract(parsed.url, deps, options.accessToken ?? null);
  if (contract.state === 'unreachable') {
    return failure('MCP_DISCOVERY_UNREACHABLE', 'The server did not answer a tools/list request');
  }

  // Absent metadata is normal: a server may authenticate with an API key instead.
  let oauthMetadata: McpOAuthMetadata | null = null;
  try {
    const parsedMetadata = await readAuthorizationMetadata(parsed, contract.challenge, deps);
    if (parsedMetadata === 'untrusted') {
      return failure(
        'MCP_DISCOVERY_UNTRUSTED_ENDPOINT',
        'The published authorization endpoints are incomplete or point outside the server domain'
      );
    }
    oauthMetadata = parsedMetadata;
  } catch {
    oauthMetadata = null;
  }

  if (contract.state === 'unauthorized') {
    return {
      ok: true,
      serverUrl: parsed.url,
      oauthMetadata,
      // No contract is known yet, and inventing an empty one would read as "this server has no
      // tools" rather than "nobody has authorized it".
      tools: [],
      authorizationRequired: true,
    };
  }

  // Servers answer either with the JSON-RPC envelope or the bare result.
  const result =
    isRecord(contract.payload) && isRecord(contract.payload.result)
      ? contract.payload.result
      : contract.payload;

  return {
    ok: true,
    serverUrl: parsed.url,
    oauthMetadata,
    tools: normalizeDiscoveredTools(serverId, result),
    authorizationRequired: false,
  };
}

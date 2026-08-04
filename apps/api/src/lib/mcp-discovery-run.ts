import {
  type DiscoveredTool,
  isPrivateAddress,
  isSameRegistrableDomain,
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
  fetchJson: (url: string, init?: { method?: string; body?: string }) => Promise<unknown>;
  /**
   * Reads a header from a request that is expected to fail, without throwing.
   *
   * Needed for RFC 9728: the pointer to a server's metadata arrives in the `WWW-Authenticate` header
   * of an unauthorized `tools/list`, and `fetchJson` throws on any non-2xx by design. Optional so an
   * older set of deps still works, falling back to the constructed path.
   */
  readHeader?: (
    url: string,
    header: string,
    init?: { method?: string; body?: string }
  ) => Promise<string | null>;
}

export interface McpOAuthMetadata {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
}

export type McpDiscoveryFailureCode =
  | 'MCP_DISCOVERY_INVALID_URL'
  | 'MCP_DISCOVERY_BLOCKED_HOST'
  | 'MCP_DISCOVERY_UNTRUSTED_ENDPOINT'
  | 'MCP_DISCOVERY_UNREACHABLE';

export type McpDiscoveryResult =
  | { ok: true; serverUrl: string; oauthMetadata: McpOAuthMetadata | null; tools: DiscoveredTool[] }
  | { ok: false; code: McpDiscoveryFailureCode; message: string };

function failure(code: McpDiscoveryFailureCode, message: string): McpDiscoveryResult {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads RFC 8414 metadata. Every endpoint must be https and on the registered server's domain:
 * the metadata document is fetched from the tenant's server, but nothing stops a compromised one
 * from naming a token endpoint an attacker controls.
 */
function readOAuthMetadata(host: string, payload: unknown): McpOAuthMetadata | 'untrusted' | null {
  if (!isRecord(payload)) return null;
  const authorization = payload.authorization_endpoint;
  const token = payload.token_endpoint;
  if (typeof authorization !== 'string' && typeof token !== 'string') return null;

  if (typeof authorization !== 'string' || typeof token !== 'string') return 'untrusted';
  if (!isSameRegistrableDomain(host, authorization)) return 'untrusted';
  if (!isSameRegistrableDomain(host, token)) return 'untrusted';

  const registration = payload.registration_endpoint;
  if (typeof registration === 'string' && !isSameRegistrableDomain(host, registration)) {
    return 'untrusted';
  }

  return {
    authorizationEndpoint: authorization,
    tokenEndpoint: token,
    registrationEndpoint: typeof registration === 'string' ? registration : null,
  };
}

/**
 * Fetches a server's RFC 8414 metadata, preferring the pointer it publishes over a guessed path.
 *
 * `${url}/.well-known/oauth-authorization-server` happens to work for most servers, but not all:
 * some keep the document at a path-specific location, and some publish it on a separate
 * authorization server. Following the `resource_metadata` pointer from an unauthorized `tools/list`
 * is what the specification asks for; the constructed path stays as a fallback because it works
 * today and a regression there would be worse than a missing entry.
 */
async function readMetadataDocument(url: string, deps: McpDiscoveryDeps): Promise<unknown> {
  const pointer = await resolveMetadataPointer(url, deps);
  if (pointer) {
    try {
      return await deps.fetchJson(pointer);
    } catch {
      // Fall through: a published pointer that does not answer is no worse than none.
    }
  }
  return deps.fetchJson(`${url}/.well-known/oauth-authorization-server`);
}

/** The authorization server metadata URL a server points at, if it publishes one. */
async function resolveMetadataPointer(
  url: string,
  deps: McpDiscoveryDeps
): Promise<string | null> {
  if (!deps.readHeader) return null;

  let challenge: string | null;
  try {
    challenge = await deps.readHeader(url, 'www-authenticate', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
  } catch {
    return null;
  }
  const resourceMetadata = challenge?.match(/resource_metadata="?([^",\s]+)"?/)?.[1];
  if (!resourceMetadata) return null;

  let resource: unknown;
  try {
    resource = await deps.fetchJson(resourceMetadata);
  } catch {
    return null;
  }
  if (!isRecord(resource) || !Array.isArray(resource.authorization_servers)) return null;

  const [issuer] = resource.authorization_servers;
  if (typeof issuer !== 'string' || !issuer.startsWith('https://')) return null;
  return `${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
}

export async function discoverMcpServer(
  serverId: string,
  serverUrl: string,
  deps: McpDiscoveryDeps
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

  // Absent metadata is normal: a server may authenticate with an API key instead.
  let oauthMetadata: McpOAuthMetadata | null = null;
  try {
    const payload = await readMetadataDocument(parsed.url, deps);
    const parsedMetadata = readOAuthMetadata(parsed.host, payload);
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

  let toolsPayload: unknown;
  try {
    toolsPayload = await deps.fetchJson(parsed.url, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
  } catch {
    return failure('MCP_DISCOVERY_UNREACHABLE', 'The server did not answer a tools/list request');
  }

  // Servers answer either with the JSON-RPC envelope or the bare result.
  const result =
    isRecord(toolsPayload) && isRecord(toolsPayload.result) ? toolsPayload.result : toolsPayload;

  return {
    ok: true,
    serverUrl: parsed.url,
    oauthMetadata,
    tools: normalizeDiscoveredTools(serverId, result),
  };
}

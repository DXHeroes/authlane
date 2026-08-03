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

export async function discoverMcpServer(
  serverId: string,
  serverUrl: string,
  deps: McpDiscoveryDeps
): Promise<McpDiscoveryResult> {
  const parsed = parseServerUrl(serverUrl);
  if (!parsed) {
    return failure('MCP_DISCOVERY_INVALID_URL', 'The server URL must be https and carry no credentials');
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
    const payload = await deps.fetchJson(
      `${parsed.url}/.well-known/oauth-authorization-server`
    );
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

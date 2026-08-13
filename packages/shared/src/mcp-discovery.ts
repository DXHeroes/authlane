/**
 * Discovery for tenant-registered MCP servers.
 *
 * These are pure functions. Anything that touches the network lives in the API, so the rules that
 * decide what Authlane is willing to talk to, and what it is willing to believe, stay testable
 * without a socket.
 */

import type { IntegrationTools } from './integration-loader.js';

/** Risk assigned to every tool discovered from a third-party server. */
export type DiscoveredToolRisk = 'read' | 'write' | 'destructive';

export interface DiscoveredTool {
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** What the server claims about itself. Recorded for the tenant to read, never acted on. */
  declaredAnnotations: Record<string, unknown> | null;
  risk: DiscoveredToolRisk;
}

const MAX_TOOL_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Accepts the single URL a tenant supplies. Only https, and never with credentials embedded:
 * those would be written to `server_url` and repeated in logs.
 */
export function parseServerUrl(value: string): { url: string; host: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;
  return { url: parsed.toString().replace(/\/$/, ''), host: parsed.hostname };
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.');
  if (octets.length !== 4) return false;
  const parts = octets.map((octet) => Number(octet));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 127) return true; // unspecified, loopback
  if (a === 10) return true; // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  return false;
}

/**
 * True when an address must never be dialled. Checked against the resolved address immediately
 * before each request, not only at registration, which is what closes the DNS-rebinding window.
 */
export function isPrivateAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (!value) return true;

  if (value.includes('.') && !value.includes(':')) return isPrivateIPv4(value);

  // IPv4-mapped and IPv4-compatible IPv6 reach the same interfaces as the bare IPv4 address.
  const mapped = value.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);

  if (value === '::' || value === '::1') return true; // unspecified, loopback
  if (value.startsWith('fe80:')) return true; // link-local
  // Unique-local: fc00::/7 covers the fc and fd prefixes.
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;
  return false;
}

/**
 * True when an https endpoint sits on `serverHost` itself or on a subdomain of it.
 *
 * Not an eTLD+1 comparison, despite what the previous name (`isSameRegistrableDomain`) claimed.
 * There is no public suffix list here: the test is a literal suffix on a dot boundary, so
 * `notexample.com` cannot pass as a subdomain of `example.com`, and it is one-directional —
 * registering `mcp.example.com` authorises nothing at `example.com`. The old name described a
 * rule this function has never implemented, and reading it as eTLD+1 is how the same check came to
 * be applied at four call sites that needed three different things.
 */
export function isSameHostOrSubdomain(serverHost: string, endpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  const registered = serverHost.toLowerCase();
  return host === registered || host.endsWith(`.${registered}`);
}

/**
 * How a tenant server's stored OAuth endpoints were established.
 *
 * This is the whole of the trust model, and it is recorded rather than re-derived because the
 * evidence — a `WWW-Authenticate` challenge, a document fetched once — is gone by the time
 * registration or a token exchange needs to judge the endpoint.
 *
 * `issuer-declared`
 *   The chain RFC 9728 and RFC 8414 describe was walked in full: the server's own refusal named a
 *   protected-resource document **on the server's host**, that document named an issuer, and the
 *   issuer's metadata named itself. The endpoints in that document are the issuer speaking about
 *   itself, and an authorization server is free to spread them across hosts it owns — Attio serves
 *   `mcp.attio.com` from `app.attio.com`, Dropbox authorizes at `www.dropbox.com` and exchanges at
 *   `api.dropboxapi.com`. Requiring a host relationship on top of the chain would reject those
 *   without adding a property the chain does not already carry.
 *
 * `server-host`
 *   The endpoints came from a path guessed at `${serverUrl}/.well-known/oauth-authorization-server`.
 *   Nothing declared anything: the document was found by construction, not by the server naming it,
 *   so it proves only that something answered on that host. Its endpoints stay pinned there.
 */
export type McpEndpointTrust = 'issuer-declared' | 'server-host';

/** What a stored server carries forward about where its OAuth endpoints came from. */
export interface McpEndpointProvenance {
  /** The host the tenant registered, and the anchor for `server-host` trust. */
  serverHost: string;
  /**
   * How discovery established the endpoints. `null` for a row written before provenance was
   * recorded, which is treated as the weaker case.
   */
  trust: McpEndpointTrust | null;
}

/**
 * Whether an endpoint may be used, given how discovery came by it.
 *
 * The single rule, applied identically wherever a stored endpoint is about to be acted on:
 * discovery, dynamic client registration, the authorize redirect and the token exchange. Before
 * this existed, discovery accepted an issuer-declared endpoint on https alone while registration
 * and the token exchange re-tested the same stored value against the MCP server's host — so
 * Authlane would store `app.attio.com`, redirect a user to it, and then refuse to exchange the code
 * there. That was one rule applied inconsistently rather than a boundary, and it blocked 13 of 44
 * verified servers at registration and 17 at the token exchange.
 *
 * An unrecorded provenance falls to `server-host`. That is the conservative direction: a row this
 * function cannot vouch for gets the narrower rule, not the wider one.
 */
export function isTrustedMcpEndpoint(
  endpoint: string,
  provenance: McpEndpointProvenance | null | undefined
): boolean {
  if (!provenance) return false;
  if (provenance.trust === 'issuer-declared') return isHttpsUrl(endpoint);
  return isSameHostOrSubdomain(provenance.serverHost, endpoint);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function readString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns a `tools/list` result into rows for `mcp_server_tools`.
 *
 * A malformed payload yields fewer tools, never an exception: a tenant's server is outside our
 * control, and a bad response must not fail the discovery run for the rest of its tools.
 */
export function normalizeDiscoveredTools(serverId: string, payload: unknown): DiscoveredTool[] {
  if (!isRecord(payload) || !Array.isArray(payload.tools)) return [];

  const seen = new Set<string>();
  const tools: DiscoveredTool[] = [];

  for (const entry of payload.tools) {
    if (!isRecord(entry)) continue;

    const name = readString(entry.name, MAX_TOOL_NAME_LENGTH);
    if (!name || name.length > MAX_TOOL_NAME_LENGTH || seen.has(name)) continue;
    if (typeof entry.name === 'string' && entry.name.trim().length > MAX_TOOL_NAME_LENGTH) continue;
    seen.add(name);

    tools.push({
      serverId,
      name,
      description: readString(entry.description, MAX_DESCRIPTION_LENGTH) ?? '',
      inputSchema: isRecord(entry.inputSchema) ? entry.inputSchema : { type: 'object' },
      declaredAnnotations: isRecord(entry.annotations) ? entry.annotations : null,
      // Never derived from the declared annotations. The tenant lowers this deliberately.
      risk: 'write',
    });
  }

  return tools;
}

/**
 * Turns a stored contract into the shape the tool registry consumes.
 *
 * Annotations are built from the stored `risk`, never copied from `declaredAnnotations`. The
 * read-only filter that enforces a tenant's `read_only` policy reads annotations, so passing the
 * server's own claim through would let it label a destructive tool read-only and walk straight
 * past the policy. The declared values stay on the row for the tenant to inspect.
 */
export function discoveredToolsToIntegration(tools: readonly DiscoveredTool[]): IntegrationTools {
  return {
    tools: Object.fromEntries(
      tools.map((tool) => [
        tool.name,
        {
          definition: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.risk === 'read',
              destructiveHint: tool.risk === 'destructive',
              idempotentHint: false,
              // A tenant server reaches systems Authlane knows nothing about.
              openWorldHint: true,
            },
          },
        },
      ])
    ),
  };
}

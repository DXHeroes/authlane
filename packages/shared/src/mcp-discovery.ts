/**
 * Discovery for tenant-registered MCP servers.
 *
 * These are pure functions. Anything that touches the network lives in the API, so the rules that
 * decide what Authlane is willing to talk to, and what it is willing to believe, stay testable
 * without a socket.
 */

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
 * True when a discovered endpoint belongs to the registered server's domain.
 *
 * The comparison is on a dot boundary so `notexample.com` cannot pass as a subdomain of
 * `example.com`, and it is deliberately one-directional: registering `mcp.example.com` does not
 * authorise `example.com`.
 */
export function isSameRegistrableDomain(serverHost: string, endpoint: string): boolean {
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

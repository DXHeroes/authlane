import { lookup } from 'node:dns/promises';
import {
  MCP_PROTOCOL_VERSION,
  type McpDiscoveryDeps,
  type McpRpcResponse,
} from './mcp-discovery-run.js';

const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_024 * 1_024;

/**
 * Reads the JSON-RPC message out of a Streamable HTTP response body.
 *
 * A server may answer a POST with either a bare JSON object or an SSE stream carrying the same
 * object on a `data:` line — the transport lets it choose, and most real servers choose the stream.
 * Only the last message is kept: discovery sends one request at a time, so anything before it is a
 * progress notification it has no use for.
 */
export function readRpcMessage(contentType: string | null, body: string): unknown {
  if (body.trim() === '') return null;

  if (!contentType?.includes('text/event-stream')) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  let message: unknown = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      message = JSON.parse(line.slice('data:'.length).trim());
    } catch {
      // A frame that is not JSON is not the answer; keep reading.
    }
  }
  return message;
}

/**
 * Real network access for discovery.
 *
 * Kept apart from the rules it feeds so those stay testable without a socket, and so the address
 * check runs against what this process would actually dial.
 */
export function createMcpDiscoveryDeps(
  options: { fetchImpl?: typeof fetch } = {}
): McpDiscoveryDeps {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function readBody(response: Response): Promise<string> {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error('Discovery response was too large');
    }
    return text;
  }

  return {
    async resolveHost(host) {
      const records = await lookup(host, { all: true });
      return records.map((record) => record.address);
    },

    async fetchJson(url, init) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          method: init?.method ?? 'GET',
          body: init?.body,
          headers: {
            accept: 'application/json',
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
          },
          // A tenant server must not be able to bounce discovery onto another host.
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Discovery request failed with status ${response.status}`);
        }

        return JSON.parse(await readBody(response));
      } finally {
        clearTimeout(timer);
      }
    },

    async callRpc(url, message, session): Promise<McpRpcResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          body: JSON.stringify(message),
          headers: {
            // Both types are mandatory on this transport: a server answers 406 to a client that
            // accepts only JSON, which is why an otherwise healthy server looked unreachable.
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
            'mcp-protocol-version': MCP_PROTOCOL_VERSION,
            ...(session?.sessionId ? { 'mcp-session-id': session.sessionId } : {}),
          },
          redirect: 'error',
          signal: controller.signal,
        });

        // Deliberately does not check `response.ok`. A server that requires authorization refuses
        // with 401 and points at its metadata in the same breath; that is an answer, not a failure.
        return {
          status: response.status,
          sessionId: response.headers.get('mcp-session-id'),
          challenge: response.headers.get('www-authenticate'),
          payload: readRpcMessage(response.headers.get('content-type'), await readBody(response)),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

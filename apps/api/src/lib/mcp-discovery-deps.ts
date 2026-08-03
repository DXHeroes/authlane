import { lookup } from 'node:dns/promises';
import type { McpDiscoveryDeps } from './mcp-discovery-run.js';

const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_024 * 1_024;

/**
 * Real network access for discovery.
 *
 * Kept apart from the rules it feeds so those stay testable without a socket, and so the address
 * check runs against what this process would actually dial.
 */
export function createMcpDiscoveryDeps(): McpDiscoveryDeps {
  return {
    async resolveHost(host) {
      const records = await lookup(host, { all: true });
      return records.map((record) => record.address);
    },

    async fetchJson(url, init) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
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

        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES) {
          throw new Error('Discovery response was too large');
        }
        return JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

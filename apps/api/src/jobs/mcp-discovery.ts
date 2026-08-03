/**
 * Keeps tenant MCP server contracts current.
 *
 * A server the tenant registered can gain or lose a tool at any time, and until now Authlane only
 * noticed when somebody pressed Rediscover. That made the tool list quietly wrong: a tool added
 * last week was never offered, and one that was removed was still issued to users.
 *
 * Rediscovery repeats every check the first discovery made, including the host and endpoint rules,
 * so a server cannot become private or move its OAuth endpoints after being approved. A tenant's
 * own judgements — a tool's risk, whether it is approved — survive, because saveDiscoverySuccess
 * leaves those columns alone.
 */

import {
  type Database,
  listMcpServersDueForDiscovery,
  saveDiscoveryFailure,
  saveDiscoverySuccess,
} from '@authlane/database';
import type { CacheStore } from '../lib/cache.js';
import { logger } from '../lib/logger.js';
import { discoverMcpServer, type McpDiscoveryDeps } from '../lib/mcp-discovery-run.js';

/** How long a contract may go unverified. */
export const MCP_DISCOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Servers per run. Bounded so one sweep cannot spend the worker on a long tail of dead hosts. */
export const MCP_DISCOVERY_BATCH_SIZE = 20;

export interface McpRediscoveryResult {
  checked: number;
  updated: number;
  failed: number;
}

export async function rediscoverStaleMcpServers(
  db: Database,
  deps: McpDiscoveryDeps,
  options: { cache?: CacheStore; now?: Date; maxAgeMs?: number; batchSize?: number } = {}
): Promise<McpRediscoveryResult> {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? MCP_DISCOVERY_MAX_AGE_MS;
  const servers = await listMcpServersDueForDiscovery(
    db,
    new Date(now.getTime() - maxAgeMs),
    options.batchSize ?? MCP_DISCOVERY_BATCH_SIZE
  );

  let updated = 0;
  let failed = 0;

  for (const server of servers) {
    const result = await discoverMcpServer(server.id, server.serverUrl, deps);
    if (!result.ok) {
      // The last known good contract stays in place. A server that is briefly unreachable should
      // not take a tenant's whole tool list away.
      await saveDiscoveryFailure(db, server.id, result.message);
      failed += 1;
      continue;
    }

    await saveDiscoverySuccess(db, server.id, result);
    await options.cache?.delete(`control-plane:tenant-services:${server.organizationId}`);
    updated += 1;
  }

  if (servers.length > 0) {
    logger.info({ checked: servers.length, updated, failed }, 'Rediscovered tenant MCP servers');
  }

  return { checked: servers.length, updated, failed };
}

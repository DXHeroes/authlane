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
 *
 * It also re-attempts dynamic client registration for a server that still has none, so a provider
 * that starts offering it is picked up without anybody pressing a button.
 */

import {
  createDatabaseSecretStore,
  type Database,
  listMcpServersDueForDiscovery,
  type SecretStore,
  saveDiscoveryFailure,
  saveDiscoverySuccess,
} from '@authlane/database';
import type { CacheStore } from '../lib/cache.js';
import { logger } from '../lib/logger.js';
import { ensureMcpOAuthClient } from '../lib/mcp-client-registration.js';
import { discoverMcpServer, type McpDiscoveryDeps } from '../lib/mcp-discovery-run.js';

/** How long a contract may go unverified. */
export const MCP_DISCOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Servers per run. Bounded so one sweep cannot spend the worker on a long tail of dead hosts. */
export const MCP_DISCOVERY_BATCH_SIZE = 20;

export interface McpRediscoveryResult {
  checked: number;
  updated: number;
  failed: number;
  /** Servers that gained an OAuth client on this sweep. */
  registered: number;
}

export async function rediscoverStaleMcpServers(
  db: Database,
  deps: McpDiscoveryDeps,
  options: {
    cache?: CacheStore;
    now?: Date;
    maxAgeMs?: number;
    batchSize?: number;
    secretStore?: SecretStore;
    /**
     * The public API origin, for the redirect URI a registration has to declare.
     *
     * The routes take this from the request they are serving; a sweep has no request, so it comes
     * from configuration. Without it registration is skipped and says so, rather than registering a
     * client against a guessed redirect URI that the callback could never satisfy.
     */
    apiBaseUrl?: string | null;
  } = {}
): Promise<McpRediscoveryResult> {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? MCP_DISCOVERY_MAX_AGE_MS;
  const servers = await listMcpServersDueForDiscovery(
    db,
    new Date(now.getTime() - maxAgeMs),
    options.batchSize ?? MCP_DISCOVERY_BATCH_SIZE
  );

  const secretStore = options.secretStore ?? createDatabaseSecretStore(db);
  let updated = 0;
  let failed = 0;
  let registered = 0;

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

    /*
     * Registration is retried here, not only from the manual route.
     *
     * The sweep re-read the contract but never re-attempted registration, so a provider that added
     * dynamic client registration after its server was registered was never noticed: the server sat
     * with an "OAuth client needed" badge until somebody pressed a button. ensureMcpOAuthClient
     * returns early for a server that already has one, so this cannot abandon a live client at the
     * provider.
     */
    const outcome = await ensureMcpOAuthClient(db, secretStore, {
      serverId: server.id,
      organizationId: server.organizationId,
      provenance: {
        serverHost: new URL(result.serverUrl).hostname,
        trust: result.oauthMetadata?.endpointTrust ?? null,
      },
      authType: server.authType,
      registrationEndpoint: result.oauthMetadata?.registrationEndpoint ?? null,
      existingClientId: server.oauthClientId,
      apiBaseUrl: options.apiBaseUrl ?? null,
      deps,
    });
    if (outcome.registered) registered += 1;

    await options.cache?.delete(`control-plane:tenant-services:${server.organizationId}`);
    updated += 1;
  }

  if (servers.length > 0) {
    logger.info(
      { checked: servers.length, updated, failed, registered },
      'Rediscovered tenant MCP servers'
    );
  }

  return { checked: servers.length, updated, failed, registered };
}

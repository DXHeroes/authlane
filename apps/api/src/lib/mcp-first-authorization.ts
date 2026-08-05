/**
 * Reads a server's tool contract with the credential of the user who just authorized it.
 *
 * Discovery asks without a credential, on purpose: a server's refusal is what names its
 * authorization metadata, and that is how it gets registered at all. The cost was that an
 * OAuth-protected server never got past that point. Its contract stayed empty and
 * `authorization_required` stayed true forever — "waiting for the first user to authorize it" was
 * a state nothing could leave, so a tenant who did everything right still had no tools to offer.
 *
 * The first authorization is the first moment a credential exists, so it is the first moment the
 * question can be asked at all.
 */

import {
  type Database,
  readMcpServerConnectConfig,
  saveDiscoverySuccess,
} from '@authlane/database';
import type { CacheStore } from './cache.js';
import { logger } from './logger.js';
import { discoverMcpServer, type McpDiscoveryDeps } from './mcp-discovery-run.js';

export interface McpFirstAuthorizationInput {
  serverId: string;
  organizationId: string;
  accessToken: string;
  authorizationRequired: boolean;
}

/**
 * Never throws. The connection is already stored and the user is mid-redirect; a server that is
 * briefly unreachable must not cost them the authorization they just completed. The next scheduled
 * rediscovery, or a tenant pressing Rediscover, picks it up instead.
 *
 * @returns how many tools were recorded, or null when nothing was attempted.
 */
export async function discoverAfterFirstAuthorization(
  db: Database,
  deps: McpDiscoveryDeps,
  cache: CacheStore | undefined,
  input: McpFirstAuthorizationInput
): Promise<number | null> {
  // Only the first one. Every later user would re-read the same contract with their own
  // permissions, which is a request per authorization for an answer that is already stored.
  if (!input.authorizationRequired) return null;

  try {
    const server = await readMcpServerConnectConfig(db, input.serverId);
    if (!server) return null;

    const result = await discoverMcpServer(input.serverId, server.serverUrl, deps, {
      accessToken: input.accessToken,
    });
    if (!result.ok) {
      logger.info(
        { serverId: input.serverId, reason: result.message },
        'MCP contract still unavailable after first authorization'
      );
      return null;
    }

    /*
     * A server that still refuses a credentialed listing keeps `authorizationRequired` true, which
     * is the honest answer: the token was accepted by the provider but does not carry whatever
     * this server wants. Saying so beats recording an empty contract as complete.
     */
    await saveDiscoverySuccess(db, input.serverId, result);
    await cache?.delete(`control-plane:tenant-services:${input.organizationId}`);

    return result.tools.length;
  } catch (error) {
    logger.warn(
      { serverId: input.serverId, error },
      'Rediscovery after first authorization failed; the connection is unaffected'
    );
    return null;
  }
}

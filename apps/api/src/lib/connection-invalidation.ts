/**
 * Makes every user of one service authorize again.
 *
 * Two things can invalidate a stored credential without the provider knowing: a tenant narrowing
 * the tool policy, and a tenant replacing the OAuth client the tokens were issued to. In both cases
 * the token is still accepted by the provider for a while and then stops working for a reason
 * nobody can see, so it is better to expire it deliberately and say so.
 *
 * Written once, because the part that is easy to forget is deleting the credential material. A
 * connection left `expired` while its ciphertext survives is a secret nothing points at, re-wrapped
 * by every future key rotation.
 */

import { and, connections, type Database, eq, type SecretStore } from '@authlane/database';
import type { CacheStore } from './cache.js';

export async function expireConnectionsForService(
  db: Database,
  secretStore: SecretStore,
  cache: CacheStore | undefined,
  organizationId: string,
  serviceId: string,
  errorCode: string
): Promise<number> {
  const scope = and(
    eq(connections.organizationId, organizationId),
    eq(connections.serviceId, serviceId)
  );

  const affected = await db
    .select({
      externalUserId: connections.externalUserId,
      credentialSecretId: connections.credentialSecretId,
    })
    .from(connections)
    .where(scope);

  if (affected.length === 0) return 0;

  await db
    .update(connections)
    .set({
      status: 'expired',
      credentialSecretId: null,
      lastErrorCode: errorCode,
      updatedAt: new Date(),
    })
    .where(scope);

  await Promise.all(
    affected.flatMap(({ credentialSecretId }) =>
      credentialSecretId
        ? [
            secretStore.delete?.(credentialSecretId, organizationId, 'connection_credentials') ??
              Promise.resolve(),
          ]
        : []
    )
  );

  await Promise.all(
    affected.map(({ externalUserId }) =>
      cache?.delete(`control-plane:connections:${organizationId}:${externalUserId}`)
    )
  );

  return affected.length;
}

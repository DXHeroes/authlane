import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { connections } from './schema/connections.js';
import { providerToolDiscoveries } from './schema/provider-tools.js';

export interface StoredProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  declaredAnnotations: Record<string, unknown> | null;
}

/** The catalogue Authlane last saw for one service in one organization. Empty when never asked. */
export async function readProviderTools(
  db: Database,
  organizationId: string,
  serviceId: string
): Promise<StoredProviderTool[]> {
  const [row] = await db
    .select({ tools: providerToolDiscoveries.tools })
    .from(providerToolDiscoveries)
    .where(
      and(
        eq(providerToolDiscoveries.organizationId, organizationId),
        eq(providerToolDiscoveries.serviceId, serviceId)
      )
    )
    .limit(1);

  return (row?.tools ?? []) as StoredProviderTool[];
}

export async function saveProviderTools(
  db: Database,
  organizationId: string,
  serviceId: string,
  tools: readonly StoredProviderTool[]
): Promise<void> {
  const now = new Date();
  await db
    .insert(providerToolDiscoveries)
    .values({
      organizationId,
      serviceId,
      tools: [...tools],
      toolCount: tools.length,
      discoveredAt: now,
      discoveryError: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [providerToolDiscoveries.organizationId, providerToolDiscoveries.serviceId],
      set: {
        tools: [...tools],
        toolCount: tools.length,
        discoveredAt: now,
        discoveryError: null,
        updatedAt: now,
      },
    });
}

/** Records a failure without discarding the catalogue that still works. */
export async function saveProviderToolsFailure(
  db: Database,
  organizationId: string,
  serviceId: string,
  message: string
): Promise<void> {
  const now = new Date();
  await db
    .insert(providerToolDiscoveries)
    .values({
      organizationId,
      serviceId,
      tools: [],
      toolCount: 0,
      discoveryError: message,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [providerToolDiscoveries.organizationId, providerToolDiscoveries.serviceId],
      set: { discoveryError: message, updatedAt: now },
    });
}

export interface ProviderDiscoveryCandidate {
  organizationId: string;
  serviceId: string;
  connectionId: string;
  credentialSecretId: string;
}

/**
 * One connected user per (organization, service) whose catalogue is stale.
 *
 * Any connected user will do — the catalogue belongs to the provider's product, not to the account
 * — so this takes exactly one credential per pair rather than asking once per user.
 */
export async function listProviderDiscoveryCandidates(
  db: Database,
  serviceIds: readonly string[],
  staleBefore: Date,
  limit: number
): Promise<ProviderDiscoveryCandidate[]> {
  if (serviceIds.length === 0) return [];

  const rows = await db
    .selectDistinctOn([connections.organizationId, connections.serviceId], {
      organizationId: connections.organizationId,
      serviceId: connections.serviceId,
      connectionId: connections.id,
      credentialSecretId: connections.credentialSecretId,
      discoveredAt: providerToolDiscoveries.discoveredAt,
    })
    .from(connections)
    .leftJoin(
      providerToolDiscoveries,
      and(
        eq(providerToolDiscoveries.organizationId, connections.organizationId),
        eq(providerToolDiscoveries.serviceId, connections.serviceId)
      )
    )
    .where(
      and(
        eq(connections.status, 'connected'),
        inArray(connections.serviceId, [...serviceIds]),
        sql`${connections.credentialSecretId} is not null`,
        or(
          isNull(providerToolDiscoveries.discoveredAt),
          lt(providerToolDiscoveries.discoveredAt, staleBefore)
        )
      )
    )
    .limit(limit);

  return rows
    .filter((row): row is typeof row & { credentialSecretId: string } =>
      Boolean(row.credentialSecretId)
    )
    .map((row) => ({
      organizationId: row.organizationId,
      serviceId: row.serviceId,
      connectionId: row.connectionId,
      credentialSecretId: row.credentialSecretId,
    }));
}

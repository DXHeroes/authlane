import type { DiscoveredTool, DiscoveredToolRisk } from '@authlane/shared';
import { isMcpServerId, MCP_SERVER_ID_PREFIX } from '@authlane/shared';
import { and, asc, eq, lt } from 'drizzle-orm';
import type { Database } from './client.js';
import { mcpServers, mcpServerTools } from './schema/mcp-servers.js';

export { MCP_SERVER_ID_PREFIX, isMcpServerId };

function toRisk(value: string): DiscoveredToolRisk {
  return value === 'read' || value === 'destructive' ? value : 'write';
}

/**
 * Reads a server's issuable tool contract.
 *
 * Runs under the caller's tenant context, so RLS restricts it to servers the organization owns; an
 * id belonging to another tenant yields nothing rather than an error. Tools the tenant switched
 * off, and servers discovery has never reached, are excluded here rather than at the caller.
 */
export async function readMcpServerTools(
  db: Database,
  serverId: string
): Promise<DiscoveredTool[]> {
  const rows = await db
    .select({
      name: mcpServerTools.name,
      description: mcpServerTools.description,
      inputSchema: mcpServerTools.inputSchema,
      declaredAnnotations: mcpServerTools.declaredAnnotations,
      risk: mcpServerTools.risk,
    })
    .from(mcpServerTools)
    .innerJoin(mcpServers, eq(mcpServers.id, mcpServerTools.serverId))
    .where(
      and(
        eq(mcpServerTools.serverId, serverId),
        eq(mcpServerTools.approved, true),
        eq(mcpServers.enabled, true)
      )
    )
    .orderBy(asc(mcpServerTools.name));

  return rows.map((row) => ({
    serverId,
    name: row.name,
    description: row.description ?? '',
    inputSchema: (row.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
    declaredAnnotations: (row.declaredAnnotations ?? null) as Record<string, unknown> | null,
    risk: toRisk(row.risk),
  }));
}

export interface McpServerToolRow {
  name: string;
  description: string;
  risk: DiscoveredToolRisk;
  approved: boolean;
  declaredAnnotations: Record<string, unknown> | null;
  lastSeenAt: Date;
}

/**
 * A server's full tool list for the tenant to review.
 *
 * Unlike {@link readMcpServerTools} this keeps the tools the tenant switched off. Hiding them would
 * make the decision irreversible: a disapproved tool would vanish from the only screen that can
 * approve it again.
 */
export async function listMcpServerToolsForReview(
  db: Database,
  serverId: string
): Promise<McpServerToolRow[]> {
  const rows = await db
    .select({
      name: mcpServerTools.name,
      description: mcpServerTools.description,
      declaredAnnotations: mcpServerTools.declaredAnnotations,
      risk: mcpServerTools.risk,
      approved: mcpServerTools.approved,
      lastSeenAt: mcpServerTools.lastSeenAt,
    })
    .from(mcpServerTools)
    .innerJoin(mcpServers, eq(mcpServers.id, mcpServerTools.serverId))
    .where(eq(mcpServerTools.serverId, serverId))
    .orderBy(asc(mcpServerTools.name));

  return rows.map((row) => ({
    name: row.name,
    description: row.description ?? '',
    risk: toRisk(row.risk),
    approved: row.approved,
    declaredAnnotations: (row.declaredAnnotations ?? null) as Record<string, unknown> | null,
    lastSeenAt: row.lastSeenAt,
  }));
}

/** Enabled MCP servers the organization owns, for catalog and connect-session listings. */
export async function listEnabledMcpServers(db: Database, organizationId: string) {
  return db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      authType: mcpServers.authType,
      serverUrl: mcpServers.serverUrl,
    })
    .from(mcpServers)
    .where(and(eq(mcpServers.organizationId, organizationId), eq(mcpServers.enabled, true)))
    .orderBy(asc(mcpServers.name));
}

/**
 * Every server the organization registered, including the ones discovery never reached.
 *
 * The dashboard needs those too: a server whose first discovery failed is disabled, and if the list
 * hid it the tenant could neither retry nor remove it — the id would only ever have existed in the
 * response to the request that created it.
 */
export async function listMcpServersForOrganization(db: Database, organizationId: string) {
  return db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      authType: mcpServers.authType,
      serverUrl: mcpServers.serverUrl,
      enabled: mcpServers.enabled,
      discoveredAt: mcpServers.discoveredAt,
      discoveryError: mcpServers.discoveryError,
      oauthClientId: mcpServers.oauthClientId,
      createdAt: mcpServers.createdAt,
    })
    .from(mcpServers)
    .where(eq(mcpServers.organizationId, organizationId))
    .orderBy(asc(mcpServers.name));
}

/**
 * Servers whose contract has gone stale, oldest first.
 *
 * A server that has never been discovered is not here: it is disabled, and the tenant is looking
 * at the failure on its card. This is for the ones that work and may have quietly changed.
 */
export async function listMcpServersDueForDiscovery(
  db: Database,
  discoveredBefore: Date,
  limit: number
) {
  return db
    .select({
      id: mcpServers.id,
      organizationId: mcpServers.organizationId,
      serverUrl: mcpServers.serverUrl,
    })
    .from(mcpServers)
    .where(and(eq(mcpServers.enabled, true), lt(mcpServers.discoveredAt, discoveredBefore)))
    .orderBy(asc(mcpServers.discoveredAt))
    .limit(limit);
}

export interface McpServerDraft {
  organizationId: string;
  name: string;
  serverUrl: string;
  authType: 'oauth2' | 'api_key';
}

/** Creates a server in the disabled state. Discovery is what turns it on. */
export async function createMcpServer(
  db: Database,
  id: string,
  draft: McpServerDraft
): Promise<void> {
  await db.insert(mcpServers).values({
    id,
    organizationId: draft.organizationId,
    name: draft.name,
    serverUrl: draft.serverUrl,
    authType: draft.authType,
    enabled: false,
  });
}

export interface DiscoverySnapshot {
  serverUrl: string;
  oauthMetadata: unknown;
  tools: readonly DiscoveredTool[];
}

/**
 * Records a successful discovery.
 *
 * Tools that vanished are left in place: their rows carry audit history, and a server briefly
 * omitting a tool should not erase the record that it once existed. They stop being issued because
 * `last_seen_at` no longer advances, not because the row is gone.
 */
export async function saveDiscoverySuccess(
  db: Database,
  serverId: string,
  snapshot: DiscoverySnapshot
): Promise<void> {
  const now = new Date();

  await db
    .update(mcpServers)
    .set({
      serverUrl: snapshot.serverUrl,
      oauthMetadata: snapshot.oauthMetadata ?? null,
      discoveredAt: now,
      discoveryError: null,
      enabled: true,
      updatedAt: now,
    })
    .where(eq(mcpServers.id, serverId));

  for (const tool of snapshot.tools) {
    await db
      .insert(mcpServerTools)
      .values({
        serverId,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        declaredAnnotations: tool.declaredAnnotations,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [mcpServerTools.serverId, mcpServerTools.name],
        // risk and approved are the tenant's decisions and survive a refresh.
        set: {
          description: tool.description,
          inputSchema: tool.inputSchema,
          declaredAnnotations: tool.declaredAnnotations,
          lastSeenAt: now,
        },
      });
  }
}

/** Records a failed discovery without disturbing the last known good contract. */
export async function saveDiscoveryFailure(
  db: Database,
  serverId: string,
  message: string
): Promise<void> {
  await db
    .update(mcpServers)
    .set({ discoveryError: message, updatedAt: new Date() })
    .where(eq(mcpServers.id, serverId));
}

export async function deleteMcpServer(db: Database, serverId: string): Promise<void> {
  await db.delete(mcpServers).where(eq(mcpServers.id, serverId));
}

/** Applies the tenant's judgement to one discovered tool. */
export async function updateMcpServerTool(
  db: Database,
  serverId: string,
  name: string,
  changes: { risk?: DiscoveredToolRisk; approved?: boolean }
): Promise<void> {
  await db
    .update(mcpServerTools)
    .set(changes)
    .where(and(eq(mcpServerTools.serverId, serverId), eq(mcpServerTools.name, name)));
}

export interface McpServerConnectConfig {
  id: string;
  /** The URL the tenant registered. Endpoints are re-checked against its host at use time. */
  serverUrl: string;
  authType: string;
  enabled: boolean;
  oauthClientId: string | null;
  oauthClientSecretId: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
}

/**
 * Everything the connect flow needs about one tenant server.
 *
 * The OAuth endpoints come from the metadata stored at discovery, which was already checked to be
 * https and on the registered domain. They are not re-read from the server at connect time, so a
 * server cannot swap its token endpoint between discovery and a user connecting.
 */
export async function readMcpServerConnectConfig(
  db: Database,
  serverId: string
): Promise<McpServerConnectConfig | null> {
  const [row] = await db
    .select({
      id: mcpServers.id,
      serverUrl: mcpServers.serverUrl,
      authType: mcpServers.authType,
      enabled: mcpServers.enabled,
      oauthClientId: mcpServers.oauthClientId,
      oauthClientSecretId: mcpServers.oauthClientSecretId,
      oauthMetadata: mcpServers.oauthMetadata,
    })
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId))
    .limit(1);

  if (!row) return null;

  const metadata = (row.oauthMetadata ?? null) as {
    authorizationEndpoint?: unknown;
    tokenEndpoint?: unknown;
  } | null;

  return {
    id: row.id,
    serverUrl: row.serverUrl,
    authType: row.authType,
    enabled: row.enabled,
    oauthClientId: row.oauthClientId,
    oauthClientSecretId: row.oauthClientSecretId,
    authorizationEndpoint:
      typeof metadata?.authorizationEndpoint === 'string' ? metadata.authorizationEndpoint : null,
    tokenEndpoint: typeof metadata?.tokenEndpoint === 'string' ? metadata.tokenEndpoint : null,
  };
}

import type { DiscoveredTool, DiscoveredToolRisk } from '@authlane/shared';
import { isMcpServerId, MCP_SERVER_ID_PREFIX } from '@authlane/shared';
import { and, asc, eq, lt } from 'drizzle-orm';
import type { Database } from './client.js';
import { mcpServers, mcpServerTools } from './schema/mcp-servers.js';

export { isMcpServerId, MCP_SERVER_ID_PREFIX };

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

/**
 * Enabled MCP servers the organization owns, for catalog and connect-session listings.
 *
 * Each row is a whole {@link McpServerConnectConfig} rather than a name and a URL, so the catalog
 * can put a server through the same readiness check the connect flow uses instead of guessing from
 * a narrower row whether connecting would work.
 */
export async function listEnabledMcpServers(
  db: Database,
  organizationId: string
): Promise<(McpServerConnectConfig & { name: string })[]> {
  const rows = await db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      authType: mcpServers.authType,
      serverUrl: mcpServers.serverUrl,
      enabled: mcpServers.enabled,
      oauthClientId: mcpServers.oauthClientId,
      oauthClientSecretId: mcpServers.oauthClientSecretId,
      oauthMetadata: mcpServers.oauthMetadata,
      authorizationRequired: mcpServers.authorizationRequired,
    })
    .from(mcpServers)
    .where(and(eq(mcpServers.organizationId, organizationId), eq(mcpServers.enabled, true)))
    .orderBy(asc(mcpServers.name));

  return rows.map((row) => ({ ...toConnectConfig(row), name: row.name }));
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
      authorizationRequired: mcpServers.authorizationRequired,
      discoveredAt: mcpServers.discoveredAt,
      discoveryError: mcpServers.discoveryError,
      oauthClientId: mcpServers.oauthClientId,
      oauthClientSource: mcpServers.oauthClientSource,
      createdAt: mcpServers.createdAt,
    })
    .from(mcpServers)
    .where(eq(mcpServers.organizationId, organizationId))
    .orderBy(asc(mcpServers.name));
}

/**
 * One server's OAuth client, scoped to the organization that owns it.
 *
 * Scoped in SQL rather than leaning on RLS alone, because the caller needs to tell "no such server"
 * apart from "not yours" — both must answer 404, and a write that silently matched nothing would
 * report success.
 */
export async function readMcpServerOAuthClient(
  db: Database,
  organizationId: string,
  serverId: string
) {
  const [row] = await db
    .select({
      id: mcpServers.id,
      authType: mcpServers.authType,
      enabled: mcpServers.enabled,
      oauthClientId: mcpServers.oauthClientId,
      oauthClientSecretId: mcpServers.oauthClientSecretId,
      oauthClientSource: mcpServers.oauthClientSource,
    })
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.organizationId, organizationId)))
    .limit(1);

  return row ?? null;
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
  /** The server refused to list anything without a credential. */
  authorizationRequired: boolean;
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
      authorizationRequired: snapshot.authorizationRequired,
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

/**
 * Stores the OAuth client Authlane registered at the server (RFC 7591).
 *
 * Written once, when discovery first sees a `registration_endpoint`. Registering again on every
 * refresh would leave a trail of abandoned clients in the provider's account, so the caller only
 * reaches this when the column is still empty.
 */
export async function saveMcpOAuthClient(
  db: Database,
  serverId: string,
  client: { clientId: string; clientSecretId: string | null; source: 'dynamic' | 'manual' }
): Promise<void> {
  await db
    .update(mcpServers)
    .set({
      oauthClientId: client.clientId,
      oauthClientSecretId: client.clientSecretId,
      oauthClientSource: client.source,
      updatedAt: new Date(),
    })
    .where(eq(mcpServers.id, serverId));
}

/**
 * Forgets the server's OAuth client.
 *
 * Only ever reached for a client the tenant pasted in. Clearing a registered one would leave it
 * live at the provider with nothing pointing at it, and the next rediscovery would register
 * another beside it.
 */
export async function clearMcpOAuthClient(db: Database, serverId: string): Promise<void> {
  await db
    .update(mcpServers)
    .set({
      oauthClientId: null,
      oauthClientSecretId: null,
      oauthClientSource: null,
      updatedAt: new Date(),
    })
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
  /** True while the server has only ever been asked without a credential. */
  authorizationRequired: boolean;
}

/** The columns a connect config is read from, whether one row or a whole organization's worth. */
interface McpServerConnectRow {
  id: string;
  serverUrl: string;
  authType: string;
  enabled: boolean;
  oauthClientId: string | null;
  oauthClientSecretId: string | null;
  oauthMetadata: unknown;
  authorizationRequired: boolean;
}

/**
 * The stored row as the connect flow sees it.
 *
 * Shared by the single-server read and the per-organization listing so both unwrap the discovery
 * metadata the same way. Two copies of this would let the catalog decide a server has an
 * authorization endpoint while the connect flow decided it has none.
 */
function toConnectConfig(row: McpServerConnectRow): McpServerConnectConfig {
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
    authorizationRequired: row.authorizationRequired,
  };
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
      authorizationRequired: mcpServers.authorizationRequired,
    })
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId))
    .limit(1);

  if (!row) return null;

  return toConnectConfig(row);
}

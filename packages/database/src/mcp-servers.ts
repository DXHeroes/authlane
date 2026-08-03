import type { DiscoveredTool, DiscoveredToolRisk } from '@authlane/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { mcpServerTools, mcpServers } from './schema/mcp-servers.js';

/** Prefix every tenant-registered MCP server carries, so it can stand in for a service id. */
export const MCP_SERVER_ID_PREFIX = 'mcp-';

export function isMcpServerId(serviceId: string): boolean {
  return serviceId.startsWith(MCP_SERVER_ID_PREFIX);
}

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

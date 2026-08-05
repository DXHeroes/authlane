import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { secretRecords } from './secret-records.js';

/**
 * MCP servers registered by a tenant.
 *
 * Unlike `services`, which is a global catalog, these belong to one organization and are only ever
 * visible to it. Authlane discovers a server's tool list but never relays `tools/call`: the
 * consuming runtime calls the server directly with a leased credential, exactly as it does for
 * built-in integrations.
 *
 * `id` carries an `mcp-` prefix so the value can be used wherever a `serviceId` is expected.
 * The separator is a hyphen rather than a colon because `isValidServiceId` accepts only
 * `^[a-z0-9-]+$`, and six security checks route through it.
 */
export const mcpServers = pgTable(
  'mcp_servers',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    serverUrl: text('server_url').notNull(),
    authType: text('auth_type').notNull(),
    // Discovery state, surfaced in the dashboard so a failure is diagnosable.
    discoveredAt: timestamp('discovered_at', { withTimezone: true }),
    discoveryError: text('discovery_error'),
    // Authorization server metadata (RFC 8414), stored only after endpoint validation.
    oauthMetadata: jsonb('oauth_metadata'),
    // Client registered dynamically with the server (RFC 7591).
    oauthClientId: text('oauth_client_id'),
    oauthClientSecretId: text('oauth_client_secret_id').references(() => secretRecords.id, {
      onDelete: 'set null',
    }),
    // Stays false until a discovery succeeds, so an unreachable server is never offered to users.
    enabled: boolean('enabled').default(false).notNull(),
    /**
     * The server refuses to list its tools without a credential.
     *
     * True for every OAuth-protected server, and not a fault: the contract arrives once a user has
     * authorized. Stored so the dashboard can say that instead of showing an empty tool list, which
     * reads as "this server offers nothing".
     */
    authorizationRequired: boolean('authorization_required').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('mcp_servers_org_idx').on(table.organizationId),
    check('mcp_servers_auth_type_check', sql`${table.authType} in ('oauth2', 'api_key')`),
    check('mcp_servers_id_prefix_check', sql`${table.id} like 'mcp-%'`),
  ]
);

/**
 * Tool contract discovered from a tenant's MCP server.
 *
 * `risk` is stored rather than derived. A third-party server declares its own MCP annotations, so
 * trusting them would let a destructive tool labelled read-only walk through a tenant's
 * `read_only` policy. Discovery always writes `write`; the tenant may lower it to `read`.
 */
export const mcpServerTools = pgTable(
  'mcp_server_tools',
  {
    serverId: text('server_id')
      .references(() => mcpServers.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description'),
    inputSchema: jsonb('input_schema').notNull(),
    // What the server claims about itself. A hint for the tenant, never the basis for policy.
    declaredAnnotations: jsonb('declared_annotations'),
    risk: text('risk').default('write').notNull(),
    approved: boolean('approved').default(true).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.name] }),
    check('mcp_server_tools_risk_check', sql`${table.risk} in ('read', 'write', 'destructive')`),
  ]
);

export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;
export type McpServerTool = typeof mcpServerTools.$inferSelect;
export type NewMcpServerTool = typeof mcpServerTools.$inferInsert;

import { integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

/**
 * What a provider's own MCP server offered, the last time Authlane asked.
 *
 * Cached per organization rather than per connection: an official server's catalogue is a property
 * of the product, not of one user, and a row per connection would multiply the same answer by every
 * end user. The approximation is that a tool gated behind one account's plan can appear for the
 * whole organization — it still fails at call time with the provider's own error, which is the same
 * outcome as before discovery existed.
 *
 * A failure is recorded rather than thrown away, so an endpoint that has quietly stopped answering
 * is visible instead of looking like a server with no tools.
 */
export const providerToolDiscoveries = pgTable(
  'provider_tool_discoveries',
  {
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    serviceId: text('service_id').notNull(),
    tools: jsonb('tools').$type<unknown[]>().default([]).notNull(),
    toolCount: integer('tool_count').default(0).notNull(),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }),
    discoveryError: text('discovery_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.serviceId] })]
);

export type ProviderToolDiscovery = typeof providerToolDiscoveries.$inferSelect;
export type NewProviderToolDiscovery = typeof providerToolDiscoveries.$inferInsert;

import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { services } from './services.js';
import { tenants } from './tenants.js';

/**
 * Connections table - End-user connections to services
 * Links end-users (from tenant's system) to third-party services
 * Uses Row-Level Security (RLS) for tenant isolation
 */
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    externalUserId: text('external_user_id').notNull(), // User ID from tenant's system
    serviceId: text('service_id')
      .references(() => services.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status', {
      enum: ['pending', 'connected', 'expired', 'error'],
    })
      .default('pending')
      .notNull(),
    credentialsEnc: text('credentials_enc'), // Encrypted credentials (AES-256-GCM)
    metadata: jsonb('metadata').default({}).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueTenantUserService: unique().on(table.tenantId, table.externalUserId, table.serviceId),
  })
);

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type ConnectionStatus = Connection['status'];

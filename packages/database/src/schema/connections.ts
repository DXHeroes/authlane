import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { secretRecords } from './secret-records.js';

export const connections = pgTable(
  'connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    externalUserId: text('external_user_id').notNull(),
    // No foreign key: a service id is either a global catalog entry or one of the tenant's own
    // MCP servers, which live in a different table. Validity is enforced by
    // isConnectableServiceId before any write, and RLS confines rows to the owning organization.
    serviceId: text('service_id').notNull(),
    status: text('status', {
      enum: ['pending', 'connected', 'expired', 'error'],
    })
      .default('pending')
      .notNull(),
    credentialSecretId: text('credential_secret_id').references(() => secretRecords.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    refreshLockToken: text('refresh_lock_token'),
    refreshLockExpiresAt: timestamp('refresh_lock_expires_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('connections_org_external_user_service_unique').on(
      table.organizationId,
      table.externalUserId,
      table.serviceId
    ),
    index('connections_org_external_user_idx').on(table.organizationId, table.externalUserId),
    index('connections_status_expires_at_idx').on(table.status, table.expiresAt),
  ]
);

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type StoredConnectionStatus = Connection['status'];

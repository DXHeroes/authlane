import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { secretRecords } from './secret-records.js';
import { services } from './services.js';

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
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
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

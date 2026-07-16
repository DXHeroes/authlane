import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { apiKeys } from './api-keys.js';
import { organization } from './auth.js';
import { services } from './services.js';

export const credentialAccessLogs = pgTable(
  'credential_access_logs',
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
      .references(() => services.id, { onDelete: 'restrict' }),
    apiKeyId: text('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('credential_access_org_external_user_idx').on(table.organizationId, table.externalUserId),
  ]
);

export type CredentialAccessLog = typeof credentialAccessLogs.$inferSelect;
export type NewCredentialAccessLog = typeof credentialAccessLogs.$inferInsert;

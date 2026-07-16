import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { connectSessions } from './connect-sessions.js';
import { connections } from './connections.js';
import { secretRecords } from './secret-records.js';
import { services } from './services.js';

export const oauthTransactions = pgTable(
  'oauth_transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    connectSessionId: text('connect_session_id')
      .notNull()
      .references(() => connectSessions.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    stateHash: text('state_hash').notNull(),
    pkceSecretId: text('pkce_secret_id')
      .notNull()
      .references(() => secretRecords.id, { onDelete: 'cascade' }),
    callbackUrl: text('callback_url').notNull(),
    allowedOrigin: text('allowed_origin').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_transactions_state_hash_unique').on(table.stateHash),
    index('oauth_transactions_connection_created_idx').on(table.connectionId, table.createdAt),
    index('oauth_transactions_expires_at_idx').on(table.expiresAt),
  ]
);

export type OAuthTransaction = typeof oauthTransactions.$inferSelect;
export type NewOAuthTransaction = typeof oauthTransactions.$inferInsert;

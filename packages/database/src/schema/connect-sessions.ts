import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

export const connectSessions = pgTable(
  'connect_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    externalUserId: text('external_user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    allowedServices: jsonb('allowed_services').$type<string[]>().default([]).notNull(),
    allowedOrigin: text('allowed_origin').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('connect_sessions_org_external_user_idx').on(table.organizationId, table.externalUserId),
    index('connect_sessions_expires_at_idx').on(table.expiresAt),
  ]
);

export type ConnectSession = typeof connectSessions.$inferSelect;
export type NewConnectSession = typeof connectSessions.$inferInsert;

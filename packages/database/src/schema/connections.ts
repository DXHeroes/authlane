import { jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';
import { services } from './services.js';

/**
 * Connection scope enum
 * - user: Connection owned by individual user
 * - organization: Connection shared across organization
 */
export const connectionScopeEnum = pgEnum('connection_scope', ['user', 'organization']);

/**
 * Connections table - End-user connections to services
 * Links users or organizations to third-party services
 */
export const connections = pgTable(
  'connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Scope determines ownership: user-level or organization-level
    scope: connectionScopeEnum('scope').notNull().default('user'),

    // Owner references - one of these must be set based on scope
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),

    // External user ID from the SaaS application (for user-scoped connections)
    externalUserId: text('external_user_id'),

    // Service being connected
    serviceId: text('service_id')
      .references(() => services.id, { onDelete: 'cascade' })
      .notNull(),

    // Connection status
    status: text('status', {
      enum: ['pending', 'connected', 'expired', 'error'],
    })
      .default('pending')
      .notNull(),

    // Encrypted credentials (AES-256-GCM)
    credentialsEnc: text('credentials_enc'),

    // Additional metadata
    metadata: jsonb('metadata').default({}).notNull(),

    // Timestamps
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: one connection per user/service or org/service
    uniqueUserService: unique('unique_user_service').on(table.userId, table.serviceId),
    uniqueOrgService: unique('unique_org_service').on(table.organizationId, table.serviceId),
  })
);

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type ConnectionStatus = Connection['status'];
export type ConnectionScope = Connection['scope'];

import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

/**
 * API Keys table - Authentication keys for accessing Authlane API
 * Each organization can have multiple API keys with different scopes
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Organization that owns this API key
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Display name for the key
    name: text('name').notNull(),

    // Hashed key (SHA-256)
    keyHash: text('key_hash').notNull().unique(),

    // Last 4 characters of the key (for display)
    keyHint: text('key_hint').notNull(),

    // Scopes granted to this key
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),

    // Key status
    enabled: boolean('enabled').default(true).notNull(),

    // Optional expiration
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // Usage tracking
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('api_keys_organization_enabled_idx').on(table.organizationId, table.enabled)]
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

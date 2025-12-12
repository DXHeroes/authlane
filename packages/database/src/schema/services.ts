import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Services table - Available services for connection
 * Defines all third-party services that can be connected (GitHub, Slack, etc.)
 */
export const services = pgTable('services', {
  id: text('id').primaryKey(), // e.g., "github", "slack"
  name: text('name').notNull(),
  authType: text('auth_type').notNull(), // "oauth2", "api_key", "header"
  config: jsonb('config').notNull(), // OAuth URLs, scopes, etc.
  enabled: boolean('enabled').default(true).notNull(),
});

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;








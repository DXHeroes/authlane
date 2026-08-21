import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Services table - Available services for connection
 * Defines all third-party services that can be connected (GitHub, Slack, etc.)
 *
 * The display columns exist so a consuming application can render a service without carrying its
 * own map from service id to logo and copy. They are nullable rather than defaulted to the empty
 * string: the demo provider is inserted without branding, and `NULL` and `''` would otherwise both
 * have to mean "absent".
 */
export const services = pgTable('services', {
  id: text('id').primaryKey(), // e.g., "github", "slack"
  name: text('name').notNull(),
  authType: text('auth_type').notNull(), // "oauth2", "api_key", "header"
  config: jsonb('config').notNull(), // OAuth URLs, scopes, etc.
  enabled: boolean('enabled').default(true).notNull(),
  /** One sentence an end user reads before connecting. */
  description: text('description'),
  /** Path to the icon Authlane serves, e.g. "/service-icons/github.svg". Absolutized per request. */
  iconPath: text('icon_path'),
  /** The provider's mark colour, lowercase hex, shown behind the initials when no icon loads. */
  brandColor: text('brand_color'),
  /** One or two characters standing in for the icon. Derived from the name when this is null. */
  initials: text('initials'),
  /** A value of ServiceCategory, so a picker can group and filter what it lists. */
  category: text('category'),
});

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;

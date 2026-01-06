import { boolean, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { services } from './services.js';

/**
 * Organization Services table - Organization-specific service configurations
 * Allows organizations to configure their own OAuth apps, API keys, or customize service settings
 */
export const organizationServices = pgTable(
  'organization_services',
  {
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    serviceId: text('service_id')
      .references(() => services.id, { onDelete: 'cascade' })
      .notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    // OAuth credentials
    oauthClientId: text('oauth_client_id'), // Optional: organization's own OAuth app
    oauthClientSecretEnc: text('oauth_client_secret_enc'), // Encrypted client secret
    customScopes: text('custom_scopes').array(), // Custom OAuth scopes
    // API Key credential
    apiKeyEnc: text('api_key_enc'), // Encrypted API key for api_key auth type services
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.serviceId] }),
  })
);

export type OrganizationService = typeof organizationServices.$inferSelect;
export type NewOrganizationService = typeof organizationServices.$inferInsert;

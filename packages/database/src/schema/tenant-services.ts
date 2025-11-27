import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { services } from './services.js';
import { tenants } from './tenants.js';

/**
 * Tenant Services table - Tenant-specific service configurations
 * Allows tenants to configure their own OAuth apps or customize service settings
 */
export const tenantServices = pgTable(
  'tenant_services',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    serviceId: text('service_id')
      .references(() => services.id, { onDelete: 'cascade' })
      .notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    oauthClientId: text('oauth_client_id'), // Optional: tenant's own OAuth app
    oauthClientSecretEnc: text('oauth_client_secret_enc'), // Encrypted client secret
    customScopes: text('custom_scopes').array(), // Custom OAuth scopes
  },
  (table) => ({
    pk: { primaryKey: { columns: [table.tenantId, table.serviceId] } },
  })
);

export type TenantService = typeof tenantServices.$inferSelect;
export type NewTenantService = typeof tenantServices.$inferInsert;

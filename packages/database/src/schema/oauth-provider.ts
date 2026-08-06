/**
 * OAuth 2.1 authorization-server tables for better-auth's oidc-provider plugin.
 *
 * These are auth-plane tables, like `user` and `session`: they describe who Authlane itself lets in,
 * not tenant data, so they carry no RLS policy. `authlane_runtime` reaches them through the
 * `ALTER DEFAULT PRIVILEGES` block at the end of sql/roles.sql — the `GRANT ON ALL TABLES` above it
 * is point-in-time and does not cover a table created later. No background job touches them.
 *
 * The export names are load-bearing. The Drizzle adapter resolves a plugin model by looking up its
 * `modelName` as a key on the schema barrel, so `oauthApplication`, `oauthAccessToken`, and
 * `oauthConsent` must stay spelled exactly as the plugin declares them
 * (better-auth/dist/plugins/oidc-provider/schema.mjs).
 */

import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';

/**
 * A downstream OAuth client registered against Authlane.
 *
 * `redirectUrls` is one comma-separated string rather than an array, because that is how the plugin
 * writes and reads it (`body.redirect_uris.join(',')` on registration, `.split(',')` on lookup).
 * Storing it as a Postgres array would leave the plugin parsing a stringified array.
 *
 * `organizationId` is ours, not the plugin's. It ties a client to the workspace that registered it,
 * so a tenant only ever manages its own clients. The plugin never writes this column — its adapter
 * drops any field absent from its own schema — so every client row has to be created by Authlane's
 * own code. That is why the column can be NOT NULL: the plugin's `/oauth2/register` endpoint would
 * fail against it, and dynamic client registration must stay disabled.
 */
export const oauthApplication = pgTable(
  'oauth_application',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    icon: text('icon'),
    metadata: text('metadata'),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    redirectUrls: text('redirect_urls').notNull(),
    type: text('type').notNull(),
    disabled: boolean('disabled').notNull().default(false),
    // The organization owns the client; the registering user is incidental, so deleting them must
    // not cascade away the workspace's client, its tokens, and its consents.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('oauth_application_user_id_idx').on(table.userId),
    index('oauth_application_organization_id_idx').on(table.organizationId),
  ]
);

/**
 * Access and refresh tokens issued to a client.
 *
 * `clientId` references `oauth_application.client_id`, not its primary key — the plugin looks a
 * token's client up by the public client id it received on the token request.
 */
export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    accessToken: text('access_token').notNull().unique(),
    refreshToken: text('refresh_token').notNull().unique(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }).notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    scopes: text('scopes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('oauth_access_token_client_id_idx').on(table.clientId),
    index('oauth_access_token_user_id_idx').on(table.userId),
  ]
);

/**
 * A user's consent to a client's requested scopes, so the consent screen is shown once.
 */
export const oauthConsent = pgTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scopes: text('scopes').notNull(),
    consentGiven: boolean('consent_given').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('oauth_consent_client_id_idx').on(table.clientId),
    index('oauth_consent_user_id_idx').on(table.userId),
  ]
);

export type OAuthApplication = typeof oauthApplication.$inferSelect;
export type NewOAuthApplication = typeof oauthApplication.$inferInsert;
export type OAuthAccessToken = typeof oauthAccessToken.$inferSelect;
export type NewOAuthAccessToken = typeof oauthAccessToken.$inferInsert;
export type OAuthConsent = typeof oauthConsent.$inferSelect;
export type NewOAuthConsent = typeof oauthConsent.$inferInsert;

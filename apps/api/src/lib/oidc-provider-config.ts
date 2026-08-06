/**
 * Authlane's OAuth 2.1 / OpenID Connect authorization-server surface.
 *
 * A downstream SaaS pairs a user identity against an Authlane workspace with authorization code +
 * PKCE, then reads `/oauth2/userinfo` for the `workspace` claim. This module holds everything that
 * shapes that surface so `auth.ts` stays a list of plugins.
 *
 * The plugin is deprecated in better-auth 1.6.25 in favour of `@better-auth/oauth-provider`. v1
 * ships on it knowingly; `__skipDeprecationWarning` keeps the runtime warning out of the logs so it
 * does not fire on every process start. Revisit when the replacement package is stable.
 */

import { decryptOAuthClientSecret, encryptOAuthClientSecret } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { oidcProvider } from 'better-auth/plugins';
import { createWorkspaceClaimResolver } from './oauth-workspace-claims.js';

/**
 * Rate limits for the authorization-server endpoints.
 *
 * The `/api/v1` limiter does not see `/api/auth/*`, so the token and authorize endpoints would
 * otherwise fall back to better-auth's global 60/minute. Keys are relative to the auth base path.
 */
export const oidcProviderRateLimitRules = {
  '/oauth2/token': { window: 60, max: 10 },
  '/oauth2/authorize': { window: 60, max: 30 },
} as const;

/**
 * Builds the oidc-provider plugin.
 *
 * Dynamic client registration stays off. `oauth_application.organization_id` is NOT NULL and the
 * plugin's adapter drops fields absent from its own schema, so `/oauth2/register` could only ever
 * violate that constraint. Clients are created by Authlane's own dashboard code instead.
 *
 * `offline_access` is left out of `scopes` because Authlane does not issue refresh tokens for
 * pairing. Note that the plugin unions its own defaults over this list, so the scope remains
 * requestable — see the note in the AL-2 report.
 */
export function createOidcProviderPlugin(db: Database): ReturnType<typeof oidcProvider> {
  return oidcProvider({
    __skipDeprecationWarning: true,
    loginPage: '/login',
    consentPage: '/oauth/consent',
    scopes: ['openid', 'profile', 'email'],
    defaultScope: 'openid',
    requirePKCE: true,
    allowPlainCodeChallengeMethod: false,
    allowDynamicClientRegistration: false,
    accessTokenExpiresIn: 600,
    codeExpiresIn: 600,
    storeClientSecret: {
      encrypt: (clientSecret: string) => encryptOAuthClientSecret(clientSecret),
      decrypt: (clientSecret: string) => decryptOAuthClientSecret(clientSecret),
    },
    getAdditionalUserInfoClaim: createWorkspaceClaimResolver(db),
  });
}

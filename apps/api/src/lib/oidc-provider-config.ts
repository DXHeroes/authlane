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

import {
  EnvelopeSecretVault,
  getDataKekKeyring,
  type SealedSecret,
  type SecretVault,
} from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { oidcProvider } from 'better-auth/plugins';
import { createWorkspaceClaimResolver } from './oauth-workspace-claims.js';

const SECRET_ENVELOPE_PREFIX = 'authlane.oidc.v1.';

/**
 * The context an OAuth client secret is sealed under.
 *
 * The plugin's `storeClientSecret` hooks are `(secret: string) => Promise<string>`: they receive
 * nothing that identifies the row, so the envelope's authenticated data can only separate this
 * domain from every other use of the data KEK ring. It cannot bind a ciphertext to one client, so
 * moving a sealed secret between `oauth_application` rows is not detected by the envelope itself —
 * only by the unique constraint on `client_id`.
 */
const CLIENT_SECRET_CONTEXT = {
  id: 'oidc-provider-client-secret',
  organizationId: 'authlane-auth-plane',
  purpose: 'oauth_client_secret',
} as const;

/** The envelope fields that are not already fixed by CLIENT_SECRET_CONTEXT. */
type StoredEnvelope = Omit<SealedSecret, 'id' | 'organizationId' | 'purpose'>;

const ENVELOPE_FIELDS = [
  'keyId',
  'wrappedDek',
  'wrappedDekIv',
  'wrappedDekTag',
  'ciphertext',
  'payloadIv',
  'payloadTag',
  'aadVersion',
] as const;

function isStoredEnvelope(value: unknown): value is StoredEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ENVELOPE_FIELDS.every((field) =>
    field === 'aadVersion' ? typeof record[field] === 'number' : typeof record[field] === 'string'
  );
}

let cachedVault: SecretVault | undefined;

function clientSecretVault(): SecretVault {
  cachedVault ??= new EnvelopeSecretVault(getDataKekKeyring());
  return cachedVault;
}

/**
 * Seals an OAuth client secret for storage in `oauth_application.client_secret`.
 *
 * Exported so whatever registers a client writes the column in the one format the token endpoint
 * can read back.
 */
export async function encryptOAuthClientSecret(
  clientSecret: string,
  vault: SecretVault = clientSecretVault()
): Promise<string> {
  const sealed = await vault.seal({
    ...CLIENT_SECRET_CONTEXT,
    plaintext: new TextEncoder().encode(clientSecret),
  });
  const envelope: StoredEnvelope = {
    keyId: sealed.keyId,
    wrappedDek: sealed.wrappedDek,
    wrappedDekIv: sealed.wrappedDekIv,
    wrappedDekTag: sealed.wrappedDekTag,
    ciphertext: sealed.ciphertext,
    payloadIv: sealed.payloadIv,
    payloadTag: sealed.payloadTag,
    aadVersion: sealed.aadVersion,
  };
  return `${SECRET_ENVELOPE_PREFIX}${Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url')}`;
}

/** Recovers a client secret sealed by {@link encryptOAuthClientSecret}. */
export async function decryptOAuthClientSecret(
  stored: string,
  vault: SecretVault = clientSecretVault()
): Promise<string> {
  if (!stored.startsWith(SECRET_ENVELOPE_PREFIX)) {
    throw new Error('Stored OAuth client secret is not in the expected envelope format');
  }
  const decoded = Buffer.from(stored.slice(SECRET_ENVELOPE_PREFIX.length), 'base64url').toString(
    'utf8'
  );
  let envelope: unknown;
  try {
    envelope = JSON.parse(decoded);
  } catch {
    throw new Error('Stored OAuth client secret envelope is not valid JSON');
  }
  if (!isStoredEnvelope(envelope)) {
    throw new Error('Stored OAuth client secret envelope is missing required fields');
  }
  const plaintext = await vault.open(
    { ...CLIENT_SECRET_CONTEXT, ...envelope },
    CLIENT_SECRET_CONTEXT
  );
  return plaintext.toString('utf8');
}

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

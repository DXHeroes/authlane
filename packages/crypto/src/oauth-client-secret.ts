/**
 * The sealed storage format for `oauth_application.client_secret`.
 *
 * Everything that registers an OAuth client writes this format and better-auth's oidc-provider
 * plugin reads it back on every token request, so a change that only looks cosmetic — the prefix,
 * the field list, the encoding — locks every existing client out of token exchange.
 *
 * It lives in @authlane/crypto rather than beside the plugin configuration because two callers in
 * different layers need the one implementation: the API app, which hands the pair to the plugin's
 * `storeClientSecret` hooks, and the database package, which seeds a local development client.
 */

import { getDataKekKeyring } from './keyring.js';
import { EnvelopeSecretVault, type SealedSecret, type SecretVault } from './secret-vault.js';

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

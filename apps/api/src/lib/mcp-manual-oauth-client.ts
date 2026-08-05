/**
 * The OAuth client a tenant registered with a provider themselves.
 *
 * Dynamic registration (RFC 7591) covers the servers that offer it, but two kinds never will: one
 * that publishes no registration endpoint at all, and one that publishes it beside its MCP host
 * rather than on it. Until now both were dead ends — `resolveMcpAuthorization` answers "not ready"
 * without a client id, and nothing but registration could write one, so every user hit the same
 * 409 with no way for the tenant to act on it.
 *
 * Only the client id and secret come from the tenant. Endpoints stay whatever discovery read from
 * the server and checked against its host.
 */

import {
  clearMcpOAuthClient,
  type Database,
  type SecretStore,
  saveMcpOAuthClient,
} from '@authlane/database';
import type { McpOAuthClientSecretChange } from './mcp-server-input.js';

export interface ManualOAuthClientOutcome {
  clientId: string | null;
  clientSecretId: string | null;
  /** What the server had before, so the caller can tell a rotation from a replacement. */
  previousClientId: string | null;
}

interface ExistingClient {
  oauthClientId: string | null;
  oauthClientSecretId: string | null;
}

/**
 * Seals a secret the same way dynamic registration does.
 *
 * Reuses the record id when one exists, so rotating a secret replaces it rather than leaving the
 * old ciphertext alive to be re-wrapped by every future key rotation.
 */
async function sealSecret(
  secretStore: SecretStore,
  organizationId: string,
  value: string,
  existingId: string | null
): Promise<string> {
  const plaintext = Buffer.from(value, 'utf8');
  try {
    return await secretStore.put({
      organizationId,
      purpose: 'oauth_client_secret',
      plaintext,
      ...(existingId ? { id: existingId } : {}),
    });
  } finally {
    // The secret never outlives this block in plaintext.
    plaintext.fill(0);
  }
}

/** Drops a secret record that nothing points at any more. */
async function forgetSecret(
  secretStore: SecretStore,
  organizationId: string,
  secretId: string | null
): Promise<void> {
  if (!secretId) return;
  await secretStore.delete?.(secretId, organizationId, 'oauth_client_secret');
}

export async function saveManualMcpOAuthClient(
  db: Database,
  secretStore: SecretStore,
  input: {
    serverId: string;
    organizationId: string;
    clientId: string;
    secret: McpOAuthClientSecretChange;
    existing: ExistingClient;
  }
): Promise<ManualOAuthClientOutcome> {
  const previousClientId = input.existing.oauthClientId;
  const previousSecretId = input.existing.oauthClientSecretId;

  let clientSecretId: string | null = previousSecretId;

  if (input.secret.kind === 'set') {
    clientSecretId = await sealSecret(
      secretStore,
      input.organizationId,
      input.secret.value,
      previousSecretId
    );
  } else if (input.secret.kind === 'public') {
    clientSecretId = null;
  }

  await saveMcpOAuthClient(db, input.serverId, {
    clientId: input.clientId,
    clientSecretId,
    source: 'manual',
  });

  // Only after the column no longer points at it. A crash between the two leaves an orphaned
  // record, which is recoverable; the reverse leaves a connection pointing at nothing.
  if (input.secret.kind === 'public') {
    await forgetSecret(secretStore, input.organizationId, previousSecretId);
  }

  return { clientId: input.clientId, clientSecretId, previousClientId };
}

export async function removeMcpOAuthClient(
  db: Database,
  secretStore: SecretStore,
  input: { serverId: string; organizationId: string; existing: ExistingClient }
): Promise<ManualOAuthClientOutcome> {
  const previousClientId = input.existing.oauthClientId;

  await clearMcpOAuthClient(db, input.serverId);
  await forgetSecret(secretStore, input.organizationId, input.existing.oauthClientSecretId);

  return { clientId: null, clientSecretId: null, previousClientId };
}

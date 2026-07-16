import {
  EnvelopeSecretVault,
  getDataKekKeyring,
  type SealedSecret,
  type SecretVault,
} from '@authlane/crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { secretRecords } from './schema/index.js';

export type SecretPurpose =
  | 'connection_credentials'
  | 'oauth_client_secret'
  | 'service_api_key'
  | 'oauth_pkce_verifier'
  | 'webhook_signing_secret';

export interface PutSecretInput {
  id?: string;
  organizationId: string;
  purpose: SecretPurpose;
  plaintext: Uint8Array;
}

export interface SecretStore {
  put(input: PutSecretInput): Promise<string>;
  read(id: string, organizationId: string, purpose: SecretPurpose): Promise<Buffer>;
  rewrap(id: string, organizationId: string, purpose: SecretPurpose): Promise<void>;
}

function toSealedSecret(row: typeof secretRecords.$inferSelect): SealedSecret {
  return {
    id: row.id,
    organizationId: row.organizationId,
    purpose: row.purpose,
    keyId: row.keyId,
    wrappedDek: row.wrappedDek,
    wrappedDekIv: row.wrappedDekIv,
    wrappedDekTag: row.wrappedDekTag,
    ciphertext: row.ciphertext,
    payloadIv: row.payloadIv,
    payloadTag: row.payloadTag,
    aadVersion: row.aadVersion,
  };
}

function persistenceFields(sealed: SealedSecret) {
  return {
    id: sealed.id,
    organizationId: sealed.organizationId,
    purpose: sealed.purpose,
    keyId: sealed.keyId,
    wrappedDek: sealed.wrappedDek,
    wrappedDekIv: sealed.wrappedDekIv,
    wrappedDekTag: sealed.wrappedDekTag,
    ciphertext: sealed.ciphertext,
    payloadIv: sealed.payloadIv,
    payloadTag: sealed.payloadTag,
    aadVersion: sealed.aadVersion,
    updatedAt: new Date(),
  };
}

export class DatabaseSecretStore implements SecretStore {
  constructor(
    private readonly db: Database,
    private readonly vault: SecretVault,
    private readonly createId: () => string = crypto.randomUUID
  ) {}

  async put(input: PutSecretInput): Promise<string> {
    const id = input.id ?? this.createId();
    const sealed = await this.vault.seal({
      id,
      organizationId: input.organizationId,
      purpose: input.purpose,
      plaintext: input.plaintext,
    });
    await this.db
      .insert(secretRecords)
      .values(persistenceFields(sealed))
      .onConflictDoUpdate({
        target: secretRecords.id,
        set: persistenceFields(sealed),
      })
      .returning({ id: secretRecords.id });
    return id;
  }

  async read(id: string, organizationId: string, purpose: SecretPurpose): Promise<Buffer> {
    const [row] = await this.db
      .select()
      .from(secretRecords)
      .where(
        and(
          eq(secretRecords.id, id),
          eq(secretRecords.organizationId, organizationId),
          eq(secretRecords.purpose, purpose)
        )
      )
      .limit(1);
    if (!row) throw new Error('Secret record was not found in the expected security context');
    return this.vault.open(toSealedSecret(row), { id, organizationId, purpose });
  }

  async rewrap(id: string, organizationId: string, purpose: SecretPurpose): Promise<void> {
    const [row] = await this.db
      .select()
      .from(secretRecords)
      .where(
        and(
          eq(secretRecords.id, id),
          eq(secretRecords.organizationId, organizationId),
          eq(secretRecords.purpose, purpose)
        )
      )
      .limit(1);
    if (!row) throw new Error('Secret record was not found in the expected security context');
    const rewrapped = await this.vault.rewrap(toSealedSecret(row), { id, organizationId, purpose });
    await this.db
      .update(secretRecords)
      .set(persistenceFields(rewrapped))
      .where(
        and(
          eq(secretRecords.id, id),
          eq(secretRecords.organizationId, organizationId),
          eq(secretRecords.purpose, purpose)
        )
      );
  }
}

export function createDatabaseSecretStore(db: Database): DatabaseSecretStore {
  return new DatabaseSecretStore(db, new EnvelopeSecretVault(getDataKekKeyring()));
}

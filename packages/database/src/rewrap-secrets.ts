import { getDataKekKeyring } from '@authlane/crypto';
import { ne } from 'drizzle-orm';
import { createDatabaseClient } from './client.js';
import { secretRecords } from './schema/index.js';
import { createDatabaseSecretStore, type SecretPurpose } from './secret-store.js';

const databaseUrl = process.env.SYSTEM_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'SYSTEM_DATABASE_URL is required to rewrap secrets with the isolated worker role'
  );
}

const keyring = getDataKekKeyring();
const db = createDatabaseClient(databaseUrl);
const store = createDatabaseSecretStore(db);
let rewrapped = 0;

for (;;) {
  const records = await db
    .select({
      id: secretRecords.id,
      organizationId: secretRecords.organizationId,
      purpose: secretRecords.purpose,
    })
    .from(secretRecords)
    .where(ne(secretRecords.keyId, keyring.currentKeyId))
    .limit(100);

  if (records.length === 0) break;
  for (const record of records) {
    await store.rewrap(record.id, record.organizationId, record.purpose as SecretPurpose);
    rewrapped += 1;
  }
}

process.stdout.write(`Rewrapped ${rewrapped} secret records to ${keyring.currentKeyId}.\n`);
process.exit(0);

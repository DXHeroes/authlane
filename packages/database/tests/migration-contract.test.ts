import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '../drizzle/0000_dashing_kat_farrell.sql'),
  'utf8'
);

describe('control-plane migration', () => {
  it('enables organization RLS on every tenant-owned table', () => {
    for (const table of [
      'api_keys',
      'credential_access_logs',
      'connect_sessions',
      'connections',
      'organization_services',
      'outbox_events',
      'secret_records',
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`CREATE POLICY "${table}_tenant_isolation"`);
    }
    expect(migration).toContain("current_setting('authlane.organization_id', true)");
  });

  it('creates the envelope secret store without legacy credential ciphertext columns', () => {
    expect(migration).toContain('CREATE TABLE "secret_records"');
    expect(migration).toContain('"credential_secret_id" text');
    expect(migration).not.toContain('"credentials_enc" text');
    expect(migration).not.toContain('"oauth_client_secret_enc" text');
    expect(migration).not.toContain('"api_key_enc" text');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '../drizzle/0000_dashing_kat_farrell.sql'),
  'utf8'
);
const oauthMigration = readFileSync(
  join(import.meta.dirname, '../drizzle/0002_unique_penance.sql'),
  'utf8'
);
const toolPolicyMigration = readFileSync(
  join(import.meta.dirname, '../drizzle/0003_lyrical_quasar.sql'),
  'utf8'
);
const microsoftGraphMigration = readFileSync(
  join(import.meta.dirname, '../drizzle/0004_microsoft_graph_reconnect.sql'),
  'utf8'
);
const sandboxMigration = readFileSync(
  join(import.meta.dirname, '../drizzle/0005_adorable_wolfsbane.sql'),
  'utf8'
);
const roles = readFileSync(join(import.meta.dirname, '../sql/roles.sql'), 'utf8');

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

  it('supports narrow pre-auth lookups and tenant-context OAuth transactions', () => {
    expect(oauthMigration).toContain('ALTER TABLE "oauth_transactions" FORCE ROW LEVEL SECURITY');
    expect(oauthMigration).toContain('"api_keys_authentication_lookup"');
    expect(oauthMigration).toContain('"connect_sessions_authentication_lookup"');
    expect(oauthMigration).toContain('"oauth_transactions_state_consume"');
  });

  it('keeps the runtime role under RLS and makes credential audit rows append-only', () => {
    expect(roles).toContain('authlane_runtime');
    expect(roles).toContain('NOBYPASSRLS');
    expect(oauthMigration).toContain('credential_access_logs_append_only');
  });

  it('creates the envelope secret store without legacy credential ciphertext columns', () => {
    expect(migration).toContain('CREATE TABLE "secret_records"');
    expect(migration).toContain('"credential_secret_id" text');
    expect(migration).not.toContain('"credentials_enc" text');
    expect(migration).not.toContain('"oauth_client_secret_enc" text');
    expect(migration).not.toContain('"api_key_enc" text');
  });

  it('defaults newly enabled services to read-only while preserving existing tenant behavior', () => {
    expect(toolPolicyMigration).toContain(
      '"tool_access_policy" text DEFAULT \'read_only\' NOT NULL'
    );
    expect(toolPolicyMigration).toContain('SET "tool_access_policy" = \'full\'');
    expect(toolPolicyMigration).toContain("\"tool_access_policy\" in ('read_only', 'full')");
  });

  it('invalidates legacy Microsoft credentials before Graph-only execution is enabled', () => {
    for (const serviceId of ['microsoft-mail', 'microsoft-calendar', 'microsoft-sharepoint']) {
      expect(microsoftGraphMigration).toContain(`'${serviceId}'`);
    }
    expect(microsoftGraphMigration).toContain('microsoft_graph_reconnect_required');
    expect(microsoftGraphMigration).toContain('"credential_secret_id" = NULL');
    expect(microsoftGraphMigration).toContain('DELETE FROM "secret_records"');
    expect(microsoftGraphMigration).toContain('sr."purpose" = \'connection_credentials\'');
  });

  it('keeps sandbox audit metadata inside tenant RLS', () => {
    expect(sandboxMigration).toContain('CREATE TABLE "sandbox_runs"');
    expect(sandboxMigration).toContain('ALTER TABLE "sandbox_runs" ENABLE ROW LEVEL SECURITY');
    expect(sandboxMigration).toContain('ALTER TABLE "sandbox_runs" FORCE ROW LEVEL SECURITY');
    expect(sandboxMigration).toContain('CREATE POLICY "sandbox_runs_tenant_isolation"');
  });
});

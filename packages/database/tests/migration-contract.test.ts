import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '../drizzle/0000_milky_bishop.sql'),
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
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`CREATE POLICY "${table}_tenant_isolation"`);
    }
    expect(migration).toContain("current_setting('authlane.organization_id', true)");
  });
});

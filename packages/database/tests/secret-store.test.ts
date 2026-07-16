import { EnvelopeSecretVault, parseKeyring } from '@authlane/crypto';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseSecretStore } from '../src/secret-store.js';

function databaseFor(row?: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([{ id: row?.id ?? 'secret_1' }]);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    db: { insert, select } as never,
    values,
  };
}

const vault = new EnvelopeSecretVault(parseKeyring(`test-kek:${'42'.repeat(32)}`));

describe('database secret store', () => {
  it('persists only the sealed envelope and returns its opaque id', async () => {
    const { db, values } = databaseFor();
    const store = new DatabaseSecretStore(db, vault, () => 'secret_1');

    await expect(
      store.put({
        organizationId: 'org_1',
        purpose: 'connection_credentials',
        plaintext: Buffer.from('database-must-not-see-this'),
      })
    ).resolves.toBe('secret_1');

    const persisted = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(persisted.id).toBe('secret_1');
    expect(persisted.keyId).toBe('test-kek');
    expect(JSON.stringify(persisted)).not.toContain('database-must-not-see-this');
  });

  it('opens a record only for its organization and purpose', async () => {
    const sealed = await vault.seal({
      id: 'secret_1',
      organizationId: 'org_1',
      purpose: 'connection_credentials',
      plaintext: Buffer.from('access-token'),
    });
    const { db } = databaseFor({
      ...sealed,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const store = new DatabaseSecretStore(db, vault);

    await expect(store.read('secret_1', 'org_1', 'connection_credentials')).resolves.toEqual(
      Buffer.from('access-token')
    );
    await expect(store.read('secret_1', 'org_2', 'connection_credentials')).rejects.toThrow();
  });
});

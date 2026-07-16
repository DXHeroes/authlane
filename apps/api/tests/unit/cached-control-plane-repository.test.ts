import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from '../../src/lib/cache.js';
import { CachedControlPlaneRepository } from '../../src/lib/control-plane-repository.js';

describe('CachedControlPlaneRepository', () => {
  it('caches tenant policy for five minutes and raw connections for thirty seconds', async () => {
    let now = 1_000;
    const source = {
      listTenantServices: vi.fn().mockResolvedValue([{ id: 'github' }]),
      listConnections: vi.fn().mockResolvedValue([{ id: 'connection_1' }]),
      getConnection: vi.fn(),
      auditCredentialAccess: vi.fn(),
    };
    const repository = new CachedControlPlaneRepository(
      source as never,
      new MemoryCacheStore(() => now)
    );

    await repository.listTenantServices('org_1');
    await repository.listTenantServices('org_1');
    await repository.listConnections('org_1', 'user_1');
    await repository.listConnections('org_1', 'user_1');
    expect(source.listTenantServices).toHaveBeenCalledTimes(1);
    expect(source.listConnections).toHaveBeenCalledTimes(1);

    now += 31_000;
    await repository.listTenantServices('org_1');
    await repository.listConnections('org_1', 'user_1');
    expect(source.listTenantServices).toHaveBeenCalledTimes(1);
    expect(source.listConnections).toHaveBeenCalledTimes(2);
  });
});

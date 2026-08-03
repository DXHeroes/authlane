import { SUPPORTED_SERVICE_IDS } from '@authlane/shared';
import { describe, expect, it, vi } from 'vitest';
import { productionServices } from '../src/seed.js';
import { SUPPORTED_SERVICE_CATALOG, seedServiceCatalog } from '../src/service-catalog.js';

describe('production service catalog', () => {
  it('contains exactly the installed integrations', () => {
    expect(SUPPORTED_SERVICE_CATALOG.map((service) => service.id).sort()).toEqual([
      ...SUPPORTED_SERVICE_IDS,
    ]);
  });

  it('keeps the legacy seed command on the same supported catalog', () => {
    expect(productionServices.map((service) => service.id).sort()).toEqual([
      ...SUPPORTED_SERVICE_IDS,
    ]);
  });

  it('only exposes service upserts to the production seeder', async () => {
    const upsertService = vi.fn(async () => undefined);

    await seedServiceCatalog({ upsertService });

    expect(upsertService).toHaveBeenCalledTimes(SUPPORTED_SERVICE_IDS.length);
    expect(upsertService.mock.calls.map(([service]) => service.id).sort()).toEqual([
      ...SUPPORTED_SERVICE_IDS,
    ]);
  });
});

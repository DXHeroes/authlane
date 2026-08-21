import { isServiceCategory, SUPPORTED_SERVICE_IDS } from '@authlane/shared';
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
  it('gives every seeded service what a consumer needs to render it', () => {
    for (const service of SUPPORTED_SERVICE_CATALOG) {
      expect(service.description.length).toBeGreaterThan(0);
      expect(service.description.length).toBeLessThanOrEqual(140);
      if (service.brandColor !== null) {
        expect(service.brandColor).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(service.initials).toMatch(/^[A-Z0-9]{1,2}$/);
      expect(isServiceCategory(service.category)).toBe(true);
    }
  });

  it('points every icon path at the file named by the same service id', () => {
    // The route serves `integrations/<id>/icon.svg` under this exact path. A second spelling here
    // would be a 404 that only shows up as a missing logo in someone else's product.
    for (const service of SUPPORTED_SERVICE_CATALOG) {
      expect(service.iconPath).toBe(`/service-icons/${service.id}.svg`);
    }
  });
});

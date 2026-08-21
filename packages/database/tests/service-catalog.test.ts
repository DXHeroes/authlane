import { hasServiceIcon, isServiceCategory, SUPPORTED_SERVICE_IDS } from '@authlane/shared';
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

  it('points an icon path at a mark that exists, and at nothing when none does', () => {
    // The route serves `integrations/<id>/icon.svg` under this exact path, so a second spelling
    // would be a 404 that only shows up as a missing logo in someone else's product. A service
    // Authlane ships no mark for gets null instead: a consumer reading a non-null iconUrl is
    // promised a mark, and should not have to spend a request discovering there is none.
    for (const service of SUPPORTED_SERVICE_CATALOG) {
      expect(service.iconPath).toBe(
        hasServiceIcon(service.id) ? `/service-icons/${service.id}.svg` : null
      );
    }
  });
});

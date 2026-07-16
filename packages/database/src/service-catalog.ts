import { SUPPORTED_SERVICE_IDS } from '@authlane/shared';
import { productionServices } from './seed.js';

export type SupportedServiceCatalogEntry = (typeof productionServices)[number];

export interface ServiceCatalogStore {
  upsertService(service: SupportedServiceCatalogEntry): Promise<void>;
}

const supportedServiceIds = new Set<string>(SUPPORTED_SERVICE_IDS);

export const SUPPORTED_SERVICE_CATALOG = productionServices.filter((service) =>
  supportedServiceIds.has(service.id)
);

if (SUPPORTED_SERVICE_CATALOG.length !== SUPPORTED_SERVICE_IDS.length) {
  throw new Error('The production service catalog does not match the installed integrations');
}

export async function seedServiceCatalog(store: ServiceCatalogStore): Promise<void> {
  for (const service of SUPPORTED_SERVICE_CATALOG) {
    await store.upsertService(service);
  }
}

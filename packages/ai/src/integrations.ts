import type { IntegrationAdapter, SupportedServiceId } from '@authlane/shared';

type IntegrationModule = {
  readonly default?: unknown;
  readonly adapter?: unknown;
};

type IntegrationImporter = () => Promise<IntegrationModule>;

const builtInIntegrationImporters = {
  airtable: () => import('@authlane/integration-airtable'),
  discord: () => import('@authlane/integration-discord'),
  github: () => import('@authlane/integration-github'),
  gmail: () => import('@authlane/integration-gmail'),
  'google-calendar': () => import('@authlane/integration-google-calendar'),
  'google-drive': () => import('@authlane/integration-google-drive'),
  hubspot: () => import('@authlane/integration-hubspot'),
  jira: () => import('@authlane/integration-jira'),
  linear: () => import('@authlane/integration-linear'),
  notion: () => import('@authlane/integration-notion'),
  pipedrive: () => import('@authlane/integration-pipedrive'),
  salesforce: () => import('@authlane/integration-salesforce'),
  sentry: () => import('@authlane/integration-sentry'),
  slack: () => import('@authlane/integration-slack'),
  stripe: () => import('@authlane/integration-stripe'),
} satisfies Record<SupportedServiceId, IntegrationImporter>;

export type IntegrationResolution =
  | { readonly status: 'found'; readonly integration: IntegrationAdapter }
  | { readonly status: 'not_found' }
  | { readonly status: 'load_failed' };

function snapshotIntegration(
  candidate: unknown,
  expectedServiceId?: string
): IntegrationAdapter | null {
  if ((typeof candidate !== 'object' && typeof candidate !== 'function') || candidate === null) {
    return null;
  }

  try {
    const serviceId = Reflect.get(candidate, 'serviceId');
    const execute = Reflect.get(candidate, 'execute');
    if (
      typeof serviceId !== 'string' ||
      serviceId.length === 0 ||
      (expectedServiceId !== undefined && serviceId !== expectedServiceId) ||
      typeof execute !== 'function'
    ) {
      return null;
    }
    const typedExecute = execute as IntegrationAdapter['execute'];
    const receiver = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(candidate)) {
      if (key === 'serviceId' || key === 'execute') {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !('value' in descriptor)) {
        continue;
      }
      const snapshotValue =
        key === 'definitions' && Array.isArray(descriptor.value)
          ? Object.freeze([...descriptor.value])
          : descriptor.value;
      Object.defineProperty(receiver, key, {
        value: snapshotValue,
        enumerable: descriptor.enumerable,
        configurable: false,
        writable: false,
      });
    }
    Object.defineProperties(receiver, {
      serviceId: { value: serviceId, enumerable: true },
      execute: { value: typedExecute, enumerable: true },
    });
    Object.freeze(receiver);

    return Object.freeze({
      serviceId,
      definitions: [],
      execute: (...args: Parameters<IntegrationAdapter['execute']>) =>
        typedExecute.apply(receiver, args),
    });
  } catch {
    return null;
  }
}

export function snapshotCustomIntegrations(
  integrations: readonly IntegrationAdapter[] | undefined
): ReadonlyMap<string, IntegrationAdapter> {
  const snapshots = new Map<string, IntegrationAdapter>();
  if (!Array.isArray(integrations)) {
    return snapshots;
  }

  for (const integration of integrations) {
    const snapshot = snapshotIntegration(integration);
    if (snapshot) {
      // A later explicit override deterministically replaces an earlier one.
      snapshots.set(snapshot.serviceId, snapshot);
    }
  }
  return snapshots;
}

const builtInIntegrationCache = new Map<string, Promise<IntegrationAdapter | null>>();

function loadBuiltInIntegration(
  serviceId: SupportedServiceId,
  importer: IntegrationImporter
): Promise<IntegrationAdapter | null> {
  const cached = builtInIntegrationCache.get(serviceId);
  if (cached) {
    return cached;
  }

  const pending = importer()
    .then((module) => {
      const primary = snapshotIntegration(module.default, serviceId);
      return primary ?? snapshotIntegration(module.adapter, serviceId);
    })
    .catch(() => null);
  builtInIntegrationCache.set(serviceId, pending);
  return pending;
}

export async function resolveIntegration(
  serviceId: string,
  customIntegrations: ReadonlyMap<string, IntegrationAdapter>
): Promise<IntegrationResolution> {
  const custom = customIntegrations.get(serviceId);
  if (custom) {
    return { status: 'found', integration: custom };
  }

  if (!Object.hasOwn(builtInIntegrationImporters, serviceId)) {
    return { status: 'not_found' };
  }

  const supportedServiceId = serviceId as SupportedServiceId;
  const importer = builtInIntegrationImporters[supportedServiceId];
  const integration = await loadBuiltInIntegration(supportedServiceId, importer);
  return integration ? { status: 'found', integration } : { status: 'load_failed' };
}

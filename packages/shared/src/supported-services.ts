export const SUPPORTED_SERVICE_IDS = [
  'airtable',
  'attio',
  'discord',
  'github',
  'gmail',
  'google-calendar',
  'google-drive',
  'hubspot',
  'jira',
  'linear',
  'microsoft-calendar',
  'microsoft-mail',
  'microsoft-sharepoint',
  'notion',
  'pipedrive',
  'salesforce',
  'slack',
  'stripe',
] as const;

export type SupportedServiceId = (typeof SUPPORTED_SERVICE_IDS)[number];

/** The local provider used by the turnkey demo. It never exists in a production catalog. */
export const DEMO_SERVICE_ID = 'authlane-demo';

export type AllowedServiceId = SupportedServiceId | typeof DEMO_SERVICE_ID;

const supportedServiceIdSet = new Set<string>(SUPPORTED_SERVICE_IDS);

function isDemoServiceEnabled(): boolean {
  return process.env.AUTHLANE_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

export function isSupportedServiceId(value: unknown): value is AllowedServiceId {
  if (typeof value !== 'string') return false;
  if (supportedServiceIdSet.has(value)) return true;
  return value === DEMO_SERVICE_ID && isDemoServiceEnabled();
}

/**
 * Strict catalog membership that never accepts the demo provider. Use it where the caller needs a
 * built-in integration contract, such as reading a service's canonical tool definitions.
 */
export function isBuiltInIntegrationId(value: unknown): value is SupportedServiceId {
  return typeof value === 'string' && supportedServiceIdSet.has(value);
}

/**
 * Service ids the control plane may read, list, and issue credentials for. Mirrors the demo gate
 * used by the OAuth endpoint allowlist so the turnkey demo provider stays visible while it runs.
 */
export function getAllowedServiceIds(): AllowedServiceId[] {
  return isDemoServiceEnabled()
    ? [...SUPPORTED_SERVICE_IDS, DEMO_SERVICE_ID]
    : [...SUPPORTED_SERVICE_IDS];
}

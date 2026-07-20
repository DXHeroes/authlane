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

const supportedServiceIdSet = new Set<string>(SUPPORTED_SERVICE_IDS);

export function isSupportedServiceId(value: unknown): value is SupportedServiceId {
  return typeof value === 'string' && supportedServiceIdSet.has(value);
}

export const SUPPORTED_SERVICE_IDS = [
  'airtable',
  'discord',
  'github',
  'gmail',
  'google-calendar',
  'google-drive',
  'hubspot',
  'jira',
  'linear',
  'notion',
  'pipedrive',
  'salesforce',
  'sentry',
  'slack',
  'stripe',
] as const;

export type SupportedServiceId = (typeof SUPPORTED_SERVICE_IDS)[number];

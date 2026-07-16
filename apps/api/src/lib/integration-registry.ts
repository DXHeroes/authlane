import {
  IntegrationRegistry,
  type IntegrationTools,
  type SupportedServiceId,
} from '@authlane/shared';

const integrationLoaders: Record<SupportedServiceId, () => Promise<IntegrationTools>> = {
  airtable: () => import('@authlane/integration-airtable/tools'),
  discord: () => import('@authlane/integration-discord/tools'),
  github: () => import('@authlane/integration-github/tools'),
  gmail: () => import('@authlane/integration-gmail/tools'),
  'google-calendar': () => import('@authlane/integration-google-calendar/tools'),
  'google-drive': () => import('@authlane/integration-google-drive/tools'),
  hubspot: () => import('@authlane/integration-hubspot/tools'),
  jira: () => import('@authlane/integration-jira/tools'),
  linear: () => import('@authlane/integration-linear/tools'),
  notion: () => import('@authlane/integration-notion/tools'),
  pipedrive: () => import('@authlane/integration-pipedrive/tools'),
  salesforce: () => import('@authlane/integration-salesforce/tools'),
  sentry: () => import('@authlane/integration-sentry/tools'),
  slack: () => import('@authlane/integration-slack/tools'),
  stripe: () => import('@authlane/integration-stripe/tools'),
};

export const integrationRegistry = new IntegrationRegistry(async (serviceId) => {
  const load = integrationLoaders[serviceId as SupportedServiceId];
  if (!load) throw new Error(`Integration package is not installed: ${serviceId}`);
  return load();
});

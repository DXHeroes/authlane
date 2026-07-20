import { describe, expect, it } from 'vitest';
import { isSupportedServiceId, SUPPORTED_SERVICE_IDS } from '../src/supported-services.js';

describe('supported service catalog', () => {
  it('publishes exactly the installed MVP integrations', () => {
    expect(SUPPORTED_SERVICE_IDS).toEqual([
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
    ]);
  });

  it('rejects catalog-only and syntactically valid unknown IDs', () => {
    expect(isSupportedServiceId('github')).toBe(true);
    expect(isSupportedServiceId('openai')).toBe(false);
    expect(isSupportedServiceId('unknown-service')).toBe(false);
  });
});

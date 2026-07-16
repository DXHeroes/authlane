import { describe, expect, it } from 'vitest';
import { SUPPORTED_SERVICE_IDS } from '../src/supported-services.js';

describe('supported service catalog', () => {
  it('publishes exactly the installed MVP integrations', () => {
    expect(SUPPORTED_SERVICE_IDS).toEqual([
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
    ]);
  });
});

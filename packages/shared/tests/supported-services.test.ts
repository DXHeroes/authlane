import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_SERVICE_ID,
  getAllowedServiceIds,
  isBuiltInIntegrationId,
  isConnectableServiceId,
  isSupportedServiceId,
  SUPPORTED_SERVICE_IDS,
} from '../src/supported-services.js';

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

describe('demo provider gating', () => {
  const demoMode = process.env.AUTHLANE_DEMO_MODE;
  const nodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.AUTHLANE_DEMO_MODE = demoMode;
    process.env.NODE_ENV = nodeEnv;
  });

  function setDemoMode(enabled: boolean, environment = 'development') {
    process.env.AUTHLANE_DEMO_MODE = enabled ? 'true' : 'false';
    process.env.NODE_ENV = environment;
  }

  it('keeps the demo provider out of the catalog by default', () => {
    setDemoMode(false);
    expect(getAllowedServiceIds()).toEqual([...SUPPORTED_SERVICE_IDS]);
    expect(isSupportedServiceId(DEMO_SERVICE_ID)).toBe(false);
  });

  it('admits the demo provider while the turnkey demo runs', () => {
    setDemoMode(true);
    expect(getAllowedServiceIds()).toEqual([...SUPPORTED_SERVICE_IDS, DEMO_SERVICE_ID]);
    expect(isSupportedServiceId(DEMO_SERVICE_ID)).toBe(true);
  });

  it('never admits the demo provider in production, even with the flag set', () => {
    setDemoMode(true, 'production');
    expect(getAllowedServiceIds()).toEqual([...SUPPORTED_SERVICE_IDS]);
    expect(isSupportedServiceId(DEMO_SERVICE_ID)).toBe(false);
  });

  it('excludes the demo provider from built-in integration contracts', () => {
    setDemoMode(true);
    expect(isBuiltInIntegrationId(DEMO_SERVICE_ID)).toBe(false);
    expect(isBuiltInIntegrationId('github')).toBe(true);
  });
});

describe('connectable service ids', () => {
  it('admits a tenant MCP server alongside the built-in catalog', () => {
    expect(isConnectableServiceId('github')).toBe(true);
    expect(isConnectableServiceId('mcp-6f1c2b3a-0000-4000-8000-000000000000')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isConnectableServiceId('openai')).toBe(false);
    expect(isConnectableServiceId('mcp')).toBe(false);
    expect(isConnectableServiceId('')).toBe(false);
    expect(isConnectableServiceId(null)).toBe(false);
  });

  it('keeps tenant ids out of the built-in union', () => {
    // isSupportedServiceId narrows to SupportedServiceId, which indexes compiled tool contracts.
    // A dynamic tenant id must never reach those lookups.
    expect(isSupportedServiceId('mcp-6f1c2b3a')).toBe(false);
    expect(isBuiltInIntegrationId('mcp-6f1c2b3a')).toBe(false);
  });
});

import { DEMO_SERVICE_ID, SUPPORTED_SERVICE_IDS } from '@authlane/shared';
import { describe, expect, it } from 'vitest';
import { integrationRegistry } from '../../src/lib/integration-registry.js';

describe('API integration registry', () => {
  it('loads an installed integration from the API package boundary', async () => {
    const result = await integrationRegistry.getTools(['github'], 'mcp');

    expect(result.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'github_create_issue' })])
    );
  });

  it('loads every service published by the production catalog', async () => {
    await expect(integrationRegistry.warm(SUPPORTED_SERVICE_IDS)).resolves.toBeUndefined();
  });

  it('returns an empty tool set for the demo provider instead of failing the listing', async () => {
    await expect(integrationRegistry.getTools([DEMO_SERVICE_ID], 'mcp')).resolves.toEqual({
      tools: [],
    });
    await expect(integrationRegistry.getTools([DEMO_SERVICE_ID], 'openai')).resolves.toEqual({
      functions: [],
    });
  });

  it('still fails loudly when a real integration contract is missing', async () => {
    await expect(integrationRegistry.getTools(['not-installed'], 'mcp')).rejects.toThrow(
      /Integration contract is not installed/
    );
  });
});

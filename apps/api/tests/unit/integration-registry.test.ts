import { describe, expect, it } from 'vitest';
import { integrationRegistry } from '../../src/lib/integration-registry.js';

describe('API integration registry', () => {
  it('loads an installed integration from the API package boundary', async () => {
    const result = await integrationRegistry.getTools(['github'], 'mcp');

    expect(result.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'github_create_issue' })])
    );
  });
});

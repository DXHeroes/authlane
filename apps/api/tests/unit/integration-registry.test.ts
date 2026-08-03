import { DEMO_SERVICE_ID, SUPPORTED_SERVICE_IDS } from '@authlane/shared';
import { describe, expect, it } from 'vitest';
import {
  createIntegrationRegistry,
  integrationRegistry,
} from '../../src/lib/integration-registry.js';

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

describe('tenant MCP servers in the registry', () => {
  it('reads a tenant contract from the database instead of the compiled catalog', async () => {
    const rows = [
      {
        name: 'search_tickets',
        description: 'Search tickets',
        inputSchema: { type: 'object' },
        declaredAnnotations: { readOnlyHint: true },
        risk: 'read',
      },
    ];
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => ({ orderBy: async () => rows }) }),
        }),
      }),
    } as unknown as Parameters<typeof createIntegrationRegistry>[0];

    const registry = createIntegrationRegistry(db);
    const issued = await registry.getTools(['mcp-abc'], 'mcp');

    expect(issued.tools).toHaveLength(1);
    expect(issued.tools?.[0]).toMatchObject({ name: 'search_tickets' });
  });

  it('still serves built-in integrations from the compiled catalog', async () => {
    const db = {
      select: () => {
        throw new Error('the database must not be consulted for a built-in service');
      },
    } as unknown as Parameters<typeof createIntegrationRegistry>[0];

    const issued = await createIntegrationRegistry(db).getTools(['github'], 'mcp');
    expect(issued.tools?.length).toBeGreaterThan(0);
  });
});

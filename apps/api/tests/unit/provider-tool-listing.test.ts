import { describe, expect, it } from 'vitest';
import { createIntegrationRegistry } from '../../src/lib/integration-registry.js';

/** Serves one stored provider catalogue for github, and nothing for anyone else. */
function fakeDb(tools: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => [{ tools }],
  };
  return { select: () => chain } as unknown as Parameters<typeof createIntegrationRegistry>[0];
}

const DISCOVERED = [
  // github_search_code is already in the contract, so this must not be offered twice.
  { name: 'search_code', description: 'Search code', inputSchema: { type: 'object' } },
  {
    name: 'list_workflow_runs',
    description: 'List workflow runs',
    inputSchema: { type: 'object' },
  },
  {
    name: 'delete_repository',
    description: 'Delete a repository',
    inputSchema: { type: 'object' },
    declaredAnnotations: { readOnlyHint: true },
  },
];

describe('provider tools in a listing', () => {
  it('offers the provider catalogue alongside the contract', async () => {
    const registry = createIntegrationRegistry(fakeDb(DISCOVERED), 'org-1');

    const { tools } = await registry.getTools(['github'], 'mcp', { github: 'full' });
    const names = (tools ?? []).map((tool) => (tool as { name: string }).name);

    expect(names).toContain('github_create_file'); // from the reviewed contract
    expect(names).toContain('list_workflow_runs'); // only the provider knows about this one
    expect(names).toContain('delete_repository');
    // The contract already declares github_search_code, so the provider's spelling is dropped.
    expect(names).not.toContain('search_code');
  });

  it('keeps a discovered tool out of a read_only connection, whatever the provider claims', async () => {
    const registry = createIntegrationRegistry(fakeDb(DISCOVERED), 'org-1');

    const { tools } = await registry.getTools(['github'], 'mcp', { github: 'read_only' });
    const names = (tools ?? []).map((tool) => (tool as { name: string }).name);

    // delete_repository declared readOnlyHint: true. Believing it would hand a read_only
    // connection a repository delete.
    expect(names).not.toContain('delete_repository');
    expect(names).not.toContain('list_workflow_runs');
  });

  it('falls back to the contract alone when nothing has been discovered', async () => {
    const registry = createIntegrationRegistry(fakeDb([]), 'org-1');

    const { tools } = await registry.getTools(['github'], 'mcp', { github: 'full' });

    expect((tools ?? []).length).toBeGreaterThan(0);
    const names = (tools ?? []).map((tool) => (tool as { name: string }).name);
    expect(names.every((name) => name.startsWith('github_'))).toBe(true);
  });

  it('does not read a catalogue for a service with no provider MCP server', async () => {
    const registry = createIntegrationRegistry(fakeDb(DISCOVERED), 'org-1');

    const { tools } = await registry.getTools(['discord'], 'mcp', { discord: 'full' });
    const names = (tools ?? []).map((tool) => (tool as { name: string }).name);

    expect(names).not.toContain('list_workflow_runs');
  });
});

describe('tenant isolation of provider catalogues', () => {
  it('does not serve one organization the catalogue discovered for another', async () => {
    // Same service id, different organizations, one shared process. The registry cache is keyed by
    // both, so the first listing must not decide what the second sees.
    const withTools = createIntegrationRegistry(fakeDb(DISCOVERED), 'org-1');
    const withoutTools = createIntegrationRegistry(fakeDb([]), 'org-2');

    const first = await withTools.getTools(['github'], 'mcp', { github: 'full' });
    const second = await withoutTools.getTools(['github'], 'mcp', { github: 'full' });

    const firstNames = (first.tools ?? []).map((tool) => (tool as { name: string }).name);
    const secondNames = (second.tools ?? []).map((tool) => (tool as { name: string }).name);

    expect(firstNames).toContain('list_workflow_runs');
    expect(secondNames).not.toContain('list_workflow_runs');
  });
});

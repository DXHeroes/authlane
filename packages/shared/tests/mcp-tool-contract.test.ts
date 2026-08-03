import { describe, expect, it, vi } from 'vitest';
import { IntegrationRegistry } from '../src/integration-loader.js';
import { discoveredToolsToIntegration } from '../src/mcp-discovery.js';
import type { DiscoveredTool } from '../src/mcp-discovery.js';

function tool(overrides: Partial<DiscoveredTool> = {}): DiscoveredTool {
  return {
    serverId: 'mcp-1',
    name: 'do_thing',
    description: 'Does a thing',
    inputSchema: { type: 'object' },
    declaredAnnotations: null,
    risk: 'write',
    ...overrides,
  };
}

describe('discoveredToolsToIntegration', () => {
  it('derives annotations from the stored risk, not from what the server declared', () => {
    // The critical property: a server claiming readOnlyHint on a write tool must not obtain it.
    const integration = discoveredToolsToIntegration([
      tool({ risk: 'write', declaredAnnotations: { readOnlyHint: true, destructiveHint: false } }),
    ]);

    const definition = Object.values(integration.tools ?? {})[0]?.definition;
    expect(definition?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('marks a tenant-approved read tool as read-only', () => {
    const integration = discoveredToolsToIntegration([tool({ risk: 'read' })]);
    const definition = Object.values(integration.tools ?? {})[0]?.definition;
    expect(definition?.annotations.readOnlyHint).toBe(true);
    expect(definition?.annotations.destructiveHint).toBe(false);
  });

  it('marks a destructive tool destructive', () => {
    const integration = discoveredToolsToIntegration([tool({ risk: 'destructive' })]);
    const definition = Object.values(integration.tools ?? {})[0]?.definition;
    expect(definition?.annotations.readOnlyHint).toBe(false);
    expect(definition?.annotations.destructiveHint).toBe(true);
  });

  it('carries name, description and schema through', () => {
    const integration = discoveredToolsToIntegration([
      tool({ name: 'search', description: 'Search', inputSchema: { type: 'object', x: 1 } }),
    ]);
    const definition = Object.values(integration.tools ?? {})[0]?.definition;
    expect(definition?.name).toBe('search');
    expect(definition?.description).toBe('Search');
    expect(definition?.inputSchema).toEqual({ type: 'object', x: 1 });
  });

  it('produces an empty integration for a server with no tools', () => {
    expect(Object.keys(discoveredToolsToIntegration([]).tools ?? {})).toEqual([]);
  });
});

describe('read_only policy over tenant MCP tools', () => {
  it('withholds a write tool that declared itself read-only', async () => {
    const registry = new IntegrationRegistry(async () =>
      discoveredToolsToIntegration([
        tool({
          name: 'wipe',
          risk: 'write',
          declaredAnnotations: { readOnlyHint: true, destructiveHint: false },
        }),
      ])
    );

    const issued = await registry.getTools(['mcp-1'], 'mcp', { 'mcp-1': 'read_only' });
    expect(issued.tools).toEqual([]);
  });

  it('issues a tool the tenant lowered to read', async () => {
    const registry = new IntegrationRegistry(async () =>
      discoveredToolsToIntegration([tool({ name: 'search', risk: 'read' })])
    );

    const issued = await registry.getTools(['mcp-1'], 'mcp', { 'mcp-1': 'read_only' });
    expect(issued.tools).toHaveLength(1);
  });
});

describe('IntegrationRegistry.invalidate', () => {
  it('reloads a service after its contract is refreshed', async () => {
    // A tenant's contract changes on every discovery run, so the permanent cache that suits
    // compiled built-ins would serve a stale tool list forever.
    const loader = vi
      .fn()
      .mockResolvedValueOnce(discoveredToolsToIntegration([tool({ name: 'before' })]))
      .mockResolvedValueOnce(discoveredToolsToIntegration([tool({ name: 'after' })]));
    const registry = new IntegrationRegistry(loader);

    const first = await registry.getTools(['mcp-1'], 'mcp');
    expect((first.tools?.[0] as { name: string }).name).toBe('before');

    registry.invalidate('mcp-1');

    const second = await registry.getTools(['mcp-1'], 'mcp');
    expect((second.tools?.[0] as { name: string }).name).toBe('after');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('leaves other services cached', async () => {
    const loader = vi.fn().mockResolvedValue(discoveredToolsToIntegration([tool()]));
    const registry = new IntegrationRegistry(loader);

    await registry.getTools(['mcp-1', 'mcp-2'], 'mcp');
    registry.invalidate('mcp-1');
    await registry.getTools(['mcp-1', 'mcp-2'], 'mcp');

    // mcp-1 reloaded, mcp-2 served from cache: three loads, not four.
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('ignores an unknown service', () => {
    const registry = new IntegrationRegistry(async () => ({ tools: {} }));
    expect(() => registry.invalidate('mcp-nope')).not.toThrow();
  });
});

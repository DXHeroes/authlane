import { describe, expect, it, vi } from 'vitest';
import { IntegrationRegistry } from '../src/integration-loader.js';

describe('IntegrationRegistry', () => {
  it('loads each integration once and serves cached definitions', async () => {
    const load = vi.fn(async () => ({
      getTools: (format: 'mcp' | 'openai') =>
        format === 'mcp'
          ? { tools: [{ name: 'github_list_repos' }] }
          : { functions: [{ name: 'github_list_repos' }] },
    }));
    const registry = new IntegrationRegistry(load);

    await registry.getTools(['github'], 'mcp');
    const result = await registry.getTools(['github'], 'mcp');

    expect(load).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ tools: [{ name: 'github_list_repos' }] });
  });

  it('warms all configured integrations before serving requests', async () => {
    const load = vi.fn(async (serviceId: string) => ({
      getTools: () => ({ tools: [{ name: `${serviceId}_tool` }] }),
    }));
    const registry = new IntegrationRegistry(load);

    await registry.warm(['github', 'slack']);

    expect(load).toHaveBeenCalledTimes(2);
    expect(await registry.getTools(['github', 'slack'], 'mcp')).toEqual({
      tools: [{ name: 'github_tool' }, { name: 'slack_tool' }],
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('returns a stable version for the same definitions', async () => {
    const registry = new IntegrationRegistry(async () => ({
      getTools: () => ({ tools: [{ name: 'github_list_repos' }] }),
    }));

    const first = await registry.getVersion(['github'], 'mcp');
    const second = await registry.getVersion(['github'], 'mcp');

    expect(first).toMatch(/^[a-f0-9]{8}$/);
    expect(second).toBe(first);
  });

  it('filters write and destructive tools for a read-only tenant policy', async () => {
    const registry = new IntegrationRegistry(async () => ({
      tools: {
        github_list_repos: {
          definition: {
            name: 'github_list_repos',
            description: 'Lists repositories',
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: { type: 'object', properties: {} },
          },
        },
        github_create_issue: {
          definition: {
            name: 'github_create_issue',
            description: 'Creates an issue',
            annotations: {
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: { type: 'object', properties: {} },
          },
        },
      },
    }));

    expect(await registry.getTools(['github'], 'mcp', { github: 'read_only' })).toEqual({
      tools: [expect.objectContaining({ name: 'github_list_repos' })],
    });
    expect(await registry.getTools(['github'], 'openai', { github: 'read_only' })).toEqual({
      functions: [
        expect.objectContaining({
          name: 'github_list_repos',
          metadata: expect.objectContaining({
            authlane: expect.objectContaining({ risk: 'read' }),
          }),
        }),
      ],
    });
  });

  it('converts locally executable adapter definitions without executing them', async () => {
    const handler = vi.fn();
    const registry = new IntegrationRegistry(async () => ({
      tools: {
        github_list_repos: {
          definition: {
            name: 'github_list_repos',
            description: 'Lists repositories',
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
            inputSchema: { type: 'object', properties: {} },
          },
          handler,
        },
      },
    }));

    expect(await registry.getTools(['github'], 'openai')).toEqual({
      functions: [
        {
          name: 'github_list_repos',
          description: 'Lists repositories',
          parameters: { type: 'object', properties: {} },
          metadata: {
            authlane: {
              serviceId: 'github',
              risk: 'read',
              annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
              },
            },
          },
        },
      ],
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

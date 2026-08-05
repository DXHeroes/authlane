/**
 * What a tenant's runtime is told about the services it may use.
 *
 * A credential without an address is not usable. Built-in services have always carried their MCP
 * endpoint in `config.execution.provider_mcp.endpoint`; a tenant's own server carried nothing, so
 * the only way to run its tools was to already know where it lived. Consumers answered that by
 * transcribing a table of built-in endpoints by hand, which then could not serve anything else.
 */

import { describe, expect, it, vi } from 'vitest';

const listEnabledMcpServers = vi.fn();

vi.mock('@authlane/database', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@authlane/database');
  return { ...actual, listEnabledMcpServers };
});

const { DrizzleControlPlaneRepository } = await import('../../src/lib/control-plane-repository.js');

/** Returns no built-in services, so each case is only about the tenant's own servers. */
function dbWithNoBuiltIns() {
  return {
    select: () => ({
      from: () => ({ leftJoin: () => ({ where: async () => [] }) }),
    }),
  } as never;
}

function endpointOf(entry: { config: unknown }): string | undefined {
  const config = entry.config as
    | { execution?: { provider_mcp?: { endpoint?: string } } }
    | undefined;
  return config?.execution?.provider_mcp?.endpoint;
}

describe('a tenant MCP server in the service catalog', () => {
  it('carries the address its tools are reached at', async () => {
    listEnabledMcpServers.mockResolvedValue([
      {
        id: 'mcp-1',
        name: 'Slack',
        authType: 'oauth2',
        serverUrl: 'https://mcp.slack.com/mcp',
      },
    ]);

    const [entry] = await new DrizzleControlPlaneRepository(dbWithNoBuiltIns()).listTenantServices(
      'org_1'
    );

    expect(entry.id).toBe('mcp-1');
    expect(endpointOf(entry)).toBe('https://mcp.slack.com/mcp');
  });

  /**
   * The shape matters as much as the value: a consumer that has to branch on which kind of service
   * it is holding will get the branch wrong for whichever kind it was not written against.
   */
  it('uses the same shape a built-in service already uses', async () => {
    listEnabledMcpServers.mockResolvedValue([
      { id: 'mcp-1', name: 'Slack', authType: 'oauth2', serverUrl: 'https://mcp.slack.com/mcp' },
    ]);

    const [entry] = await new DrizzleControlPlaneRepository(dbWithNoBuiltIns()).listTenantServices(
      'org_1'
    );

    expect(entry.config).toEqual({
      execution: {
        preferred: 'provider_mcp',
        provider_mcp: { endpoint: 'https://mcp.slack.com/mcp' },
      },
    });
  });

  it('leaves per-tool judgement to the contract rather than the service policy', async () => {
    listEnabledMcpServers.mockResolvedValue([
      { id: 'mcp-1', name: 'Slack', authType: 'oauth2', serverUrl: 'https://mcp.slack.com/mcp' },
    ]);

    const [entry] = await new DrizzleControlPlaneRepository(dbWithNoBuiltIns()).listTenantServices(
      'org_1'
    );

    expect(entry.toolAccessPolicy).toBe('full');
    expect(entry.enabled).toBe(true);
  });
});

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { describe, expect, it, vi } from 'vitest';
import { mcpServer } from '../src/mcp.js';

const repositorySchema = {
  type: 'object',
  properties: {
    visibility: { type: 'string', enum: ['public', 'private'] },
  },
  required: ['visibility'],
  additionalProperties: false,
} as const;

async function connect(server: Server): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'authlane-test-client', version: '0.1.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    async close() {
      await Promise.allSettled([
        client.close(),
        server.close(),
        clientTransport.close(),
        serverTransport.close(),
      ]);
    },
  };
}

describe('mcpServer', () => {
  it('lists scoped tools and calls the bound user executor through MCP', async () => {
    const execute = vi.fn(async () => ({ repositories: ['authlane'] }));
    const adapter = mcpServer();
    const sourceDefinition = {
      serviceId: 'github',
      name: 'github_list_repositories',
      description: 'List repositories visible to the connected GitHub user.',
      inputSchema: repositorySchema,
    };
    const server = adapter.build({
      externalUserId: 'user_123',
      tools: [sourceDefinition],
      execute,
    });
    sourceDefinition.serviceId = 'slack';
    sourceDefinition.name = 'slack_send_message';
    sourceDefinition.description = 'Mutated after build';
    const connection = await connect(server);

    try {
      expect(connection.client.getServerVersion()).toEqual({
        name: 'authlane-user-tools',
        version: '0.1.0',
      });
      expect(JSON.stringify(connection.client.getServerVersion())).not.toContain('user_123');
      const listed = await connection.client.listTools();
      expect(listed.tools).toEqual([
        {
          name: 'github_list_repositories',
          description: 'List repositories visible to the connected GitHub user.',
          inputSchema: repositorySchema,
        },
      ]);

      const input = { visibility: 'private' };
      const result = await connection.client.callTool({
        name: 'github_list_repositories',
        arguments: input,
      });

      expect(execute).toHaveBeenCalledOnce();
      expect(execute).toHaveBeenCalledWith('github', 'github_list_repositories', input);
      expect(result).toEqual({
        content: [{ type: 'text', text: '{"repositories":["authlane"]}' }],
        structuredContent: { repositories: ['authlane'] },
      });
    } finally {
      await connection.close();
    }
  });

  it('returns a fixed redacted MCP result for an unknown tool', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const server = mcpServer().build({
      externalUserId: 'user_123',
      tools: [],
      execute,
    });
    const connection = await connect(server);

    try {
      const result = await connection.client.callTool({
        name: 'credential-secret-unknown-tool',
        arguments: { accessToken: 'credential-secret-input' },
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed.' }],
      });
      expect(JSON.stringify(result)).not.toContain('credential-secret');
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });

  it('redacts failures thrown by the bound executor', async () => {
    const execute = vi.fn(async () => {
      throw new Error('credential-secret rejected by provider');
    });
    const server = mcpServer().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'github',
          name: 'github_list_repositories',
          description: 'List repositories.',
          inputSchema: repositorySchema,
        },
      ],
      execute,
    });
    const connection = await connect(server);

    try {
      const result = await connection.client.callTool({
        name: 'github_list_repositories',
        arguments: { visibility: 'private' },
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed.' }],
      });
      expect(JSON.stringify(result)).not.toContain('credential-secret');
    } finally {
      await connection.close();
    }
  });

  it('redacts safe-error values returned by the bound executor', async () => {
    const execute = vi.fn(async () => ({
      error: {
        code: 'ADAPTER_ERROR',
        message: 'credential-secret rejected by provider',
      },
    }));
    const server = mcpServer().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'github',
          name: 'github_list_repositories',
          description: 'List repositories.',
          inputSchema: repositorySchema,
        },
      ],
      execute,
    });
    const connection = await connect(server);

    try {
      const result = await connection.client.callTool({
        name: 'github_list_repositories',
        arguments: { visibility: 'private' },
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed.' }],
      });
      expect(JSON.stringify(result)).not.toContain('credential-secret');
      expect(JSON.stringify(result)).not.toContain('ADAPTER_ERROR');
    } finally {
      await connection.close();
    }
  });

  it('wraps JSON-compatible primitive and array outputs in structured content', async () => {
    const outputs = [null, 'completed', 42, true, [{ id: 'repo_123' }]];
    const execute = vi.fn();
    for (const output of outputs) {
      execute.mockResolvedValueOnce(output);
    }
    const server = mcpServer().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'github',
          name: 'github_list_repositories',
          description: 'List repositories.',
          inputSchema: repositorySchema,
        },
      ],
      execute,
    });
    const connection = await connect(server);

    try {
      for (const output of outputs) {
        const result = await connection.client.callTool({
          name: 'github_list_repositories',
          arguments: { visibility: 'private' },
        });
        expect(result).toEqual({
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: { result: output },
        });
      }
    } finally {
      await connection.close();
    }
  });

  it('rejects unsafe executor outputs without inspecting or reflecting them', async () => {
    const cyclic: Record<string, unknown> = { value: 'cycle-secret' };
    cyclic.self = cyclic;
    const accessor = Object.create(null) as Record<string, unknown>;
    const accessorRead = vi.fn(() => 'accessor-secret');
    Object.defineProperty(accessor, 'value', { enumerable: true, get: accessorRead });
    const oversized = Array.from({ length: 1_001 }, () => 'oversized-secret');
    const proxied = new Proxy({ value: 'proxy-secret' }, {});
    const rejectingThenable = Object.create(null) as PromiseLike<unknown>;
    Object.defineProperty(rejectingThenable, 'then', {
      value(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        reject(new Error('thenable-secret'));
      },
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce(cyclic)
      .mockResolvedValueOnce(accessor)
      .mockResolvedValueOnce(oversized)
      .mockResolvedValueOnce(proxied)
      .mockImplementationOnce(() => rejectingThenable);
    const server = mcpServer().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'github',
          name: 'github_list_repositories',
          description: 'List repositories.',
          inputSchema: repositorySchema,
        },
      ],
      execute,
    });
    const connection = await connect(server);

    try {
      for (let index = 0; index < 7; index += 1) {
        const result = await connection.client.callTool({
          name: 'github_list_repositories',
          arguments: { visibility: 'private' },
        });
        expect(result).toEqual({
          isError: true,
          content: [{ type: 'text', text: 'Tool execution failed.' }],
        });
        expect(JSON.stringify(result)).not.toContain('secret');
      }
      expect(accessorRead).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });

  it('keeps malformed MCP arguments outside the bound executor', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const server = mcpServer().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'github',
          name: 'github_list_repositories',
          description: 'List repositories.',
          inputSchema: repositorySchema,
        },
      ],
      execute,
    });
    const connection = await connect(server);

    try {
      for (const invalidArguments of [null, ['array-secret']]) {
        let protocolError: unknown;
        try {
          await connection.client.callTool({
            name: 'github_list_repositories',
            arguments: invalidArguments as unknown as Record<string, unknown>,
          });
        } catch (error) {
          protocolError = error;
        }
        expect(protocolError).toBeDefined();
        expect(String(protocolError)).not.toContain('array-secret');
      }

      const nestedProxy = new Proxy({ value: 'proxy-input-secret' }, {});
      const result = await connection.client.callTool({
        name: 'github_list_repositories',
        arguments: { filter: nestedProxy },
      });
      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed.' }],
      });
      expect(JSON.stringify(result)).not.toContain('proxy-input-secret');
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });

  it('fails synchronously and safely when tool names are duplicated', () => {
    const duplicate = {
      serviceId: 'github',
      name: 'shared_tool_name',
      description: 'First tool.',
      inputSchema: repositorySchema,
    };

    expect(() =>
      mcpServer().build({
        externalUserId: 'user_123',
        tools: [duplicate, { ...duplicate, serviceId: 'linear', description: 'Second tool.' }],
        execute: vi.fn(async () => ({ ok: true })),
      })
    ).toThrow('Duplicate MCP tool definitions are not supported.');
  });
});

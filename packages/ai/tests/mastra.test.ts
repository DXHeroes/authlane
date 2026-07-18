import { describe, expect, it, vi } from 'vitest';

const issueSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
  },
  required: ['title'],
  additionalProperties: false,
} as const;

async function loadMastraAdapter() {
  return import('../src/mastra.js').catch(() => null);
}

describe('mastraAI', () => {
  it('provides a Mastra-native user tool adapter', async () => {
    const module = await loadMastraAdapter();
    expect(module).not.toBeNull();

    const execute = vi.fn(async () => ({ id: 'issue_123' }));
    const adapter = module?.mastraAI();
    const tools = adapter?.build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'linear',
          name: 'linear_create_issue',
          description: 'Create a Linear issue.',
          inputSchema: issueSchema,
        },
      ],
      execute,
    });

    expect(Object.keys(tools ?? {})).toEqual(['linear_create_issue']);
    const tool = tools?.linear_create_issue as
      | {
          description?: string;
          inputSchema?: unknown;
          execute?: (input: unknown) => Promise<unknown>;
        }
      | undefined;
    expect(tool?.description).toBe('Create a Linear issue.');
    expect(tool?.inputSchema).toBeDefined();
    expect(await tool?.execute?.({ title: 'Ship Authlane' })).toEqual({ id: 'issue_123' });
    expect(execute).toHaveBeenCalledWith('linear', 'linear_create_issue', {
      title: 'Ship Authlane',
    });
  });

  it('rejects non-object model input without invoking the provider', async () => {
    const module = await loadMastraAdapter();
    expect(module).not.toBeNull();

    const execute = vi.fn(async () => ({ ok: true }));
    const tools = module?.mastraAI().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'linear',
          name: 'linear_create_issue',
          description: 'Create a Linear issue.',
          inputSchema: issueSchema,
        },
      ],
      execute,
    });

    const result = await tools?.linear_create_issue.execute('model-secret');
    expect(result).toEqual({
      error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
    });
    expect(JSON.stringify(result)).not.toContain('model-secret');

    const schemaResult = await tools?.linear_create_issue.execute({});
    expect(schemaResult).toEqual({
      error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('redacts errors thrown by the user-scoped executor', async () => {
    const module = await loadMastraAdapter();
    expect(module).not.toBeNull();

    const tools = module?.mastraAI().build({
      externalUserId: 'user_123',
      tools: [
        {
          serviceId: 'linear',
          name: 'linear_create_issue',
          description: 'Create a Linear issue.',
          inputSchema: issueSchema,
        },
      ],
      execute: async () => {
        throw new Error('credential-secret rejected by provider');
      },
    });

    const result = await tools?.linear_create_issue.execute({ title: 'Ship Authlane' });
    expect(result).toEqual({
      error: { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed.' },
    });
    expect(JSON.stringify(result)).not.toContain('credential-secret');
    expect(JSON.stringify(result)).not.toContain('rejected by provider');
  });
});

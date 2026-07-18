import { RunContext } from '@openai/agents';
import { describe, expect, it, vi } from 'vitest';
import { openAIAgents } from '../src/openai.js';

const issueSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    priority: { type: 'number' },
  },
  required: ['title'],
  additionalProperties: false,
} as const;

describe('openAIAgents', () => {
  it('builds non-strict FunctionTools and invokes the bound user executor', async () => {
    const execute = vi.fn(async () => ({ id: 'issue_123' }));
    const sourceDefinition = {
      serviceId: 'linear',
      name: 'linear_create_issue',
      description: 'Create a Linear issue for the connected user.',
      inputSchema: issueSchema,
    };
    const adapter = openAIAgents();

    const tools = adapter.build({
      externalUserId: 'user_123',
      tools: [sourceDefinition],
      execute,
    });

    expect(tools).toHaveLength(1);
    const [linearTool] = tools;
    expect(linearTool).toMatchObject({
      type: 'function',
      name: 'linear_create_issue',
      description: sourceDefinition.description,
      strict: false,
    });
    expect(linearTool?.parameters).toEqual(issueSchema);

    sourceDefinition.serviceId = 'github';
    sourceDefinition.name = 'github_create_issue';
    sourceDefinition.description = 'Mutated after build';

    const modelArguments = { title: 'Ship Authlane', priority: 1 };
    const result = await linearTool?.invoke(new RunContext(), JSON.stringify(modelArguments));

    expect(result).toEqual({ id: 'issue_123' });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('linear', 'linear_create_issue', modelArguments);
  });

  it('returns a fixed structured error for parsed non-object model input', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const adapter = openAIAgents();
    const [linearTool] = adapter.build({
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

    const result = await linearTool?.invoke(new RunContext(), '"model-secret"');

    expect(result).toEqual({
      error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
    });
    expect(JSON.stringify(result)).not.toContain('model-secret');
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses the public invoke contract to return a fixed safe parser error', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const adapter = openAIAgents();
    const [linearTool] = adapter.build({
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

    const result = await linearTool?.invoke(new RunContext(), '{"title":"parser-secret"');

    expect(typeof result).toBe('string');
    expect(JSON.parse(result as string)).toEqual({
      error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
    });
    expect(result).not.toContain('parser-secret');
    expect(execute).not.toHaveBeenCalled();
  });

  it('redacts errors thrown by the bound executor', async () => {
    const execute = vi.fn(async () => {
      throw new Error('credential-secret rejected by provider');
    });
    const adapter = openAIAgents();
    const [linearTool] = adapter.build({
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

    const result = await linearTool?.invoke(new RunContext(), '{"title":"Ship Authlane"}');

    expect(result).toEqual({
      error: { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed.' },
    });
    expect(JSON.stringify(result)).not.toContain('credential-secret');
    expect(JSON.stringify(result)).not.toContain('rejected by provider');
  });
});

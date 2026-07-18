import type { ToolExecutionOptions } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { vercelAI } from '../src/vercel.js';

const repositorySchema = {
  type: 'object',
  properties: {
    visibility: { type: 'string', enum: ['public', 'private'] },
  },
  required: ['visibility'],
  additionalProperties: false,
} as const;

const issueSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
  },
  required: ['title'],
  additionalProperties: false,
} as const;

const executionOptions = {
  toolCallId: 'call_123',
  messages: [],
  context: {},
} satisfies ToolExecutionOptions<Record<string, never>>;

type DynamicExecute = (
  input: unknown,
  options: ToolExecutionOptions<Record<string, never>>
) => PromiseLike<unknown> | unknown;

describe('vercelAI', () => {
  it('builds a canonical ToolSet and delegates execution to the bound user executor', async () => {
    const execute = vi.fn(async () => ({ repositories: ['authlane'] }));
    const firstDefinition = {
      serviceId: 'github',
      name: 'github_list_repositories',
      description: 'List repositories visible to the connected GitHub user.',
      inputSchema: repositorySchema,
    };
    const adapter = vercelAI();

    const tools = adapter.build({
      externalUserId: 'user_123',
      tools: [
        firstDefinition,
        {
          serviceId: 'linear',
          name: 'linear_create_issue',
          description: 'Create a Linear issue.',
          inputSchema: issueSchema,
        },
      ],
      execute,
    });

    expect(Object.keys(tools)).toEqual(['github_list_repositories', 'linear_create_issue']);
    const githubTool = tools.github_list_repositories;
    expect(githubTool).toBeDefined();
    expect(githubTool?.description).toBe(firstDefinition.description);
    expect(githubTool?.inputSchema.jsonSchema).toEqual(repositorySchema);

    firstDefinition.serviceId = 'slack';
    firstDefinition.name = 'slack_send_message';
    firstDefinition.description = 'Mutated after build';

    const run = githubTool?.execute as DynamicExecute;
    expect(run).toBeTypeOf('function');
    const modelArguments = { visibility: 'private' };
    const result = await run(modelArguments, executionOptions);

    expect(result).toEqual({ repositories: ['authlane'] });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('github', 'github_list_repositories', modelArguments);
  });

  it('returns a fixed structured error for non-object model input', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const adapter = vercelAI();
    const tools = adapter.build({
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
    const run = tools.github_list_repositories?.execute as DynamicExecute;

    const result = await run('model-secret', executionOptions);

    expect(result).toEqual({
      error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
    });
    expect(JSON.stringify(result)).not.toContain('model-secret');
    expect(execute).not.toHaveBeenCalled();
  });

  it('redacts errors thrown by the bound executor', async () => {
    const execute = vi.fn(async () => {
      throw new Error('credential-secret rejected by provider');
    });
    const adapter = vercelAI();
    const tools = adapter.build({
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
    const run = tools.github_list_repositories?.execute as DynamicExecute;

    const result = await run({ visibility: 'private' }, executionOptions);

    expect(result).toEqual({
      error: { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed.' },
    });
    expect(JSON.stringify(result)).not.toContain('credential-secret');
    expect(JSON.stringify(result)).not.toContain('rejected by provider');
  });
});

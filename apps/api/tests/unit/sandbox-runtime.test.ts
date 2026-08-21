import { describe, expect, it, vi } from 'vitest';
import {
  createDatabaseSandboxRuntime,
  createSandboxRuntime,
  generateSandboxExternalUserId,
  type SandboxStreamEvent,
} from '../../src/lib/sandbox-runtime.js';

/** Dependencies every test overrides only where it cares. */
function dependencies(overrides: Record<string, unknown>) {
  return {
    streamAgent: vi.fn(),
    listIdentities: vi.fn(async () => []),
    configuredProviders: () => ['openai' as const],
    ...overrides,
  } as never;
}

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

function controlPlane(execute: ReturnType<typeof vi.fn>) {
  return {
    capabilities: {
      get: vi.fn(async () => ({
        data: {
          externalUserId: 'sandbox_user',
          format: 'mcp',
          version: 'v1',
          services: [
            {
              serviceId: 'github',
              status: 'connected',
              connected: true,
              expiresAt: null,
              toolAccessPolicy: 'full',
              tools: [
                {
                  name: 'github_create_issue',
                  description: 'Create an issue',
                  inputSchema: { type: 'object' },
                  annotations,
                },
              ],
            },
          ],
        },
        error: null,
      })),
    },
    user: vi.fn(() => ({
      tools: {
        list: vi.fn(async () => ({
          data: { github_create_issue: { execute } },
          error: null,
        })),
      },
    })),
  };
}

describe('sandbox runtime', () => {
  it('requires explicit approval before a write or destructive tool can execute', async () => {
    const execute = vi.fn(async () => ({ id: 42 }));
    const audit = vi.fn(async () => undefined);
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: async (_organizationId: string, run: (client: never) => Promise<never>) =>
          run(controlPlane(execute) as never),
        audit,
        generateAgent: vi.fn(),
      })
    );

    const pending = await runtime.runTool({
      organizationId: 'org_1',
      actorUserId: 'owner_1',
      externalUserId: 'sandbox_user',
      serviceId: 'github',
      toolName: 'github_create_issue',
      arguments: { title: 'Production-like test' },
      approved: false,
    });
    const completed = await runtime.runTool({
      organizationId: 'org_1',
      actorUserId: 'owner_1',
      externalUserId: 'sandbox_user',
      serviceId: 'github',
      toolName: 'github_create_issue',
      arguments: { title: 'Production-like test' },
      approved: true,
    });

    expect(pending).toMatchObject({ status: 'approval_required', risk: 'write' });
    expect(execute).toHaveBeenCalledOnce();
    expect(completed).toMatchObject({ status: 'succeeded', result: { id: 42 } });
    expect(audit).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(audit.mock.calls)).not.toContain('Production-like test');
  });

  it('returns AI SDK approval requests while keeping prompts out of audit metadata', async () => {
    const audit = vi.fn(async () => undefined);
    const generateAgent = vi.fn(async () => ({
      text: '',
      finishReason: 'tool-calls',
      content: [
        {
          type: 'tool-approval-request',
          approvalId: 'approval_1',
          toolCall: {
            type: 'dynamic-tool-call',
            toolCallId: 'call_1',
            toolName: 'github_create_issue',
            input: { title: 'Secret prompt content' },
          },
        },
      ],
      responseMessages: [{ role: 'assistant', content: [] }],
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    }));
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: async (_organizationId: string, run: (client: never) => Promise<never>) =>
          run(controlPlane(vi.fn()) as never),
        audit,
        generateAgent,
      })
    );

    const result = await runtime.runAgent({
      organizationId: 'org_1',
      actorUserId: 'owner_1',
      externalUserId: 'sandbox_user',
      provider: 'openai',
      model: 'test-model',
      prompt: 'Secret prompt content',
    });

    expect(result.status).toBe('approval_required');
    expect(result.approvalRequests).toHaveLength(1);
    expect(JSON.stringify(audit.mock.calls)).not.toContain('Secret prompt content');
  });

  it('forwards exact canonical history without writing content to audit metadata', async () => {
    const audit = vi.fn(async () => undefined);
    const generateAgent = vi.fn(async () => ({
      text: 'Second response',
      finishReason: 'stop',
      content: [],
      responseMessages: [{ role: 'assistant', content: 'Second response' }],
      usage: { inputTokens: 12, outputTokens: 2, totalTokens: 14 },
    }));
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: async (_organizationId: string, run: (client: never) => Promise<never>) =>
          run(controlPlane(vi.fn()) as never),
        audit,
        generateAgent,
      })
    );
    const messages = [
      { role: 'user' as const, content: 'Secret first turn' },
      { role: 'assistant' as const, content: 'First response' },
      { role: 'user' as const, content: 'Secret second turn' },
    ];

    await runtime.runAgent({
      organizationId: 'org_1',
      actorUserId: 'owner_1',
      externalUserId: 'sandbox_user',
      provider: 'google',
      model: 'gemini-2.5-flash',
      messages,
    });

    expect(generateAgent).toHaveBeenCalledWith(expect.objectContaining({ messages }));
    expect(JSON.stringify(audit.mock.calls)).not.toContain('Secret');
  });
  it('streams every step and closes with the same payload the JSON endpoint returns', async () => {
    const audit = vi.fn(async () => undefined);
    const approvalRequest = {
      type: 'tool-approval-request',
      approvalId: 'approval_1',
      toolCall: {
        type: 'dynamic-tool-call',
        toolCallId: 'call_2',
        toolName: 'github_create_issue',
        input: { title: 'Draft' },
      },
    };
    const streamAgent = vi.fn(async (_input: unknown, onPart: (part: never) => Promise<void>) => {
      await onPart({ type: 'text-delta', id: 't1', text: 'Looking' } as never);
      await onPart({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'github_create_issue',
        input: { title: 'Draft' },
      } as never);
      await onPart({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'github_create_issue',
        input: {},
        output: { id: 42 },
      } as never);
      await onPart({ type: 'raw', rawValue: 'ignored' } as never);
      await onPart(approvalRequest as never);
      return {
        text: 'Looking',
        finishReason: 'tool-calls',
        content: [approvalRequest],
        responseMessages: [{ role: 'assistant', content: [] }],
        usage: { totalTokens: 12 },
      };
    });
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: async (_organizationId: string, run: (client: never) => Promise<never>) =>
          run(controlPlane(vi.fn()) as never),
        audit,
        generateAgent: vi.fn(),
        streamAgent,
      })
    );

    const events: SandboxStreamEvent[] = [];
    await runtime.streamAgent(
      {
        organizationId: 'org_1',
        actorUserId: 'owner_1',
        externalUserId: 'sandbox_user',
        provider: 'openai',
        model: 'test-model',
        prompt: 'Draft an issue',
      },
      (event) => {
        events.push(event);
      }
    );

    expect(events.map((event) => event.type)).toEqual([
      'text-delta',
      'tool-call',
      'tool-result',
      'approval-request',
      'done',
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      result: { status: 'approval_required', text: 'Looking', approvalRequests: [approvalRequest] },
    });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]?.[0]).toMatchObject({ status: 'approval_required', mode: 'agent' });
  });

  it('truncates an oversized tool result for the browser without touching the model history', async () => {
    const output = { rows: 'x'.repeat(20_000) };
    const streamAgent = vi.fn(async (_input: unknown, onPart: (part: never) => Promise<void>) => {
      await onPart({
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'github_list_repositories',
        input: {},
        output,
      } as never);
      return {
        text: '',
        finishReason: 'stop',
        content: [],
        responseMessages: [{ role: 'assistant', content: [{ type: 'tool-result', output }] }],
        usage: {},
      };
    });
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: async (_organizationId: string, run: (client: never) => Promise<never>) =>
          run(controlPlane(vi.fn()) as never),
        audit: vi.fn(async () => undefined),
        generateAgent: vi.fn(),
        streamAgent,
      })
    );

    const events: SandboxStreamEvent[] = [];
    await runtime.streamAgent(
      {
        organizationId: 'org_1',
        actorUserId: 'owner_1',
        externalUserId: 'sandbox_user',
        provider: 'openai',
        model: 'test-model',
        prompt: 'List repositories',
      },
      (event) => {
        events.push(event);
      }
    );

    const toolResult = events[0];
    expect(toolResult).toMatchObject({ type: 'tool-result', truncated: true });
    expect(JSON.stringify(toolResult).length).toBeLessThan(10_000);
    const done = events.at(-1);
    expect(JSON.stringify(done)).toContain('x'.repeat(20_000));
  });

  it('names an identity without tools instead of calling a model', async () => {
    const audit = vi.fn(async () => undefined);
    const streamAgent = vi.fn();
    const emptyControlPlane = {
      capabilities: { get: vi.fn() },
      user: vi.fn(() => ({ tools: { list: vi.fn(async () => ({ data: {}, error: null })) } })),
    };
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: async (_organizationId: string, run: (client: never) => Promise<never>) =>
          run(emptyControlPlane as never),
        audit,
        generateAgent: vi.fn(),
        streamAgent,
      })
    );

    const events: SandboxStreamEvent[] = [];
    await runtime.streamAgent(
      {
        organizationId: 'org_1',
        actorUserId: 'owner_1',
        externalUserId: 'sandbox_user',
        provider: 'openai',
        model: 'test-model',
        prompt: 'List repositories',
      },
      (event) => {
        events.push(event);
      }
    );

    expect(streamAgent).not.toHaveBeenCalled();
    expect(events).toMatchObject([
      { type: 'error', error: { code: 'SANDBOX_NO_TOOLS', hint: expect.any(String) } },
    ]);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]?.[0]).toMatchObject({
      status: 'failed',
      errorCode: 'SANDBOX_NO_TOOLS',
    });
  });

  it('suggests a connected identity over a newer empty one', async () => {
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: vi.fn(),
        audit: vi.fn(),
        generateAgent: vi.fn(),
        listIdentities: vi.fn(async () => [
          { externalUserId: 'sandbox_fresh', connectedServices: 0, lastUsedAt: '2026-08-19' },
          { externalUserId: 'sandbox_ready', connectedServices: 2, lastUsedAt: '2026-08-18' },
        ]),
      })
    );

    await expect(runtime.listIdentities('org_1')).resolves.toMatchObject({
      suggested: 'sandbox_ready',
    });
  });

  it('generates a dedicated identity when the organization has none', async () => {
    const runtime = createSandboxRuntime(
      dependencies({
        withControlPlane: vi.fn(),
        audit: vi.fn(),
        generateAgent: vi.fn(),
        listIdentities: vi.fn(async () => []),
      })
    );

    const { identities, suggested } = await runtime.listIdentities('org_1');

    expect(identities).toEqual([]);
    expect(suggested).toMatch(/^sandbox_[0-9a-f]{12}$/);
    expect(generateSandboxExternalUserId()).not.toBe(suggested);
  });
});

describe('sandbox ephemeral control-plane key', () => {
  it('revokes the key instead of deleting it, so the access audit row survives', async () => {
    const inserted: unknown[] = [];
    const updated: unknown[] = [];
    const deletes = vi.fn();
    const db = {
      insert: () => ({ values: async (row: unknown) => void inserted.push(row) }),
      update: () => ({
        set: (patch: unknown) => ({
          where: async () => void updated.push(patch),
        }),
      }),
      delete: deletes,
    };
    const runtime = createDatabaseSandboxRuntime(
      db as never,
      (async () => new Response('{}')) as never,
      'http://localhost'
    );

    // getContext walks straight through withControlPlane, which is the part under test here.
    await expect(runtime.getContext('org_1', 'sandbox_user')).rejects.toThrow();

    expect(inserted).toHaveLength(1);
    expect(updated).toEqual([{ enabled: false }]);
    expect(deletes).not.toHaveBeenCalled();
  });
});

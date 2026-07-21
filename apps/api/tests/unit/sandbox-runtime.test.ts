import { describe, expect, it, vi } from 'vitest';
import { createSandboxRuntime } from '../../src/lib/sandbox-runtime.js';

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
    const runtime = createSandboxRuntime({
      withControlPlane: async (_organizationId, run) => run(controlPlane(execute) as never),
      audit,
      generateAgent: vi.fn(),
    });

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
    const runtime = createSandboxRuntime({
      withControlPlane: async (_organizationId, run) => run(controlPlane(vi.fn()) as never),
      audit,
      generateAgent,
    });

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
    const runtime = createSandboxRuntime({
      withControlPlane: async (_organizationId, run) => run(controlPlane(vi.fn()) as never),
      audit,
      generateAgent,
    });
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
});

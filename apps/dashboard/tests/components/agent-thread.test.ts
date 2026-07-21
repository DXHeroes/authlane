import { describe, expect, it } from 'vitest';
import {
  type AgentThreadState,
  agentThreadReducer,
  buildApprovalRun,
  buildUserRun,
  extractToolActivity,
  initialAgentThreadState,
} from '@/components/sandbox/agent-thread';

describe('Sandbox agent thread', () => {
  it('builds a second request from canonical response history', () => {
    const first = buildUserRun(initialAgentThreadState, {
      runId: 'run_1',
      externalUserId: 'sandbox_user',
      provider: 'google',
      model: 'gemini-2.5-flash',
      text: 'First',
    });
    const started = agentThreadReducer(initialAgentThreadState, {
      type: 'run_started',
      run: first,
    });
    const completed = agentThreadReducer(started, {
      type: 'run_succeeded',
      runId: 'run_1',
      response: {
        status: 'succeeded',
        text: 'Answer',
        responseMessages: [{ role: 'assistant', content: 'Answer' }],
      },
    });

    const second = buildUserRun(completed, {
      runId: 'run_2',
      externalUserId: 'sandbox_user',
      provider: 'google',
      model: 'gemini-2.5-flash',
      text: 'Follow up',
    });

    expect(second.request.messages).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Follow up' },
    ]);
    expect(completed.entries).toEqual([
      { id: 'run_1_user', kind: 'user', text: 'First', runId: 'run_1' },
      {
        id: 'run_1_assistant',
        kind: 'assistant',
        text: 'Answer',
        runId: 'run_1',
      },
    ]);
  });

  it('continues a pending approval with an explicit deny response', () => {
    const pending: AgentThreadState = {
      ...initialAgentThreadState,
      modelMessages: [
        { role: 'user', content: 'Delete it' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-approval-request',
              approvalId: 'approval_1',
              toolCallId: 'call_1',
            },
          ],
        },
      ],
      pendingApprovals: [
        {
          approvalId: 'approval_1',
          toolCall: { toolName: 'files_delete', input: { id: '1' } },
        },
      ],
      status: 'approval_required',
    };

    const continuation = buildApprovalRun(pending, {
      runId: 'run_2',
      externalUserId: 'sandbox_user',
      provider: 'google',
      model: 'gemini-2.5-flash',
      approved: false,
    });

    expect(continuation.request.messages.at(-1)).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval_1',
          approved: false,
          reason: 'Operator denied this Sandbox action.',
        },
      ],
    });
  });

  it('keeps failed history retryable without duplicating its user entry', () => {
    const run = buildUserRun(initialAgentThreadState, {
      runId: 'run_1',
      externalUserId: 'sandbox_user',
      provider: 'google',
      model: 'gemini-2.5-flash',
      text: 'Try once',
    });
    const started = agentThreadReducer(initialAgentThreadState, {
      type: 'run_started',
      run,
    });
    const failed = agentThreadReducer(started, {
      type: 'run_failed',
      runId: 'run_1',
      error: { message: 'Model unavailable', code: 'MODEL_DOWN' },
    });
    const retried = agentThreadReducer(failed, {
      type: 'run_started',
      run: { ...run, isRetry: true },
    });

    expect(retried.entries.filter((entry) => entry.kind === 'user')).toHaveLength(1);
    expect(retried.entries.some((entry) => entry.kind === 'error')).toBe(false);
    expect(retried.runs).toEqual([expect.objectContaining({ id: 'run_1', request: run.request })]);
  });

  it('extracts approval and tool response activity for the inspector', () => {
    expect(
      extractToolActivity({
        status: 'approval_required',
        approvalRequests: [
          {
            approvalId: 'approval_1',
            toolCall: { toolName: 'github_create_issue', input: { title: 'Test' } },
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolName: 'github_list_repositories' },
              { type: 'text', text: 'Checking repositories.' },
            ],
          },
        ],
      })
    ).toEqual([
      expect.objectContaining({ approvalId: 'approval_1' }),
      expect.objectContaining({ type: 'tool-call', toolName: 'github_list_repositories' }),
    ]);
  });

  it('resets every ephemeral conversation field', () => {
    const dirty: AgentThreadState = {
      ...initialAgentThreadState,
      modelMessages: [{ role: 'user', content: 'x' }],
      entries: [{ id: '1', kind: 'user', text: 'x', runId: 'run_1' }],
      draft: 'draft',
      status: 'failed',
    };

    expect(agentThreadReducer(dirty, { type: 'reset' })).toEqual(initialAgentThreadState);
  });
});

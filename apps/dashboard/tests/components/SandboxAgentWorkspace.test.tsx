import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxAgentWorkspace } from '@/components/sandbox/SandboxAgentWorkspace';
import * as apiModule from '@/lib/api';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: vi.fn(), stream: vi.fn() } };
});

describe('SandboxAgentWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses viewport breakpoints emitted by the dashboard Tailwind configuration', () => {
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);

    const conversation = screen.getByRole('log', { name: 'Conversation' });
    const splitWorkspace = conversation.parentElement?.parentElement;
    expect(splitWorkspace).toHaveClass('xl:grid-cols-[3fr_2fr]', 'xl:items-start');
    expect(screen.getByRole('complementary')).toHaveClass('xl:sticky', 'xl:top-6');
  });

  it('sends a multi-turn canonical thread and locks the model until reset', async () => {
    vi.mocked(apiModule.api.post)
      .mockResolvedValueOnce({
        status: 'succeeded',
        text: 'First answer',
        responseMessages: [{ role: 'assistant', content: 'First answer' }],
      })
      .mockResolvedValueOnce({
        status: 'succeeded',
        text: 'Second answer',
        responseMessages: [{ role: 'assistant', content: 'Second answer' }],
      });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const conversation = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByLabelText('Message'), 'First question');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await within(conversation).findByText('First answer')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toBeDisabled();
    expect(screen.getByLabelText('Model')).toBeDisabled();

    await user.type(screen.getByLabelText('Message'), 'Follow up');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await within(conversation).findByText('Second answer')).toBeInTheDocument();
    expect(apiModule.api.post).toHaveBeenLastCalledWith(
      '/sandbox/agent-runs',
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: 'Follow up' },
        ],
      })
    );

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.getByLabelText('Provider')).toBeEnabled();
    expect(screen.getByLabelText('Model')).toBeEnabled();
    expect(within(conversation).queryByText('First answer')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Run the agent to inspect its JSON.');
  });

  it.each([
    { label: 'Approve action', approved: true, answer: 'Created' },
    { label: 'Deny action', approved: false, answer: 'Cancelled' },
  ])('continues the complete thread after $label', async ({ label, approved, answer }) => {
    vi.mocked(apiModule.api.post)
      .mockResolvedValueOnce({
        status: 'approval_required',
        text: '',
        approvalRequests: [
          {
            approvalId: 'approval_1',
            toolCall: {
              toolName: 'github_create_issue',
              input: { title: 'Test' },
            },
          },
        ],
        responseMessages: [
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
      })
      .mockResolvedValueOnce({
        status: 'succeeded',
        text: answer,
        responseMessages: [{ role: 'assistant', content: answer }],
      });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const conversation = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByLabelText('Message'), 'Create an issue');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await user.click(await screen.findByRole('button', { name: label }));

    expect(await within(conversation).findByText(answer)).toBeInTheDocument();
    expect(apiModule.api.post).toHaveBeenLastCalledWith(
      '/sandbox/agent-runs',
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: 'tool',
            content: [
              expect.objectContaining({
                approvalId: 'approval_1',
                approved,
              }),
            ],
          },
        ]),
      })
    );
  });

  it('preserves failed history and retries the exact request without duplicating the user message', async () => {
    vi.mocked(apiModule.api.post)
      .mockRejectedValueOnce(new Error('Model unavailable'))
      .mockResolvedValueOnce({
        status: 'succeeded',
        text: 'Recovered',
        responseMessages: [{ role: 'assistant', content: 'Recovered' }],
      });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const conversation = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByLabelText('Message'), 'Try once');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Retry message' }));

    expect(await within(conversation).findByText('Recovered')).toBeInTheDocument();
    expect(within(conversation).getAllByText('Try once')).toHaveLength(1);
    expect(apiModule.api.post).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiModule.api.post).mock.calls[1]?.[1]).toEqual(
      vi.mocked(apiModule.api.post).mock.calls[0]?.[1]
    );
  });

  it('sends with Enter and keeps a newline with Shift+Enter', async () => {
    vi.mocked(apiModule.api.post).mockResolvedValueOnce({
      status: 'succeeded',
      text: 'Done',
      responseMessages: [{ role: 'assistant', content: 'Done' }],
    });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const composer = screen.getByLabelText('Message');

    await user.type(composer, 'Line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(composer, 'Line two');

    expect(composer).toHaveValue('Line one\nLine two');
    await user.keyboard('{Enter}');
    expect(apiModule.api.post).toHaveBeenCalledOnce();
    expect(apiModule.api.post).toHaveBeenCalledWith(
      '/sandbox/agent-runs',
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Line one\nLine two' }],
      })
    );
  });
  it('shows the tool call and its result while the answer is still streaming', async () => {
    vi.mocked(apiModule.api.stream).mockImplementation(async function* () {
      yield {
        event: 'tool-call',
        data: {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'github_list_repositories',
          input: { visibility: 'all' },
        },
      };
      yield {
        event: 'tool-result',
        data: {
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'github_list_repositories',
          output: { repositories: ['authlane'] },
          truncated: false,
        },
      };
      yield { event: 'text-delta', data: { type: 'text-delta', text: 'You have ' } };
      yield { event: 'text-delta', data: { type: 'text-delta', text: 'one repository.' } };
      yield {
        event: 'done',
        data: {
          result: {
            status: 'succeeded',
            text: 'You have one repository.',
            responseMessages: [{ role: 'assistant', content: 'You have one repository.' }],
          },
        },
      };
    });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const conversation = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByLabelText('Message'), 'List my repositories');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await within(conversation).findByText('github_list_repositories')).toBeInTheDocument();
    expect(within(conversation).getByText('Result')).toBeInTheDocument();
    expect(within(conversation).getByText(/authlane/)).toBeInTheDocument();
    expect(within(conversation).getByText('You have one repository.')).toBeInTheDocument();
    expect(apiModule.api.post).not.toHaveBeenCalled();
  });

  it('falls back to the non-streaming endpoint when the transport drops the stream', async () => {
    vi.mocked(apiModule.api.stream).mockImplementation(() => {
      throw new TypeError('Failed to fetch');
    });
    vi.mocked(apiModule.api.post).mockResolvedValueOnce({
      status: 'succeeded',
      text: 'Buffered answer',
      responseMessages: [{ role: 'assistant', content: 'Buffered answer' }],
    });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const conversation = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByLabelText('Message'), 'List my repositories');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await within(conversation).findByText('Buffered answer')).toBeInTheDocument();
    expect(apiModule.api.post).toHaveBeenCalledWith(
      '/sandbox/agent-runs',
      expect.objectContaining({ externalUserId: 'sandbox_user' })
    );
  });

  it('reports the cause of a failed run and its remedy', async () => {
    vi.mocked(apiModule.api.stream).mockImplementation(async function* () {
      yield {
        event: 'error',
        data: {
          error: {
            code: 'SANDBOX_PROVIDER_NOT_CONFIGURED',
            message: 'The selected model provider is not configured on this server.',
            hint: 'Set ANTHROPIC_API_KEY on the Authlane server.',
          },
        },
      };
    });
    const user = userEvent.setup();
    render(<SandboxAgentWorkspace externalUserId="sandbox_user" />);
    const conversation = screen.getByRole('log', { name: 'Conversation' });

    await user.type(screen.getByLabelText('Message'), 'List my repositories');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(
      await within(conversation).findByText(/is not configured on this server/)
    ).toBeInTheDocument();
    expect(within(conversation).getByText(/Set ANTHROPIC_API_KEY/)).toBeInTheDocument();
  });

  it('starts on a provider that actually has a server key', async () => {
    render(
      <SandboxAgentWorkspace
        externalUserId="sandbox_user"
        providers={[
          { id: 'openai', configured: false },
          { id: 'anthropic', configured: true },
          { id: 'google', configured: false },
        ]}
      />
    );

    expect(screen.getByLabelText('Provider')).toHaveValue('anthropic');
    expect(screen.getByLabelText('Model')).toHaveValue('claude-opus-5');
    expect(screen.getByRole('option', { name: /OpenAI — no server key/ })).toBeTruthy();
  });
});

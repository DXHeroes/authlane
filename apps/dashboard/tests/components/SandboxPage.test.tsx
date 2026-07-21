import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import SandboxPage from '@/pages/SandboxPage';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

describe('SandboxPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a dedicated user and exposes tool risk before execution', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValueOnce({
      externalUserId: 'sandbox_user',
      services: [
        {
          serviceId: 'github',
          status: 'connected',
          connected: true,
          toolAccessPolicy: 'full',
          tools: [
            {
              name: 'github_create_issue',
              description: 'Create an issue',
              risk: 'write',
              annotations: { readOnlyHint: false, destructiveHint: false },
              inputSchema: { type: 'object' },
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    render(<SandboxPage />);

    await user.type(screen.getByLabelText('External user ID'), 'sandbox_user');
    await user.click(screen.getByRole('button', { name: 'Load sandbox user' }));

    expect(await screen.findByRole('heading', { name: 'github_create_issue' })).toBeInTheDocument();
    expect(screen.getByText('Approval required')).toBeInTheDocument();
    expect(screen.getByText(/dedicated test identity/i)).toBeInTheDocument();
    const toolSplit = screen
      .getByRole('heading', { name: 'Tool output' })
      .closest('aside')?.parentElement;
    expect(toolSplit).toHaveClass('xl:grid-cols-[3fr_2fr]');
  });

  it('does not execute a write tool until the operator confirms approval', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValueOnce({
      externalUserId: 'sandbox_user',
      services: [
        {
          serviceId: 'github',
          status: 'connected',
          connected: true,
          toolAccessPolicy: 'full',
          tools: [
            {
              name: 'github_create_issue',
              description: 'Create an issue',
              risk: 'write',
              annotations: { readOnlyHint: false, destructiveHint: false },
              inputSchema: { type: 'object' },
            },
          ],
        },
      ],
    });
    vi.mocked(apiModule.api.post)
      .mockResolvedValueOnce({ status: 'approval_required', risk: 'write' })
      .mockResolvedValueOnce({ status: 'succeeded', result: { id: 42 } });
    const user = userEvent.setup();
    render(<SandboxPage />);
    await user.type(screen.getByLabelText('External user ID'), 'sandbox_user');
    await user.click(screen.getByRole('button', { name: 'Load sandbox user' }));
    await screen.findByRole('heading', { name: 'github_create_issue' });

    await user.click(screen.getByRole('button', { name: 'Run tool' }));
    expect(apiModule.api.post).toHaveBeenLastCalledWith(
      '/sandbox/tool-runs',
      expect.objectContaining({ approved: false })
    );
    await user.click(await screen.findByRole('button', { name: 'Approve and run' }));
    expect(apiModule.api.post).toHaveBeenLastCalledWith(
      '/sandbox/tool-runs',
      expect.objectContaining({ approved: true })
    );
  });

  it('exposes the ephemeral AI chat and JSON inspector for a loaded identity', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValueOnce({
      externalUserId: 'sandbox_user',
      services: [],
    });
    const user = userEvent.setup();
    render(<SandboxPage />);

    await user.type(screen.getByLabelText('External user ID'), 'sandbox_user');
    await user.click(screen.getByRole('button', { name: 'Load sandbox user' }));
    await user.click(await screen.findByRole('tab', { name: 'AI agent' }));

    expect(screen.getByRole('heading', { name: 'AI chat' })).toBeInTheDocument();
    expect(screen.getByText(/thread is cleared on reload/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Latest' })).toBeInTheDocument();
  });

  it('clears the AI chat when the operator loads another sandbox identity', async () => {
    vi.mocked(apiModule.api.get)
      .mockResolvedValueOnce({ externalUserId: 'sandbox_one', services: [] })
      .mockResolvedValueOnce({ externalUserId: 'sandbox_two', services: [] });
    vi.mocked(apiModule.api.post).mockResolvedValueOnce({
      status: 'succeeded',
      text: 'Identity one answer',
      responseMessages: [{ role: 'assistant', content: 'Identity one answer' }],
    });
    const user = userEvent.setup();
    render(<SandboxPage />);
    const externalUserInput = screen.getByLabelText('External user ID');

    await user.type(externalUserInput, 'sandbox_one');
    await user.click(screen.getByRole('button', { name: 'Load sandbox user' }));
    await user.click(await screen.findByRole('tab', { name: 'AI agent' }));
    await user.type(screen.getByLabelText('Message'), 'Who am I?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const firstConversation = screen.getByRole('log', { name: 'Conversation' });
    expect(await within(firstConversation).findByText('Identity one answer')).toBeInTheDocument();

    await user.clear(externalUserInput);
    await user.type(externalUserInput, 'sandbox_two');
    await user.click(screen.getByRole('button', { name: 'Load sandbox user' }));

    const secondConversation = screen.getByRole('log', { name: 'Conversation' });
    expect(within(secondConversation).queryByText('Identity one answer')).not.toBeInTheDocument();
    expect(
      within(secondConversation).getByText(/start with a real connector question/i)
    ).toBeInTheDocument();
  });
});

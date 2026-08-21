import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import SandboxPage from '@/pages/SandboxPage';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), stream: vi.fn() },
  DashboardApiError: class DashboardApiError extends Error {},
}));

interface IdentitiesResponse {
  identities: { externalUserId: string; connectedServices: number; lastUsedAt: string | null }[];
  suggested: string;
}

/**
 * Routes GET by path: the page asks for its identities on mount and for a context on every load,
 * so a positional `mockResolvedValueOnce` chain would hand the wrong payload to the wrong call.
 */
function mockGet(identities: IdentitiesResponse, contexts: Record<string, unknown>) {
  vi.mocked(apiModule.api.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/sandbox/identities')) return identities;
    const externalUserId =
      new URLSearchParams(path.split('?')[1] ?? '').get('externalUserId') ?? '';
    return contexts[externalUserId] ?? { externalUserId, services: [] };
  });
}

const noIdentities: IdentitiesResponse = { identities: [], suggested: 'sandbox_suggested' };

function githubService(risk: 'read' | 'write') {
  return {
    serviceId: 'github',
    status: 'connected',
    connected: true,
    toolAccessPolicy: 'full',
    tools: [
      {
        name: 'github_create_issue',
        description: 'Create an issue',
        risk,
        annotations: { readOnlyHint: risk === 'read', destructiveHint: false },
        inputSchema: { type: 'object' },
      },
    ],
  };
}

async function loadIdentity(user: ReturnType<typeof userEvent.setup>, externalUserId: string) {
  const input = screen.getByLabelText('External user ID') as HTMLInputElement;
  // The suggestion lands asynchronously; typing before it would race with it.
  await waitFor(() => expect(input.value).not.toBe(''));
  await user.clear(input);
  await user.type(input, externalUserId);
  await user.click(screen.getByRole('button', { name: 'Load sandbox user' }));
}

describe('SandboxPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a dedicated user and exposes tool risk before execution', async () => {
    mockGet(noIdentities, {
      sandbox_user: { externalUserId: 'sandbox_user', services: [githubService('write')] },
    });
    const user = userEvent.setup();
    render(<SandboxPage />);

    await loadIdentity(user, 'sandbox_user');

    expect(await screen.findByRole('heading', { name: 'github_create_issue' })).toBeInTheDocument();
    expect(screen.getByText('Approval required')).toBeInTheDocument();
    expect(screen.getByText(/dedicated test identity/i)).toBeInTheDocument();
    const toolSplit = screen
      .getByRole('heading', { name: 'Tool output' })
      .closest('aside')?.parentElement;
    expect(toolSplit).toHaveClass('xl:grid-cols-[3fr_2fr]');
  });

  it('suggests an identity that already has connections and loads it without being asked', async () => {
    mockGet(
      {
        identities: [
          { externalUserId: 'sandbox_ready', connectedServices: 1, lastUsedAt: null },
          { externalUserId: 'sandbox_empty', connectedServices: 0, lastUsedAt: null },
        ],
        suggested: 'sandbox_ready',
      },
      { sandbox_ready: { externalUserId: 'sandbox_ready', services: [githubService('read')] } }
    );
    render(<SandboxPage />);

    expect(await screen.findByRole('heading', { name: 'github_create_issue' })).toBeInTheDocument();
    expect(screen.getByLabelText('External user ID')).toHaveValue('sandbox_ready');
    expect(
      screen.getByRole('option', { name: /sandbox_ready — 1 connected service/ })
    ).toBeTruthy();
  });

  it('offers a fresh identity without making the operator invent one', async () => {
    mockGet(noIdentities, {});
    const user = userEvent.setup();
    render(<SandboxPage />);

    await user.click(screen.getByRole('button', { name: 'New identity' }));

    const input = screen.getByLabelText('External user ID') as HTMLInputElement;
    expect(input.value).toMatch(/^sandbox_[0-9a-f]{12}$/);
  });

  it('says plainly when the loaded identity has nothing connected', async () => {
    mockGet(noIdentities, { sandbox_empty: { externalUserId: 'sandbox_empty', services: [] } });
    const user = userEvent.setup();
    render(<SandboxPage />);

    await loadIdentity(user, 'sandbox_empty');

    expect(
      await screen.findByRole('heading', { name: /nothing is connected for this identity/i })
    ).toBeInTheDocument();
  });

  it('does not execute a write tool until the operator confirms approval', async () => {
    mockGet(noIdentities, {
      sandbox_user: { externalUserId: 'sandbox_user', services: [githubService('write')] },
    });
    vi.mocked(apiModule.api.post)
      .mockResolvedValueOnce({ status: 'approval_required', risk: 'write' })
      .mockResolvedValueOnce({ status: 'succeeded', result: { id: 42 } });
    const user = userEvent.setup();
    render(<SandboxPage />);
    await loadIdentity(user, 'sandbox_user');
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
    mockGet(noIdentities, {});
    const user = userEvent.setup();
    render(<SandboxPage />);

    await loadIdentity(user, 'sandbox_user');
    await user.click(await screen.findByRole('tab', { name: 'AI agent' }));

    expect(screen.getByRole('heading', { name: 'AI chat' })).toBeInTheDocument();
    expect(screen.getByText(/thread is cleared on reload/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Latest' })).toBeInTheDocument();
  });

  it('clears the AI chat when the operator loads another sandbox identity', async () => {
    mockGet(noIdentities, {});
    vi.mocked(apiModule.api.stream).mockImplementation(async function* () {
      yield {
        event: 'done',
        data: {
          result: {
            status: 'succeeded',
            text: 'Identity one answer',
            responseMessages: [{ role: 'assistant', content: 'Identity one answer' }],
          },
        },
      };
    });
    const user = userEvent.setup();
    render(<SandboxPage />);

    await loadIdentity(user, 'sandbox_one');
    await user.click(await screen.findByRole('tab', { name: 'AI agent' }));
    await user.type(screen.getByLabelText('Message'), 'Who am I?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const firstConversation = screen.getByRole('log', { name: 'Conversation' });
    expect(await within(firstConversation).findByText('Identity one answer')).toBeInTheDocument();

    await loadIdentity(user, 'sandbox_two');

    const secondConversation = screen.getByRole('log', { name: 'Conversation' });
    expect(within(secondConversation).queryByText('Identity one answer')).not.toBeInTheDocument();
    expect(
      within(secondConversation).getByText(/start with a real connector question/i)
    ).toBeInTheDocument();
  });
});

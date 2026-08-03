import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import McpServersPage from '@/pages/McpServersPage';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  DashboardApiError: class extends Error {},
}));

const SERVER = {
  id: 'mcp-1',
  name: 'Support desk',
  serverUrl: 'https://mcp.example.com',
  authType: 'oauth2',
  enabled: true,
  discoveredAt: '2026-08-03T10:00:00.000Z',
  discoveryError: null,
  oauthClientId: 'client-1',
  createdAt: '2026-08-03T09:00:00.000Z',
};

describe('McpServersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists a registered server with its id and URL', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValueOnce([SERVER]);

    render(<McpServersPage />);

    expect(await screen.findByText('Support desk')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.example.com')).toBeInTheDocument();
    expect(screen.getByText('mcp-1')).toBeInTheDocument();
  });

  it('surfaces a server discovery could not reach, so it can be retried', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValueOnce([
      { ...SERVER, enabled: false, discoveryError: 'Server did not answer tools/list' },
    ]);

    render(<McpServersPage />);

    expect(await screen.findByText('Not discovered')).toBeInTheDocument();
    expect(
      screen.getByText(/Last discovery failed: Server did not answer tools\/list/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rediscover' })).toBeEnabled();
  });

  it('shows a disapproved tool so the tenant can switch it back on', async () => {
    vi.mocked(apiModule.api.get)
      .mockResolvedValueOnce([SERVER])
      .mockResolvedValueOnce([
        {
          name: 'delete_ticket',
          description: 'Removes a ticket',
          risk: 'destructive',
          approved: false,
          declaredAnnotations: { readOnlyHint: true },
          lastSeenAt: '2026-08-03T10:00:00.000Z',
        },
      ]);

    render(<McpServersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tools' }));

    expect(await screen.findByText('delete_ticket')).toBeInTheDocument();
    // The stored risk drives the control, not what the server declared about itself.
    expect(screen.getByLabelText('Risk for delete_ticket')).toHaveValue('destructive');
    // What the server claims is shown next to what Authlane enforces, never instead of it.
    expect(screen.getByText(/server claims: readOnlyHint/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  });
});

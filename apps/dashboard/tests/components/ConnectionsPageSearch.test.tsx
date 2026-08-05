import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import ConnectionsPage from '@/pages/ConnectionsPage';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  DashboardApiError: class extends Error {},
}));

const CONNECTION = {
  id: 'conn-1',
  scope: 'user' as const,
  organizationId: 'org-1',
  serviceId: 'google-drive',
  externalUserId: 'user_42',
  status: 'active' as const,
  createdAt: '2026-08-03T19:54:26.000Z',
  updatedAt: '2026-08-03T19:54:26.000Z',
};

const connectionRequests = () =>
  vi
    .mocked(apiModule.api.get)
    .mock.calls.map(([path]) => path)
    .filter((path) => path.startsWith('/connections'));

describe('searching connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api.get).mockImplementation(async (path: string) => {
      if (path.startsWith('/connections')) return [CONNECTION];
      if (path === '/services') return [];
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  /**
   * The search term went straight into the query key, so an eight-character user id fired
   * eight requests and whichever answered last won.
   */
  it('asks once for a typed user id rather than once per keystroke', async () => {
    const user = userEvent.setup();
    render(<ConnectionsPage />);

    await screen.findByText('user_42');
    const before = connectionRequests().length;

    await user.type(screen.getByLabelText('Search by user ID'), 'user_42');

    await waitFor(
      () => {
        expect(connectionRequests().length).toBe(before + 1);
      },
      { timeout: 2000 }
    );

    expect(connectionRequests().at(-1)).toContain('userId=user_42');
  });

  it('offers a way out of a filter that matches nothing', async () => {
    const user = userEvent.setup();
    render(<ConnectionsPage />);
    await screen.findByText('user_42');

    await user.type(screen.getByLabelText('Search by user ID'), 'nobody');

    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('says how many connections the current filters show', async () => {
    render(<ConnectionsPage />);

    expect(await screen.findByText('1 connection')).toBeInTheDocument();
  });
});

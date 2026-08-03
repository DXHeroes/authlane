import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import ConnectionsPage from '@/pages/ConnectionsPage';
import { render, screen } from '../utils/test-utils';

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

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api.get).mockImplementation(async (path) => {
      if (path.startsWith('/connections')) return [CONNECTION];
      if (path === '/services') return [];
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it('shows the end user each connection belongs to', async () => {
    render(<ConnectionsPage />);

    // The API field is externalUserId; reading anything else leaves the column blank.
    expect(await screen.findByText('user_42')).toBeInTheDocument();
  });
});

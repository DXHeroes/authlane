import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import ApiKeysPage from '@/pages/ApiKeysPage';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('ApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the scopes granted to each API key', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValueOnce([
      {
        id: 'key-1',
        organizationId: 'org-1',
        name: 'Production agent',
        keyPrefix: 'ak_live_',
        scopes: ['catalog:read', 'credentials:issue'],
        createdAt: '2026-07-16T00:00:00.000Z',
      },
    ]);

    render(<ApiKeysPage />);

    expect(await screen.findByText('catalog:read')).toBeInTheDocument();
    expect(screen.getByText('credentials:issue')).toBeInTheDocument();
  });
});

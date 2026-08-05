import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  DashboardApiError: class extends Error {},
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const KEY = {
  id: 'key-1',
  organizationId: 'org-1',
  name: 'Production agent',
  keyPrefix: 'ak_live_',
  scopes: ['catalog:read'],
  createdAt: '2026-07-16T00:00:00.000Z',
};

/**
 * Revoking used to run through `window.confirm()`, which names the page rather than the
 * key and cannot say what breaks. These cover the part that matters: nothing is revoked
 * until someone says so, and the key is named where they are asked.
 */
describe('revoking an API key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api.get).mockResolvedValue([KEY]);
  });

  it('names the key and its consequence before anything is revoked', async () => {
    const user = userEvent.setup();
    render(<ApiKeysPage />);

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));

    expect(
      await screen.findByRole('heading', { name: 'Revoke Production agent?' })
    ).toBeInTheDocument();
    expect(screen.getByText(/starts failing immediately/i)).toBeInTheDocument();
    expect(apiModule.api.delete).not.toHaveBeenCalled();
  });

  it('leaves the key alone when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    render(<ApiKeysPage />);

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Revoke Production agent?' })
      ).not.toBeInTheDocument();
    });
    expect(apiModule.api.delete).not.toHaveBeenCalled();
  });

  it('revokes only after the confirming button is pressed', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.delete).mockResolvedValue(undefined as never);
    render(<ApiKeysPage />);

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke key' }));

    await waitFor(() => {
      expect(apiModule.api.delete).toHaveBeenCalledWith('/api-keys/key-1');
    });
  });

  it('closes with Escape without revoking, which window.confirm could not do', async () => {
    const user = userEvent.setup();
    render(<ApiKeysPage />);

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Revoke Production agent?' })
      ).not.toBeInTheDocument();
    });
    expect(apiModule.api.delete).not.toHaveBeenCalled();
  });
});

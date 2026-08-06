import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import * as toastModule from '@/lib/toast';
import * as roleModule from '@/lib/use-organization-role';
import OAuthClientsPage from '@/pages/OAuthClientsPage';
import { render, screen, waitFor } from '../utils/test-utils';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/toast', () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

vi.mock('@/lib/use-organization-role', () => ({ useOrganizationRole: vi.fn() }));

const CLIENT = {
  id: 'oauth_client_1',
  name: 'SmartStaff',
  clientId: 'nDq1V2h7',
  redirectUris: ['https://app.smartstaff.io/auth/authlane/callback'],
  disabled: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function asRole(role: 'owner' | 'admin' | 'member' | null) {
  vi.mocked(roleModule.useOrganizationRole).mockReturnValue({ role, isLoading: false });
}

describe('OAuthClientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asRole('admin');
    vi.mocked(apiModule.api.get).mockResolvedValue([CLIENT]);
  });

  it('shows what a developer needs to configure the application', async () => {
    render(<OAuthClientsPage />);

    expect(await screen.findByText('SmartStaff')).toBeInTheDocument();
    expect(screen.getByText('nDq1V2h7')).toBeInTheDocument();
    expect(
      screen.getByText('https://app.smartstaff.io/auth/authlane/callback')
    ).toBeInTheDocument();
  });

  it('marks a disabled application without offering a control to a plain member', async () => {
    asRole('member');
    vi.mocked(apiModule.api.get).mockResolvedValue([{ ...CLIENT, disabled: true }]);

    render(<OAuthClientsPage />);

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register application' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('offers the management controls to an admin', async () => {
    render(<OAuthClientsPage />);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register application' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Disable SmartStaff' })).toBeInTheDocument();
  });

  it('tells a member why the list is empty rather than dangling a control they cannot use', async () => {
    asRole('member');
    vi.mocked(apiModule.api.get).mockResolvedValue([]);

    render(<OAuthClientsPage />);

    expect(await screen.findByText('No connected apps yet')).toBeInTheDocument();
    expect(
      screen.getByText('Only admins and owners can manage connected apps.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Register/ })).not.toBeInTheDocument();
  });

  it('disables an application through the API', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.patch).mockResolvedValue({ ...CLIENT, disabled: true });

    render(<OAuthClientsPage />);
    await user.click(await screen.findByRole('switch', { name: 'Disable SmartStaff' }));

    await waitFor(() =>
      expect(apiModule.api.patch).toHaveBeenCalledWith('/oauth-clients/oauth_client_1', {
        disabled: true,
      })
    );
  });

  it('answers a refusal from the API in this screen’s own words', async () => {
    const user = userEvent.setup();
    // The role lookup can be stale — a demotion between page load and click still ends here.
    vi.mocked(apiModule.api.patch).mockRejectedValue(
      new apiModule.DashboardApiError(
        'Only admins and owners can manage OAuth clients',
        'INSUFFICIENT_SCOPE'
      )
    );

    render(<OAuthClientsPage />);
    await user.click(await screen.findByRole('switch', { name: 'Disable SmartStaff' }));

    await waitFor(() => expect(toastModule.toastError).toHaveBeenCalled());
    const [reported] = vi.mocked(toastModule.toastError).mock.calls[0];
    expect((reported as Error).message).toBe('Only admins and owners can manage connected apps.');
  });

  it('confirms removal before disconnecting everyone signed in through it', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.delete).mockResolvedValue({ deleted: true });

    render(<OAuthClientsPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Remove SmartStaff?')).toBeInTheDocument();
    expect(apiModule.api.delete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove application' }));
    await waitFor(() =>
      expect(apiModule.api.delete).toHaveBeenCalledWith('/oauth-clients/oauth_client_1')
    );
  });
});

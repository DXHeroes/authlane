import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthClientModal, { parseRedirectUris } from '@/components/OAuthClientModal';
import * as apiModule from '@/lib/api';
import { render, screen, waitFor } from '../utils/test-utils';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  api: { post: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/lib/toast', () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const CREATED = {
  id: 'oauth_client_1',
  name: 'SmartStaff',
  clientId: 'nDq1V2h7',
  clientSecret: 'alcs_thisisshownexactlyonce',
  redirectUris: ['https://app.smartstaff.io/cb'],
  disabled: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function registerClient(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Application name'), 'SmartStaff');
  await user.type(screen.getByLabelText('Redirect URIs'), 'https://app.smartstaff.io/cb');
  await user.click(screen.getByRole('button', { name: 'Register application' }));
}

describe('OAuthClientModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the client secret once, says so, and does not send it back for a re-read', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockResolvedValue(CREATED);

    render(<OAuthClientModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await registerClient(user);

    expect(await screen.findByText('Copy the client secret now')).toBeInTheDocument();
    expect(screen.getByText(/only time it can be shown/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Client secret')).toHaveValue('alcs_thisisshownexactlyonce');
    expect(screen.getByLabelText('Client ID')).toHaveValue('nDq1V2h7');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('sends one redirect URI per line, so no comma can smuggle in a second callback', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockResolvedValue(CREATED);

    render(<OAuthClientModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.type(screen.getByLabelText('Application name'), 'SmartStaff');
    await user.type(
      screen.getByLabelText('Redirect URIs'),
      'https://app.smartstaff.io/cb{Enter}https://staging.smartstaff.io/cb'
    );
    await user.click(screen.getByRole('button', { name: 'Register application' }));

    await waitFor(() =>
      expect(apiModule.api.post).toHaveBeenCalledWith('/oauth-clients', {
        name: 'SmartStaff',
        redirectUris: ['https://app.smartstaff.io/cb', 'https://staging.smartstaff.io/cb'],
      })
    );
  });

  it('surfaces the rule a rejected redirect URI broke, not just that one did', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockRejectedValue(
      new apiModule.DashboardApiError(
        'Invalid redirect URI',
        'VALIDATION_ERROR',
        'A redirect URI may not contain a wildcard; matching is exact: https://*.example.com/cb'
      )
    );

    render(<OAuthClientModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await registerClient(user);

    expect(await screen.findByText('Invalid redirect URI')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A redirect URI may not contain a wildcard; matching is exact: https://*.example.com/cb'
      )
    ).toBeInTheDocument();
    // The form is still standing, with what was typed, so the URI can be corrected in place.
    expect(screen.getByLabelText('Application name')).toHaveValue('SmartStaff');
  });

  it('edits an existing client without ever showing a secret', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(apiModule.api.patch).mockResolvedValue({ ...CREATED, name: 'SmartStaff EU' });

    render(
      <OAuthClientModal
        client={{ ...CREATED, redirectUris: ['https://app.smartstaff.io/cb'] }}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByLabelText('Redirect URIs')).toHaveValue('https://app.smartstaff.io/cb');
    await user.clear(screen.getByLabelText('Application name'));
    await user.type(screen.getByLabelText('Application name'), 'SmartStaff EU');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiModule.api.patch).toHaveBeenCalledWith('/oauth-clients/oauth_client_1', {
        name: 'SmartStaff EU',
        redirectUris: ['https://app.smartstaff.io/cb'],
      })
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(screen.queryByText('Copy the client secret now')).not.toBeInTheDocument();
  });
});

describe('parseRedirectUris', () => {
  it('trims each line and drops the blank ones', () => {
    expect(parseRedirectUris('  https://a.test/cb \n\n https://b.test/cb\n')).toEqual([
      'https://a.test/cb',
      'https://b.test/cb',
    ]);
  });

  it('is empty for empty input, which the form uses to keep submission disabled', () => {
    expect(parseRedirectUris('   \n  ')).toEqual([]);
  });
});

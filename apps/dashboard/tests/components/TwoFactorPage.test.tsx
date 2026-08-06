import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '@/lib/auth-client';
import { clearParkedRequest, stashParkedRequest } from '@/lib/oauth-flow';
import TwoFactorPage from '@/pages/TwoFactorPage';
import { render, screen, waitFor } from '../utils/test-utils';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
  },
}));

const AUTHORIZE_QUERY =
  'client_id=nDq1V2h7&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&response_type=code' +
  '&scope=openid%20email&state=st%2Fate%2B1';

let assign: ReturnType<typeof vi.spyOn>;

async function verify() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Authenticator code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify' }));
}

describe('TwoFactorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    vi.mocked(authClient.twoFactor.verifyTotp).mockResolvedValue({ error: null } as never);
    clearParkedRequest();
  });

  afterEach(() => {
    assign.mockRestore();
  });

  it('finishes a parked authorization instead of dropping the user on the dashboard', async () => {
    stashParkedRequest('authorize', AUTHORIZE_QUERY);
    render(<TwoFactorPage />);

    await verify();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(`/api/auth/oauth2/authorize?${AUTHORIZE_QUERY}`)
    );
  });

  it('finishes a parked consent request at the consent screen', async () => {
    stashParkedRequest('consent', 'consent_code=cc1&client_id=nDq1V2h7');
    render(<TwoFactorPage />);

    await verify();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/oauth/consent?consent_code=cc1&client_id=nDq1V2h7')
    );
  });

  it('goes to the dashboard rather than following a kind it does not handle', async () => {
    // The stash holds a kind, not a URL, and an unrecognised kind is refused at the take site —
    // so tampered storage cannot name a destination.
    window.sessionStorage.setItem(
      'authlane.oauth.parked_request',
      JSON.stringify({ kind: 'elsewhere', query: 'x=1', at: Date.now() })
    );
    render(<TwoFactorPage />);

    await verify();

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
  });

  it('goes to the dashboard for an ordinary sign-in', async () => {
    render(<TwoFactorPage />);

    await verify();

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
  });

  it('does not resume a request that has outlived the authorization behind it', async () => {
    // The plugin gives a parked authorization ten minutes; an abandoned one must not hijack the
    // next unrelated trip through two-factor.
    window.sessionStorage.setItem(
      'authlane.oauth.parked_request',
      JSON.stringify({ query: AUTHORIZE_QUERY, at: Date.now() - 600_001 })
    );
    render(<TwoFactorPage />);

    await verify();

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
  });

  it('stays put when verification fails', async () => {
    vi.mocked(authClient.twoFactor.verifyTotp).mockResolvedValue({
      error: { message: 'Invalid code' },
    } as never);
    stashParkedRequest('authorize', AUTHORIZE_QUERY);
    render(<TwoFactorPage />);

    await verify();

    expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });
});

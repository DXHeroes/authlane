import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearParkedRequest, stashParkedRequest, takeParkedRequest } from '@/lib/oauth-flow';
import LoginPage from '@/pages/LoginPage';
import { render, screen, waitFor } from '../utils/test-utils';

const login = vi.fn();
const requestMagicLink = vi.fn();
let authMode: 'magic-link' | 'email-password' = 'magic-link';
let isAuthenticated = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authMode,
    isAuthenticated,
    login,
    requestMagicLink,
    signUpEnabled: true,
  }),
}));

/**
 * A real parked authorization, spelled the way better-auth's oidc-provider forwards it: `scope` and
 * `state` arrive percent-encoded, and `URLSearchParams` would re-serialise both — `%20` becomes `+`
 * — if anything on the way through decoded them.
 */
const AUTHORIZE_QUERY =
  'client_id=nDq1V2h7&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&response_type=code' +
  '&scope=openid%20email&state=st%2Fate%2B1&code_challenge=E9Melhoa2Ow&code_challenge_method=S256';

function visit(path: string) {
  window.history.pushState({}, '', path);
}

let assign: ReturnType<typeof vi.spyOn>;

describe('LoginPage', () => {
  beforeEach(() => {
    authMode = 'magic-link';
    isAuthenticated = false;
    login.mockReset();
    requestMagicLink.mockReset();
    assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    clearParkedRequest();
    visit('/login');
  });

  afterEach(() => {
    assign.mockRestore();
  });

  it('offers one email-only cloud flow and confirms the inbox step', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email address'), 'developer@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue with email' }));

    await waitFor(() =>
      expect(requestMagicLink).toHaveBeenCalledWith('developer@example.com', {
        callbackURL: '/dashboard',
        newUserCallbackURL: '/onboarding',
        errorCallbackURL: '/login',
      })
    );
    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
  });

  it('preserves password sign-in for self-hosted mode', () => {
    authMode = 'email-password';
    render(<LoginPage />);

    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  describe('resuming a parked authorization', () => {
    it('sends the magic link back into the flow with the query byte-for-byte intact', async () => {
      const user = userEvent.setup();
      visit(`/login?${AUTHORIZE_QUERY}`);
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Email address'), 'developer@example.com');
      await user.click(screen.getByRole('button', { name: 'Continue with email' }));

      await waitFor(() => expect(requestMagicLink).toHaveBeenCalled());
      const [, destinations] = requestMagicLink.mock.calls[0];
      expect(destinations.callbackURL).toBe(`/api/auth/oauth2/authorize?${AUTHORIZE_QUERY}`);
      // A first-time user goes to the same place: the authorization endpoint answers
      // access_denied for a non-member, which the waiting application can act on.
      expect(destinations.newUserCallbackURL).toBe(`/api/auth/oauth2/authorize?${AUTHORIZE_QUERY}`);
      // A failed link keeps the request, so it can be retried without leaving the flow.
      expect(destinations.errorCallbackURL).toBe(`/login?${AUTHORIZE_QUERY}`);
    });

    it('hands the browser to the authorization endpoint once a session exists', async () => {
      authMode = 'email-password';
      isAuthenticated = true;
      visit(`/login?${AUTHORIZE_QUERY}`);

      render(<LoginPage />);

      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith(`/api/auth/oauth2/authorize?${AUTHORIZE_QUERY}`)
      );
    });

    it('stays put when a session exists but no authorization is parked', () => {
      isAuthenticated = true;
      visit('/login');

      render(<LoginPage />);

      expect(assign).not.toHaveBeenCalled();
    });

    it('does not resume before a session exists, leaving two-factor its own redirect', async () => {
      authMode = 'email-password';
      visit(`/login?${AUTHORIZE_QUERY}`);
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Email address'), 'developer@example.com');
      await user.type(screen.getByLabelText('Password'), 'correct horse');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => expect(login).toHaveBeenCalled());
      expect(assign).not.toHaveBeenCalled();
    });

    it('stashes the request so a two-factor detour can finish it', () => {
      visit(`/login?${AUTHORIZE_QUERY}`);

      render(<LoginPage />);

      expect(takeParkedRequest()).toEqual({ kind: 'authorize', query: AUTHORIZE_QUERY });
    });

    it('drops an abandoned request rather than letting it capture the next sign-in', () => {
      // The shared-machine case: someone walks away from an OAuth sign-in, and within the stash's
      // ten minutes the next person signs in through two-factor in the same tab. Without this,
      // they would land in a stranger's pending authorization and could grant an application on
      // their behalf.
      stashParkedRequest('authorize', AUTHORIZE_QUERY);
      visit('/login');

      render(<LoginPage />);

      expect(takeParkedRequest()).toBeNull();
    });

    it('clears the stash when it resumes the request itself', async () => {
      isAuthenticated = true;
      visit(`/login?${AUTHORIZE_QUERY}`);

      render(<LoginPage />);

      await waitFor(() => expect(assign).toHaveBeenCalled());
      expect(takeParkedRequest()).toBeNull();
    });

    it('ignores a query that is not an authorization request', () => {
      isAuthenticated = false;
      visit('/login?error=invalid_token');

      render(<LoginPage />);

      expect(screen.getByText(/this sign-in link is invalid/i)).toBeInTheDocument();
      expect(
        screen.queryByText('Sign in to continue to the application that sent you here')
      ).not.toBeInTheDocument();
    });

    it('says why the sign-in is being asked for', () => {
      visit(`/login?${AUTHORIZE_QUERY}`);

      render(<LoginPage />);

      expect(
        screen.getByText('Sign in to continue to the application that sent you here')
      ).toBeInTheDocument();
    });
  });

  describe('re-authentication prompt (prompt=login)', () => {
    // The shape better-auth forwards when the user already has a session: client_id, code and
    // state only. It carries no redirect_uri and no response_type, so it cannot be replayed.
    const REAUTH_QUERY = 'client_id=nDq1V2h7&code=abc123&state=st1';

    it('shows the sign-in form and does not try to replay an unreplayable query', async () => {
      authMode = 'email-password';
      isAuthenticated = true;
      visit(`/login?${REAUTH_QUERY}`);

      render(<LoginPage />);

      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(
        screen.getByText('Sign in to continue to the application that sent you here')
      ).toBeInTheDocument();
      // Resuming is the plugin's job here — it holds the full query in its own cookie.
      expect(assign).not.toHaveBeenCalled();
      expect(takeParkedRequest()).toBeNull();
    });
  });

  describe('a consent request whose session lapsed', () => {
    const CONSENT_QUERY = 'consent_code=cc1&client_id=nDq1V2h7&scope=openid%20email';

    it('returns to the consent screen once signed in, rather than the dashboard', async () => {
      isAuthenticated = true;
      visit(`/login?${CONSENT_QUERY}`);

      render(<LoginPage />);

      await waitFor(() => expect(window.location.pathname).toBe('/oauth/consent'));
      expect(window.location.search).toBe(`?${CONSENT_QUERY}`);
      // The consent screen is this same app, so it is reached through the router.
      expect(assign).not.toHaveBeenCalled();
    });

    it('survives the two-factor detour, like an authorization does', () => {
      visit(`/login?${CONSENT_QUERY}`);

      render(<LoginPage />);

      expect(takeParkedRequest()).toEqual({ kind: 'consent', query: CONSENT_QUERY });
    });

    it('survives the email hop by riding the magic link', async () => {
      const user = userEvent.setup();
      visit(`/login?${CONSENT_QUERY}`);
      render(<LoginPage />);

      await user.type(screen.getByLabelText('Email address'), 'developer@example.com');
      await user.click(screen.getByRole('button', { name: 'Continue with email' }));

      await waitFor(() => expect(requestMagicLink).toHaveBeenCalled());
      const [, destinations] = requestMagicLink.mock.calls[0];
      expect(destinations.callbackURL).toBe(`/oauth/consent?${CONSENT_QUERY}`);
      expect(destinations.errorCallbackURL).toBe(`/login?${CONSENT_QUERY}`);
      // A consent code is bound to the user it was minted for, and the plugin records the grant
      // against that user — so a brand-new account must not be handed the screen.
      expect(destinations.newUserCallbackURL).toBe('/onboarding');
    });
  });
});

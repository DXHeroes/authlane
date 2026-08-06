import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentRoute, LoginRoute } from '@/App';
import { render, screen, waitFor } from '../utils/test-utils';

/**
 * The routing decisions these two components make are the ones that silently kill a parked
 * authorization when they get them wrong: the application that asked simply waits forever, with no
 * error anywhere. Asserting on rendered output rather than on the source text is what makes an
 * inverted condition fail here — grepping App.tsx for the identifiers it calls would pass either
 * way round.
 */

let isAuthenticated = false;

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    authMode: 'email-password' as const,
    isAuthenticated,
    login: vi.fn(),
    requestMagicLink: vi.fn(),
    signUpEnabled: true,
  }),
}));

const AUTHORIZE_QUERY =
  'client_id=nDq1V2h7&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&response_type=code';
const CONSENT_QUERY = 'consent_code=cc1&client_id=nDq1V2h7&scope=openid%20email';
const REAUTH_QUERY = 'client_id=nDq1V2h7&code=abc123&state=st1';

function visit(path: string) {
  window.history.pushState({}, '', path);
}

let assign: ReturnType<typeof vi.spyOn>;

describe('LoginRoute', () => {
  beforeEach(() => {
    isAuthenticated = false;
    assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    window.sessionStorage.clear();
  });

  afterEach(() => assign.mockRestore());

  it('sends an authenticated visitor to the dashboard when nothing is parked', async () => {
    isAuthenticated = true;
    visit('/login');

    render(<LoginRoute />);

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it.each([
    ['a full authorize query', AUTHORIZE_QUERY],
    ['a re-authentication prompt', REAUTH_QUERY],
    ['a lapsed consent request', CONSENT_QUERY],
  ])('does not discard an authenticated visitor to the dashboard for %s', (_name, query) => {
    isAuthenticated = true;
    visit(`/login?${query}`);

    render(<LoginRoute />);

    // The dashboard is where a parked request goes to die. Where each shape goes instead differs —
    // the authorize query leaves through window.location, consent through the router, and a
    // re-authentication prompt waits for the form — so the shared guarantee is this one.
    expect(window.location.pathname).not.toBe('/dashboard');
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('stays on the sign-in form for a re-authentication prompt, which cannot be replayed', () => {
    isAuthenticated = true;
    visit(`/login?${REAUTH_QUERY}`);

    render(<LoginRoute />);

    expect(window.location.pathname).toBe('/login');
    // Resuming this shape is the plugin's job; rebuilding an authorize URL from it is impossible.
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the sign-in form to an unauthenticated visitor', () => {
    visit('/login');

    render(<LoginRoute />);

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });
});

describe('ConsentRoute', () => {
  beforeEach(() => {
    isAuthenticated = false;
    window.sessionStorage.clear();
    // The consent page fetches its client the moment it renders.
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ clientId: 'nDq1V2h7', name: 'SmartStaff', icon: null }),
    } as Response);
  });

  it('carries the request to the login page when the session has lapsed', async () => {
    visit(`/oauth/consent?${CONSENT_QUERY}`);

    render(<ConsentRoute />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    // Dropping the query here is what would strand the application: signing in would end on the
    // dashboard with nothing left pointing back at the consent screen.
    expect(window.location.search).toBe(`?${CONSENT_QUERY}`);
  });

  it('renders the consent screen for a signed-in visitor', async () => {
    isAuthenticated = true;
    visit(`/oauth/consent?${CONSENT_QUERY}`);

    render(<ConsentRoute />);

    expect(await screen.findByRole('button', { name: 'Allow access' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/oauth/consent');
  });
});

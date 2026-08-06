import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import OAuthConsentPage, { disclosuresForScope } from '@/pages/OAuthConsentPage';
import { render, screen, waitFor } from '../utils/test-utils';

// Keeps `DashboardApiError` real — ErrorNotice narrows on it with `instanceof`, which a wholesale
// module mock would turn into a TypeError the moment an error renders.
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  api: { get: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1', name: 'Acme Corp' } }),
}));

const CLIENT_ID = 'nDq1V2h7';
const CONSENT_CODE = 'consent-code-1';

interface FetchStub {
  ok: boolean;
  status: number;
  body: unknown;
}

function stubFetch(routes: Record<string, FetchStub>) {
  vi.mocked(global.fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.includes(path));
    if (!match) throw new Error(`Unexpected fetch: ${url}`);
    const { ok, status, body } = routes[match];
    return { ok, status, json: async () => body } as Response;
  });
}

function clientRoute(name = 'SmartStaff', icon: string | null = null): Record<string, FetchStub> {
  return {
    '/api/auth/oauth2/client/': {
      ok: true,
      status: 200,
      body: { clientId: CLIENT_ID, name, icon },
    },
  };
}

function visit(query: string) {
  window.history.pushState({}, '', `/oauth/consent${query}`);
}

let assign: ReturnType<typeof vi.spyOn>;

describe('OAuthConsentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    // The workspace name is only claimed when the active organization owns the client.
    vi.mocked(apiModule.api.get).mockResolvedValue([{ clientId: CLIENT_ID }]);
    visit(`?consent_code=${CONSENT_CODE}&client_id=${CLIENT_ID}&scope=openid%20email`);
  });

  afterEach(() => {
    assign.mockRestore();
  });

  it('names the application, the workspace, and only the scopes actually requested', async () => {
    stubFetch(clientRoute());

    render(<OAuthConsentPage />);

    expect(await screen.findByText(/SmartStaff/)).toBeInTheDocument();
    expect(await screen.findByText(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getByText('Your email address')).toBeInTheDocument();
    expect(screen.getByText('Your Authlane user ID')).toBeInTheDocument();
    // `profile` was not requested, so the name must not be listed as shared.
    expect(screen.queryByText('Your name')).not.toBeInTheDocument();
  });

  it('sends the consent code and hands the browser to the returned redirect', async () => {
    const user = userEvent.setup();
    stubFetch({
      ...clientRoute(),
      '/api/auth/oauth2/consent': {
        ok: true,
        status: 200,
        body: { redirectURI: 'https://app.example.com/cb?code=abc&state=xyz' },
      },
    });

    render(<OAuthConsentPage />);
    await user.click(await screen.findByRole('button', { name: 'Allow access' }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://app.example.com/cb?code=abc&state=xyz')
    );
    const consentCall = vi
      .mocked(global.fetch)
      .mock.calls.find(([input]) => String(input).includes('/consent'));
    expect(JSON.parse(String(consentCall?.[1]?.body))).toEqual({
      accept: true,
      consent_code: CONSENT_CODE,
    });
  });

  it('reports a denial to the application rather than staying on the page', async () => {
    const user = userEvent.setup();
    stubFetch({
      ...clientRoute(),
      '/api/auth/oauth2/consent': {
        ok: true,
        status: 200,
        body: { redirectURI: 'https://app.example.com/cb?error=access_denied' },
      },
    });

    render(<OAuthConsentPage />);
    await user.click(await screen.findByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://app.example.com/cb?error=access_denied')
    );
    const consentCall = vi
      .mocked(global.fetch)
      .mock.calls.find(([input]) => String(input).includes('/consent'));
    expect(JSON.parse(String(consentCall?.[1]?.body)).accept).toBe(false);
  });

  it('refuses to act when the page was opened without a request', async () => {
    visit('');

    render(<OAuthConsentPage />);

    expect(await screen.findByText('Nothing to authorize')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('says so when the client is not registered', async () => {
    stubFetch({
      '/api/auth/oauth2/client/': { ok: false, status: 404, body: { error: 'not_found' } },
    });

    render(<OAuthConsentPage />);

    expect(await screen.findByText('This request cannot be shown')).toBeInTheDocument();
    expect(
      screen.getByText('This application is not registered with Authlane.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow access' })).not.toBeInTheDocument();
  });

  it('does not navigate when the server answers without a destination', async () => {
    const user = userEvent.setup();
    stubFetch({
      ...clientRoute(),
      '/api/auth/oauth2/consent': { ok: true, status: 200, body: {} },
    });

    render(<OAuthConsentPage />);
    await user.click(await screen.findByRole('button', { name: 'Allow access' }));

    expect(await screen.findByText(/did not return a destination/)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not navigate to a destination that is not http', async () => {
    const user = userEvent.setup();
    stubFetch({
      ...clientRoute(),
      '/api/auth/oauth2/consent': {
        ok: true,
        status: 200,
        body: { redirectURI: 'javascript:alert(1)' },
      },
    });

    render(<OAuthConsentPage />);
    await user.click(await screen.findByRole('button', { name: 'Allow access' }));

    expect(await screen.findByText(/did not return a destination/)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('renders an attacker-chosen client name as text, and refuses a non-http icon', async () => {
    const hostileName = '<img src=x onerror="alert(1)">Trusted Bank';
    stubFetch(clientRoute(hostileName, 'javascript:alert(1)'));

    const { container } = render(<OAuthConsentPage />);

    expect(await screen.findByText(/Trusted Bank/)).toBeInTheDocument();
    // The name arrived as markup and stayed a string; nothing in it became an element.
    expect(container.querySelector('img')).toBeNull();
  });

  it('leaves the workspace unnamed when the active organization does not own the client', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue([{ clientId: 'a-different-client' }]);
    stubFetch(clientRoute());

    render(<OAuthConsentPage />);

    expect(
      await screen.findByText('You are signing in with your Authlane workspace.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Acme Corp/)).not.toBeInTheDocument();
  });
});

describe('disclosuresForScope', () => {
  it('describes the scopes Authlane grants', () => {
    expect(disclosuresForScope('openid profile email')).toEqual([
      'Your Authlane user ID',
      'Your name',
      'Your email address',
      'Which Authlane workspace you belong to, and your role in it',
    ]);
  });

  it('always discloses the workspace, which is attached to every token regardless of scope', () => {
    expect(disclosuresForScope('openid')).toContain(
      'Which Authlane workspace you belong to, and your role in it'
    );
    expect(disclosuresForScope('')).toEqual([
      'Which Authlane workspace you belong to, and your role in it',
    ]);
  });

  it('shows an unrecognised scope by name rather than hiding it', () => {
    expect(disclosuresForScope('openid offline_access')).toContain('The “offline_access” scope');
  });

  it('reads a form-encoded scope list, where spaces arrive as plus signs', () => {
    expect(disclosuresForScope('openid+email')).toContain('Your email address');
  });
});

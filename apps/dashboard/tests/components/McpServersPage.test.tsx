import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import McpServersPage from '@/pages/McpServersPage';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  DashboardApiError: class extends Error {},
}));

vi.mock('@/lib/toast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const PRESETS = [
  {
    key: 'linear',
    name: 'Linear',
    serverUrl: 'https://mcp.linear.app/mcp',
    authType: 'oauth2',
    category: 'productivity',
    docsUrl: 'https://linear.app/docs/mcp',
    dynamicRegistration: true,
    verifiedAt: '2026-08-04',
  },
  {
    key: 'slack',
    name: 'Slack',
    serverUrl: 'https://mcp.slack.com/mcp',
    authType: 'oauth2',
    category: 'productivity',
    docsUrl: 'https://docs.slack.dev/ai/slack-mcp-server/',
    dynamicRegistration: false,
    verifiedAt: '2026-08-04',
  },
];

const SERVER = {
  id: 'mcp-1',
  name: 'Linear',
  serverUrl: 'https://mcp.linear.app/mcp',
  authType: 'oauth2',
  enabled: true,
  authorizationRequired: false,
  discoveredAt: '2026-08-03T10:00:00.000Z',
  discoveryError: null,
  oauthClientId: 'client-1',
  oauthClientSource: 'dynamic',
  redirectUri: 'https://app.authlane.io/api/v1/oauth/mcp-1/callback',
  createdAt: '2026-08-03T09:00:00.000Z',
};

/**
 * Routes by path rather than call order.
 *
 * The page issues several queries and gained one when the catalogue was added; sequential mocks made
 * every existing test fail for a reason that had nothing to do with what it was checking.
 */
function mockApi(responses: { servers?: unknown[]; tools?: unknown[]; presets?: unknown[] } = {}) {
  vi.mocked(apiModule.api.get).mockImplementation(async (path: string) => {
    if (path.endsWith('/presets')) return responses.presets ?? PRESETS;
    if (path.endsWith('/tools')) return responses.tools ?? [];
    return responses.servers ?? [];
  });
}

describe('the verified server catalogue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('offers every verified server as a switch, the way Services does', async () => {
    render(<McpServersPage />);

    expect(await screen.findByRole('switch', { name: 'Enable Linear' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('switch', { name: 'Enable Slack' })).toBeInTheDocument();
  });

  it('registers a server from one switch, with nothing to fill in', async () => {
    vi.mocked(apiModule.api.post).mockResolvedValue({
      id: 'mcp-1',
      enabled: true,
      tools: 0,
      authorizationRequired: true,
    } as never);
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('switch', { name: 'Enable Linear' }));

    expect(apiModule.api.post).toHaveBeenCalledWith('/organization/mcp-servers', {
      name: 'Linear',
      serverUrl: 'https://mcp.linear.app/mcp',
      authType: 'oauth2',
    });
  });

  it('shows a registered server as on', async () => {
    mockApi({ servers: [SERVER] });
    render(<McpServersPage />);

    expect(await screen.findByRole('switch', { name: 'Disable Linear' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('switch', { name: 'Enable Slack' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('names the server and the consequence before turning it off', async () => {
    // window.confirm named the page rather than the thing being destroyed, and turning a server off
    // drops every user's connection to it.
    mockApi({ servers: [SERVER] });
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('switch', { name: 'Disable Linear' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Turn off Linear?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/loses their connection/i)).toBeInTheDocument();
    expect(apiModule.api.delete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    expect(apiModule.api.delete).toHaveBeenCalledWith('/organization/mcp-servers/mcp-1');
  });

  /**
   * The old copy sent the tenant to Services, whose OAuth form writes a built-in service's client
   * id — a value the MCP branch never reads. Following it changed nothing, and the server kept
   * answering 409.
   */
  it('points a server without dynamic registration at its own form, not at Services', async () => {
    render(<McpServersPage />);

    expect(await screen.findByText(/does not let Authlane register itself/)).toBeInTheDocument();
    expect(screen.queryByText(/under Services/)).not.toBeInTheDocument();
  });
});

describe('what the page says about a server it has discovered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('explains an empty tool list on a server nobody has authorized yet', async () => {
    // Zero tools is the normal state of an OAuth server before its first authorization. Left
    // unexplained it reads as a server that offers nothing.
    mockApi({ servers: [{ ...SERVER, authorizationRequired: true }] });
    render(<McpServersPage />);

    expect(await screen.findByText(/waiting for the first user to authorize/i)).toBeInTheDocument();
  });

  it('surfaces a server discovery could not reach, so it can be retried', async () => {
    mockApi({
      servers: [{ ...SERVER, enabled: false, discoveryError: 'Server did not answer tools/list' }],
    });
    render(<McpServersPage />);

    expect(
      await screen.findByText(/Last discovery failed: Server did not answer tools\/list/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry discovery' })).toBeEnabled();
  });

  it('keeps a failed registration switched on, so a second copy is never registered', async () => {
    // The row exists even when discovery failed. Reading the card as "off" would post the same
    // server again on the next click.
    mockApi({
      servers: [{ ...SERVER, enabled: false, discoveryError: 'Server did not answer tools/list' }],
    });
    render(<McpServersPage />);

    expect(await screen.findByRole('switch', { name: 'Disable Linear' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('shows a disapproved tool so the tenant can switch it back on', async () => {
    mockApi({
      servers: [SERVER],
      tools: [
        {
          name: 'delete_ticket',
          description: 'Removes a ticket',
          risk: 'destructive',
          approved: false,
          declaredAnnotations: { readOnlyHint: true },
          lastSeenAt: '2026-08-03T10:00:00.000Z',
        },
      ],
    });
    render(<McpServersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tools' }));

    expect(await screen.findByText('delete_ticket')).toBeInTheDocument();
    // The stored risk drives the control, not what the server declared about itself.
    expect(screen.getByLabelText('Risk for delete_ticket')).toHaveValue('destructive');
    // What the server claims is shown next to what Authlane enforces, never instead of it.
    expect(screen.getByText(/server claims: readOnlyHint/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });
});

describe('a server the tenant runs themselves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('is listed apart from the catalogue, with its id and URL', async () => {
    mockApi({
      servers: [
        { ...SERVER, id: 'mcp-2', name: 'Support desk', serverUrl: 'https://mcp.acme.test' },
      ],
    });
    render(<McpServersPage />);

    expect(await screen.findByText('Support desk')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.acme.test')).toBeInTheDocument();
    expect(screen.getByText('mcp-2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your own servers' })).toBeInTheDocument();
  });

  it('is registered from a URL the tenant types', async () => {
    vi.mocked(apiModule.api.post).mockResolvedValue({ id: 'mcp-2', enabled: true } as never);
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Add your own server' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Support desk');
    await userEvent.type(screen.getByLabelText('Server URL'), 'https://mcp.acme.test');
    await userEvent.click(screen.getByRole('button', { name: 'Register server' }));

    expect(apiModule.api.post).toHaveBeenCalledWith('/organization/mcp-servers', {
      name: 'Support desk',
      serverUrl: 'https://mcp.acme.test',
      authType: 'oauth2',
    });
  });
});

/**
 * The screen that turns a permanent 409 into something a tenant can fix.
 *
 * Slack publishes no registration endpoint and Attio publishes one on another host, so neither can
 * ever get a client through RFC 7591. Their only route is an application the tenant owns.
 */
describe('bringing your own OAuth application', () => {
  const withoutClient = {
    ...SERVER,
    name: 'Slack',
    serverUrl: 'https://mcp.slack.com/mcp',
    oauthClientId: null,
    oauthClientSource: null,
    redirectUri: 'https://app.authlane.io/api/v1/oauth/mcp-1/callback',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says on the card which servers cannot authorize anyone yet', async () => {
    mockApi({ servers: [withoutClient] });
    render(<McpServersPage />);

    expect(await screen.findByText('OAuth client needed')).toBeInTheDocument();
  });

  it('shows the redirect URI the provider must be given', async () => {
    mockApi({ servers: [withoutClient] });
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'OAuth client' }));

    const dialog = await screen.findByRole('dialog');
    // Built by the API: the dashboard runs on its own origin, so a URI derived here would be the
    // wrong one and the provider would reject the redirect.
    expect(
      within(dialog).getByDisplayValue('https://app.authlane.io/api/v1/oauth/mcp-1/callback')
    ).toBeInTheDocument();
  });

  it('sends the credentials the tenant pasted', async () => {
    mockApi({ servers: [withoutClient] });
    vi.mocked(apiModule.api.put).mockResolvedValue({ ready: true } as never);
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'OAuth client' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Client ID'), '1234.5678');
    await userEvent.type(within(dialog).getByLabelText('Client secret'), 'xoxb-secret');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save OAuth client' }));

    expect(apiModule.api.put).toHaveBeenCalledWith('/organization/mcp-servers/mcp-1/oauth-client', {
      clientId: '1234.5678',
      clientSecret: 'xoxb-secret',
    });
  });

  /**
   * A provider that issues no secret still needs to be storable — otherwise the only PKCE-only
   * servers stay unreachable for the opposite reason to the one this screen exists to fix.
   */
  it('can store a public client, which carries no secret at all', async () => {
    mockApi({ servers: [withoutClient] });
    vi.mocked(apiModule.api.put).mockResolvedValue({ ready: true } as never);
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'OAuth client' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Client ID'), '1234.5678');
    await userEvent.click(within(dialog).getByLabelText(/public client/i));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save OAuth client' }));

    expect(apiModule.api.put).toHaveBeenCalledWith('/organization/mcp-servers/mcp-1/oauth-client', {
      clientId: '1234.5678',
      clientSecret: null,
    });
  });

  it('warns that changing the client id disconnects everyone', async () => {
    mockApi({
      servers: [{ ...withoutClient, oauthClientId: 'old-id', oauthClientSource: 'manual' }],
    });
    render(<McpServersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'OAuth client' }));
    const dialog = await screen.findByRole('dialog');
    const clientId = within(dialog).getByLabelText('Client ID');
    await userEvent.clear(clientId);
    await userEvent.type(clientId, 'new-id');

    expect(within(dialog).getByText(/authorize again/i)).toBeInTheDocument();
  });
});

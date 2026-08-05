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

  it('says when a server needs the tenant to bring their own OAuth application', async () => {
    render(<McpServersPage />);

    // Sending someone into an authorization that cannot complete is the failure this avoids.
    expect(await screen.findByText(/your own OAuth application/)).toBeInTheDocument();
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

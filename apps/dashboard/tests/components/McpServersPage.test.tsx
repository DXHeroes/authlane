import { screen } from '@testing-library/react';
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

const SERVER = {
  id: 'mcp-1',
  name: 'Support desk',
  serverUrl: 'https://mcp.example.com',
  authType: 'oauth2',
  enabled: true,
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
    if (path.endsWith('/presets')) return responses.presets ?? [];
    if (path.endsWith('/tools')) return responses.tools ?? [];
    return responses.servers ?? [];
  });
}

describe('McpServersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('lists a registered server with its id and URL', async () => {
    mockApi({ servers: [SERVER] });

    render(<McpServersPage />);

    expect(await screen.findByText('Support desk')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.example.com')).toBeInTheDocument();
    expect(screen.getByText('mcp-1')).toBeInTheDocument();
  });

  it('surfaces a server discovery could not reach, so it can be retried', async () => {
    mockApi({
      servers: [{ ...SERVER, enabled: false, discoveryError: 'Server did not answer tools/list' }],
    });

    render(<McpServersPage />);

    expect(await screen.findByText('Not discovered')).toBeInTheDocument();
    expect(
      screen.getByText(/Last discovery failed: Server did not answer tools\/list/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rediscover' })).toBeEnabled();
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
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  });
});

describe('the verified server catalogue', () => {
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

  function withPresets() {
    vi.mocked(apiModule.api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/presets')) return PRESETS;
      return [];
    });
  }

  it('prefills the form from a chosen server', async () => {
    withPresets();
    render(<McpServersPage />);

    const picker = await screen.findByLabelText('Start from a verified server');
    await userEvent.selectOptions(picker, 'linear');

    expect(screen.getByLabelText('Name')).toHaveValue('Linear');
    expect(screen.getByLabelText('Server URL')).toHaveValue('https://mcp.linear.app/mcp');
  });

  it('says when a server needs the tenant to bring their own OAuth application', async () => {
    withPresets();
    render(<McpServersPage />);

    const picker = await screen.findByLabelText('Start from a verified server');
    await userEvent.selectOptions(picker, 'slack');

    // Sending someone into an authorization that cannot complete is the failure this avoids.
    expect(screen.getByText(/your own OAuth application/)).toBeInTheDocument();
  });

  it('leaves the form empty for a server that is not in the catalogue', async () => {
    withPresets();
    render(<McpServersPage />);

    await screen.findByLabelText('Start from a verified server');

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Server URL')).toHaveValue('');
  });
});

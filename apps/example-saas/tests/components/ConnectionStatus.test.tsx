import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectionStatus from '@/components/ConnectionStatus';
import * as authlaneModule from '@/lib/authlane';
import { render, screen, waitFor } from '../utils/test-utils';

// Mock the authlane module
vi.mock('@/lib/authlane', () => ({
  authlane: {
    listConnections: vi.fn(),
    listServices: vi.fn(),
    createConnectSession: vi.fn(),
  },
}));

vi.mock('@authlane/react', () => ({
  AuthlaneConnect: ({ connectUrl, title }: { connectUrl: string; title: string }) => (
    <div title={title} data-connect-url={connectUrl} />
  ),
}));

// Mock window.alert
global.alert = vi.fn();

describe('ConnectionStatus', () => {
  const mockOAuthServices = [
    {
      id: 'github',
      name: 'GitHub',
      authType: 'oauth2' as const,
    },
    {
      id: 'slack',
      name: 'Slack',
      authType: 'oauth2' as const,
    },
  ];

  const mockPublicServices = [
    {
      id: 'pokeapi',
      name: 'PokeAPI',
      authType: 'none' as const,
    },
  ];

  const mockConnections = [
    {
      id: 'conn-1',
      serviceId: 'github',
      status: 'connected' as const,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading skeleton while fetching data', () => {
      // Create promises that won't resolve immediately
      const connectionsPromise = new Promise(() => {});
      const servicesPromise = new Promise(() => {});

      vi.mocked(authlaneModule.authlane.listConnections).mockReturnValue(connectionsPromise as any);
      vi.mocked(authlaneModule.authlane.listServices).mockReturnValue(servicesPromise as any);

      render(<ConnectionStatus />);

      // Should show 3 loading skeleton items
      const skeletons = document.querySelectorAll('.animate-pulse > div');
      expect(skeletons.length).toBe(3);
    });
  });

  describe('Error State', () => {
    it('displays error message when services fail to load', async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValueOnce({
        data: [],
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValueOnce({
        error: { message: 'Network error' },
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load connections')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows retry button in error state', async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValueOnce({
        data: [],
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValueOnce({
        error: { message: 'Network error' },
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries loading data when retry button is clicked', async () => {
      const user = userEvent.setup();

      // First call fails
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValueOnce({
        data: [],
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValueOnce({
        error: { message: 'Network error' },
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Second call succeeds
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValueOnce({
        data: [],
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValueOnce({
        data: mockOAuthServices,
      } as any);

      const retryButton = screen.getByText('Retry');
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('OAuth Services')).toBeInTheDocument();
      });
    });
  });

  describe('OAuth Services Display', () => {
    beforeEach(async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValue({
        data: mockConnections,
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValue({
        data: [...mockOAuthServices, ...mockPublicServices],
      } as any);
    });

    it('displays OAuth Services section', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('OAuth Services')).toBeInTheDocument();
      });
    });

    it('displays all OAuth services', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeInTheDocument();
        expect(screen.getByText('Slack')).toBeInTheDocument();
      });
    });

    it('shows service abbreviation icon', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('GI')).toBeInTheDocument(); // GitHub
        expect(screen.getByText('SL')).toBeInTheDocument(); // Slack
      });
    });

    it('shows connected status for connected services', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('✓ Connected')).toBeInTheDocument();
      });
    });

    it('shows not connected status for disconnected services', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('Not connected')).toBeInTheDocument();
      });
    });

    it('shows "Connect" button for disconnected services', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        const connectButtons = screen.getAllByText('Connect');
        expect(connectButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows "Reconnect" button for connected services', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('Reconnect')).toBeInTheDocument();
      });
    });
  });

  describe('Public APIs Display', () => {
    beforeEach(async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValue({
        data: [],
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValue({
        data: [...mockOAuthServices, ...mockPublicServices],
      } as any);
    });

    it('displays Public APIs section', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('Public APIs (No Auth Needed)')).toBeInTheDocument();
      });
    });

    it('displays all public API services', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('PokeAPI')).toBeInTheDocument();
      });
    });

    it('shows always available status for public APIs', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('✓ Always available')).toBeInTheDocument();
      });
    });
  });

  describe('Connect Functionality', () => {
    beforeEach(async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValue({
        data: [],
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValue({
        data: mockOAuthServices,
      } as any);
    });

    it('embeds the short-lived connect URL without opening a popup', async () => {
      const user = userEvent.setup();
      vi.mocked(authlaneModule.authlane.createConnectSession).mockResolvedValueOnce({
        data: { connectUrl: 'about:blank?session=secret' },
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getAllByText('Connect').length).toBeGreaterThan(0);
      });

      const connectButton = screen.getAllByText('Connect')[0];
      await user.click(connectButton);

      await waitFor(() => {
        const frame = screen.getByTitle('Authlane connection for GitHub');
        expect(frame).toHaveAttribute('data-connect-url', 'about:blank?session=secret');
      });
    });

    it('shows alert when getting auth URL fails', async () => {
      const user = userEvent.setup();
      vi.mocked(authlaneModule.authlane.createConnectSession).mockResolvedValueOnce({
        error: { message: 'Service not configured' },
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getAllByText('Connect').length).toBeGreaterThan(0);
      });

      const connectButton = screen.getAllByText('Connect')[0];
      await user.click(connectButton);

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(
          'Failed to get authorization URL: Service not configured'
        );
      });
    });

    it('shows generic error message when error message is not provided', async () => {
      const user = userEvent.setup();
      vi.mocked(authlaneModule.authlane.createConnectSession).mockResolvedValueOnce({
        error: {},
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getAllByText('Connect').length).toBeGreaterThan(0);
      });

      const connectButton = screen.getAllByText('Connect')[0];
      await user.click(connectButton);

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith('Failed to get authorization URL: Unknown error');
      });
    });
  });

  describe('Refresh Functionality', () => {
    beforeEach(async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValue({
        data: mockConnections,
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValue({
        data: mockOAuthServices,
      } as any);
    });

    it('displays refresh button', async () => {
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('↻ Refresh connections')).toBeInTheDocument();
      });
    });

    it('reloads data when refresh button is clicked', async () => {
      const user = userEvent.setup();
      render(<ConnectionStatus />);

      await waitFor(() => {
        expect(screen.getByText('↻ Refresh connections')).toBeInTheDocument();
      });

      // Clear previous calls
      vi.clearAllMocks();

      const refreshButton = screen.getByText('↻ Refresh connections');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(authlaneModule.authlane.listConnections).toHaveBeenCalled();
        expect(authlaneModule.authlane.listServices).toHaveBeenCalled();
      });
    });
  });

  describe('Data Integration', () => {
    it('merges connection data with service information', async () => {
      vi.mocked(authlaneModule.authlane.listConnections).mockResolvedValue({
        data: mockConnections,
      } as any);
      vi.mocked(authlaneModule.authlane.listServices).mockResolvedValue({
        data: mockOAuthServices,
      } as any);

      render(<ConnectionStatus />);

      await waitFor(() => {
        // GitHub should show as connected
        expect(screen.getByText('GitHub')).toBeInTheDocument();
        expect(screen.getByText('✓ Connected')).toBeInTheDocument();

        // Slack should show as not connected
        expect(screen.getByText('Slack')).toBeInTheDocument();
        expect(screen.getByText('Not connected')).toBeInTheDocument();
      });
    });
  });
});

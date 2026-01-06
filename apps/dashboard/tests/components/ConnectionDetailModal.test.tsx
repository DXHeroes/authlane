import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectionDetailModal from '@/components/ConnectionDetailModal';
import * as apiModule from '@/lib/api';
import type { Connection } from '@/types';
import { render, screen, waitFor } from '../utils/test-utils';

// Mock the API module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('ConnectionDetailModal', () => {
  const mockOnClose = vi.fn();

  const mockConnection: Connection = {
    id: 'conn-123',
    scope: 'user',
    userId: 'user-456',
    organizationId: 'org-789',
    serviceId: 'github',
    externalUserId: 'ext-user-123',
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-16T12:00:00Z',
    lastHealthCheck: '2024-01-17T08:30:00Z',
  };

  const mockCredentials = {
    accessToken: 'gho_1234567890abcdefghijklmnopqrstuvwxyz1234',
    refreshToken: 'ghr_abcdefghijklmnopqrstuvwxyz1234567890',
    expiresAt: '2024-02-15T10:00:00Z',
    scopes: ['repo', 'user', 'workflow'],
    metadata: {
      installationId: '12345',
      permissions: { contents: 'read' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Details Display', () => {
    it('renders connection details modal with all information', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.getByRole('heading', { name: /Connection Details/i })).toBeInTheDocument();
      expect(screen.getByText('conn-123')).toBeInTheDocument();
      expect(screen.getByText('user-456')).toBeInTheDocument();
      expect(screen.getByText('github')).toBeInTheDocument();
    });

    it('displays connection status with correct color', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const statusElement = screen.getByText('active');
      expect(statusElement).toHaveClass('text-green-600');
    });

    it('displays expired status in yellow', () => {
      const expiredConnection = { ...mockConnection, status: 'expired' as const };
      render(<ConnectionDetailModal connection={expiredConnection} onClose={mockOnClose} />);

      const statusElement = screen.getByText('expired');
      expect(statusElement).toHaveClass('text-yellow-600');
    });

    it('displays error status in red', () => {
      const errorConnection = { ...mockConnection, status: 'error' as const };
      render(<ConnectionDetailModal connection={errorConnection} onClose={mockOnClose} />);

      const statusElement = screen.getByText('error');
      expect(statusElement).toHaveClass('text-red-600');
    });

    it('formats and displays creation date', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const formattedDate = new Date('2024-01-15T10:00:00Z').toLocaleString();
      expect(screen.getByText(formattedDate)).toBeInTheDocument();
    });

    it('formats and displays updated date', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const formattedDate = new Date('2024-01-16T12:00:00Z').toLocaleString();
      expect(screen.getByText(formattedDate)).toBeInTheDocument();
    });

    it('displays last health check when available', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.getByText('Last Health Check')).toBeInTheDocument();
      const formattedDate = new Date('2024-01-17T08:30:00Z').toLocaleString();
      expect(screen.getByText(formattedDate)).toBeInTheDocument();
    });

    it('does not display last health check when not available', () => {
      const connectionWithoutHealthCheck = { ...mockConnection, lastHealthCheck: undefined };
      render(
        <ConnectionDetailModal connection={connectionWithoutHealthCheck} onClose={mockOnClose} />
      );

      expect(screen.queryByText('Last Health Check')).not.toBeInTheDocument();
    });
  });

  describe('Credentials Section', () => {
    it('shows "Show Credentials" button by default', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.getByRole('button', { name: /Show Credentials/i })).toBeInTheDocument();
    });

    it('does not display credentials section by default', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.queryByText('Access Token')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading credentials...')).not.toBeInTheDocument();
    });

    it('fetches and displays credentials when "Show Credentials" is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      // Wait for credentials to load
      await waitFor(() => {
        expect(screen.getByText('Access Token')).toBeInTheDocument();
      });
    });

    it('changes button text to "Hide Credentials" when shown', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Hide Credentials/i })).toBeInTheDocument();
      });
    });

    it('hides credentials when "Hide Credentials" is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      // Show credentials
      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('Access Token')).toBeInTheDocument();
      });

      // Hide credentials
      const hideButton = screen.getByRole('button', { name: /Hide Credentials/i });
      await user.click(hideButton);

      await waitFor(() => {
        expect(screen.queryByText('Access Token')).not.toBeInTheDocument();
      });
    });

    it('calls API with correct endpoint when fetching credentials', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(apiModule.api.get).toHaveBeenCalledWith(
          '/users/user-456/connections/github/credentials'
        );
      });
    });
  });

  describe('Token Masking', () => {
    it('masks access token showing first 4 and last 4 characters', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('gho_••••••••1234')).toBeInTheDocument();
      });
    });

    it('masks refresh token showing first 4 and last 4 characters', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('ghr_••••••••7890')).toBeInTheDocument();
      });
    });

    it('masks short tokens with all bullets', async () => {
      const user = userEvent.setup();
      const shortTokenCreds = {
        ...mockCredentials,
        accessToken: 'short',
      };
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(shortTokenCreds);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('••••••••')).toBeInTheDocument();
      });
    });
  });

  describe('Credentials Fields Display', () => {
    it('displays all credential fields when available', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('Access Token')).toBeInTheDocument();
        expect(screen.getByText('Refresh Token')).toBeInTheDocument();
        expect(screen.getByText('Expires At')).toBeInTheDocument();
        expect(screen.getByText('Scopes')).toBeInTheDocument();
        expect(screen.getByText('Metadata')).toBeInTheDocument();
      });
    });

    it('displays scopes as pills', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('repo')).toBeInTheDocument();
        expect(screen.getByText('user')).toBeInTheDocument();
        expect(screen.getByText('workflow')).toBeInTheDocument();
      });
    });

    it('displays metadata as formatted JSON', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('Metadata')).toBeInTheDocument();
        // Check that metadata values are present
        expect(screen.getByText(/"installationId"/i)).toBeInTheDocument();
      });
    });

    it('does not display fields that are not present', async () => {
      const user = userEvent.setup();
      const minimalCreds = {
        accessToken: 'token123',
      };
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(minimalCreds);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('Access Token')).toBeInTheDocument();
        expect(screen.queryByText('Refresh Token')).not.toBeInTheDocument();
        expect(screen.queryByText('Expires At')).not.toBeInTheDocument();
        expect(screen.queryByText('Scopes')).not.toBeInTheDocument();
        expect(screen.queryByText('Metadata')).not.toBeInTheDocument();
      });
    });

    it('displays "No credentials available" when credentials are null', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(null);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('No credentials available')).toBeInTheDocument();
      });
    });

    it('formats expiration date correctly', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.get).mockResolvedValueOnce(mockCredentials);

      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const showButton = screen.getByRole('button', { name: /Show Credentials/i });
      await user.click(showButton);

      await waitFor(() => {
        const formattedDate = new Date('2024-02-15T10:00:00Z').toLocaleString();
        expect(screen.getByText(formattedDate)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Interactions', () => {
    it('calls onClose when close button (X) is clicked', async () => {
      const user = userEvent.setup();
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      // Find all Close buttons
      const closeButtons = screen.getAllByRole('button', { name: /Close/i });
      // First one is the X button with aria-label="Close"
      const xButton = closeButtons[0];
      await user.click(xButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when "Close" button at bottom is clicked', async () => {
      const user = userEvent.setup();
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      // Find the Close button (not the aria-label Close, but the text "Close")
      const closeButtons = screen.getAllByRole('button', { name: /Close/i });
      const bottomCloseButton = closeButtons[closeButtons.length - 1];

      await user.click(bottomCloseButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA label for close button', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      const closeButtons = screen.getAllByRole('button', { name: /Close/i });
      // Should have both X button with aria-label and bottom Close button
      expect(closeButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('uses semantic HTML with proper labels', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.getByText('Connection ID')).toBeInTheDocument();
      expect(screen.getByText('User ID')).toBeInTheDocument();
      expect(screen.getByText('Service')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Created At')).toBeInTheDocument();
      expect(screen.getByText('Updated At')).toBeInTheDocument();
    });
  });
});

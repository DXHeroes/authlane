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
    organizationId: 'org-789',
    serviceId: 'github',
    externalUserId: 'ext-user-123',
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-16T12:00:00Z',
    lastHealthCheck: '2024-01-17T08:30:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Details Display', () => {
    it('renders connection details modal with all information', () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.getByRole('heading', { name: /Connection Details/i })).toBeInTheDocument();
      expect(screen.getByText('conn-123')).toBeInTheDocument();
      expect(screen.getByText('ext-user-123')).toBeInTheDocument();
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
    it('never requests or renders credential material', async () => {
      render(<ConnectionDetailModal connection={mockConnection} onClose={mockOnClose} />);

      expect(screen.queryByRole('button', { name: /Show Credentials/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Access Token')).not.toBeInTheDocument();
      expect(
        screen.getByText(/credentials are only issued to scoped server-side API keys/i)
      ).toBeInTheDocument();
      await waitFor(() => expect(apiModule.api.get).not.toHaveBeenCalled());
    });
  });

  describe('Modal Interactions', () => {
    it('calls onClose when close button (X) is clicked', async () => {
      const userEvent = (await import('@testing-library/user-event')).default;
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
      const userEvent = (await import('@testing-library/user-event')).default;
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

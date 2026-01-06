import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServiceCard } from '@/components/ServiceCard';
import type { Service } from '@/types';
import { render, screen } from '../utils/test-utils';

// Mock ConnectionStatus component
vi.mock('@/components/ConnectionStatus', () => ({
  ConnectionStatus: ({ status, compact }: { status: string; compact: boolean }) => (
    <div data-testid="connection-status" data-status={status} data-compact={compact}>
      Status: {status}
    </div>
  ),
}));

describe('ServiceCard', () => {
  const mockOnClick = vi.fn();

  const baseService: Service = {
    id: 'github',
    name: 'GitHub',
    category: 'development',
    icon: 'https://example.com/github-icon.png',
    description: 'Connect your GitHub account',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Information Display', () => {
    it('renders service name and description', () => {
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
    });

    it('displays service icon when icon URL is provided', () => {
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const icon = screen.getByAltText('GitHub');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('src', 'https://example.com/github-icon.png');
    });

    it('displays first letter placeholder when icon is not provided', () => {
      const serviceWithoutIcon = { ...baseService, icon: '' };
      render(<ServiceCard service={serviceWithoutIcon} onClick={mockOnClick} />);

      expect(screen.getByText('G')).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('capitalizes first letter in placeholder', () => {
      const lowercaseService = { ...baseService, name: 'github', icon: '' };
      render(<ServiceCard service={lowercaseService} onClick={mockOnClick} />);

      expect(screen.getByText('G')).toBeInTheDocument();
    });
  });

  describe('Status Display', () => {
    it('shows ConnectionStatus when status is provided', () => {
      const connectedService = { ...baseService, status: 'connected' as const };
      render(<ServiceCard service={connectedService} onClick={mockOnClick} />);

      const connectionStatus = screen.getByTestId('connection-status');
      expect(connectionStatus).toBeInTheDocument();
      expect(connectionStatus).toHaveAttribute('data-status', 'connected');
      expect(connectionStatus).toHaveAttribute('data-compact', 'true');
    });

    it('does not show ConnectionStatus when status is not provided', () => {
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      expect(screen.queryByTestId('connection-status')).not.toBeInTheDocument();
    });

    it('passes connected status to ConnectionStatus', () => {
      const connectedService = { ...baseService, status: 'connected' as const };
      render(<ServiceCard service={connectedService} onClick={mockOnClick} />);

      const connectionStatus = screen.getByTestId('connection-status');
      expect(connectionStatus).toHaveAttribute('data-status', 'connected');
    });

    it('passes disconnected status to ConnectionStatus', () => {
      const disconnectedService = { ...baseService, status: 'disconnected' as const };
      render(<ServiceCard service={disconnectedService} onClick={mockOnClick} />);

      const connectionStatus = screen.getByTestId('connection-status');
      expect(connectionStatus).toHaveAttribute('data-status', 'disconnected');
    });

    it('passes expired status to ConnectionStatus', () => {
      const expiredService = { ...baseService, status: 'expired' as const };
      render(<ServiceCard service={expiredService} onClick={mockOnClick} />);

      const connectionStatus = screen.getByTestId('connection-status');
      expect(connectionStatus).toHaveAttribute('data-status', 'expired');
    });
  });

  describe('Status Badge Icon', () => {
    it('shows check icon for connected status', () => {
      const connectedService = { ...baseService, status: 'connected' as const };
      const { container } = render(
        <ServiceCard service={connectedService} onClick={mockOnClick} />
      );

      const statusBadge = container.querySelector('.service-card__status-badge');
      expect(statusBadge).toBeInTheDocument();
      expect(
        statusBadge?.querySelector('.service-card__status-icon--connected')
      ).toBeInTheDocument();
    });

    it('shows clock icon for expired status', () => {
      const expiredService = { ...baseService, status: 'expired' as const };
      const { container } = render(<ServiceCard service={expiredService} onClick={mockOnClick} />);

      const statusBadge = container.querySelector('.service-card__status-badge');
      expect(statusBadge).toBeInTheDocument();
      expect(statusBadge?.querySelector('.service-card__status-icon--expired')).toBeInTheDocument();
    });

    it('does not show status badge icon for disconnected status', () => {
      const disconnectedService = { ...baseService, status: 'disconnected' as const };
      const { container } = render(
        <ServiceCard service={disconnectedService} onClick={mockOnClick} />
      );

      const statusBadge = container.querySelector('.service-card__status-badge');
      expect(statusBadge).toBeInTheDocument();
      const statusIcon = statusBadge?.querySelector('.service-card__status-icon');
      expect(statusIcon).not.toBeInTheDocument();
    });

    it('does not show status badge when status is not provided', () => {
      const { container } = render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const statusBadge = container.querySelector('.service-card__status-badge');
      expect(statusBadge).not.toBeInTheDocument();
    });
  });

  describe('Click Interaction', () => {
    it('calls onClick when card is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      await user.click(card);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when card is clicked via keyboard', async () => {
      const user = userEvent.setup();
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard('{Enter}');

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('renders as a button element', () => {
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      expect(card).toBeInTheDocument();
      expect(card.tagName).toBe('BUTTON');
    });

    it('has service-card class', () => {
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      expect(card).toHaveClass('service-card');
    });
  });
});

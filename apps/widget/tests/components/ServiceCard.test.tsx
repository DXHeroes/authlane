import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServiceCard } from '@/components/ServiceCard';
import type { Service } from '@/types';
import { fireEvent, render, screen } from '../utils/test-utils';

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
    authType: 'oauth2',
    category: 'engineering',
    iconUrl: 'https://app.authlane.io/service-icons/github.svg',
    description: 'Connect your GitHub account',
    brandColor: '#181717',
    initials: 'GH',
    status: 'disconnected',
  };

  /** A card rendered before any connection state is known. */
  const withoutStatus = { ...baseService, status: undefined } as unknown as Service;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Information Display', () => {
    it('renders service name and description', () => {
      render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
    });

    it('displays the mark Authlane serves', () => {
      const { container } = render(<ServiceCard service={baseService} onClick={mockOnClick} />);

      const icon = container.querySelector('.service-card__icon img');
      // Decorative: the service name is already the heading right beside it, so alt text here
      // would make a screen reader say it twice.
      expect(icon).toHaveAttribute('src', 'https://app.authlane.io/service-icons/github.svg');
      expect(icon).toHaveAttribute('alt', '');
    });

    it('draws the initials over the brand colour when no mark is served', () => {
      // Slack, Salesforce, and the Microsoft services take this path: their owners do not permit
      // the mark to be redistributed, so the API sends iconUrl: null on purpose.
      const withoutIcon = { ...baseService, iconUrl: null };
      const { container } = render(<ServiceCard service={withoutIcon} onClick={mockOnClick} />);

      expect(screen.getByText('GH')).toBeInTheDocument();
      expect(container.querySelector('.service-card__icon img')).toBeNull();
      expect(container.querySelector('.service-card__icon')).toHaveStyle({
        '--service-brand-color': '#181717',
      });
    });

    it('falls back to the initials when the image itself fails', async () => {
      // One 404 or a host-page CSP should leave initials, not an empty square.
      const { container } = render(<ServiceCard service={baseService} onClick={mockOnClick} />);
      const icon = container.querySelector('.service-card__icon img') as HTMLImageElement;

      fireEvent.error(icon);

      expect(screen.getByText('GH')).toBeInTheDocument();
      expect(container.querySelector('.service-card__icon img')).toBeNull();
    });

    it('renders no description paragraph when the service declares none', () => {
      const { container } = render(
        <ServiceCard service={{ ...baseService, description: null }} onClick={mockOnClick} />
      );

      expect(container.querySelector('.service-card__description')).toBeNull();
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
      // The card guards on status, and this pins that guard. The fixture states the absence
      // explicitly now that Service declares status, rather than relying on an incomplete object.
      render(<ServiceCard service={withoutStatus} onClick={mockOnClick} />);

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
      const { container } = render(<ServiceCard service={withoutStatus} onClick={mockOnClick} />);

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

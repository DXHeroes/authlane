import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { render, screen } from '../utils/test-utils';

describe('ConnectionStatus', () => {
  describe('Compact Mode', () => {
    it('renders connected status in compact mode', () => {
      render(<ConnectionStatus status="connected" compact />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
      const container = screen.getByText('Connected').parentElement;
      expect(container).toHaveClass('connection-status--compact');
      expect(container).toHaveClass('connection-status--connected');
    });

    it('renders disconnected status in compact mode', () => {
      render(<ConnectionStatus status="disconnected" compact />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      const container = screen.getByText('Disconnected').parentElement;
      expect(container).toHaveClass('connection-status--compact');
      expect(container).toHaveClass('connection-status--disconnected');
    });

    it('renders expired status in compact mode', () => {
      render(<ConnectionStatus status="expired" compact />);

      expect(screen.getByText('Expired')).toBeInTheDocument();
      const container = screen.getByText('Expired').parentElement;
      expect(container).toHaveClass('connection-status--compact');
      expect(container).toHaveClass('connection-status--expired');
    });

    it('does not show reconnect button in compact mode', () => {
      const mockReconnect = vi.fn();
      render(<ConnectionStatus status="disconnected" compact onReconnect={mockReconnect} />);

      expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
    });

    it('does not show expiry date in compact mode', () => {
      render(<ConnectionStatus status="connected" compact expiresAt="2024-12-31T23:59:59Z" />);

      expect(screen.queryByText(/Expires:/)).not.toBeInTheDocument();
    });
  });

  describe('Full Mode', () => {
    it('renders connected status in full mode', () => {
      render(<ConnectionStatus status="connected" />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
      const badge = screen.getByText('Connected').closest('.connection-status__badge');
      expect(badge).toBeInTheDocument();
    });

    it('renders disconnected status in full mode', () => {
      render(<ConnectionStatus status="disconnected" />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      const badge = screen.getByText('Disconnected').closest('.connection-status__badge');
      expect(badge).toBeInTheDocument();
    });

    it('renders expired status in full mode', () => {
      render(<ConnectionStatus status="expired" />);

      expect(screen.getByText('Expired')).toBeInTheDocument();
      const badge = screen.getByText('Expired').closest('.connection-status__badge');
      expect(badge).toBeInTheDocument();
    });

    it('shows expiry date for connected status when provided', () => {
      render(<ConnectionStatus status="connected" expiresAt="2024-12-31T23:59:59Z" />);

      const expiryText = screen.getByText(/Expires:/);
      expect(expiryText).toBeInTheDocument();
      // Date formatting depends on locale and timezone, just check that it contains a date
      expect(expiryText.textContent).toMatch(/Expires: \d+\/\d+\/\d+/);
    });

    it('does not show expiry date for disconnected status', () => {
      render(<ConnectionStatus status="disconnected" expiresAt="2024-12-31T23:59:59Z" />);

      expect(screen.queryByText(/Expires:/)).not.toBeInTheDocument();
    });

    it('does not show expiry date for expired status', () => {
      render(<ConnectionStatus status="expired" expiresAt="2024-12-31T23:59:59Z" />);

      expect(screen.queryByText(/Expires:/)).not.toBeInTheDocument();
    });
  });

  describe('Reconnect Functionality', () => {
    it('shows reconnect button for disconnected status when handler provided', () => {
      const mockReconnect = vi.fn();
      render(<ConnectionStatus status="disconnected" onReconnect={mockReconnect} />);

      expect(screen.getByText('Reconnect')).toBeInTheDocument();
    });

    it('shows reconnect button for expired status when handler provided', () => {
      const mockReconnect = vi.fn();
      render(<ConnectionStatus status="expired" onReconnect={mockReconnect} />);

      expect(screen.getByText('Reconnect')).toBeInTheDocument();
    });

    it('does not show reconnect button for connected status', () => {
      const mockReconnect = vi.fn();
      render(<ConnectionStatus status="connected" onReconnect={mockReconnect} />);

      expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
    });

    it('does not show reconnect button when handler not provided', () => {
      render(<ConnectionStatus status="disconnected" />);

      expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
    });

    it('calls onReconnect when reconnect button is clicked', async () => {
      const user = userEvent.setup();
      const mockReconnect = vi.fn();
      render(<ConnectionStatus status="disconnected" onReconnect={mockReconnect} />);

      const reconnectButton = screen.getByText('Reconnect');
      await user.click(reconnectButton);

      expect(mockReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('CSS Classes', () => {
    it('applies connected class for connected status', () => {
      const { container } = render(<ConnectionStatus status="connected" />);

      const statusElement = container.querySelector('.connection-status--connected');
      expect(statusElement).toBeInTheDocument();
    });

    it('applies disconnected class for disconnected status', () => {
      const { container } = render(<ConnectionStatus status="disconnected" />);

      const statusElement = container.querySelector('.connection-status--disconnected');
      expect(statusElement).toBeInTheDocument();
    });

    it('applies expired class for expired status', () => {
      const { container } = render(<ConnectionStatus status="expired" />);

      const statusElement = container.querySelector('.connection-status--expired');
      expect(statusElement).toBeInTheDocument();
    });

    it('applies compact class when in compact mode', () => {
      const { container } = render(<ConnectionStatus status="connected" compact />);

      const statusElement = container.querySelector('.connection-status--compact');
      expect(statusElement).toBeInTheDocument();
    });
  });
});

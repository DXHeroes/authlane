import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateApiKeyModal from '@/components/CreateApiKeyModal';
import * as apiModule from '@/lib/api';
import { render, screen, waitFor } from '../utils/test-utils';

// Mock the API module
vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('CreateApiKeyModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Form State', () => {
    it('renders the creation form with all required fields', () => {
      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByRole('heading', { name: /Create API Key/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/API Key Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Expires In/i)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Read service catalog/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Read connections/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Create connect sessions/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Issue credential leases/i })).not.toBeChecked();
    });

    it('has disabled submit button when name is empty', () => {
      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const submitButton = screen.getByRole('button', { name: /^Create API Key$/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Form Interactions', () => {
    it('enables submit button when name is filled', async () => {
      const user = userEvent.setup();
      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/API Key Name/i);
      await user.type(nameInput, 'Test API Key');

      const submitButton = screen.getByRole('button', { name: /^Create API Key$/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('API Key Creation', () => {
    it('creates API key successfully and displays it', async () => {
      const user = userEvent.setup();
      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key: 'ak_test_123456789abcdef',
        prefix: 'ak_test_',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      vi.mocked(apiModule.api.post).mockResolvedValueOnce(mockApiKey);

      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      // Fill in the form
      const nameInput = screen.getByLabelText(/API Key Name/i);
      await user.type(nameInput, 'Test Key');

      // Submit
      const submitButton = screen.getByRole('button', { name: /^Create API Key$/i });
      await user.click(submitButton);

      expect(apiModule.api.post).toHaveBeenCalledWith('/api-keys', {
        name: 'Test Key',
        expiresInDays: undefined,
        scopes: ['catalog:read', 'connections:read', 'connect-sessions:create'],
      });

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /API Key Created/i })).toBeInTheDocument();
      });

      // Verify API key is displayed
      expect(screen.getByDisplayValue('ak_test_123456789abcdef')).toBeInTheDocument();
      expect(screen.getByText(/Important: Save this API key now!/i)).toBeInTheDocument();
    });

    it('displays error message on creation failure', async () => {
      const user = userEvent.setup();

      vi.mocked(apiModule.api.post).mockRejectedValueOnce(new Error('API Error'));

      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/API Key Name/i);
      await user.type(nameInput, 'Test Key');

      const submitButton = screen.getByRole('button', { name: /^Create API Key$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to create API key/i)).toBeInTheDocument();
      });
    });

    it('requires an explicit opt-in before issuing credential leases', async () => {
      const user = userEvent.setup();
      vi.mocked(apiModule.api.post).mockResolvedValueOnce({
        id: 'key-lease',
        name: 'Lease Key',
        key: 'ak_test_lease',
        keyPrefix: 'ak_test_',
        scopes: [
          'catalog:read',
          'connections:read',
          'connect-sessions:create',
          'credentials:issue',
        ],
        createdAt: new Date().toISOString(),
      });

      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      await user.type(screen.getByLabelText(/API Key Name/i), 'Lease Key');
      await user.click(screen.getByRole('checkbox', { name: /Issue credential leases/i }));

      expect(screen.getByText(/can retrieve short-lived credentials/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Create API Key$/i }));

      expect(apiModule.api.post).toHaveBeenCalledWith(
        '/api-keys',
        expect.objectContaining({
          scopes: expect.arrayContaining(['credentials:issue']),
        })
      );
    });
  });

  describe('Copy Functionality', () => {
    it('copies API key to clipboard when copy button is clicked', async () => {
      const user = userEvent.setup();
      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key: 'ak_test_123456789',
        prefix: 'ak_test_',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      vi.mocked(apiModule.api.post).mockResolvedValueOnce(mockApiKey);

      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/API Key Name/i);
      await user.type(nameInput, 'Test Key');

      const submitButton = screen.getByRole('button', { name: /^Create API Key$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /Copy/i });
      await user.click(copyButton);

      // Note: clipboard.writeText is managed by userEvent in JSDOM environment
      // Just verify the button shows "Copied" state
      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for buttons', () => {
      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    });

    it('form inputs have proper labels and IDs', () => {
      render(<CreateApiKeyModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/API Key Name/i);
      const expiresInput = screen.getByLabelText(/Expires In/i);

      expect(nameInput).toHaveAttribute('id', 'key-name');
      expect(expiresInput).toHaveAttribute('id', 'expires-in');
    });
  });
});

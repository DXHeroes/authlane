import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateOrganizationModal from '@/components/CreateOrganizationModal';
import * as AuthContext from '@/contexts/AuthContext';
import { render, screen, waitFor } from '../utils/test-utils';

// Mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('CreateOrganizationModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockCreateOrganization = vi.fn();
  const mockSwitchOrganization = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOrganization.mockResolvedValue({ id: 'org-123', name: 'Test Org', slug: 'test-org' });
    mockSwitchOrganization.mockResolvedValue(undefined);

    vi.mocked(AuthContext.useAuth).mockReturnValue({
      createOrganization: mockCreateOrganization,
      switchOrganization: mockSwitchOrganization,
    } as any);
  });

  describe('Initial Form State', () => {
    it('renders the creation form with all required fields', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByRole('heading', { name: /Create Organization/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Organization Slug/i)).toBeInTheDocument();
    });

    it('has disabled submit button when fields are empty', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      expect(submitButton).toBeDisabled();
    });

    it('displays help text for slug field', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(
        screen.getByText(
          /URL-friendly identifier \(lowercase letters, numbers, and hyphens only\)/i
        )
      ).toBeInTheDocument();
    });
  });

  describe('Slug Auto-generation', () => {
    it('auto-generates slug when name is typed', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'My Test Company');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      expect(slugInput).toHaveValue('my-test-company');
    });

    it('converts uppercase to lowercase in slug', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'ACME Corp');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      expect(slugInput).toHaveValue('acme-corp');
    });

    it('removes special characters from slug', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test @ Company! #2024');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      expect(slugInput).toHaveValue('test-company-2024');
    });

    it('replaces multiple spaces with single hyphen', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'My    Test    Company');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      expect(slugInput).toHaveValue('my-test-company');
    });

    it('replaces multiple hyphens with single hyphen', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test---Company');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      expect(slugInput).toHaveValue('test-company');
    });
  });

  describe('Slug Manual Editing', () => {
    it('allows manual editing of slug field', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      await user.clear(slugInput);
      await user.type(slugInput, 'custom-slug');

      expect(slugInput).toHaveValue('custom-slug');
    });

    it('enforces lowercase in manually edited slug', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      await user.type(slugInput, 'UPPERCASE');

      expect(slugInput).toHaveValue('uppercase');
    });

    it('removes invalid characters from manually edited slug', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      await user.type(slugInput, 'test@slug!123#');

      expect(slugInput).toHaveValue('testslug123');
    });

    it('allows hyphens in manually edited slug', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      await user.type(slugInput, 'test-slug-123');

      expect(slugInput).toHaveValue('test-slug-123');
    });
  });

  describe('Form Interactions', () => {
    it('enables submit button when both fields are filled', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button (X) is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const closeButton = screen.getByRole('button', { name: /Close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Organization Creation', () => {
    it('creates organization successfully', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateOrganization).toHaveBeenCalledWith('Test Company', 'test-company');
      });
    });

    it('switches to new organization after creation', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSwitchOrganization).toHaveBeenCalledWith('org-123');
      });
    });

    it('calls onSuccess and onClose after successful creation', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it('displays error message on creation failure', async () => {
      const user = userEvent.setup();
      mockCreateOrganization.mockRejectedValueOnce(new Error('Organization slug already exists'));

      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Organization slug already exists/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while creating organization', async () => {
      const user = userEvent.setup();

      let resolveCreate: (value: any) => void;
      const createPromise = new Promise((resolve) => {
        resolveCreate = resolve;
      });
      mockCreateOrganization.mockReturnValue(createPromise);

      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, 'Test Company');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByRole('button', { name: /Creating.../i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Creating.../i })).toBeDisabled();

      // Resolve the promise
      resolveCreate?.({ id: 'org-123', name: 'Test Company', slug: 'test-company' });
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('trims whitespace from inputs before submission', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, '  Test Company  ');

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      await user.clear(slugInput);
      await user.type(slugInput, '  test-slug  ');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateOrganization).toHaveBeenCalledWith('Test Company', 'test-slug');
      });
    });

    it('does not submit if name is only whitespace', async () => {
      const user = userEvent.setup();
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.type(nameInput, '   ');

      const submitButton = screen.getByRole('button', { name: /Create Organization/i });

      // Button should be disabled
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for buttons', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    });

    it('form inputs have proper labels and IDs', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      const slugInput = screen.getByLabelText(/Organization Slug/i);

      expect(nameInput).toHaveAttribute('id', 'org-name');
      expect(slugInput).toHaveAttribute('id', 'org-slug');
    });

    it('form inputs have required attribute', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const nameInput = screen.getByLabelText(/Organization Name/i);
      const slugInput = screen.getByLabelText(/Organization Slug/i);

      expect(nameInput).toBeRequired();
      expect(slugInput).toBeRequired();
    });

    it('slug input has pattern validation', () => {
      render(<CreateOrganizationModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const slugInput = screen.getByLabelText(/Organization Slug/i);
      expect(slugInput).toHaveAttribute('pattern', '^[a-z0-9-]+$');
    });
  });
});

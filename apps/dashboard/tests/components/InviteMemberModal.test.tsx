import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InviteMemberModal from '@/components/InviteMemberModal';
import * as authClientModule from '@/lib/auth-client';
import { render, screen, waitFor } from '../utils/test-utils';

// Mock the auth client module
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    organization: {
      inviteMember: vi.fn(),
    },
  },
}));

describe('InviteMemberModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Form State', () => {
    it('renders the invitation form with all required fields', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByRole('heading', { name: /Invite Team Member/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Role/i)).toBeInTheDocument();
    });

    it('has disabled submit button when email is empty', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      expect(submitButton).toBeDisabled();
    });

    it('defaults role to "member"', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const roleSelect = screen.getByLabelText(/Role/i);
      expect(roleSelect).toHaveValue('member');
    });

    it('displays member role description by default', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByText(/Member Role/i)).toBeInTheDocument();
      expect(screen.getByText(/Can view organization data/i)).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('enables submit button when email is filled', async () => {
      const user = userEvent.setup();
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('updates role description when role is changed to admin', async () => {
      const user = userEvent.setup();
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const roleSelect = screen.getByLabelText(/Role/i);
      await user.selectOptions(roleSelect, 'admin');

      expect(screen.getByText(/Admin Role/i)).toBeInTheDocument();
      expect(screen.getByText(/Can invite and remove members/i)).toBeInTheDocument();
    });

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button (X) is clicked', async () => {
      const user = userEvent.setup();
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const closeButton = screen.getByRole('button', { name: /Close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invitation Sending', () => {
    it('sends invitation successfully and displays success message', async () => {
      const user = userEvent.setup();
      const testEmail = 'colleague@company.com';

      vi.mocked(authClientModule.authClient.organization.inviteMember).mockResolvedValueOnce(
        undefined
      );

      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      // Fill in the form
      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, testEmail);

      // Submit
      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      await user.click(submitButton);

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Invitation Sent/i })).toBeInTheDocument();
      });

      // Verify success message contains email
      expect(screen.getByText(testEmail, { exact: false })).toBeInTheDocument();
      expect(screen.getByText(/An invitation email has been sent/i)).toBeInTheDocument();
    });

    it('sends invitation with selected role', async () => {
      const user = userEvent.setup();
      const testEmail = 'admin@company.com';

      vi.mocked(authClientModule.authClient.organization.inviteMember).mockResolvedValueOnce(
        undefined
      );

      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      // Fill in the form with admin role
      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, testEmail);

      const roleSelect = screen.getByLabelText(/Role/i);
      await user.selectOptions(roleSelect, 'admin');

      // Submit
      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      await user.click(submitButton);

      // Verify API was called with correct parameters
      await waitFor(() => {
        expect(authClientModule.authClient.organization.inviteMember).toHaveBeenCalledWith({
          email: testEmail,
          role: 'admin',
        });
      });
    });

    it('displays error message on invitation failure', async () => {
      const user = userEvent.setup();

      vi.mocked(authClientModule.authClient.organization.inviteMember).mockRejectedValueOnce(
        new Error('Email already invited')
      );

      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Email already invited/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while sending invitation', async () => {
      const user = userEvent.setup();

      // Create a promise that we can control
      let resolveInvite: () => void;
      const invitePromise = new Promise<void>((resolve) => {
        resolveInvite = resolve;
      });

      vi.mocked(authClientModule.authClient.organization.inviteMember).mockReturnValueOnce(
        invitePromise
      );

      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByRole('button', { name: /Sending.../i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sending.../i })).toBeDisabled();

      // Resolve the promise
      resolveInvite?.();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Invitation Sent/i })).toBeInTheDocument();
      });
    });
  });

  describe('Success State Actions', () => {
    it('resets form when "Invite Another" is clicked', async () => {
      const user = userEvent.setup();
      const testEmail = 'test@example.com';

      vi.mocked(authClientModule.authClient.organization.inviteMember).mockResolvedValueOnce(
        undefined
      );

      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      // Send invitation
      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, testEmail);

      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      await user.click(submitButton);

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Invite Another/i })).toBeInTheDocument();
      });

      // Click "Invite Another"
      const inviteAnotherButton = screen.getByRole('button', { name: /Invite Another/i });
      await user.click(inviteAnotherButton);

      // Should return to form state
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Invite Team Member/i })).toBeInTheDocument();
      });

      // Email should be cleared
      const newEmailInput = screen.getByLabelText(/Email Address/i);
      expect(newEmailInput).toHaveValue('');
    });

    it('calls onSuccess and onClose when "Done" is clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(authClientModule.authClient.organization.inviteMember).mockResolvedValueOnce(
        undefined
      );

      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      // Send invitation
      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
      await user.click(submitButton);

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
      });

      // Click "Done"
      const doneButton = screen.getByRole('button', { name: /Done/i });
      await user.click(doneButton);

      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for buttons', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    });

    it('form inputs have proper labels and IDs', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      const roleSelect = screen.getByLabelText(/Role/i);

      expect(emailInput).toHaveAttribute('id', 'member-email');
      expect(roleSelect).toHaveAttribute('id', 'member-role');
    });

    it('email input has required attribute', () => {
      render(<InviteMemberModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      expect(emailInput).toBeRequired();
    });
  });
});

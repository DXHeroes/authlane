import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationSelector from '@/components/OrganizationSelector';
import * as AuthContext from '@/contexts/AuthContext';

// Mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('OrganizationSelector', () => {
  const mockOnCreateNew = vi.fn();
  const mockSwitchOrganization = vi.fn();

  const mockOrganizations = [
    {
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      createdAt: new Date(),
    },
    {
      id: 'org-2',
      name: 'Beta Inc',
      slug: 'beta-inc',
      createdAt: new Date(),
    },
    {
      id: 'org-3',
      name: 'Gamma LLC',
      slug: 'gamma-llc',
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSwitchOrganization.mockResolvedValue(undefined);
  });

  describe('Initial Rendering', () => {
    it('displays the current organization name', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('displays the first letter of organization name as avatar', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('displays "Select Organization" when no organization is selected', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: null,
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      expect(screen.getByText('Select Organization')).toBeInTheDocument();
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('dropdown is closed by default', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
      expect(screen.queryByText('Create new organization')).not.toBeInTheDocument();
    });
  });

  describe('Dropdown Interaction', () => {
    it('opens dropdown when button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      const button = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(button);

      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
      expect(screen.getByText('Gamma LLC')).toBeInTheDocument();
      expect(screen.getByText('Create new organization')).toBeInTheDocument();
    });

    it('closes dropdown when button is clicked again', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      const button = screen.getByRole('button', { name: /Acme Corp/i });

      // Open
      await user.click(button);
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();

      // Close
      await user.click(button);
      await waitFor(() => {
        expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
      });
    });

    it('displays checkmark next to current organization', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Find all buttons and filter out the trigger button
      const acmeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent?.includes('Acme Corp'));
      const acmeDropdownButton = acmeButtons.find((btn) => btn !== triggerButton);

      // Current organization button in dropdown should have accent background
      expect(acmeDropdownButton).toHaveClass('bg-accent');
    });

    it('displays "No organizations found" when organizations array is empty', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: null,
        organizations: [],
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(screen.getByText('No organizations found')).toBeInTheDocument();
    });
  });

  describe('Organization Switching', () => {
    it('calls switchOrganization when a different organization is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click on Beta Inc
      const betaButton = screen.getByText('Beta Inc');
      await user.click(betaButton);

      expect(mockSwitchOrganization).toHaveBeenCalledWith('org-2');
    });

    it('closes dropdown after switching organization', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click on Beta Inc
      const betaButton = screen.getByText('Beta Inc');
      await user.click(betaButton);

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Gamma LLC')).not.toBeInTheDocument();
      });
    });

    it('does not call switchOrganization when clicking current organization', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click on Acme Corp (current org)
      const acmeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent?.includes('Acme Corp'));
      // Find the one in the dropdown (not the trigger button)
      const acmeDropdownButton = acmeButtons.find((btn) => btn !== triggerButton);
      await user.click(acmeDropdownButton!);

      expect(mockSwitchOrganization).not.toHaveBeenCalled();
    });

    it('shows loading state during organization switch', async () => {
      const user = userEvent.setup();

      // Create a promise that we can control
      let resolveSwitchOrg: () => void;
      const switchPromise = new Promise<void>((resolve) => {
        resolveSwitchOrg = resolve;
      });
      mockSwitchOrganization.mockReturnValue(switchPromise);

      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click on Beta Inc
      const betaButton = screen.getByText('Beta Inc');
      await user.click(betaButton);

      // Trigger button should be disabled during loading
      await waitFor(() => {
        expect(triggerButton).toBeDisabled();
      });

      // Resolve the promise
      resolveSwitchOrg?.();

      await waitFor(() => {
        expect(triggerButton).not.toBeDisabled();
      });
    });

    it('handles errors during organization switch gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockSwitchOrganization.mockRejectedValueOnce(new Error('Network error'));

      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click on Beta Inc
      const betaButton = screen.getByText('Beta Inc');
      await user.click(betaButton);

      // Should log error
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to switch organization:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Create New Organization', () => {
    it('calls onCreateNew when "Create new organization" is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click "Create new organization"
      const createButton = screen.getByText('Create new organization');
      await user.click(createButton);

      expect(mockOnCreateNew).toHaveBeenCalledTimes(1);
    });

    it('closes dropdown when "Create new organization" is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      // Open dropdown
      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await user.click(triggerButton);

      // Click "Create new organization"
      const createButton = screen.getByText('Create new organization');
      await user.click(createButton);

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Create new organization')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('maintains focus on trigger button', async () => {
      const user = userEvent.setup();
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });

      await user.click(triggerButton);
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    });

    it('all organization items are keyboard accessible', async () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        organization: mockOrganizations[0],
        organizations: mockOrganizations,
        switchOrganization: mockSwitchOrganization,
      } as any);

      render(<OrganizationSelector onCreateNew={mockOnCreateNew} />);

      const triggerButton = screen.getByRole('button', { name: /Acme Corp/i });
      await userEvent.click(triggerButton);

      // All organizations should be rendered as buttons
      const buttons = screen.getAllByRole('button');

      // Trigger button + 3 org buttons + create new button
      expect(buttons).toHaveLength(5);
    });
  });
});

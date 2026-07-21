import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from '@/components/DashboardLayout';
import * as AuthContext from '@/contexts/AuthContext';

// Mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock child components to keep tests focused on DashboardLayout
vi.mock('@/components/OrganizationSelector', () => ({
  default: ({ onCreateNew }: { onCreateNew: () => void }) => (
    <div data-testid="organization-selector">
      <button type="button" onClick={onCreateNew}>
        Create New Org
      </button>
    </div>
  ),
}));

vi.mock('@/components/CreateOrganizationModal', () => ({
  default: ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => (
    <div data-testid="create-org-modal">
      <button type="button" onClick={onClose}>
        Close Modal
      </button>
      <button type="button" onClick={onSuccess}>
        Success
      </button>
    </div>
  ),
}));

describe('DashboardLayout', () => {
  const mockLogout = vi.fn();

  const mockUser = {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    emailVerified: true,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);

    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: mockUser,
      logout: mockLogout,
    } as any);
  });

  describe('Layout Structure', () => {
    it('renders the main layout with sidebar and content area', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getAllByText('Authlane')).toHaveLength(2);
      expect(screen.getByTestId('organization-selector')).toBeInTheDocument();
    });

    it('renders all navigation links', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Connections/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Services/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Sandbox/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /API Keys/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Members/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^Organization$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument();
    });

    it('displays the Organization section header', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getByText('Organization', { selector: 'p' })).toBeInTheDocument();
    });

    it('renders OrganizationSelector component', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getByTestId('organization-selector')).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('has correct href attributes for all links', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute(
        'href',
        '/dashboard'
      );
      expect(screen.getByRole('link', { name: /Connections/i })).toHaveAttribute(
        'href',
        '/dashboard/connections'
      );
      expect(screen.getByRole('link', { name: /Services/i })).toHaveAttribute(
        'href',
        '/dashboard/services'
      );
      expect(screen.getByRole('link', { name: /API Keys/i })).toHaveAttribute(
        'href',
        '/dashboard/api-keys'
      );
      expect(screen.getByRole('link', { name: /Sandbox/i })).toHaveAttribute(
        'href',
        '/dashboard/sandbox'
      );
      expect(screen.getByRole('link', { name: /Members/i })).toHaveAttribute(
        'href',
        '/dashboard/members'
      );
      expect(screen.getByRole('link', { name: /^Organization$/i })).toHaveAttribute(
        'href',
        '/dashboard/organization'
      );
      expect(screen.getByRole('link', { name: /Settings/i })).toHaveAttribute(
        'href',
        '/dashboard/settings'
      );
    });

    it('applies active styles to current route', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard/connections']}>
          <DashboardLayout />
        </MemoryRouter>
      );

      const connectionsLink = screen.getByRole('link', { name: /Connections/i });
      expect(connectionsLink).toHaveClass('bg-muted', 'text-foreground');
    });

    it('applies inactive styles to non-active routes', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>
      );

      const connectionsLink = screen.getByRole('link', { name: /Connections/i });
      expect(connectionsLink).not.toHaveClass('bg-muted');
      expect(connectionsLink).toHaveClass('text-muted-foreground');
    });
  });

  describe('User Information', () => {
    it('displays user name and email', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('handles missing user gracefully', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        user: null,
        logout: mockLogout,
      } as any);

      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      // Should not crash, just not display user info
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  describe('Logout Functionality', () => {
    it('displays Sign out button', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument();
    });

    it('calls logout function when Sign out button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      const signOutButton = screen.getByRole('button', { name: /Sign out/i });
      await user.click(signOutButton);

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Create Organization Modal', () => {
    it('does not display modal by default', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(screen.queryByTestId('create-org-modal')).not.toBeInTheDocument();
    });

    it('opens modal when OrganizationSelector triggers onCreateNew', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      // Click the mocked OrganizationSelector's create button
      const createButton = screen.getByText('Create New Org');
      await user.click(createButton);

      expect(screen.getByTestId('create-org-modal')).toBeInTheDocument();
    });

    it('closes modal when onClose is called', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      // Open modal
      const createButton = screen.getByText('Create New Org');
      await user.click(createButton);
      expect(screen.getByTestId('create-org-modal')).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByText('Close Modal');
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('create-org-modal')).not.toBeInTheDocument();
      });
    });

    it('reloads page when organization is created successfully', async () => {
      const user = userEvent.setup();
      const reloadSpy = vi.fn();

      // Mock window.location.reload
      Object.defineProperty(window, 'location', {
        value: { reload: reloadSpy },
        writable: true,
      });

      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      // Open modal
      const createButton = screen.getByText('Create New Org');
      await user.click(createButton);

      // Trigger success
      const successButton = screen.getByText('Success');
      await user.click(successButton);

      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('keeps the mobile close control above the navigation overlay', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: 'Open navigation' }));

      expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveClass('z-50');
      expect(screen.getByRole('button', { name: 'Close navigation overlay' })).toHaveClass('z-30');
    });

    it('has proper navigation structure with nav element', () => {
      const { container } = render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('all navigation links are keyboard accessible', () => {
      render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);

      links.forEach((link) => {
        expect(link).toBeInTheDocument();
      });
    });

    it('has proper semantic HTML structure', () => {
      const { container } = render(
        <MemoryRouter>
          <DashboardLayout />
        </MemoryRouter>
      );

      expect(container.querySelector('aside')).toBeInTheDocument();
      expect(container.querySelector('main')).toBeInTheDocument();
      expect(container.querySelector('nav')).toBeInTheDocument();
    });
  });
});

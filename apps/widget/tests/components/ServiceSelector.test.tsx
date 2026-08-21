import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServiceSelector } from '@/components/ServiceSelector';
import type { Service } from '@/types';
import { render, screen } from '../utils/test-utils';

// Mock ServiceCard component
vi.mock('@/components/ServiceCard', () => ({
  ServiceCard: ({ service, onClick }: { service: Service; onClick: () => void }) => (
    <button type="button" data-testid={`service-card-${service.id}`} onClick={onClick}>
      {service.name}
    </button>
  ),
}));

function service(
  id: string,
  name: string,
  category: Service['category'],
  description: string | null
): Service {
  return {
    id,
    name,
    authType: 'oauth2',
    category,
    iconUrl: null,
    description,
    brandColor: null,
    initials: name.slice(0, 2).toUpperCase(),
    status: 'disconnected',
  };
}

describe('ServiceSelector', () => {
  const mockOnServiceSelect = vi.fn();

  const mockServices: Service[] = [
    service('github', 'GitHub', 'engineering', 'Version control and collaboration'),
    service('slack', 'Slack', 'communication', 'Team communication platform'),
    service('salesforce', 'Salesforce', 'crm', 'Customer relationship management'),
    service('google-drive', 'Google Drive', 'storage', 'Cloud storage solution'),
    service('trello', 'Trello', 'productivity', 'Project management tool'),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders header with title and subtitle', () => {
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      expect(screen.getByText('Connect Services')).toBeInTheDocument();
      expect(screen.getByText('Choose a service to connect to your account')).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const searchInput = screen.getByPlaceholderText('Search services...');
      expect(searchInput).toBeInTheDocument();
    });

    it('renders a button for every category present, and no others', () => {
      // The list used to be hardcoded and included categories nothing was ever filed under, so
      // those tabs could only ever empty the grid.
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      for (const label of [
        /All/i,
        /Communication/i,
        /Crm/i,
        /Engineering/i,
        /Productivity/i,
        /Storage/i,
      ]) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: /Other/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Finance/i })).not.toBeInTheDocument();
    });

    it('offers no category a service could be missing from', () => {
      // A server a workspace registered itself declares no category. It must stay reachable, so
      // the filter is hidden rather than silently excluding it behind a tab.
      const uncategorized = [service('mcp-1', 'Acme CRM', null, null)];
      render(<ServiceSelector services={uncategorized} onServiceSelect={mockOnServiceSelect} />);

      expect(screen.queryByRole('button', { name: /^Crm$/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('service-card-mcp-1')).toBeInTheDocument();
    });

    it('has "All" category selected by default', () => {
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const allButton = screen.getByRole('button', { name: /All/i });
      expect(allButton).toHaveClass('service-selector__category--active');
    });

    it('displays all services when no filters are applied', () => {
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-slack')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-salesforce')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-google-drive')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-trello')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('filters services by name', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const searchInput = screen.getByPlaceholderText('Search services...');
      await user.type(searchInput, 'GitHub');

      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-slack')).not.toBeInTheDocument();
      expect(screen.queryByTestId('service-card-salesforce')).not.toBeInTheDocument();
    });

    it('filters services by description', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const searchInput = screen.getByPlaceholderText('Search services...');
      await user.type(searchInput, 'collaboration');

      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-slack')).not.toBeInTheDocument();
    });

    it('is case-insensitive', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const searchInput = screen.getByPlaceholderText('Search services...');
      await user.type(searchInput, 'SLACK');

      expect(screen.getByTestId('service-card-slack')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-github')).not.toBeInTheDocument();
    });

    it('shows no results message when search has no matches', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const searchInput = screen.getByPlaceholderText('Search services...');
      await user.type(searchInput, 'nonexistent service');

      expect(screen.getByText('No services found matching your criteria')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-github')).not.toBeInTheDocument();
    });

    it('clears search when input is cleared', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const searchInput = screen.getByPlaceholderText('Search services...');

      // Type search term
      await user.type(searchInput, 'GitHub');
      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-slack')).not.toBeInTheDocument();

      // Clear search
      await user.clear(searchInput);

      // All services should be visible again
      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-slack')).toBeInTheDocument();
    });
  });

  describe('Category Filtering', () => {
    it('filters services by communication category', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const communicationButton = screen.getByRole('button', { name: /Communication/i });
      await user.click(communicationButton);

      expect(screen.getByTestId('service-card-slack')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-github')).not.toBeInTheDocument();
      expect(screen.queryByTestId('service-card-salesforce')).not.toBeInTheDocument();
    });

    it('filters services by engineering category', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const developmentButton = screen.getByRole('button', { name: /^Engineering$/i });
      await user.click(developmentButton);

      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-slack')).not.toBeInTheDocument();
    });

    it('filters services by crm category', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const crmButton = screen.getByRole('button', { name: /Crm/i });
      await user.click(crmButton);

      expect(screen.getByTestId('service-card-salesforce')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-github')).not.toBeInTheDocument();
    });

    it('shows all services when "All" category is selected', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      // First select a specific category
      const developmentButton = screen.getByRole('button', { name: /^Engineering$/i });
      await user.click(developmentButton);
      expect(screen.queryByTestId('service-card-slack')).not.toBeInTheDocument();

      // Then select "All"
      const allButton = screen.getByRole('button', { name: /All/i });
      await user.click(allButton);

      // All services should be visible
      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-slack')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-salesforce')).toBeInTheDocument();
    });

    it('updates active class when category changes', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const developmentButton = screen.getByRole('button', { name: /^Engineering$/i });
      await user.click(developmentButton);

      expect(developmentButton).toHaveClass('service-selector__category--active');
      expect(screen.getByRole('button', { name: /All/i })).not.toHaveClass(
        'service-selector__category--active'
      );
    });

    it('shows the empty state when a search matches nothing', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      await user.type(screen.getByPlaceholderText('Search services...'), 'nothing-matches-this');

      expect(screen.getByText('No services found matching your criteria')).toBeInTheDocument();
    });
  });

  describe('Combined Search and Category Filtering', () => {
    it('applies both search and category filters together', async () => {
      const user = userEvent.setup();
      const servicesWithMultipleInCategory: Service[] = [
        ...mockServices,
        service('gitlab', 'GitLab', 'engineering', 'DevOps platform'),
      ];

      render(
        <ServiceSelector
          services={servicesWithMultipleInCategory}
          onServiceSelect={mockOnServiceSelect}
        />
      );

      // Select engineering category
      const developmentButton = screen.getByRole('button', { name: /^Engineering$/i });
      await user.click(developmentButton);

      // Both GitHub and GitLab should be visible
      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.getByTestId('service-card-gitlab')).toBeInTheDocument();

      // Search for "Hub"
      const searchInput = screen.getByPlaceholderText('Search services...');
      await user.type(searchInput, 'Hub');

      // Only GitHub should match
      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
      expect(screen.queryByTestId('service-card-gitlab')).not.toBeInTheDocument();
      expect(screen.queryByTestId('service-card-slack')).not.toBeInTheDocument();
    });
  });

  describe('Service Selection', () => {
    it('calls onServiceSelect when a service is clicked', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const githubCard = screen.getByTestId('service-card-github');
      await user.click(githubCard);

      expect(mockOnServiceSelect).toHaveBeenCalledTimes(1);
      expect(mockOnServiceSelect).toHaveBeenCalledWith(mockServices[0]);
    });

    it('calls onServiceSelect with correct service', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const slackCard = screen.getByTestId('service-card-slack');
      await user.click(slackCard);

      expect(mockOnServiceSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'slack',
          name: 'Slack',
        })
      );
    });
  });

  describe('Loading State', () => {
    it('shows loading message when loading is true', () => {
      render(
        <ServiceSelector services={[]} onServiceSelect={mockOnServiceSelect} loading={true} />
      );

      expect(screen.getByText('Loading services...')).toBeInTheDocument();
    });

    it('does not show services grid when loading', () => {
      render(
        <ServiceSelector
          services={mockServices}
          onServiceSelect={mockOnServiceSelect}
          loading={true}
        />
      );

      expect(screen.queryByTestId('service-card-github')).not.toBeInTheDocument();
    });

    it('shows services when loading is false', () => {
      render(
        <ServiceSelector
          services={mockServices}
          onServiceSelect={mockOnServiceSelect}
          loading={false}
        />
      );

      expect(screen.queryByText('Loading services...')).not.toBeInTheDocument();
      expect(screen.getByTestId('service-card-github')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no services provided', () => {
      render(<ServiceSelector services={[]} onServiceSelect={mockOnServiceSelect} />);

      expect(screen.getByText('No services found matching your criteria')).toBeInTheDocument();
    });
  });
});

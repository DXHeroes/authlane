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

describe('ServiceSelector', () => {
  const mockOnServiceSelect = vi.fn();

  const mockServices: Service[] = [
    {
      id: 'github',
      name: 'GitHub',
      category: 'development',
      icon: '',
      description: 'Version control and collaboration',
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'communication',
      icon: '',
      description: 'Team communication platform',
    },
    {
      id: 'salesforce',
      name: 'Salesforce',
      category: 'crm',
      icon: '',
      description: 'Customer relationship management',
    },
    {
      id: 'google-drive',
      name: 'Google Drive',
      category: 'storage',
      icon: '',
      description: 'Cloud storage solution',
    },
    {
      id: 'trello',
      name: 'Trello',
      category: 'productivity',
      icon: '',
      description: 'Project management tool',
    },
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

    it('renders all category buttons', () => {
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      expect(screen.getByRole('button', { name: /All/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Communication/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Crm/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Development/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Productivity/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Storage/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Other/i })).toBeInTheDocument();
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

    it('filters services by development category', async () => {
      const user = userEvent.setup();
      render(<ServiceSelector services={mockServices} onServiceSelect={mockOnServiceSelect} />);

      const developmentButton = screen.getByRole('button', { name: /Development/i });
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
      const developmentButton = screen.getByRole('button', { name: /Development/i });
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

      const developmentButton = screen.getByRole('button', { name: /Development/i });
      await user.click(developmentButton);

      expect(developmentButton).toHaveClass('service-selector__category--active');
      expect(screen.getByRole('button', { name: /All/i })).not.toHaveClass(
        'service-selector__category--active'
      );
    });

    it('shows no results message when category has no matching services', async () => {
      const user = userEvent.setup();
      const noOtherServices = mockServices; // No services with "other" category
      render(<ServiceSelector services={noOtherServices} onServiceSelect={mockOnServiceSelect} />);

      const otherButton = screen.getByRole('button', { name: /Other/i });
      await user.click(otherButton);

      expect(screen.getByText('No services found matching your criteria')).toBeInTheDocument();
    });
  });

  describe('Combined Search and Category Filtering', () => {
    it('applies both search and category filters together', async () => {
      const user = userEvent.setup();
      const servicesWithMultipleInCategory: Service[] = [
        ...mockServices,
        {
          id: 'gitlab',
          name: 'GitLab',
          category: 'development',
          icon: '',
          description: 'DevOps platform',
        },
      ];

      render(
        <ServiceSelector
          services={servicesWithMultipleInCategory}
          onServiceSelect={mockOnServiceSelect}
        />
      );

      // Select development category
      const developmentButton = screen.getByRole('button', { name: /Development/i });
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

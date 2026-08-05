import { Grid3x3, Search } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { Service } from '../types';
import { ServiceCard } from './ServiceCard';

interface ServiceSelectorProps {
  services: Service[];
  onServiceSelect: (service: Service) => void;
  loading?: boolean;
  /** Id of the service whose connect or disconnect call is in flight. */
  pendingServiceId?: string | null;
}

const CATEGORIES = [
  'all',
  'communication',
  'crm',
  'development',
  'productivity',
  'storage',
  'other',
];

/**
 * Placeholders in the shape of the cards they stand in for.
 *
 * The widget reports its own height to the host page through a ResizeObserver, so a
 * single centred line of text growing into a grid of cards makes the iframe jump.
 */
function SkeletonCards() {
  return (
    <>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="service-card service-card--skeleton">
          <div className="skeleton skeleton--icon" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--line skeleton--line-short" />
        </div>
      ))}
    </>
  );
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  services,
  onServiceSelect,
  loading = false,
  pendingServiceId = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesSearch =
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || service.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, searchTerm, selectedCategory]);

  return (
    <div className="service-selector">
      <div className="service-selector__header">
        <h2 className="service-selector__title">
          <Grid3x3 size={20} aria-hidden="true" />
          Connect Services
        </h2>
        <p className="service-selector__subtitle">Choose a service to connect to your account</p>
      </div>

      <div className="service-selector__search">
        <Search className="service-selector__search-icon" size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search services..."
          aria-label="Search services"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="service-selector__search-input"
        />
      </div>

      <fieldset className="service-selector__categories">
        <legend className="service-selector__sr-only">Filter services by category</legend>
        {CATEGORIES.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={selectedCategory === category}
            className={`service-selector__category ${
              selectedCategory === category ? 'service-selector__category--active' : ''
            }`}
            onClick={() => setSelectedCategory(category)}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </fieldset>

      {loading ? (
        <div className="service-selector__grid" role="status" aria-busy="true">
          <span className="service-selector__sr-only">Loading services...</span>
          <SkeletonCards />
        </div>
      ) : (
        <div className="service-selector__grid">
          {filteredServices.length > 0 ? (
            filteredServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                pending={pendingServiceId === service.id}
                onClick={() => onServiceSelect(service)}
              />
            ))
          ) : (
            <div className="service-selector__empty">No services found matching your criteria</div>
          )}
        </div>
      )}
    </div>
  );
};

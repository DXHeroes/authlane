import React, { useState, useMemo } from 'react';
import { Search, Grid3x3 } from 'lucide-react';
import type { Service } from '../types';
import { ServiceCard } from './ServiceCard';

interface ServiceSelectorProps {
  services: Service[];
  onServiceSelect: (service: Service) => void;
  loading?: boolean;
}

const CATEGORIES = [
  'all',
  'communication',
  'crm',
  'development',
  'productivity',
  'storage',
  'other'
];

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  services,
  onServiceSelect,
  loading = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || service.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, searchTerm, selectedCategory]);

  return (
    <div className="service-selector">
      <div className="service-selector__header">
        <h2 className="service-selector__title">
          <Grid3x3 size={20} />
          Connect Services
        </h2>
        <p className="service-selector__subtitle">
          Choose a service to connect to your account
        </p>
      </div>

      <div className="service-selector__search">
        <Search className="service-selector__search-icon" size={18} />
        <input
          type="text"
          placeholder="Search services..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="service-selector__search-input"
        />
      </div>

      <div className="service-selector__categories">
        {CATEGORIES.map(category => (
          <button
            key={category}
            className={`service-selector__category ${
              selectedCategory === category ? 'service-selector__category--active' : ''
            }`}
            onClick={() => setSelectedCategory(category)}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="service-selector__loading">Loading services...</div>
      ) : (
        <div className="service-selector__grid">
          {filteredServices.length > 0 ? (
            filteredServices.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                onClick={() => onServiceSelect(service)}
              />
            ))
          ) : (
            <div className="service-selector__empty">
              No services found matching your criteria
            </div>
          )}
        </div>
      )}
    </div>
  );
};

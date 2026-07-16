import { Check, Clock } from 'lucide-react';
import type React from 'react';
import type { Service } from '../types';
import { ConnectionStatus } from './ConnectionStatus';

interface ServiceCardProps {
  service: Service;
  onClick: () => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, onClick }) => {
  const getStatusIcon = () => {
    switch (service.status) {
      case 'connected':
        return (
          <Check
            className="service-card__status-icon service-card__status-icon--connected"
            size={16}
          />
        );
      case 'expired':
        return (
          <Clock
            className="service-card__status-icon service-card__status-icon--expired"
            size={16}
          />
        );
      default:
        return null;
    }
  };

  return (
    <button type="button" className="service-card" onClick={onClick}>
      <div className="service-card__header">
        <div className="service-card__icon">
          {service.icon ? (
            <img src={service.icon} alt={service.name} />
          ) : (
            <div className="service-card__icon-placeholder">
              {service.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        {service.status && <div className="service-card__status-badge">{getStatusIcon()}</div>}
      </div>

      <div className="service-card__content">
        <h3 className="service-card__name">{service.name}</h3>
        <p className="service-card__description">{service.description}</p>

        {service.status && <ConnectionStatus status={service.status} compact />}
      </div>
    </button>
  );
};

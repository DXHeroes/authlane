import { Check, Clock } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { Service } from '../types';
import { ConnectionStatus } from './ConnectionStatus';

interface ServiceCardProps {
  service: Service;
  onClick: () => void;
  /** True while the connect or disconnect call for this service is in flight. */
  pending?: boolean;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, onClick, pending = false }) => {
  // Clicking a connected service disconnects it. That used to happen on the first click
  // with nothing asked, so a misplaced tap dropped an authorization silently.
  const [confirming, setConfirming] = useState(false);
  // A mark can 404 or be blocked by the host page's own CSP. Falling back on error means one bad
  // request leaves initials rather than an empty square.
  const [iconFailed, setIconFailed] = useState(false);
  const isConnected = service.status === 'connected';
  const showIcon = Boolean(service.iconUrl) && !iconFailed;

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

  const body = (
    <>
      <div className="service-card__header">
        <div
          className="service-card__icon"
          style={
            service.brandColor && !showIcon
              ? ({ '--service-brand-color': service.brandColor } as React.CSSProperties)
              : undefined
          }
        >
          {showIcon ? (
            <img src={service.iconUrl as string} alt="" onError={() => setIconFailed(true)} />
          ) : (
            <div className="service-card__icon-placeholder">{service.initials}</div>
          )}
        </div>
        {service.status && <div className="service-card__status-badge">{getStatusIcon()}</div>}
      </div>

      <div className="service-card__content">
        <h3 className="service-card__name">{service.name}</h3>
        {service.description && <p className="service-card__description">{service.description}</p>}

        {service.status && <ConnectionStatus status={service.status} compact />}
      </div>
    </>
  );

  if (confirming) {
    return (
      <div className="service-card service-card--confirming">
        {body}
        <div className="service-card__confirm">
          <p className="service-card__confirm-question">
            Disconnect {service.name}? Anything using it stops working until you connect again.
          </p>
          <div className="service-card__confirm-actions">
            <button
              type="button"
              className="service-card__confirm-cancel"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
            <button
              type="button"
              className="service-card__confirm-accept"
              onClick={() => {
                setConfirming(false);
                onClick();
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="service-card"
      aria-busy={pending || undefined}
      disabled={pending}
      // Names what the click does, rather than only what the card is about.
      aria-label={`${isConnected ? 'Disconnect' : 'Connect'} ${service.name}`}
      onClick={() => (isConnected ? setConfirming(true) : onClick())}
    >
      {body}
    </button>
  );
};

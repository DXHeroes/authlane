import { Check, Clock, RefreshCw, X } from 'lucide-react';
import type React from 'react';

interface ConnectionStatusProps {
  status: 'connected' | 'disconnected' | 'expired';
  onReconnect?: () => void;
  compact?: boolean;
  expiresAt?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  onReconnect,
  compact = false,
  expiresAt,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: <Check size={16} />,
          label: 'Connected',
          className: 'connection-status--connected',
        };
      case 'expired':
        return {
          icon: <Clock size={16} />,
          label: 'Expired',
          className: 'connection-status--expired',
        };
      default:
        return {
          icon: <X size={16} />,
          label: 'Disconnected',
          className: 'connection-status--disconnected',
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    return (
      <span className={`connection-status connection-status--compact ${config.className}`}>
        {config.icon}
        <span className="connection-status__label">{config.label}</span>
      </span>
    );
  }

  return (
    <div className={`connection-status ${config.className}`}>
      <div className="connection-status__badge">
        {config.icon}
        <span className="connection-status__label">{config.label}</span>
      </div>

      {expiresAt && status === 'connected' && (
        <div className="connection-status__expiry">
          Expires: {new Date(expiresAt).toLocaleDateString()}
        </div>
      )}

      {(status === 'expired' || status === 'disconnected') && onReconnect && (
        <button className="connection-status__reconnect" onClick={onReconnect}>
          <RefreshCw size={14} />
          Reconnect
        </button>
      )}
    </div>
  );
};

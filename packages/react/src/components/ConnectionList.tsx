/**
 * ConnectionList component
 * Displays all user connections with status and disconnect functionality
 */

import type { Connection } from '@authlane/sdk';
import { useState } from 'react';
import { useAuthlaneContext } from '../context.js';
import { useConnections } from '../hooks/useConnections.js';
import type { ConnectionListProps, ConnectionStatus } from '../types.js';

/**
 * Component for displaying a list of user connections
 *
 * @example
 * ```tsx
 * import { ConnectionList } from '@authlane/react';
 *
 * function App() {
 *   return (
 *     <ConnectionList
 *       onDisconnect={(serviceId) => {
 *         console.log('Disconnected from', serviceId);
 *       }}
 *       allowDisconnect={true}
 *     />
 *   );
 * }
 * ```
 */
export function ConnectionList({
  onDisconnect,
  className = '',
  services,
  allowDisconnect = true,
  emptyState,
}: ConnectionListProps) {
  const { connections, isLoading, refetch } = useConnections({ autoFetch: true });

  const filteredConnections = services
    ? connections.filter((conn) => services.includes(conn.serviceId))
    : connections;

  const listClass = ['authlane-connection-list', className].filter(Boolean).join(' ');

  if (isLoading) {
    return (
      <div className={listClass}>
        <div className="authlane-connection-list__loading">Loading connections...</div>
      </div>
    );
  }

  if (filteredConnections.length === 0) {
    return (
      <div className={listClass}>
        {emptyState || <div className="authlane-connection-list__empty">No connections found</div>}
      </div>
    );
  }

  return (
    <div className={listClass}>
      {filteredConnections.map((connection) => (
        <ConnectionItem
          key={connection.serviceId}
          connection={connection}
          onDisconnect={onDisconnect}
          allowDisconnect={allowDisconnect}
          onRefresh={refetch}
        />
      ))}
    </div>
  );
}

/**
 * Individual connection item component
 */
interface ConnectionItemProps {
  connection: Connection;
  onDisconnect?: (serviceId: string) => void;
  allowDisconnect: boolean;
  onRefresh: () => void;
}

function ConnectionItem({
  connection,
  onDisconnect,
  allowDisconnect,
  onRefresh,
}: ConnectionItemProps) {
  const { client, userId } = useAuthlaneContext();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const status = determineConnectionStatus(connection);

  const handleDisconnect = async () => {
    if (!allowDisconnect) return;

    setIsDisconnecting(true);

    try {
      const { error } = await client.connections.delete({
        userId,
        serviceId: connection.serviceId,
      });

      if (error) {
        throw new Error(error.message);
      }

      onDisconnect?.(connection.serviceId);
      onRefresh();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="authlane-connection-item">
      <div className="authlane-connection-item__info">
        <div className="authlane-connection-item__service">{connection.serviceId}</div>
        <ConnectionStatusBadge status={status} />
      </div>

      {allowDisconnect && (
        <button
          type="button"
          className="authlane-connection-item__disconnect"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      )}
    </div>
  );
}

/**
 * Status badge component
 */
interface StatusBadgeProps {
  status: ConnectionStatus;
}

function ConnectionStatusBadge({ status }: StatusBadgeProps) {
  const badgeClass = ['authlane-connection-status', `authlane-connection-status--${status}`].join(
    ' '
  );

  const labels: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    expired: 'Expired',
    error: 'Error',
  };

  return <span className={badgeClass}>{labels[status]}</span>;
}

/**
 * Determine connection status
 */
function determineConnectionStatus(connection: Connection): ConnectionStatus {
  // Use the status from the connection object
  if (connection.status === 'expired') {
    return 'expired';
  }

  if (connection.status === 'error') {
    return 'error';
  }

  if (connection.status === 'connected') {
    return 'connected';
  }

  return 'disconnected';
}

/**
 * Hook for managing a single connection
 */

import { useState, useEffect, useCallback } from 'react';
import type { Connection } from '@authlane/sdk';
import { useAuthlaneContext } from '../context.js';
import type { ConnectionStatus } from '../types.js';

interface UseConnectionOptions {
  serviceId: string;
  /** Auto-fetch connection on mount */
  autoFetch?: boolean;
  /** Poll interval in milliseconds */
  pollInterval?: number;
}

interface UseConnectionReturn {
  connection: Connection | null;
  status: ConnectionStatus;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Hook to manage a single service connection
 *
 * @param options - Connection options
 * @returns Connection state and actions
 *
 * @example
 * ```tsx
 * import { useConnection } from '@authlane/react';
 *
 * function GitHubStatus() {
 *   const { connection, status, disconnect } = useConnection({
 *     serviceId: 'github',
 *     autoFetch: true,
 *   });
 *
 *   if (status === 'connected') {
 *     return (
 *       <div>
 *         Connected to GitHub
 *         <button onClick={disconnect}>Disconnect</button>
 *       </div>
 *     );
 *   }
 *
 *   return <div>Not connected</div>;
 * }
 * ```
 */
export function useConnection(options: UseConnectionOptions): UseConnectionReturn {
  const { serviceId, autoFetch = true, pollInterval } = options;
  const { client, userId } = useAuthlaneContext();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchConnection = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: apiError } = await client.connections.get({
        userId,
        serviceId,
      });

      if (apiError) {
        throw new Error(apiError.message);
      }

      if (data) {
        setConnection(data);
        setStatus(determineStatus(data));
      } else {
        setConnection(null);
        setStatus('disconnected');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [client, userId, serviceId]);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: apiError } = await client.connections.delete({
        userId,
        serviceId,
      });

      if (apiError) {
        throw new Error(apiError.message);
      }

      setConnection(null);
      setStatus('disconnected');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [client, userId, serviceId]);

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      fetchConnection();
    }
  }, [autoFetch, fetchConnection]);

  // Polling
  useEffect(() => {
    if (!pollInterval) return;

    const intervalId = setInterval(fetchConnection, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [pollInterval, fetchConnection]);

  return {
    connection,
    status,
    isLoading,
    error,
    refetch: fetchConnection,
    disconnect,
  };
}

/**
 * Determine connection status from connection data
 */
function determineStatus(connection: Connection): ConnectionStatus {
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

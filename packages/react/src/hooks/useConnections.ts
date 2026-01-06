/**
 * Hook for managing multiple connections
 */

import type { Connection } from '@authlane/sdk';
import { useCallback, useEffect, useState } from 'react';
import { useAuthlaneContext } from '../context.js';

interface UseConnectionsOptions {
  /** Auto-fetch connections on mount */
  autoFetch?: boolean;
  /** Poll interval in milliseconds */
  pollInterval?: number;
}

interface UseConnectionsReturn {
  connections: Connection[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to manage all user connections
 *
 * @param options - Connections options
 * @returns Connections state and actions
 *
 * @example
 * ```tsx
 * import { useConnections } from '@authlane/react';
 *
 * function ConnectionsList() {
 *   const { connections, isLoading, refetch } = useConnections({
 *     autoFetch: true,
 *   });
 *
 *   if (isLoading) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       <button onClick={refetch}>Refresh</button>
 *       {connections.map(conn => (
 *         <div key={conn.serviceId}>{conn.serviceId}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useConnections(options: UseConnectionsOptions = {}): UseConnectionsReturn {
  const { autoFetch = true, pollInterval } = options;
  const { client, userId } = useAuthlaneContext();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: apiError } = await client.connections.list({
        userId,
      });

      if (apiError) {
        throw new Error(apiError.message);
      }

      setConnections(data || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, [client, userId]);

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      fetchConnections();
    }
  }, [autoFetch, fetchConnections]);

  // Polling
  useEffect(() => {
    if (!pollInterval) return;

    const intervalId = setInterval(fetchConnections, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [pollInterval, fetchConnections]);

  return {
    connections,
    isLoading,
    error,
    refetch: fetchConnections,
  };
}

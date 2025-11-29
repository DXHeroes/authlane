/**
 * Main hook for accessing Authlane client
 */

import { useAuthlaneContext } from '../context.js';

/**
 * Hook to access Authlane SDK client
 *
 * @returns Authlane client instance and user ID
 *
 * @example
 * ```tsx
 * import { useAuthlane } from '@authlane/react';
 *
 * function MyComponent() {
 *   const { client, userId } = useAuthlane();
 *
 *   const handleGetConnections = async () => {
 *     const { data, error } = await client.connections.list({ userId });
 *     if (data) {
 *       console.log('Connections:', data);
 *     }
 *   };
 *
 *   return <button onClick={handleGetConnections}>Get Connections</button>;
 * }
 * ```
 */
export function useAuthlane() {
  const { client, userId } = useAuthlaneContext();

  return {
    client,
    userId,
  };
}

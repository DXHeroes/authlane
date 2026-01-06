/**
 * React Context for Authlane
 */

import { Authlane } from '@authlane/sdk';
import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { AuthlaneConfig } from './types.js';

interface AuthlaneContextValue {
  client: Authlane;
  userId: string;
  publicKey: string;
  baseUrl: string;
}

const AuthlaneContext = createContext<AuthlaneContextValue | null>(null);

/**
 * AuthlaneProvider component
 *
 * Provides Authlane context to child components
 *
 * @example
 * ```tsx
 * import { AuthlaneProvider } from '@authlane/react';
 *
 * function App() {
 *   return (
 *     <AuthlaneProvider
 *       publicKey="pk_..."
 *       userId={currentUser.id}
 *     >
 *       <YourApp />
 *     </AuthlaneProvider>
 *   );
 * }
 * ```
 */
export function AuthlaneProvider({
  children,
  publicKey,
  userId,
  baseUrl = 'https://api.authlane.com',
  fetch: customFetch,
}: AuthlaneConfig & { children: React.ReactNode }) {
  const client = useMemo(
    () =>
      new Authlane({
        apiKey: publicKey,
        baseUrl,
        fetch: customFetch,
      }),
    [publicKey, baseUrl, customFetch]
  );

  const value = useMemo<AuthlaneContextValue>(
    () => ({
      client,
      userId,
      publicKey,
      baseUrl,
    }),
    [client, userId, publicKey, baseUrl]
  );

  return <AuthlaneContext.Provider value={value}>{children}</AuthlaneContext.Provider>;
}

/**
 * Hook to access Authlane context
 *
 * @returns Authlane context value
 * @throws Error if used outside AuthlaneProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { client, userId } = useAuthlaneContext();
 *   // Use client and userId
 * }
 * ```
 */
export function useAuthlaneContext(): AuthlaneContextValue {
  const context = useContext(AuthlaneContext);

  if (!context) {
    throw new Error('useAuthlaneContext must be used within an AuthlaneProvider');
  }

  return context;
}

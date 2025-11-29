/**
 * Better Auth Client for Dashboard
 */

import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

// Get API base URL - default to localhost:3000 for development
const getBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace('/api/v1', '');
  }
  // Default to localhost:3000 for development
  return 'http://localhost:3000';
};

/**
 * Better Auth client instance
 */
export const authClient = createAuthClient({
  baseURL: `${getBaseURL()}/api/auth`,
  plugins: [
    organizationClient(),
  ],
});

// Export convenience hooks
export const { useSession, signIn, signUp, signOut } = authClient;


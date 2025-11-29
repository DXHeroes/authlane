/**
 * Type definitions for API context
 */

import type { User, Organization } from '@authlane/database';

/**
 * Extended Hono context with authentication information
 */
export interface AuthlaneContext {
  user: User | null;
  session: { id: string; userId: string } | null;
  organization: Organization | null;
  apiKey: string | null; // For external SDK authentication
}

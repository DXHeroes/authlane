/**
 * Type definitions for API context
 */

import type { Organization, User } from '@authlane/database';
import type { ApiPrincipal } from './lib/api-principal.js';

/**
 * Extended Hono context with authentication information
 */
export interface AuthlaneContext {
  user: User | null;
  session: { id: string; userId: string; createdAt: Date | string } | null;
  organization: Organization | null;
  apiKey: string | null;
  principal: ApiPrincipal;
}

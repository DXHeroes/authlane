/**
 * Type definitions for API context
 */

import type { Tenant } from '@authlane/database';

/**
 * Extended Hono context with tenant information
 */
export interface AuthlaneContext {
  tenant: Tenant;
  tenantId: string;
}

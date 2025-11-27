/**
 * Hono context type extensions
 */

import type { Tenant } from '@authlane/database';

declare module 'hono' {
  interface ContextVariableMap {
    tenant: Tenant;
    tenantId: string;
  }
}

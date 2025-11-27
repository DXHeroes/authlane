/**
 * Tenant context utilities
 */

import type { Context } from 'hono';

/**
 * Gets tenant ID from context, throws if not found
 */
export function getTenantId(c: Context): string {
  const tenantId = c.get('tenantId');
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Tenant context not found');
  }
  return tenantId;
}

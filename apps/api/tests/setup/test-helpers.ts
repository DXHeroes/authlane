/**
 * Test helper utilities
 */

import type { Context, Next } from 'hono';

/**
 * Middleware to set tenant context from x-tenant-id header for tests
 */
export function testTenantMiddleware() {
  return async (c: Context, next: Next) => {
    const tenantId = c.req.header('x-tenant-id');
    if (tenantId) {
      c.set('tenantId', tenantId);
    }
    await next();
  };
}

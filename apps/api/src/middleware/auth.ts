/**
 * API Key authentication middleware
 */

import type { Database } from '@authlane/database';
import { tenants } from '@authlane/database';
import { Errors, hashApiKey } from '@authlane/shared';
import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';

/**
 * Extracts API key from request header
 */
function extractApiKey(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <key>" and "ApiKey <key>" formats
  const match = authHeader.match(/^(?:Bearer|ApiKey)\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}

/**
 * Middleware to authenticate requests using API key
 */
export function authMiddleware(db: Database) {
  return async (c: Context, next: Next) => {
    const apiKey = extractApiKey(c);
    if (!apiKey) {
      return c.json(Errors.unauthorized('API key is required'), 401);
    }

    const apiKeyHash = hashApiKey(apiKey);

    // Find tenant by API key hash
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.apiKeyHash, apiKeyHash))
      .limit(1);

    if (!tenant) {
      return c.json(Errors.unauthorized('Invalid API key'), 401);
    }

    // Set tenant context for RLS
    c.set('tenant', tenant);
    c.set('tenantId', tenant.id);

    await next();
  };
}

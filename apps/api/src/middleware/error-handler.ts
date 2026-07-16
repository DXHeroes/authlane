/**
 * Error handling middleware
 */

import type { AuthlaneError } from '@authlane/shared';
import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';

export function handleError(error: unknown, c: Context): Response {
  if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') {
    return c.json({ error: Errors.unauthorized('Tenant context not found') }, 401);
  }

  console.error('Unhandled error:', error);
  const authlaneError: AuthlaneError = Errors.internalError(
    error instanceof Error ? error.message : 'Unknown error occurred'
  );
  return c.json({ error: authlaneError }, 500);
}

/**
 * Error handling middleware for Hono
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    return handleError(error, c);
  }
}

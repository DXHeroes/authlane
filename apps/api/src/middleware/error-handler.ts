/**
 * Error handling middleware
 */

import type { AuthlaneError } from '@authlane/shared';
import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';
import { logger } from '../lib/logger.js';

export function handleError(error: unknown, c: Context): Response {
  if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') {
    return c.json({ error: Errors.unauthorized('Tenant context not found') }, 401);
  }

  const requestId = c.get('requestId') || 'unavailable';
  logger.error(
    { error, requestId, path: c.req.path, method: c.req.method },
    'Unhandled request error'
  );
  const authlaneError: AuthlaneError = Errors.internalError(
    `The request could not be completed. Request ID: ${requestId}`
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

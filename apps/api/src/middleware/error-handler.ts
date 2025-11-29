/**
 * Error handling middleware
 */

import type { AuthlaneError } from '@authlane/shared';
import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';

/**
 * Error handling middleware for Hono
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    // Handle tenant context errors
    if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') {
      const tenantError = Errors.unauthorized('Tenant context not found');
      return c.json({ error: tenantError }, 401);
    }

    console.error('Unhandled error:', error);

    let authlaneError: AuthlaneError;
    if (error instanceof Error) {
      authlaneError = Errors.internalError(error.message);
    } else {
      authlaneError = Errors.internalError('Unknown error occurred');
    }

    const statusCode = (authlaneError.statusCode || 500) as 200 | 201 | 400 | 401 | 404 | 500;
    return c.json({ error: authlaneError }, statusCode);
  }
}

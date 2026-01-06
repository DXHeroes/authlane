/**
 * Sentry integration for Hono
 * Note: This module provides Hono-compatible Sentry integration
 */

import * as Sentry from '@sentry/node';
import type { Context, Next } from 'hono';

/**
 * Sentry request handler middleware for Hono
 * Captures request context for error tracking
 */
export function sentryRequestHandler() {
  return async (c: Context, next: Next) => {
    const transaction = Sentry.startSpan(
      {
        name: `${c.req.method} ${c.req.path}`,
        op: 'http.server',
      },
      async () => {
        await next();
      }
    );
    return transaction;
  };
}

/**
 * Sentry error handler middleware for Hono
 * Captures errors with status code >= 500
 */
export function sentryErrorHandler() {
  return async (_c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      // Capture error in Sentry
      const status =
        error instanceof Error && 'status' in error ? (error as { status: number }).status : 500;

      if (status >= 500) {
        Sentry.captureException(error);
      }

      throw error;
    }
  };
}

/**
 * Attach user info to Sentry context
 */
export function attachSentryUser() {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (user) {
      Sentry.setUser({
        id: user.id,
        email: user.email,
      });
    }
    await next();
  };
}

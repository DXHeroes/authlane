import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { Context, Next } from 'hono';
import { logger } from './logger.js';

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|code|credential/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : scrub(entry),
    ])
  );
}

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    logger.info('Sentry is not configured');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    // Profiling
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    sendDefaultPii: false,

    integrations: [
      nodeProfilingIntegration(),
      Sentry.httpIntegration(),
      Sentry.nativeNodeFetchIntegration(),
    ],

    // Filtering
    beforeSend(event, hint) {
      // Don't send errors in development
      if (process.env.NODE_ENV === 'development') {
        return null;
      }

      // Filter out specific errors
      if (event.exception) {
        const error = hint.originalException;
        if (error instanceof Error) {
          // Don't send validation errors
          if (error.message.includes('ValidationError')) {
            return null;
          }
        }
      }

      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
      }
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map((value) => ({
          ...value,
          value: 'Internal error',
        }));
      }
      return scrub(event) as typeof event;
    },

    // Release tracking
    release: process.env.SENTRY_RELEASE || `authlane@${process.env.npm_package_version}`,
  });

  logger.info('Sentry initialized');
}

// Hono middleware for Sentry
export function sentryMiddleware() {
  return async (c: Context, next: Next) => {
    // Skip if Sentry is not initialized
    if (!process.env.SENTRY_DSN) {
      return next();
    }

    return Sentry.startSpan(
      {
        op: 'http.server',
        name: `${c.req.method} ${c.req.path}`,
      },
      async () => {
        try {
          await next();
        } catch (error) {
          if (error instanceof Error) {
            Sentry.captureException(error, {
              contexts: {
                request: {
                  method: c.req.method,
                  path: c.req.path,
                  requestId: c.get('requestId'),
                },
              },
            });
          }
          throw error;
        }
      }
    );
  };
}

export function captureException(error: Error, context?: Record<string, unknown>) {
  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string }) {
  Sentry.setUser({ id: user.id });
}

export function clearUser() {
  Sentry.setUser(null);
}

export { Sentry };

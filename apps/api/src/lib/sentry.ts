import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { Context, Next } from 'hono';

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    // Profiling
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),

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

      return event;
    },

    // Release tracking
    release: process.env.SENTRY_RELEASE || `authlane@${process.env.npm_package_version}`,
  });

  console.log('✅ Sentry initialized');
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
                  url: c.req.url,
                  headers: Object.fromEntries(c.req.raw.headers),
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

export function setUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

export function clearUser() {
  Sentry.setUser(null);
}

export { Sentry };

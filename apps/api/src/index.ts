/**
 * Authlane API Server
 * Main entry point for the API application
 */

// Initialize Sentry as early as possible
import { initSentry, sentryMiddleware } from './lib/sentry.js';

initSentry();

import { createHash, timingSafeEqual } from 'node:crypto';
import { createDatabaseClient, type Database } from '@authlane/database';
import { Errors, getEnv } from '@authlane/shared';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import Redis from 'ioredis';
import { setupJobs } from './jobs/setup.js';
import { createAuth } from './lib/auth.js';
import {
  type AuthSecondaryStorage,
  createEncryptedRedisSecondaryStorage,
} from './lib/auth-secondary-storage.js';
import { type CacheStore, MemoryCacheStore, RedisCacheStore } from './lib/cache.js';
import { resolveClientIp } from './lib/client-ip.js';
import { exactFrameOrigin, sanitizeMetricRoute } from './lib/http-security.js';
import { logger, logRequest } from './lib/logger.js';
import { recordHttpRequest } from './lib/metrics.js';
import {
  authMiddleware,
  dashboardSessionSecurity,
  handleError,
  rateLimitMiddleware,
} from './middleware/index.js';
import {
  MemoryRateLimitStore,
  type RateLimitStore,
  RedisRateLimitStore,
} from './middleware/rate-limit.js';
import { createApiRouter } from './routes/index.js';

/**
 * Create Hono app with routes and middleware
 * Exported for testing purposes
 */
export function createApp(
  db: Database,
  options?: {
    corsOrigin?: string | string[];
    rateLimitMaxRequests?: number;
    rateLimitWindowMs?: number;
    rateLimitEnabled?: boolean;
    cacheStore?: CacheStore;
    rateLimitStore?: RateLimitStore;
    authSecondaryStorage?: AuthSecondaryStorage;
    trustedProxyCidrs?: string[];
    metricsBearerToken?: string;
    publicRoot?: string;
  }
) {
  const app = new Hono();
  app.onError(handleError);
  const trustedOrigins = Array.isArray(options?.corsOrigin)
    ? options.corsOrigin
    : [options?.corsOrigin || 'http://localhost:5173'];
  const trustedProxyCidrs = options?.trustedProxyCidrs ?? [];

  // Create Better Auth instance
  const auth = createAuth(db, {
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins,
    secondaryStorage: options?.authSecondaryStorage,
  });

  // Global middleware
  app.use('*', requestId());
  app.use('*', async (c, next) => {
    let remoteAddress: string | undefined;
    try {
      remoteAddress = getConnInfo(c).remote.address;
    } catch {
      remoteAddress = undefined;
    }
    c.set(
      'clientIp',
      resolveClientIp(remoteAddress, c.req.header('x-forwarded-for'), trustedProxyCidrs)
    );
    await next();
    c.header('X-Request-ID', c.get('requestId'));
  });
  app.use('*', sentryMiddleware());
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: [
          (c) => {
            if (c.req.path !== '/connect') return "'none'";
            const frameOrigin = exactFrameOrigin(
              c.req.query('origin'),
              process.env.NODE_ENV || 'development'
            );
            return frameOrigin ? `'self' ${frameOrigin}` : "'none'";
          },
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
      },
      referrerPolicy: 'no-referrer',
      strictTransportSecurity:
        process.env.NODE_ENV === 'production'
          ? 'max-age=31536000; includeSubDomains; preload'
          : false,
      xFrameOptions: false,
    })
  );
  app.use(
    '*',
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json(Errors.validationError('Request body exceeds 256 KiB'), 413),
    })
  );
  app.use('*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const contentLength = Number(c.req.header('content-length') || 0);
      const contentType = c.req.header('content-type') || '';
      if (contentLength > 0 && !contentType.toLowerCase().startsWith('application/json')) {
        return c.json(Errors.validationError('Content-Type must be application/json'), 415);
      }
      if (c.req.raw.body) {
        const rawRequest = c.req.raw;
        try {
          const body = await rawRequest.arrayBuffer();
          c.req.raw = new Request(rawRequest, { body, duplex: 'half' });
        } catch (error) {
          if (error instanceof Error && error.name === 'BodyLimitError') {
            return c.json(Errors.validationError('Request body exceeds 256 KiB'), 413);
          }
          throw error;
        }
      }
    }
    await next();
  });
  app.use('*', async (c, next) => {
    const startedAt = performance.now();
    await next();
    const route = sanitizeMetricRoute(c.req.path);
    const durationMs = performance.now() - startedAt;
    recordHttpRequest(c.req.method, route, c.res.status, durationMs / 1_000);
    logRequest(c.req.method, route, c.res.status, durationMs, {
      requestId: c.get('requestId'),
      organizationId: c.get('principal')?.organizationId,
    });
  });
  app.use(
    '*',
    cors({
      origin: options?.corsOrigin ||
        process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true, // Required for better-auth cookies
    })
  );

  // Health check (no auth required)
  app.get('/health', (c) => {
    return c.json({ data: { status: 'ok', timestamp: new Date().toISOString() }, error: null });
  });

  // Metrics are protected even when network policy is accidentally permissive.
  app.get('/metrics', async (c) => {
    const expectedToken = options?.metricsBearerToken ?? process.env.METRICS_BEARER_TOKEN;
    if (expectedToken) {
      const provided = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
      const expectedHash = createHash('sha256').update(expectedToken).digest();
      const providedHash = createHash('sha256').update(provided).digest();
      if (!timingSafeEqual(expectedHash, providedHash)) {
        return c.json(Errors.notFound('Route'), 404);
      }
    } else if (process.env.NODE_ENV === 'production') {
      return c.json(Errors.notFound('Route'), 404);
    }
    const { register } = await import('./lib/metrics.js');
    const metrics = await register.metrics();
    return c.text(metrics, 200, {
      'Content-Type': register.contentType,
    });
  });

  // Better Auth routes (public)
  app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.set('x-authlane-client-ip', c.get('clientIp'));
      return await auth.handler(new Request(c.req.raw, { headers }));
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Authentication handler failed');
      return c.json({ error: Errors.internalError('Authentication request failed') }, 500);
    }
  });

  const cacheStore = options?.cacheStore ?? new MemoryCacheStore();

  // API routes (require authentication and rate limiting)
  app.use('/api/v1/*', authMiddleware(db, auth));
  app.use(
    '/api/v1/dashboard/*',
    dashboardSessionSecurity({
      trustedOrigins,
    })
  );
  app.use(
    '/api/v1/*',
    rateLimitMiddleware(
      db,
      {
        maxRequests: options?.rateLimitMaxRequests ?? 100,
        windowMs: options?.rateLimitWindowMs ?? 60000,
        enabled: options?.rateLimitEnabled ?? true,
      },
      options?.rateLimitStore ?? new MemoryRateLimitStore()
    )
  );
  app.route('/api/v1', createApiRouter(db, cacheStore));

  app.all('/api/*', (c) => c.json(Errors.notFound('API route', c.req.path), 404));

  const publicRoot = options?.publicRoot ?? process.env.AUTHLANE_PUBLIC_DIR ?? './public';
  const immutableAsset = {
    root: publicRoot,
    onFound: (_path: string, c: Context) => {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    },
  };
  app.use('/assets/*', serveStatic(immutableAsset));
  app.use('/connect/assets/*', serveStatic(immutableAsset));
  const noStoreDocument = {
    root: publicRoot,
    path: 'connect/index.html',
    onFound: (_path: string, c: Context) => c.header('Cache-Control', 'no-store'),
  };
  app.get('/connect', serveStatic(noStoreDocument));
  app.get('/connect/*', serveStatic(noStoreDocument));
  app.get(
    '*',
    serveStatic({
      root: publicRoot,
      path: 'index.html',
      onFound: (_path, c) => c.header('Cache-Control', 'no-store'),
    })
  );

  return app;
}

// Only run server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (error) => {
    logger.fatal({ error }, 'Unhandled rejection');
    process.exit(1);
  });

  // Validate environment
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    logger.fatal({ error }, 'Environment validation failed');
    process.exit(1);
  }

  // Initialize database
  let db: ReturnType<typeof createDatabaseClient>;
  try {
    db = createDatabaseClient(env.DATABASE_URL);
    logger.info('Database client initialized');
  } catch (error) {
    logger.fatal({ error }, 'Database connection failed');
    process.exit(1);
  }

  // Setup job queues (token refresh)
  const workerDb = env.SYSTEM_DATABASE_URL ? createDatabaseClient(env.SYSTEM_DATABASE_URL) : db;
  if (env.REDIS_URL) {
    setupJobs(workerDb, env.REDIS_URL);
  } else {
    logger.warn('REDIS_URL is not set; background jobs are disabled');
  }

  let cacheStore: CacheStore = new MemoryCacheStore();
  let rateLimitStore: RateLimitStore = new MemoryRateLimitStore();
  let authSecondaryStorage: AuthSecondaryStorage | undefined;
  if (env.REDIS_URL) {
    const redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    cacheStore = new RedisCacheStore(redis);
    rateLimitStore = new RedisRateLimitStore(redis);
    authSecondaryStorage = createEncryptedRedisSecondaryStorage(redis);
  }

  // Create app
  // Parse comma-separated CORS origins into array.
  const baseOrigins =
    env.CORS_ORIGIN?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) || [];
  const corsOrigins = [
    ...new Set([
      ...baseOrigins,
      ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173']),
    ]),
  ];
  const app = createApp(db, {
    corsOrigin: corsOrigins,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
    cacheStore,
    rateLimitStore,
    authSecondaryStorage,
    trustedProxyCidrs: env.TRUSTED_PROXY_CIDRS,
    metricsBearerToken: env.METRICS_BEARER_TOKEN,
  });

  // Start server
  const port = env.API_PORT;
  const host = env.API_HOST;

  logger.info(
    { host, port, environment: env.NODE_ENV, corsOrigins },
    'Authlane API server starting'
  );

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });
}

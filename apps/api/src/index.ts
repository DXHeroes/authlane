/**
 * Authlane API Server
 * Main entry point for the API application
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { createDatabaseClient, type Database } from '@authlane/database';
import type { EmailResult } from '@authlane/email';
import { Errors, getEnv } from '@authlane/shared';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import Redis from 'ioredis';
import { setupJobs } from './jobs/setup.js';
import { errorResult } from './lib/api-response.js';
import { createAuth } from './lib/auth.js';
import {
  type AuthSecondaryStorage,
  createEncryptedRedisSecondaryStorage,
} from './lib/auth-secondary-storage.js';
import { type AuthMode, isSignUpEnabled, parseAuthMode } from './lib/auth-security-config.js';
import { type CacheStore, MemoryCacheStore, RedisCacheStore } from './lib/cache.js';
import { resolveClientIp } from './lib/client-ip.js';
import {
  exactFrameOrigin,
  preservesOAuthPopupOpener,
  sanitizeMetricRoute,
} from './lib/http-security.js';
import { logger, logRequest } from './lib/logger.js';
import { recordHttpRequest } from './lib/metrics.js';
import {
  canonicalRedirectLocation,
  isDocsPath,
  isProductOnlyPath,
  type PublicSurface,
  resolvePublicSurface,
} from './lib/public-surface.js';
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

const ROOT_DOCUMENTATION_ASSETS = new Set(['/llms.txt', '/llms-full.txt']);

function isDocumentationPath(path: string): boolean {
  return isDocsPath(path) || ROOT_DOCUMENTATION_ASSETS.has(path);
}

function withDocumentationContentType(response: Response, path: string): Response {
  const contentType = /\.ya?ml$/i.test(path)
    ? 'application/yaml; charset=utf-8'
    : /\.md$/i.test(path)
      ? 'text/markdown; charset=utf-8'
      : undefined;
  if (!contentType) return response;

  const headers = new Headers(response.headers);
  headers.set('Content-Type', contentType);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
    landingPublicRoot?: string;
    landingHosts?: string[];
    appHosts?: string[];
    authMode?: AuthMode;
    signUpEnabled?: boolean;
    sendMagicLinkEmail?: (email: string, url: string) => Promise<EmailResult>;
  }
) {
  const app = new Hono();
  app.onError(handleError);
  const trustedOrigins = Array.isArray(options?.corsOrigin)
    ? options.corsOrigin
    : [options?.corsOrigin || 'http://localhost:5173'];
  const trustedProxyCidrs = options?.trustedProxyCidrs ?? [];
  const publicRoot = options?.publicRoot ?? process.env.AUTHLANE_PUBLIC_DIR ?? './public';
  const landingPublicRoot = options?.landingPublicRoot ?? process.env.AUTHLANE_LANDING_DIR;
  const landingHosts =
    options?.landingHosts ?? (process.env.AUTHLANE_LANDING_HOSTS ?? 'authlane.io').split(',');
  const appHosts =
    options?.appHosts ?? (process.env.AUTHLANE_APP_HOSTS ?? 'app.authlane.io').split(',');
  const environment = process.env.NODE_ENV || 'development';
  const authMode = options?.authMode ?? parseAuthMode(process.env.AUTHLANE_AUTH_MODE);
  const signUpEnabled =
    options?.signUpEnabled ?? isSignUpEnabled(process.env.AUTHLANE_ALLOW_SIGNUP, environment);

  const landingStatic = landingPublicRoot ? serveStatic({ root: landingPublicRoot }) : undefined;
  const landingNextStatic = landingPublicRoot
    ? serveStatic({ root: landingPublicRoot })
    : undefined;
  const landingIndex = landingPublicRoot
    ? serveStatic({
        root: landingPublicRoot,
        path: 'index.html',
        onFound: (_path, c) => c.header('Cache-Control', 'no-store'),
      })
    : undefined;
  const landingNotFound = landingPublicRoot
    ? serveStatic({
        root: landingPublicRoot,
        path: '404.html',
        onFound: (_path, c) => c.header('Cache-Control', 'no-store'),
      })
    : undefined;
  const docsStatic = landingPublicRoot ? serveStatic({ root: landingPublicRoot }) : undefined;
  const docsIndex = landingPublicRoot
    ? serveStatic({
        root: landingPublicRoot,
        path: 'docs/index.html',
        onFound: (_path, c) => c.header('Cache-Control', 'no-store'),
      })
    : undefined;
  const runStatic = async (
    handler: ReturnType<typeof serveStatic> | undefined,
    c: Context
  ): Promise<Response | undefined> => {
    if (!handler) return undefined;
    return (await handler(c, async () => {})) ?? undefined;
  };

  const runImmutableStatic = async (
    handler: ReturnType<typeof serveStatic> | undefined,
    c: Context
  ): Promise<Response | undefined> => {
    const response = await runStatic(handler, c);
    if (!response) return undefined;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  const landing404 = async (c: Context): Promise<Response> => {
    const response = await runStatic(landingNotFound, c);
    if (!response) return c.notFound();
    return new Response(response.body, { status: 404, headers: response.headers });
  };

  // Create Better Auth instance
  const auth = createAuth(db, {
    authMode,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    signUpEnabled,
    trustedOrigins,
    secondaryStorage: options?.authSecondaryStorage,
    sendMagicLinkEmail: options?.sendMagicLinkEmail,
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
  app.use('*', async (c, next) => {
    if (c.req.path === '/health') {
      await next();
      return;
    }

    // The Node adapter builds the request URL from Host. The URL fallback keeps
    // direct Fetch-based tests and local callers on the same trusted input.
    const requestHost = c.req.header('host') ?? new URL(c.req.url).host;
    c.set('publicSurface', resolvePublicSurface(requestHost, { landingHosts, appHosts }));
    await next();
  });
  app.use('*', async (c, next) => {
    await next();
    const oauthPopupPolicy = preservesOAuthPopupOpener(c.req.path);
    if (oauthPopupPolicy) c.header('Cross-Origin-Opener-Policy', oauthPopupPolicy);
  });
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
  const compressResponse = compress();
  app.use('*', async (c, next) => {
    await compressResponse(c, next);
    const vary = c.res.headers.get('Vary');
    const varyValues = vary
      ? vary
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    if (!varyValues.some((value) => value.toLowerCase() === 'accept-encoding')) {
      varyValues.push('Accept-Encoding');
      c.res.headers.set('Vary', varyValues.join(', '));
    }
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
  app.use('*', async (c, next) => {
    if (c.req.path === '/health') {
      await next();
      return;
    }

    const surface = c.get('publicSurface') as PublicSurface | undefined;
    if (!surface) return c.json(errorResult(Errors.notFound('Route', c.req.path)), 404);
    if (surface.kind === 'redirect') {
      return c.redirect(canonicalRedirectLocation(c.req.url, surface.location), 308);
    }
    if (surface.kind === 'unavailable') {
      return c.json(errorResult(Errors.notFound('Route', c.req.path)), 404);
    }
    if (surface.kind === 'app') {
      if (isDocumentationPath(c.req.path)) {
        return c.redirect(canonicalRedirectLocation(c.req.url), 308);
      }
      await next();
      return;
    }

    if (isProductOnlyPath(c.req.path)) return c.notFound();

    let response: Response | undefined;
    if (isDocsPath(c.req.path)) {
      response =
        c.req.path === '/docs' ? await runStatic(docsIndex, c) : await runStatic(docsStatic, c);
      if (response) response = withDocumentationContentType(response, c.req.path);
    } else if (c.req.path === '/') {
      response = await runStatic(landingIndex, c);
    } else if (c.req.path.startsWith('/_next/static/')) {
      response = await runImmutableStatic(landingNextStatic, c);
    } else if (
      ROOT_DOCUMENTATION_ASSETS.has(c.req.path) ||
      ['/favicon.ico', '/icon.svg', '/robots.txt', '/sitemap.xml'].includes(c.req.path)
    ) {
      response = await runStatic(landingStatic, c);
    }

    return response ?? landing404(c);
  });
  app.use(
    '*',
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) =>
        c.json(errorResult(Errors.validationError('Request body exceeds 256 KiB')), 413),
    })
  );
  app.use('*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const contentLength = Number(c.req.header('content-length') || 0);
      const contentType = c.req.header('content-type') || '';
      if (contentLength > 0 && !contentType.toLowerCase().startsWith('application/json')) {
        return c.json(
          errorResult(Errors.validationError('Content-Type must be application/json')),
          415
        );
      }
      if (c.req.raw.body) {
        const rawRequest = c.req.raw;
        try {
          const body = await rawRequest.arrayBuffer();
          c.req.raw = new Request(rawRequest, { body, duplex: 'half' });
        } catch (error) {
          if (error instanceof Error && error.name === 'BodyLimitError') {
            return c.json(errorResult(Errors.validationError('Request body exceeds 256 KiB')), 413);
          }
          throw error;
        }
      }
    }
    await next();
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
        return c.json(errorResult(Errors.notFound('Route')), 404);
      }
    } else if (process.env.NODE_ENV === 'production') {
      return c.json(errorResult(Errors.notFound('Route')), 404);
    }
    const { register } = await import('./lib/metrics.js');
    const metrics = await register.metrics();
    return c.text(metrics, 200, {
      'Content-Type': register.contentType,
    });
  });

  // Better Auth routes (public)
  app.get('/api/auth/config', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ data: { mode: authMode, signUpEnabled }, error: null });
  });

  app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.set('x-authlane-client-ip', c.get('clientIp'));
      return await auth.handler(new Request(c.req.raw, { headers }));
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Authentication handler failed');
      return c.json(errorResult(Errors.internalError('Authentication request failed')), 500);
    }
  });

  const cacheStore = options?.cacheStore ?? new MemoryCacheStore();

  // API routes (require authentication and rate limiting)
  app.use('/api/v1/*', authMiddleware(db, auth));
  app.use(
    '/api/v1/dashboard/*',
    dashboardSessionSecurity({
      authMode,
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
  const internalFetch: typeof fetch = async (input, init) => app.fetch(new Request(input, init));
  const internalAppHost = appHosts.map((host) => host.trim()).find(Boolean) ?? 'app.authlane.io';
  app.route(
    '/api/v1',
    createApiRouter(db, cacheStore, undefined, internalFetch, `https://${internalAppHost}`)
  );

  app.all('/api/*', (c) => c.json(errorResult(Errors.notFound('API route', c.req.path)), 404));

  // Landing-built assets are shared by the apex docs and app product shell.
  app.get('/_next/static/*', async (c) => {
    return (await runImmutableStatic(landingNextStatic, c)) ?? c.notFound();
  });
  for (const path of ['/favicon.ico', '/icon.svg']) {
    app.get(path, async (c) => (await runStatic(landingStatic, c)) ?? c.notFound());
  }

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
    landingPublicRoot: process.env.AUTHLANE_LANDING_DIR,
    landingHosts: (process.env.AUTHLANE_LANDING_HOSTS ?? 'authlane.io').split(','),
    appHosts: (process.env.AUTHLANE_APP_HOSTS ?? 'app.authlane.io').split(','),
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

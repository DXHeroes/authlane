/**
 * Authlane API Server
 * Main entry point for the API application
 */

// Suppress repeated Redis connection errors in development
// BullMQ/ioredis throws AggregateErrors when Redis is unavailable
let redisErrorLogged = false;
process.on('uncaughtException', (err: Error & { code?: string }) => {
  // Handle Redis connection errors gracefully
  if (err.code === 'ECONNREFUSED' && (err.message?.includes('6379') || String(err).includes('6379'))) {
    if (!redisErrorLogged) {
      redisErrorLogged = true;
      console.log('⚠️  Redis connection refused. Token refresh jobs will not work.');
      console.log('💡 Start Redis: docker run -d -p 6379:6379 redis');
      console.log('💡 Or comment out REDIS_URL in .env to disable this feature\n');
    }
    return; // Don't crash the app
  }
  // Re-throw other errors
  console.error('Uncaught exception:', err);
  process.exit(1);
});

// Initialize Sentry as early as possible
import { initSentry, sentryMiddleware } from './lib/sentry.js';
initSentry();

import { createDatabaseClient, type Database } from '@authlane/database';
import { getEnv } from '@authlane/shared';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { setupJobs } from './jobs/setup.js';
import { createAuth } from './lib/auth.js';
import { authMiddleware, errorHandler, rateLimitMiddleware } from './middleware/index.js';
import { createApiRouter } from './routes/index.js';

/**
 * Create Hono app with routes and middleware
 * Exported for testing purposes
 */
export function createApp(db: Database, options?: {
  corsOrigin?: string | string[];
  rateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
  rateLimitEnabled?: boolean;
}) {
  const app = new Hono();

  // Create Better Auth instance
  const auth = createAuth(db, {
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins: Array.isArray(options?.corsOrigin) 
      ? options.corsOrigin 
      : [options?.corsOrigin || 'http://localhost:5173'].filter(Boolean),
  });

  // Global middleware
  app.use('*', sentryMiddleware());
  app.use('*', logger());
  app.use('*', errorHandler);
  app.use(
    '*',
    cors({
      origin: options?.corsOrigin || process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true, // Required for better-auth cookies
    })
  );

  // Health check (no auth required)
  app.get('/health', (c) => {
    return c.json({ data: { status: 'ok', timestamp: new Date().toISOString() }, error: null });
  });

  // Metrics endpoint (no auth required, but should be firewalled in production)
  app.get('/metrics', async (c) => {
    const { register } = await import('./lib/metrics.js');
    const metrics = await register.metrics();
    return c.text(metrics, 200, {
      'Content-Type': register.contentType,
    });
  });

  // Better Auth routes (public)
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return auth.handler(c.req.raw);
  });

  // API routes (require authentication and rate limiting)
  app.use(
    '/api/v1/*',
    rateLimitMiddleware(db, {
      maxRequests: options?.rateLimitMaxRequests ?? 100,
      windowMs: options?.rateLimitWindowMs ?? 60000,
      enabled: options?.rateLimitEnabled ?? true,
    })
  );
  app.use('/api/v1/*', authMiddleware(db, auth));
  app.route('/api/v1', createApiRouter(db));

  return app;
}

// Only run server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  // Validate environment
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    console.error(
      '❌ Environment validation failed:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }

  // Initialize database
  let db: ReturnType<typeof createDatabaseClient>;
  try {
    db = createDatabaseClient(env.DATABASE_URL);
    console.log('✅ Database client initialized');
  } catch (error) {
    console.error('❌ Database connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Setup job queues (token refresh)
  if (env.REDIS_URL) {
    setupJobs(db, env.REDIS_URL);
  } else {
    console.log('⚠️  REDIS_URL not set, token refresh jobs disabled');
  }

  // Create app
  // Parse comma-separated CORS origins into array
  // Always include localhost:5173 (dashboard) in development
  const baseOrigins = env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const corsOrigins = [...new Set([
    ...baseOrigins,
    'http://localhost:3000',
    'http://localhost:5173', // Dashboard dev server
  ])];
  const app = createApp(db, {
    corsOrigin: corsOrigins,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  });

  // Start server
  const port = env.API_PORT;
  const host = env.API_HOST;

  console.log(`🚀 Authlane API server starting on http://${host}:${port}`);
  console.log(`📊 Environment: ${env.NODE_ENV}`);
  console.log(`🔐 CORS Origins: ${corsOrigins.join(', ')}`);
  console.log('');
  console.log('📚 API Documentation:');
  console.log('   Health: GET /health');
  console.log('   Auth: POST/GET /api/auth/*');
  console.log('   Services: GET /api/v1/services');
  console.log('   Connections: GET /api/v1/users/:userId/connections');
  console.log('   Tools: GET /api/v1/users/:userId/tools?format=mcp');
  console.log('');

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });
}

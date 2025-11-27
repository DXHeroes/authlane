/**
 * Authlane API Server
 * Main entry point for the API application
 */

import { createDatabaseClient } from '@authlane/database';
import { getEnv } from '@authlane/shared';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { setupJobs } from './jobs/setup.js';
import { authMiddleware, errorHandler, rateLimitMiddleware } from './middleware/index.js';
import { createApiRouter } from './routes/index.js';

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

// Create Hono app
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', errorHandler);
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN || 'http://localhost:3000',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (require authentication and rate limiting)
app.use(
  '/api/v1/*',
  rateLimitMiddleware(db, {
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS || 100,
    windowMs: env.RATE_LIMIT_WINDOW_MS || 60000,
    enabled: env.RATE_LIMIT_ENABLED !== false,
  })
);
app.use('/api/v1/*', authMiddleware(db));
app.route('/api/v1', createApiRouter(db));

// Start server
const port = env.API_PORT;
const host = env.API_HOST;

console.log(`🚀 Authlane API server starting on http://${host}:${port}`);
console.log(`📊 Environment: ${env.NODE_ENV}`);
console.log(`🔐 CORS Origin: ${env.CORS_ORIGIN}`);
console.log('');
console.log('📚 API Documentation:');
console.log('   Health: GET /health');
console.log('   Services: GET /api/v1/services');
console.log('   Connections: GET /api/v1/users/:userId/connections');
console.log('   Tools: GET /api/v1/users/:userId/tools?format=mcp');
console.log('');
console.log('💡 Get your API key from: pnpm --filter @authlane/database seed');
console.log('');

serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

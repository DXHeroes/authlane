/**
 * API Routes
 * Main router for API endpoints
 */

import type { Database } from '@authlane/database';
import { Hono } from 'hono';
import { createConnectionsRouter } from './connections.js';
import { createOAuthRouter } from './oauth.js';
import { createServicesRouter } from './services.js';
import { createToolsRouter } from './tools.js';

export function createApiRouter(db: Database) {
  const router = new Hono();

  // Services routes
  router.route('/services', createServicesRouter(db));

  // Connections routes
  router.route('/users', createConnectionsRouter(db));

  // OAuth routes
  router.route('/users', createOAuthRouter(db));

  // Tools routes
  router.route('/users', createToolsRouter(db));

  return router;
}

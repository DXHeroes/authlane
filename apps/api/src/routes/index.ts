/**
 * API Routes
 * Main router for API endpoints
 */

import type { Database } from '@authlane/database';
import { Hono } from 'hono';
import { type CacheStore, MemoryCacheStore } from '../lib/cache.js';
import {
  CachedControlPlaneRepository,
  DrizzleControlPlaneRepository,
} from '../lib/control-plane-repository.js';
import { integrationRegistry } from '../lib/integration-registry.js';
import { createControlPlaneRouter } from './control-plane.js';
import { createDashboardRouter } from './dashboard.js';
import { createOAuthRouter } from './oauth.js';
import { createServicesRouter } from './services.js';

export function createApiRouter(db: Database, cache: CacheStore = new MemoryCacheStore()) {
  const router = new Hono();
  const repository = new CachedControlPlaneRepository(new DrizzleControlPlaneRepository(db), cache);

  // Dashboard routes (tenant-specific)
  router.route('/dashboard', createDashboardRouter(db, cache));
  router.route('/', createDashboardRouter(db, cache)); // Also mount at root for /connections

  // Services routes
  router.route('/services', createServicesRouter(db));

  router.route('/', createControlPlaneRouter(repository, integrationRegistry));
  router.route('/', createOAuthRouter(db));

  return router;
}

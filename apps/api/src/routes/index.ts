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
import { requirePrincipalKind } from '../middleware/principal-kind.js';
import { createControlPlaneRouter } from './control-plane.js';
import { createDashboardRouter } from './dashboard.js';
import { createOAuthRouter } from './oauth.js';
import { createServicesRouter } from './services.js';

export function createApiRouter(db: Database, cache: CacheStore = new MemoryCacheStore()) {
  const router = new Hono();
  const repository = new CachedControlPlaneRepository(new DrizzleControlPlaneRepository(db), cache);

  const dashboard = new Hono();
  dashboard.use('*', requirePrincipalKind('session'));
  dashboard.route('/services', createServicesRouter(db));
  dashboard.route('/', createDashboardRouter(db, cache));
  router.route('/dashboard', dashboard);

  router.use('/catalog/*', requirePrincipalKind('api_key'));
  router.use('/users/*', requirePrincipalKind('api_key'));
  router.route('/', createControlPlaneRouter(repository, integrationRegistry));
  router.route('/', createOAuthRouter(db));

  return router;
}

/**
 * API Routes
 * Main router for API endpoints
 */

import { createDatabaseSecretStore, type Database, type SecretStore } from '@authlane/database';
import { Hono } from 'hono';
import { type CacheStore, MemoryCacheStore } from '../lib/cache.js';
import {
  CachedControlPlaneRepository,
  DrizzleControlPlaneRepository,
} from '../lib/control-plane-repository.js';
import { createIntegrationRegistry } from '../lib/integration-registry.js';
import { createMcpDiscoveryDeps } from '../lib/mcp-discovery-deps.js';
import { createDatabaseSandboxRuntime } from '../lib/sandbox-runtime.js';
import { requirePrincipalKind } from '../middleware/principal-kind.js';
import { createControlPlaneRouter } from './control-plane.js';
import { createDashboardRouter } from './dashboard.js';
import { createMcpServersRouter } from './mcp-servers.js';
import { createOAuthRouter } from './oauth.js';
import { createSandboxRouter } from './sandbox.js';
import { createServicesRouter } from './services.js';

export function createApiRouter(
  db: Database,
  cache: CacheStore = new MemoryCacheStore(),
  secretStore: SecretStore = createDatabaseSecretStore(db),
  internalFetch?: typeof fetch,
  internalBaseUrl?: string
) {
  const router = new Hono();
  const repository = new CachedControlPlaneRepository(new DrizzleControlPlaneRepository(db), cache);

  const dashboard = new Hono();
  dashboard.use('*', requirePrincipalKind('session'));
  dashboard.route('/services', createServicesRouter(db));
  dashboard.route('/', createDashboardRouter(db, cache, secretStore));
  dashboard.route('/', createMcpServersRouter(db, createMcpDiscoveryDeps(), cache, secretStore));
  if (internalFetch) {
    dashboard.route(
      '/',
      createSandboxRouter(db, createDatabaseSandboxRuntime(db, internalFetch, internalBaseUrl))
    );
  }
  router.route('/dashboard', dashboard);

  router.use('/catalog/*', requirePrincipalKind('api_key'));
  router.use('/users/*', requirePrincipalKind('api_key'));
  // One registry per organization, because a provider MCP catalogue is discovered per organization
  // and a shared cache keyed on `github` would hand one tenant's catalogue to the next.
  const registries = new Map<string, ReturnType<typeof createIntegrationRegistry>>();
  const registryFor = (organizationId: string) => {
    const existing = registries.get(organizationId);
    if (existing) return existing;
    // Bounded so a long-lived process cannot accumulate one registry per tenant that ever called.
    if (registries.size >= 256) registries.clear();
    const created = createIntegrationRegistry(db, organizationId);
    registries.set(organizationId, created);
    return created;
  };

  router.route('/', createControlPlaneRouter(repository, registryFor, secretStore));
  router.route('/', createOAuthRouter(db, secretStore));

  return router;
}

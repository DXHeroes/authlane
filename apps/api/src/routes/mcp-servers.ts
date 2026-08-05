/**
 * Tenant-registered MCP servers.
 *
 * A workspace owner registers a server by URL; Authlane discovers its tool contract and offers it
 * to that organization's users. Authlane never relays a tool call — the consuming runtime reaches
 * the server directly with a leased credential.
 */

import { randomUUID } from 'node:crypto';
import {
  createDatabaseSecretStore,
  createMcpServer,
  type Database,
  deleteMcpServer,
  listMcpServersForOrganization,
  listMcpServerToolsForReview,
  MCP_SERVER_ID_PREFIX,
  readMcpServerConnectConfig,
  readMcpServerOAuthClient,
  type SecretStore,
  saveDiscoveryFailure,
  saveDiscoverySuccess,
  updateMcpServerTool,
} from '@authlane/database';
import { Errors, MCP_SERVER_PRESETS } from '@authlane/shared';
import { Hono } from 'hono';
import type { CacheStore } from '../lib/cache.js';
import { expireConnectionsForService } from '../lib/connection-invalidation.js';
import { logger } from '../lib/logger.js';
import { ensureMcpOAuthClient, mcpCallbackUrl } from '../lib/mcp-client-registration.js';
import { discoverMcpServer, type McpDiscoveryDeps } from '../lib/mcp-discovery-run.js';
import { removeMcpOAuthClient, saveManualMcpOAuthClient } from '../lib/mcp-manual-oauth-client.js';
import {
  parseMcpOAuthClientInput,
  parseMcpServerRegistration,
  parseMcpToolUpdate,
} from '../lib/mcp-server-input.js';
import { resolveMcpAuthorization } from '../lib/oauth-provider-resolution.js';
import { publicApiBase } from '../lib/public-api-base.js';

export function createMcpServersRouter(
  db: Database,
  discoveryDeps: McpDiscoveryDeps,
  cache?: CacheStore,
  secretStore: SecretStore = createDatabaseSecretStore(db)
) {
  const router = new Hono();

  /**
   * Registers Authlane as an OAuth client if the server offers dynamic registration.
   *
   * Runs after a successful discovery, on both registration and refresh. Failure is recorded on the
   * server rather than thrown: the tool list is still worth keeping, and the tenant needs to see why
   * the OAuth step is not ready rather than a silently unusable server.
   */
  async function registerOAuthClientIfOffered(
    organizationId: string,
    serverId: string,
    serverUrl: string,
    authType: string,
    existingClientId: string | null,
    metadata: { registrationEndpoint: string | null } | null,
    requestUrl: string
  ): Promise<void> {
    const outcome = await ensureMcpOAuthClient(db, secretStore, {
      serverId,
      organizationId,
      host: new URL(serverUrl).hostname,
      authType,
      registrationEndpoint: metadata?.registrationEndpoint ?? null,
      existingClientId,
      // The same origin the authorize step will send as redirect_uri. APP_URL points at the
      // dashboard, so registering with it produced a client the callback could never satisfy.
      apiBaseUrl: publicApiBase(requestUrl),
      deps: discoveryDeps,
    });

    if (!outcome.registered && outcome.message) {
      logger.info({ serverId, reason: outcome.message }, 'MCP server has no OAuth client');
    }
  }

  /**
   * Drops the cached service catalog for an organization.
   *
   * listTenantServices is cached for five minutes, so without this a newly registered server
   * stays invisible to the SDK for up to that long and looks broken to whoever just added it.
   */
  async function invalidateCatalog(organizationId: string): Promise<void> {
    await cache?.delete(`control-plane:tenant-services:${organizationId}`);
  }

  /**
   * The catalogue of servers Authlane has verified.
   *
   * Static and organization-independent, so it is served straight from the list. Picking one still
   * goes through POST /organization/mcp-servers, which means a preset gets the same discovery, host
   * checks and per-tool review as a URL somebody typed.
   */
  router.get('/organization/mcp-servers/presets', (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    return c.json({ data: MCP_SERVER_PRESETS, error: null });
  });

  /** Every server the organization has registered, including ones discovery has not reached. */
  router.get('/organization/mcp-servers', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const servers = await listMcpServersForOrganization(db, org.id);
    const apiBaseUrl = publicApiBase(c.req.url);
    return c.json({
      data: servers.map((server) => ({
        ...server,
        discoveredAt: server.discoveredAt?.toISOString() ?? null,
        createdAt: server.createdAt.toISOString(),
        // Built here, never in the browser: the dashboard runs on its own origin in development,
        // and a tenant who pastes that one into their provider gets a redirect we never send.
        redirectUri: server.authType === 'oauth2' ? mcpCallbackUrl(apiBaseUrl, server.id) : null,
      })),
      error: null,
    });
  });

  router.post('/organization/mcp-servers', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(Errors.validationError('Request body must be valid JSON'), 400);
    }

    const registration = parseMcpServerRegistration(body);
    if (!registration) {
      return c.json(
        Errors.validationError(
          'A name, an https server URL without credentials, and an auth type of oauth2 or api_key are required'
        ),
        400
      );
    }

    const serverId = `${MCP_SERVER_ID_PREFIX}${randomUUID()}`;
    await createMcpServer(db, serverId, { ...registration, organizationId: org.id });

    // The server stays disabled until discovery succeeds, so a URL nobody can reach is never
    // offered to users.
    const result = await discoverMcpServer(serverId, registration.serverUrl, discoveryDeps);
    if (!result.ok) {
      await saveDiscoveryFailure(db, serverId, result.message);
      return c.json(
        {
          data: { id: serverId, enabled: false },
          error: { code: result.code, message: result.message },
        },
        201
      );
    }

    await saveDiscoverySuccess(db, serverId, result);
    await registerOAuthClientIfOffered(
      org.id,
      serverId,
      result.serverUrl,
      registration.authType,
      null,
      result.oauthMetadata,
      c.req.url
    );
    await invalidateCatalog(org.id);
    return c.json(
      {
        data: {
          id: serverId,
          enabled: true,
          tools: result.tools.length,
          // Zero tools with this set means "nobody has authorized it yet", not "it offers nothing".
          authorizationRequired: result.authorizationRequired,
        },
        error: null,
      },
      201
    );
  });

  /** Re-runs discovery. The host check runs again, so a server cannot turn private after the fact. */
  router.post('/organization/mcp-servers/:serverId/discover', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const serverId = c.req.param('serverId');
    // Deliberately not restricted to enabled servers: retrying is exactly what a server whose
    // first discovery failed needs.
    const [server] = await listMcpServersForOrganization(db, org.id).then((rows) =>
      rows.filter((row) => row.id === serverId)
    );
    if (!server) return c.json(Errors.notFound('MCP server', serverId), 404);

    const result = await discoverMcpServer(serverId, server.serverUrl, discoveryDeps);
    if (!result.ok) {
      await saveDiscoveryFailure(db, serverId, result.message);
      return c.json({ data: null, error: { code: result.code, message: result.message } }, 502);
    }

    await saveDiscoverySuccess(db, serverId, result);
    await registerOAuthClientIfOffered(
      org.id,
      serverId,
      result.serverUrl,
      server.authType,
      server.oauthClientId,
      result.oauthMetadata,
      c.req.url
    );
    await invalidateCatalog(org.id);
    logger.info({ serverId, tools: result.tools.length }, 'Rediscovered tenant MCP server');
    return c.json({
      data: {
        id: serverId,
        tools: result.tools.length,
        authorizationRequired: result.authorizationRequired,
      },
      error: null,
    });
  });

  router.get('/organization/mcp-servers/:serverId/tools', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const tools = await listMcpServerToolsForReview(db, c.req.param('serverId'));
    return c.json({
      data: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: tool.risk,
        approved: tool.approved,
        // Shown so a tenant can see what the server claims, next to what Authlane enforces.
        declaredAnnotations: tool.declaredAnnotations,
        lastSeenAt: tool.lastSeenAt.toISOString(),
      })),
      error: null,
    });
  });

  router.patch('/organization/mcp-servers/:serverId/tools/:toolName', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(Errors.validationError('Request body must be valid JSON'), 400);
    }

    const update = parseMcpToolUpdate(body);
    if (!update) {
      return c.json(
        Errors.validationError('Provide a risk of read, write or destructive, or an approved flag'),
        400
      );
    }

    await updateMcpServerTool(db, c.req.param('serverId'), c.req.param('toolName'), update);
    await invalidateCatalog(org.id);
    return c.json({ data: { updated: true }, error: null });
  });

  router.delete('/organization/mcp-servers/:serverId', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const serverId = c.req.param('serverId');
    // Read before the row goes: the foreign key nulls the other direction, so dropping the server
    // would leave its client secret encrypted at rest with nothing pointing at it, re-wrapped by
    // every future key rotation.
    const existing = await readMcpServerOAuthClient(db, org.id, serverId);

    await deleteMcpServer(db, serverId);
    if (existing?.oauthClientSecretId) {
      await secretStore.delete?.(existing.oauthClientSecretId, org.id, 'oauth_client_secret');
    }
    await invalidateCatalog(org.id);
    return c.json({ data: { deleted: true }, error: null });
  });

  /**
   * Reports where a server stands after its OAuth client changed.
   *
   * `ready` is the part that matters: credentials can be saved before discovery has found an
   * authorization endpoint, and without this the tenant would only learn that when one of their
   * users hit a 409.
   */
  async function oauthClientState(serverId: string, clientSecretId: string | null) {
    const resolution = resolveMcpAuthorization(await readMcpServerConnectConfig(db, serverId));
    return { hasClientSecret: clientSecretId !== null, ready: resolution.ok };
  }

  /**
   * The OAuth application a tenant registered with the provider themselves.
   *
   * The only route out of a permanent 409 for a server that offers no dynamic registration, or
   * that offers it on a host other than its own. Never accepts an endpoint — those stay whatever
   * discovery read from the server and checked.
   */
  router.put('/organization/mcp-servers/:serverId/oauth-client', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const body = await c.req.json().catch(() => null);
    const input = parseMcpOAuthClientInput(body);
    if (!input) {
      return c.json(
        Errors.validationError(
          'A clientId is required. Send clientSecret as a string to store one, or null for a public client.'
        ),
        400
      );
    }

    const serverId = c.req.param('serverId');
    const existing = await readMcpServerOAuthClient(db, org.id, serverId);
    if (!existing) return c.json(Errors.notFound('MCP server', serverId), 404);
    if (existing.authType !== 'oauth2') {
      return c.json(Errors.validationError('Only an OAuth 2.1 server has an OAuth client'), 400);
    }

    // Carrying a stored secret onto a different client id produces a token exchange that fails at
    // the provider for a reason nothing here can report.
    if (input.secret.kind === 'unchanged' && input.clientId !== existing.oauthClientId) {
      return c.json(
        Errors.validationError(
          'Changing the client id needs its matching client secret, or null for a public client'
        ),
        400
      );
    }

    const outcome = await saveManualMcpOAuthClient(db, secretStore, {
      serverId,
      organizationId: org.id,
      clientId: input.clientId,
      secret: input.secret,
      existing,
    });

    // Tokens were issued to the old client. Rotating only the secret leaves them valid, so that
    // case deliberately does not expire anything.
    if (outcome.previousClientId && outcome.previousClientId !== outcome.clientId) {
      await expireConnectionsForService(
        db,
        secretStore,
        cache,
        org.id,
        serverId,
        'OAUTH_CLIENT_CHANGED_REAUTHORIZATION_REQUIRED'
      );
    }
    await invalidateCatalog(org.id);

    return c.json({
      data: {
        clientId: outcome.clientId,
        source: 'manual',
        redirectUri: mcpCallbackUrl(publicApiBase(c.req.url), serverId),
        ...(await oauthClientState(serverId, outcome.clientSecretId)),
      },
      error: null,
    });
  });

  router.delete('/organization/mcp-servers/:serverId/oauth-client', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const serverId = c.req.param('serverId');
    const existing = await readMcpServerOAuthClient(db, org.id, serverId);
    if (!existing) return c.json(Errors.notFound('MCP server', serverId), 404);

    // A registered client belongs to Authlane, not the tenant: clearing it would leave it live at
    // the provider and the next rediscovery would register another one beside it.
    if (existing.oauthClientSource !== 'manual') {
      return c.json(
        Errors.validationError('Authlane registered this client itself, so it cannot be removed'),
        400
      );
    }

    const outcome = await removeMcpOAuthClient(db, secretStore, {
      serverId,
      organizationId: org.id,
      existing,
    });
    if (outcome.previousClientId) {
      await expireConnectionsForService(
        db,
        secretStore,
        cache,
        org.id,
        serverId,
        'OAUTH_CLIENT_CHANGED_REAUTHORIZATION_REQUIRED'
      );
    }
    await invalidateCatalog(org.id);

    return c.json({ data: { deleted: true }, error: null });
  });

  return router;
}

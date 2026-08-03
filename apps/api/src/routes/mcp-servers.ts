/**
 * Tenant-registered MCP servers.
 *
 * A workspace owner registers a server by URL; Authlane discovers its tool contract and offers it
 * to that organization's users. Authlane never relays a tool call — the consuming runtime reaches
 * the server directly with a leased credential.
 */

import { randomUUID } from 'node:crypto';
import {
  createMcpServer,
  type Database,
  deleteMcpServer,
  listEnabledMcpServers,
  MCP_SERVER_ID_PREFIX,
  readMcpServerTools,
  saveDiscoveryFailure,
  saveDiscoverySuccess,
  updateMcpServerTool,
} from '@authlane/database';
import { Errors } from '@authlane/shared';
import { Hono } from 'hono';
import { type McpDiscoveryDeps, discoverMcpServer } from '../lib/mcp-discovery-run.js';
import { logger } from '../lib/logger.js';
import { parseMcpServerRegistration, parseMcpToolUpdate } from '../lib/mcp-server-input.js';

export function createMcpServersRouter(db: Database, discoveryDeps: McpDiscoveryDeps) {
  const router = new Hono();

  /** Every server the organization has registered, with its discovered contract. */
  router.get('/organization/mcp-servers', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const servers = await listEnabledMcpServers(db, org.id);
    return c.json({ data: servers, error: null });
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
        { data: { id: serverId, enabled: false }, error: { code: result.code, message: result.message } },
        201
      );
    }

    await saveDiscoverySuccess(db, serverId, result);
    return c.json({ data: { id: serverId, enabled: true, tools: result.tools.length }, error: null }, 201);
  });

  /** Re-runs discovery. The host check runs again, so a server cannot turn private after the fact. */
  router.post('/organization/mcp-servers/:serverId/discover', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const serverId = c.req.param('serverId');
    const [server] = await listEnabledMcpServers(db, org.id).then((rows) =>
      rows.filter((row) => row.id === serverId)
    );
    if (!server) return c.json(Errors.notFound('MCP server', serverId), 404);

    const result = await discoverMcpServer(serverId, server.serverUrl, discoveryDeps);
    if (!result.ok) {
      await saveDiscoveryFailure(db, serverId, result.message);
      return c.json({ data: null, error: { code: result.code, message: result.message } }, 502);
    }

    await saveDiscoverySuccess(db, serverId, result);
    logger.info({ serverId, tools: result.tools.length }, 'Rediscovered tenant MCP server');
    return c.json({ data: { id: serverId, tools: result.tools.length }, error: null });
  });

  router.get('/organization/mcp-servers/:serverId/tools', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    const tools = await readMcpServerTools(db, c.req.param('serverId'));
    return c.json({
      data: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: tool.risk,
        // Shown so a tenant can see what the server claims, next to what Authlane enforces.
        declaredAnnotations: tool.declaredAnnotations,
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
    return c.json({ data: { updated: true }, error: null });
  });

  router.delete('/organization/mcp-servers/:serverId', async (c) => {
    const org = c.get('organization');
    if (!org) return c.json(Errors.unauthorized('Organization context required'), 401);

    await deleteMcpServer(db, c.req.param('serverId'));
    return c.json({ data: { deleted: true }, error: null });
  });

  return router;
}

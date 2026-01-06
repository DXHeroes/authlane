/**
 * Tools API routes
 * Returns tool definitions in MCP or OpenAI format
 */

import type { Database } from '@authlane/database';
import { and, connections, eq, or } from '@authlane/database';
import {
  Errors,
  isValidUserId,
  loadMultipleIntegrationTools,
  type ToolFormat,
} from '@authlane/shared';
import { Hono } from 'hono';
import { executeTool } from '../lib/tool-executor.js';
import { validateToolExecution } from '../middleware/tool-validation.js';

export function createToolsRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/users/:userId/tools
   * Get tool definitions for all connected services
   * Query params: format (mcp | openai, default: mcp)
   */
  router.get('/:userId/tools', async (c) => {
    try {
      const externalUserId = c.req.param('userId');
      const user = c.get('user');
      const org = c.get('organization');
      const format = (c.req.query('format') || 'mcp') as ToolFormat;
      const serviceIdFilter = c.req.query('serviceId'); // Optional filter by specific service

      if (!isValidUserId(externalUserId)) {
        return c.json(
          Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
          400
        );
      }

      if (format !== 'mcp' && format !== 'openai') {
        return c.json(
          Errors.validationError('Invalid format', 'Format must be "mcp" or "openai"'),
          400
        );
      }

      // Build filter for connections based on auth context
      const userId = user?.id;
      const orgId = org?.id;

      // Build connection filters
      const baseConnectionsFilter = orgId
        ? or(
            and(eq(connections.scope, 'organization'), eq(connections.organizationId, orgId)),
            and(
              eq(connections.scope, 'user'),
              eq(connections.userId, userId || ''),
              eq(connections.externalUserId, externalUserId)
            )
          )
        : and(eq(connections.userId, userId || ''), eq(connections.externalUserId, externalUserId));

      // Add optional serviceId filter
      const filters = [baseConnectionsFilter, eq(connections.status, 'connected')];
      if (serviceIdFilter) {
        filters.push(eq(connections.serviceId, serviceIdFilter));
      }

      const userConnections = await db
        .select()
        .from(connections)
        .where(and(...filters));

      // Get service IDs
      const serviceIds = userConnections.map((conn) => conn.serviceId);

      if (serviceIds.length === 0) {
        return c.json({
          data: format === 'mcp' ? { tools: [] } : { functions: [] },
          error: null,
        });
      }

      // Dynamically load tools for all connected services
      const toolsData = await loadMultipleIntegrationTools(serviceIds, format);

      return c.json({
        data: toolsData,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching tools:', error);
      return c.json(Errors.internalError('Failed to fetch tools'), 500);
    }
  });

  /**
   * POST /api/v1/users/:userId/tools/:toolName/execute
   * Execute a tool with credential injection
   * Body: { parameters: Record<string, unknown> }
   */
  router.post('/:userId/tools/:toolName/execute', validateToolExecution(db), async (c) => {
    try {
      const userId = c.req.param('userId');
      const toolName = c.req.param('toolName');

      // Parse request body
      let body: { parameters?: Record<string, unknown> };
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          {
            data: null,
            error: Errors.validationError('Invalid JSON body', 'Request body must be valid JSON'),
          },
          400
        );
      }

      const parameters = body.parameters || {};

      // Validate parameters is an object
      if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
        return c.json(
          {
            data: null,
            error: Errors.validationError(
              'Invalid parameters',
              'Parameters must be a non-null object'
            ),
          },
          400
        );
      }

      // Execute tool
      const result = await executeTool(userId, toolName, parameters, db);

      if (result.error) {
        const statusCode =
          result.error.code === 'NOT_FOUND'
            ? 404
            : result.error.code === 'VALIDATION_ERROR'
              ? 400
              : 500;
        return c.json(result, statusCode);
      }

      return c.json(result, 200);
    } catch (error) {
      console.error('Error executing tool:', error);
      return c.json(
        {
          data: null,
          error: Errors.internalError('Failed to execute tool'),
        },
        500
      );
    }
  });

  return router;
}

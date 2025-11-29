/**
 * Tools API routes
 * Returns tool definitions in MCP or OpenAI format
 */

import type { Database } from '@authlane/database';
import { connections, and, eq, or } from '@authlane/database';
import {
  Errors,
  isValidUserId,
  loadMultipleIntegrationTools,
  type ToolFormat,
} from '@authlane/shared';
import { Hono } from 'hono';

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

      // Get all connected services for the user (both user-scoped and org-scoped)
      const connectionsFilter = orgId 
        ? or(
            and(eq(connections.scope, 'organization'), eq(connections.organizationId, orgId)),
            and(eq(connections.scope, 'user'), eq(connections.userId, userId || ''), eq(connections.externalUserId, externalUserId))
          )
        : and(eq(connections.userId, userId || ''), eq(connections.externalUserId, externalUserId));

      const userConnections = await db
        .select()
        .from(connections)
        .where(
          and(
            connectionsFilter,
            eq(connections.status, 'connected')
          )
        );

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

  return router;
}

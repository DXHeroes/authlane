/**
 * Tools API routes
 * Returns tool definitions in MCP or OpenAI format
 */

import type { Database } from '@authlane/database';
import { connections } from '@authlane/database';
import { Errors, isValidUserId, type ToolFormat } from '@authlane/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getTenantId } from '../utils/tenant-context.js';

export function createToolsRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/users/:userId/tools
   * Get tool definitions for all connected services
   * Query params: format (mcp | openai, default: mcp)
   */
  router.get('/:userId/tools', async (c) => {
    try {
      const userId = c.req.param('userId');
      const tenantId = getTenantId(c);
      const format = (c.req.query('format') || 'mcp') as ToolFormat;

      if (!isValidUserId(userId)) {
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

      // Get all connected services for the user
      const userConnections = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.tenantId, tenantId),
            eq(connections.externalUserId, userId),
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

    // Load tools for each service
    // For now, we'll use a simple approach - in production, load from integrations
    const allTools: unknown[] = [];

    // Example: Load GitHub tools if GitHub is connected
    // In production, this would dynamically load from the integrations directory
    if (serviceIds.includes('github')) {
      // For now, return basic GitHub tools structure
      // In production, load from integrations/github/tools.ts
      if (format === 'mcp') {
        allTools.push(
          {
            name: 'github_create_issue',
            description: 'Creates a new issue in a GitHub repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue body' },
              },
              required: ['owner', 'repo', 'title'],
            },
          },
          {
            name: 'github_list_issues',
            description: 'Lists issues in a GitHub repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                state: { type: 'string', enum: ['open', 'closed', 'all'] },
              },
              required: ['owner', 'repo'],
            },
          }
        );
      } else {
        allTools.push(
          {
            name: 'github_create_issue',
            description: 'Creates a new issue in a GitHub repository',
            parameters: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue body' },
              },
              required: ['owner', 'repo', 'title'],
            },
          },
          {
            name: 'github_list_issues',
            description: 'Lists issues in a GitHub repository',
            parameters: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                state: { type: 'string', enum: ['open', 'closed', 'all'] },
              },
              required: ['owner', 'repo'],
            },
          }
        );
      }
    }

    return c.json({
      data: format === 'mcp' ? { tools: allTools } : { functions: allTools },
      error: null,
    });
  });

  return router;
}

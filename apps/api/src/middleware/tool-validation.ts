/**
 * Tool Validation Middleware
 * Validates tool execution requests before reaching the executor
 */

import type { Database } from '@authlane/database';
import { and, connections, eq } from '@authlane/database';
import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';

/**
 * Validates that a tool exists by attempting to load it
 *
 * @param toolName - Tool name (e.g., 'github_create_issue')
 * @returns Whether the tool exists
 */
async function toolExists(toolName: string): Promise<boolean> {
  try {
    // Extract service ID from tool name
    const serviceId = toolName.split('_')[0];
    if (!serviceId) {
      return false;
    }

    // Try to import the integration
    const integrationPath = `../../../../integrations/${serviceId}/tools.js`;
    const integration = await import(integrationPath);

    // Check if tool exists in integration
    return !!integration.tools?.[toolName];
  } catch {
    return false;
  }
}

/**
 * Middleware to validate tool execution requests
 *
 * Validates:
 * - Tool name format and existence
 * - User has connection to service
 * - Connection is active (status = 'connected')
 */
export function validateToolExecution(db: Database) {
  return async (c: Context, next: Next) => {
    const userId = c.req.param('userId');
    const toolName = c.req.param('toolName');

    // Validate userId
    if (!userId) {
      return c.json(
        {
          data: null,
          error: Errors.validationError('Missing userId parameter', 'userId is required'),
        },
        400
      );
    }

    // Validate toolName format
    if (!toolName || !toolName.includes('_')) {
      return c.json(
        {
          data: null,
          error: Errors.validationError(
            'Invalid tool name format',
            'Expected format: service_toolname (e.g., github_create_issue)'
          ),
        },
        400
      );
    }

    // Extract service ID
    const serviceId = toolName.split('_')[0];
    if (!serviceId) {
      return c.json(
        {
          data: null,
          error: Errors.validationError(
            'Invalid tool name',
            'Could not extract service ID from tool name'
          ),
        },
        400
      );
    }

    // Check if tool exists
    const exists = await toolExists(toolName);
    if (!exists) {
      return c.json(
        {
          data: null,
          error: Errors.notFound('Tool', toolName),
        },
        404
      );
    }

    // Check if user has connection to service
    try {
      const [connection] = await db
        .select()
        .from(connections)
        .where(and(eq(connections.userId, userId), eq(connections.serviceId, serviceId)))
        .limit(1);

      if (!connection) {
        return c.json(
          {
            data: null,
            error: Errors.notFound(
              'Connection',
              `User does not have a connection to service '${serviceId}'`
            ),
          },
          404
        );
      }

      // Check connection status
      if (connection.status !== 'connected') {
        return c.json(
          {
            data: null,
            error: Errors.connectionNotConnected(
              `Connection to '${serviceId}' is not active. Status: ${connection.status}`
            ),
          },
          403
        );
      }

      // Check if connection has expired
      if (connection.expiresAt && new Date(connection.expiresAt) < new Date()) {
        return c.json(
          {
            data: null,
            error: Errors.connectionExpired(serviceId),
          },
          403
        );
      }

      // Validation passed, continue to handler
      await next();
    } catch (error) {
      console.error('Tool validation error:', error);
      return c.json(
        {
          data: null,
          error: Errors.internalError('Failed to validate tool execution'),
        },
        500
      );
    }
  };
}

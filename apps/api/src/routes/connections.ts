/**
 * Connections API routes
 */

import { decrypt, getEncryptionKey } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { and, connections, eq, or } from '@authlane/database';
import { Errors, isValidServiceId, isValidUserId } from '@authlane/shared';
import type { SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

export function createConnectionsRouter(db: Database) {
  const router = new Hono();

  /**
   * Build filter condition for connections based on auth context
   * Supports both user-scoped and organization-scoped connections
   */
  function buildConnectionsFilter(c: Context, externalUserId?: string): SQL | undefined {
    const user = c.get('user');
    const org = c.get('organization');
    const userId = user?.id;
    const orgId = org?.id;

    // Build filter based on available context
    if (orgId && externalUserId) {
      // Filter by organization or user scope
      return or(
        and(eq(connections.scope, 'organization'), eq(connections.organizationId, orgId)),
        and(
          eq(connections.scope, 'user'),
          eq(connections.userId, userId || ''),
          eq(connections.externalUserId, externalUserId)
        )
      );
    } else if (orgId) {
      return or(
        and(eq(connections.scope, 'organization'), eq(connections.organizationId, orgId)),
        and(eq(connections.scope, 'user'), eq(connections.userId, userId || ''))
      );
    } else if (userId && externalUserId) {
      return and(eq(connections.userId, userId), eq(connections.externalUserId, externalUserId));
    } else if (userId) {
      return eq(connections.userId, userId);
    }

    return undefined;
  }

  /**
   * GET /api/v1/users/:userId/connections
   * List all connections for a user
   */
  router.get('/:userId/connections', async (c) => {
    try {
      const externalUserId = c.req.param('userId');

      if (!isValidUserId(externalUserId)) {
        return c.json(
          Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
          400
        );
      }

      const filter = buildConnectionsFilter(c, externalUserId);
      if (!filter) {
        return c.json(Errors.unauthorized('Authentication required'), 401);
      }

      const userConnections = await db
        .select()
        .from(connections)
        .where(and(filter, eq(connections.externalUserId, externalUserId)));

      return c.json({
        data: userConnections,
        error: null,
      });
    } catch (error) {
      console.error('Failed to list connections:', error);
      return c.json(Errors.internalError('Failed to retrieve connections'), 500);
    }
  });

  /**
   * GET /api/v1/users/:userId/connections/:serviceId
   * Get a specific connection
   */
  router.get('/:userId/connections/:serviceId', async (c) => {
    try {
      const externalUserId = c.req.param('userId');
      const serviceId = c.req.param('serviceId');

      if (!isValidUserId(externalUserId)) {
        return c.json(
          Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
          400
        );
      }

      if (!isValidServiceId(serviceId)) {
        return c.json(
          Errors.validationError(
            'Invalid service ID',
            'Service ID must be lowercase alphanumeric with hyphens'
          ),
          400
        );
      }

      const filter = buildConnectionsFilter(c, externalUserId);
      if (!filter) {
        return c.json(Errors.unauthorized('Authentication required'), 401);
      }

      const [connection] = await db
        .select()
        .from(connections)
        .where(
          and(
            filter,
            eq(connections.externalUserId, externalUserId),
            eq(connections.serviceId, serviceId)
          )
        )
        .limit(1);

      if (!connection) {
        return c.json(Errors.notFound('Connection', `${externalUserId}/${serviceId}`), 404);
      }

      return c.json({
        data: connection,
        error: null,
      });
    } catch (error) {
      console.error('Failed to get connection:', error);
      return c.json(Errors.internalError('Failed to retrieve connection'), 500);
    }
  });

  /**
   * GET /api/v1/users/:userId/connections/:serviceId/credentials
   * Get decrypted credentials for a connection
   */
  router.get('/:userId/connections/:serviceId/credentials', async (c) => {
    const externalUserId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');

    if (!isValidUserId(externalUserId)) {
      return c.json(
        Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
        400
      );
    }

    if (!isValidServiceId(serviceId)) {
      return c.json(
        Errors.validationError(
          'Invalid service ID',
          'Service ID must be lowercase alphanumeric with hyphens'
        ),
        400
      );
    }

    const filter = buildConnectionsFilter(c, externalUserId);
    if (!filter) {
      return c.json(Errors.unauthorized('Authentication required'), 401);
    }

    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          filter,
          eq(connections.externalUserId, externalUserId),
          eq(connections.serviceId, serviceId)
        )
      )
      .limit(1);

    if (!connection) {
      return c.json(Errors.notFound('Connection', `${externalUserId}/${serviceId}`), 404);
    }

    if (connection.status !== 'connected') {
      return c.json(
        Errors.connectionNotConnected(`Connection to ${serviceId} is not connected`),
        400
      );
    }

    if (!connection.credentialsEnc) {
      return c.json(Errors.connectionError('No credentials found for this connection'), 404);
    }

    // Decrypt credentials
    const encryptionKey = getEncryptionKey();

    try {
      const credentialsJson = decrypt(connection.credentialsEnc, encryptionKey);
      const credentials = JSON.parse(credentialsJson);

      return c.json({
        data: credentials,
        error: null,
      });
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return c.json(Errors.encryptionError('Failed to decrypt credentials'), 500);
    }
  });

  /**
   * GET /api/v1/users/:userId/connections/:serviceId/health
   * Check connection health
   */
  router.get('/:userId/connections/:serviceId/health', async (c) => {
    try {
      const externalUserId = c.req.param('userId');
      const serviceId = c.req.param('serviceId');

      if (!isValidUserId(externalUserId)) {
        return c.json(
          Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
          400
        );
      }

      if (!isValidServiceId(serviceId)) {
        return c.json(
          Errors.validationError(
            'Invalid service ID',
            'Service ID must be lowercase alphanumeric with hyphens'
          ),
          400
        );
      }

      const filter = buildConnectionsFilter(c, externalUserId);
      if (!filter) {
        return c.json(Errors.unauthorized('Authentication required'), 401);
      }

      const [connection] = await db
        .select()
        .from(connections)
        .where(
          and(
            filter,
            eq(connections.externalUserId, externalUserId),
            eq(connections.serviceId, serviceId)
          )
        )
        .limit(1);

      if (!connection) {
        return c.json(Errors.notFound('Connection', `${externalUserId}/${serviceId}`), 404);
      }

      const isHealthy = connection.status === 'connected';
      const isExpired = connection.expiresAt ? new Date(connection.expiresAt) < new Date() : false;

      return c.json({
        data: {
          status: isHealthy && !isExpired ? 'healthy' : 'unhealthy',
          connection_status: connection.status,
          last_verified: connection.connectedAt?.toISOString() || null,
          expires_at: connection.expiresAt?.toISOString() || null,
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to check connection health:', error);
      return c.json(Errors.internalError('Failed to check connection health'), 500);
    }
  });

  /**
   * DELETE /api/v1/users/:userId/connections/:serviceId
   * Disconnect a service (delete connection)
   */
  router.delete('/:userId/connections/:serviceId', async (c) => {
    const externalUserId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');

    if (!isValidUserId(externalUserId)) {
      return c.json(
        Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
        400
      );
    }

    if (!isValidServiceId(serviceId)) {
      return c.json(
        Errors.validationError(
          'Invalid service ID',
          'Service ID must be lowercase alphanumeric with hyphens'
        ),
        400
      );
    }

    const filter = buildConnectionsFilter(c, externalUserId);
    if (!filter) {
      return c.json(Errors.unauthorized('Authentication required'), 401);
    }

    // Find and delete connection
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          filter,
          eq(connections.externalUserId, externalUserId),
          eq(connections.serviceId, serviceId)
        )
      )
      .limit(1);

    if (!connection) {
      return c.json(Errors.notFound('Connection', `${externalUserId}/${serviceId}`), 404);
    }

    await db.delete(connections).where(eq(connections.id, connection.id));

    return c.json({
      data: {
        message: 'Connection deleted successfully',
        service: serviceId,
      },
      error: null,
    });
  });

  return router;
}

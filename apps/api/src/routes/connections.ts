/**
 * Connections API routes
 */

import { decrypt, getEncryptionKey } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { connections } from '@authlane/database';
import { Errors, isValidServiceId, isValidUserId } from '@authlane/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getTenantId } from '../utils/tenant-context.js';

export function createConnectionsRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/users/:userId/connections
   * List all connections for a user
   */
  router.get('/:userId/connections', async (c) => {
    try {
      const userId = c.req.param('userId');
      const tenantId = getTenantId(c);

      if (!isValidUserId(userId)) {
        return c.json(
          Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
          400
        );
      }

      const userConnections = await db
        .select()
        .from(connections)
        .where(and(eq(connections.tenantId, tenantId), eq(connections.externalUserId, userId)));

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
      const userId = c.req.param('userId');
      const serviceId = c.req.param('serviceId');
      const tenantId = getTenantId(c);

      if (!isValidUserId(userId)) {
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

      const [connection] = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.tenantId, tenantId),
            eq(connections.externalUserId, userId),
            eq(connections.serviceId, serviceId)
          )
        )
        .limit(1);

      if (!connection) {
        return c.json(Errors.notFound('Connection', `${userId}/${serviceId}`), 404);
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
    const userId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');
    const tenantId = getTenantId(c);

    if (!isValidUserId(userId)) {
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

    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.tenantId, tenantId),
          eq(connections.externalUserId, userId),
          eq(connections.serviceId, serviceId)
        )
      )
      .limit(1);

    if (!connection) {
      return c.json(Errors.notFound('Connection', `${userId}/${serviceId}`), 404);
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
      const userId = c.req.param('userId');
      const serviceId = c.req.param('serviceId');
      const tenantId = getTenantId(c);

      if (!isValidUserId(userId)) {
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

      const [connection] = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.tenantId, tenantId),
            eq(connections.externalUserId, userId),
            eq(connections.serviceId, serviceId)
          )
        )
        .limit(1);

      if (!connection) {
        return c.json(Errors.notFound('Connection', `${userId}/${serviceId}`), 404);
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
    const userId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');
    const tenantId = getTenantId(c);

    if (!isValidUserId(userId)) {
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

    // Find and delete connection
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.tenantId, tenantId),
          eq(connections.externalUserId, userId),
          eq(connections.serviceId, serviceId)
        )
      )
      .limit(1);

    if (!connection) {
      return c.json(Errors.notFound('Connection', `${userId}/${serviceId}`), 404);
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

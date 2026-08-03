/**
 * Services API routes
 */

import type { Database } from '@authlane/database';
import { and, eq, inArray, services } from '@authlane/database';
import { Errors, getAllowedServiceIds, isSupportedServiceId } from '@authlane/shared';
import { Hono } from 'hono';
import { errorResult } from '../lib/api-response.js';
import { logger } from '../lib/logger.js';

export function createServicesRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/services
   * List all available services
   */
  router.get('/', async (c) => {
    try {
      const allServices = await db
        .select()
        .from(services)
        .where(and(eq(services.enabled, true), inArray(services.id, getAllowedServiceIds())));

      return c.json({
        data: allServices,
        error: null,
      });
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Failed to list services');
      return c.json(errorResult(Errors.internalError('Failed to retrieve services')), 500);
    }
  });

  /**
   * GET /api/v1/services/:serviceId
   * Get a specific service by ID
   */
  router.get('/:serviceId', async (c) => {
    try {
      const serviceId = c.req.param('serviceId');

      if (!isSupportedServiceId(serviceId)) {
        return c.json(errorResult(Errors.notFound('Service', serviceId)), 404);
      }

      const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);

      if (!service) {
        return c.json(errorResult(Errors.notFound('Service', serviceId)), 404);
      }

      return c.json({
        data: service,
        error: null,
      });
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Failed to get service');
      return c.json(errorResult(Errors.internalError('Failed to retrieve service')), 500);
    }
  });

  return router;
}

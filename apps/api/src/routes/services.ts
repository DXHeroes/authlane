/**
 * Services API routes
 */

import type { Database } from '@authlane/database';
import { services, eq } from '@authlane/database';
import { Errors } from '@authlane/shared';
import { Hono } from 'hono';

export function createServicesRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/services
   * List all available services
   */
  router.get('/', async (c) => {
    try {
      const allServices = await db.select().from(services).where(eq(services.enabled, true));

      return c.json({
        data: allServices,
        error: null,
      });
    } catch (error) {
      console.error('Failed to list services:', error);
      return c.json(Errors.internalError('Failed to retrieve services'), 500);
    }
  });

  /**
   * GET /api/v1/services/:serviceId
   * Get a specific service by ID
   */
  router.get('/:serviceId', async (c) => {
    try {
      const serviceId = c.req.param('serviceId');

      const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);

      if (!service) {
        return c.json(Errors.notFound('Service', serviceId), 404);
      }

      return c.json({
        data: service,
        error: null,
      });
    } catch (error) {
      console.error('Failed to get service:', error);
      return c.json(Errors.internalError('Failed to retrieve service'), 500);
    }
  });

  return router;
}

/**
 * Integration tests for Services API routes
 */

import { services } from '@authlane/database';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServicesRouter } from '../../src/routes/services.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';

describe('Services API Routes', () => {
  const db = getTestDb();
  const app = new Hono();

  beforeEach(async () => {
    await cleanDatabase(db);

    // Seed test services
    await db.insert(services).values([
      {
        id: 'github',
        name: 'GitHub',
        description: 'GitHub integration',
        authType: 'oauth2',
        enabled: true,
        config: {
          authorization_url: 'https://github.com/login/oauth/authorize',
          token_url: 'https://github.com/login/oauth/access_token',
          scopes: ['repo', 'user'],
        },
      },
      {
        id: 'slack',
        name: 'Slack',
        description: 'Slack integration',
        authType: 'oauth2',
        enabled: true,
        config: {
          authorization_url: 'https://slack.com/oauth/v2/authorize',
          token_url: 'https://slack.com/api/oauth.v2.access',
          scopes: ['chat:write', 'users:read'],
        },
      },
      {
        id: 'disabled-service',
        name: 'Disabled Service',
        description: 'A disabled service',
        authType: 'oauth2',
        enabled: false,
        config: {},
      },
    ]);
  });

  describe('GET /api/v1/services', () => {
    it('should return all enabled services', async () => {
      const router = createServicesRouter(db);
      app.route('/', router);

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((s: any) => s.id)).toContain('github');
      expect(body.data.map((s: any) => s.id)).toContain('slack');
      expect(body.data.map((s: any) => s.id)).not.toContain('disabled-service');
    });

    it('should return empty array when no enabled services exist', async () => {
      await cleanDatabase(db);
      await db.insert(services).values([
        {
          id: 'disabled-only',
          name: 'Disabled',
          description: 'Disabled service',
          authType: 'oauth2',
          enabled: false,
          config: {},
        },
      ]);

      const router = createServicesRouter(db);
      app.route('/', router);

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      // Create a router with a mock database that throws
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => {
              throw new Error('Database connection failed');
            },
          }),
        }),
      };

      const router = createServicesRouter(mockDb as any);
      app.route('/', router);

      const res = await app.request('/');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toContain('Failed to retrieve services');
    });
  });

  describe('GET /api/v1/services/:serviceId', () => {
    it('should return a specific service by ID', async () => {
      const router = createServicesRouter(db);
      app.route('/', router);

      const res = await app.request('/github');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('github');
      expect(body.data.name).toBe('GitHub');
      expect(body.data.description).toBe('GitHub integration');
      expect(body.data.authType).toBe('oauth2');
      expect(body.data.enabled).toBe(true);
      expect(body.data.config).toBeDefined();
    });

    it('should return disabled service if requested by ID', async () => {
      const router = createServicesRouter(db);
      app.route('/', router);

      const res = await app.request('/disabled-service');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('disabled-service');
      expect(body.data.enabled).toBe(false);
    });

    it('should return 404 when service does not exist', async () => {
      const router = createServicesRouter(db);
      app.route('/', router);

      const res = await app.request('/nonexistent-service');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Service not found');
      expect(body.error.message).toContain('nonexistent-service');
    });

    it('should handle database errors gracefully', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => {
                throw new Error('Database query failed');
              },
            }),
          }),
        }),
      };

      const router = createServicesRouter(mockDb as any);
      app.route('/', router);

      const res = await app.request('/github');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toContain('Failed to retrieve service');
    });

    it('should handle special characters in service ID', async () => {
      const router = createServicesRouter(db);
      app.route('/', router);

      const res = await app.request('/service-with-special%20chars');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});

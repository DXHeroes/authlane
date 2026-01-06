/**
 * Integration tests for Tools API routes
 */

import { connections, services, tenants } from '@authlane/database';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolsRouter } from '../../src/routes/tools.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { testTenantMiddleware } from '../setup/test-helpers.js';

// Mock the integration loader
vi.mock('@authlane/shared', async () => {
  const actual = await vi.importActual('@authlane/shared');
  return {
    ...actual,
    loadMultipleIntegrationTools: vi.fn(async (serviceIds: string[], format: string) => {
      if (format === 'mcp') {
        return {
          tools: serviceIds.map((id) => ({
            name: `${id}_tool`,
            description: `Tool for ${id}`,
            inputSchema: {
              type: 'object',
              properties: {},
            },
          })),
        };
      } else {
        return {
          functions: serviceIds.map((id) => ({
            name: `${id}_function`,
            description: `Function for ${id}`,
            parameters: {
              type: 'object',
              properties: {},
            },
          })),
        };
      }
    }),
  };
});

describe('Tools API Routes', () => {
  const db = getTestDb();
  const app = new Hono();
  const testTenantId = 'test-tenant-123';
  const testUserId = 'user-456';

  beforeEach(async () => {
    await cleanDatabase(db);

    // Seed tenant
    await db.insert(tenants).values({
      id: testTenantId,
      name: 'Test Tenant',
      apiKeyHash: 'test-hash',
    });

    // Seed services
    await db.insert(services).values([
      {
        id: 'github',
        name: 'GitHub',
        description: 'GitHub integration',
        authType: 'oauth2',
        enabled: true,
        config: {},
      },
      {
        id: 'slack',
        name: 'Slack',
        description: 'Slack integration',
        authType: 'oauth2',
        enabled: true,
        config: {},
      },
    ]);

    // Setup app with middleware
    const testApp = new Hono();
    testApp.use('*', testTenantMiddleware());
    testApp.route('/', createToolsRouter(db));
    app.route('/', testApp);
  });

  describe('GET /api/v1/users/:userId/tools', () => {
    it('should return tools in MCP format by default', async () => {
      await db.insert(connections).values([
        {
          id: 'conn-1',
          tenantId: testTenantId,
          externalUserId: testUserId,
          serviceId: 'github',
          status: 'connected',
        },
        {
          id: 'conn-2',
          tenantId: testTenantId,
          externalUserId: testUserId,
          serviceId: 'slack',
          status: 'connected',
        },
      ]);

      const res = await app.request(`/${testUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.tools).toBeDefined();
      expect(body.data.tools).toHaveLength(2);
      expect(body.data.tools.map((t: any) => t.name)).toContain('github_tool');
      expect(body.data.tools.map((t: any) => t.name)).toContain('slack_tool');
    });

    it('should return tools in MCP format when explicitly requested', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
      });

      const res = await app.request(`/${testUserId}/tools?format=mcp`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tools).toBeDefined();
      expect(body.data.tools).toHaveLength(1);
      expect(body.data.tools[0].name).toBe('github_tool');
    });

    it('should return tools in OpenAI format when requested', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
      });

      const res = await app.request(`/${testUserId}/tools?format=openai`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.functions).toBeDefined();
      expect(body.data.functions).toHaveLength(1);
      expect(body.data.functions[0].name).toBe('github_function');
    });

    it('should only return tools for connected services', async () => {
      await db.insert(connections).values([
        {
          id: 'conn-1',
          tenantId: testTenantId,
          externalUserId: testUserId,
          serviceId: 'github',
          status: 'connected',
        },
        {
          id: 'conn-2',
          tenantId: testTenantId,
          externalUserId: testUserId,
          serviceId: 'slack',
          status: 'pending',
        },
      ]);

      const res = await app.request(`/${testUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tools).toHaveLength(1);
      expect(body.data.tools[0].name).toBe('github_tool');
    });

    it('should return empty tools when user has no connected services', async () => {
      const res = await app.request(`/${testUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.tools).toEqual([]);
    });

    it('should return empty functions when user has no connected services (OpenAI format)', async () => {
      const res = await app.request(`/${testUserId}/tools?format=openai`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.functions).toEqual([]);
    });

    it('should return 400 for invalid user ID', async () => {
      const res = await app.request('//tools', {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid user ID');
    });

    it('should return 400 for invalid format parameter', async () => {
      const res = await app.request(`/${testUserId}/tools?format=invalid`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Format must be "mcp" or "openai"');
    });

    it('should filter connections by tenant', async () => {
      const otherTenantId = 'other-tenant';
      await db.insert(tenants).values({
        id: otherTenantId,
        name: 'Other Tenant',
        apiKeyHash: 'other-hash',
      });

      await db.insert(connections).values([
        {
          id: 'conn-1',
          tenantId: testTenantId,
          externalUserId: testUserId,
          serviceId: 'github',
          status: 'connected',
        },
        {
          id: 'conn-2',
          tenantId: otherTenantId,
          externalUserId: testUserId,
          serviceId: 'slack',
          status: 'connected',
        },
      ]);

      const res = await app.request(`/${testUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tools).toHaveLength(1);
      expect(body.data.tools[0].name).toBe('github_tool');
    });

    it('should handle database errors gracefully', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => {
              throw new Error('Database error');
            },
          }),
        }),
      };

      const testApp = new Hono();
      testApp.use('*', testTenantMiddleware());
      testApp.route('/', createToolsRouter(mockDb as any));

      const res = await testApp.request(`/${testUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toContain('Failed to fetch tools');
    });

    it('should handle tool loading errors gracefully', async () => {
      const { loadMultipleIntegrationTools } = await import('@authlane/shared');
      vi.mocked(loadMultipleIntegrationTools).mockRejectedValueOnce(
        new Error('Failed to load integration tools')
      );

      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
      });

      const res = await app.request(`/${testUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle special characters in user ID validation', async () => {
      const invalidUserId = 'user@#$%';
      const res = await app.request(`/${invalidUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tools).toEqual([]);
    });

    it('should handle very long user IDs', async () => {
      const longUserId = 'a'.repeat(256);
      const res = await app.request(`/${longUserId}/tools`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

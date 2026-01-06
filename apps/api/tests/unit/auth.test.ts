/**
 * Unit tests for authentication middleware
 */

import { tenants } from '@authlane/database';
import { hashApiKey } from '@authlane/shared';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { authMiddleware } from '../../src/middleware/auth.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';

describe('Authentication Middleware', () => {
  const db = getTestDb();
  const app = new Hono();
  const testApiKey = 'test-api-key-12345';
  const testTenantId = 'test-tenant-123';

  beforeEach(async () => {
    await cleanDatabase(db);

    // Setup test route
    app.use('*', authMiddleware(db));
    app.get('/test', (c) => c.json({ message: 'authenticated', tenantId: c.get('tenantId') }));
  });

  describe('API Key Extraction', () => {
    it('should accept API key with Bearer prefix', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('authenticated');
      expect(body.tenantId).toBe(testTenantId);
    });

    it('should accept API key with ApiKey prefix', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: `ApiKey ${testApiKey}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('authenticated');
      expect(body.tenantId).toBe(testTenantId);
    });

    it('should be case-insensitive for prefix', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: `bearer ${testApiKey}` },
      });

      expect(res.status).toBe(200);
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await app.request('/test');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('API key is required');
    });

    it('should return 401 when Authorization header has invalid format', async () => {
      const res = await app.request('/test', {
        headers: { Authorization: 'InvalidFormat' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('API key is required');
    });

    it('should return 401 for empty Authorization header', async () => {
      const res = await app.request('/test', {
        headers: { Authorization: '' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('API Key Validation', () => {
    it('should authenticate valid API key', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(200);
    });

    it('should return 401 for invalid API key', async () => {
      const validApiKeyHash = hashApiKey('valid-key');
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash: validApiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid-key' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid API key');
    });

    it('should return 401 when no tenant matches the API key', async () => {
      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid API key');
    });

    it('should hash the API key before database lookup', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('Tenant Context Setting', () => {
    it('should set tenant context for authenticated request', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      const tenant = {
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      };
      await db.insert(tenants).values(tenant);

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenantId).toBe(testTenantId);
    });

    it('should set both tenant and tenantId in context', async () => {
      const apiKeyHash = hashApiKey(testApiKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      // Custom route to check both context values
      const testApp = new Hono();
      testApp.use('*', authMiddleware(db));
      testApp.get('/context', (c) => {
        const tenant = c.get('tenant');
        const tenantId = c.get('tenantId');
        return c.json({ tenant, tenantId });
      });

      const res = await testApp.request('/context', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toBeDefined();
      expect(body.tenant.id).toBe(testTenantId);
      expect(body.tenantId).toBe(testTenantId);
    });

    it('should not set tenant context for unauthenticated request', async () => {
      const testApp = new Hono();
      testApp.use('*', authMiddleware(db));
      testApp.get('/context', (c) => {
        const tenantId = c.get('tenantId');
        return c.json({ tenantId });
      });

      const res = await testApp.request('/context');
      expect(res.status).toBe(401);
    });
  });

  describe('Edge Cases', () => {
    it('should handle database errors gracefully', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => {
                throw new Error('Database connection failed');
              },
            }),
          }),
        }),
      };

      const testApp = new Hono();
      testApp.use('*', authMiddleware(mockDb as any));
      testApp.get('/test', (c) => c.json({ message: 'ok' }));

      const res = await testApp.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(500);
    });

    it('should handle multiple spaces in Authorization header', async () => {
      const res = await app.request('/test', {
        headers: { Authorization: `Bearer  ${testApiKey}` },
      });

      expect(res.status).toBe(401);
    });

    it('should handle API key with special characters', async () => {
      const specialKey = 'key-with-special-chars!@#$%^&*()';
      const apiKeyHash = hashApiKey(specialKey);
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash,
      });

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${specialKey}` },
      });

      expect(res.status).toBe(200);
    });

    it('should handle very long API keys', async () => {
      const longKey = 'a'.repeat(1000);
      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${longKey}` },
      });

      expect(res.status).toBe(401);
    });

    it('should handle Authorization header with only prefix', async () => {
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer ' },
      });

      expect(res.status).toBe(401);
    });

    it('should distinguish between different tenants with different keys', async () => {
      const tenant1Key = 'tenant1-key';
      const tenant2Key = 'tenant2-key';

      await db.insert(tenants).values([
        {
          id: 'tenant-1',
          name: 'Tenant 1',
          apiKeyHash: hashApiKey(tenant1Key),
        },
        {
          id: 'tenant-2',
          name: 'Tenant 2',
          apiKeyHash: hashApiKey(tenant2Key),
        },
      ]);

      const res1 = await app.request('/test', {
        headers: { Authorization: `Bearer ${tenant1Key}` },
      });

      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.tenantId).toBe('tenant-1');

      const res2 = await app.request('/test', {
        headers: { Authorization: `Bearer ${tenant2Key}` },
      });

      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.tenantId).toBe('tenant-2');
    });
  });

  describe('Security', () => {
    it('should not expose tenant information in error messages', async () => {
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer wrong-key' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toBe('Invalid API key');
      expect(JSON.stringify(body)).not.toContain(testTenantId);
    });

    it('should use hashed API keys for comparison', async () => {
      // Store the API key directly (without hashing) - should not work
      await db.insert(tenants).values({
        id: testTenantId,
        name: 'Test Tenant',
        apiKeyHash: testApiKey, // Not hashed
      });

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });

      expect(res.status).toBe(401);
    });

    it('should prevent timing attacks by always performing hash comparison', async () => {
      const start1 = Date.now();
      await app.request('/test', {
        headers: { Authorization: 'Bearer key1' },
      });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await app.request('/test', {
        headers: { Authorization: 'Bearer key2' },
      });
      const time2 = Date.now() - start2;

      // Both should take similar time (within reasonable margin)
      // This is a basic check - true timing attack prevention requires constant-time comparison
      expect(Math.abs(time1 - time2)).toBeLessThan(50);
    });
  });
});

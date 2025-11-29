/**
 * Integration tests for Connections API routes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createConnectionsRouter } from '../../src/routes/connections.js';
import { getTestDb, cleanDatabase } from '../setup/test-db.js';
import { testTenantMiddleware } from '../setup/test-helpers.js';
import { connections, services, tenants } from '@authlane/database';
import { encrypt, getEncryptionKey } from '@authlane/crypto';

describe('Connections API Routes', () => {
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
    testApp.route('/', createConnectionsRouter(db));
    app.route('/', testApp);
  });

  describe('GET /api/v1/users/:userId/connections', () => {
    it('should return all connections for a user', async () => {
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

      const res = await app.request(`/${testUserId}/connections`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((c: any) => c.serviceId)).toContain('github');
      expect(body.data.map((c: any) => c.serviceId)).toContain('slack');
    });

    it('should return empty array when user has no connections', async () => {
      const res = await app.request(`/${testUserId}/connections`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toHaveLength(0);
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

      const res = await app.request(`/${testUserId}/connections`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].serviceId).toBe('github');
    });

    it('should return 400 for invalid user ID', async () => {
      const res = await app.request('//connections', {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid user ID');
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
      testApp.route('/', createConnectionsRouter(mockDb as any));

      const res = await testApp.request(`/${testUserId}/connections`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/v1/users/:userId/connections/:serviceId', () => {
    it('should return a specific connection', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        connectedAt: new Date(),
      });

      const res = await app.request(`/${testUserId}/connections/github`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.serviceId).toBe('github');
      expect(body.data.status).toBe('connected');
    });

    it('should return 404 when connection does not exist', async () => {
      const res = await app.request(`/${testUserId}/connections/github`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain(`${testUserId}/github`);
    });

    it('should return 400 for invalid user ID', async () => {
      const res = await app.request('//connections/github', {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid user ID');
    });

    it('should return 400 for invalid service ID', async () => {
      const res = await app.request(`/${testUserId}/connections/INVALID_SERVICE`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid service ID');
    });
  });

  describe('GET /api/v1/users/:userId/connections/:serviceId/credentials', () => {
    it('should return decrypted credentials for a connected connection', async () => {
      const credentials = {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        token_type: 'Bearer',
      };

      const encryptionKey = getEncryptionKey();
      const credentialsEnc = encrypt(JSON.stringify(credentials), encryptionKey);

      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        credentialsEnc,
      });

      const res = await app.request(`/${testUserId}/connections/github/credentials`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toEqual(credentials);
    });

    it('should return 404 when connection does not exist', async () => {
      const res = await app.request(`/${testUserId}/connections/github/credentials`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when connection is not connected', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
      });

      const res = await app.request(`/${testUserId}/connections/github/credentials`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('CONNECTION_NOT_CONNECTED');
    });

    it('should return 404 when credentials are missing', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        credentialsEnc: null,
      });

      const res = await app.request(`/${testUserId}/connections/github/credentials`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('CONNECTION_ERROR');
      expect(body.error.message).toContain('No credentials found');
    });

    it('should return 500 when decryption fails', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        credentialsEnc: 'invalid-encrypted-data',
      });

      const res = await app.request(`/${testUserId}/connections/github/credentials`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('ENCRYPTION_ERROR');
      expect(body.error.message).toContain('Failed to decrypt credentials');
    });
  });

  describe('GET /api/v1/users/:userId/connections/:serviceId/health', () => {
    it('should return healthy status for connected non-expired connection', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        connectedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      });

      const res = await app.request(`/${testUserId}/connections/github/health`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.status).toBe('healthy');
      expect(body.data.connection_status).toBe('connected');
      expect(body.data.last_verified).toBeDefined();
      expect(body.data.expires_at).toBeDefined();
    });

    it('should return unhealthy status for pending connection', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
      });

      const res = await app.request(`/${testUserId}/connections/github/health`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('unhealthy');
      expect(body.data.connection_status).toBe('pending');
    });

    it('should return unhealthy status for expired connection', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      });

      const res = await app.request(`/${testUserId}/connections/github/health`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('unhealthy');
    });

    it('should return healthy status when no expiry is set', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        expiresAt: null,
      });

      const res = await app.request(`/${testUserId}/connections/github/health`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('healthy');
    });

    it('should return 404 when connection does not exist', async () => {
      const res = await app.request(`/${testUserId}/connections/github/health`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/users/:userId/connections/:serviceId', () => {
    it('should delete an existing connection', async () => {
      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
      });

      const res = await app.request(`/${testUserId}/connections/github`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.message).toContain('deleted successfully');
      expect(body.data.service).toBe('github');

      // Verify connection was deleted
      const checkRes = await app.request(`/${testUserId}/connections/github`, {
        headers: { 'x-tenant-id': testTenantId },
      });
      expect(checkRes.status).toBe(404);
    });

    it('should return 404 when connection does not exist', async () => {
      const res = await app.request(`/${testUserId}/connections/github`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid user ID', async () => {
      const res = await app.request('//connections/github', {
        method: 'DELETE',
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid service ID', async () => {
      const res = await app.request(`/${testUserId}/connections/INVALID`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should only delete connections for the correct tenant', async () => {
      const otherTenantId = 'other-tenant';
      await db.insert(tenants).values({
        id: otherTenantId,
        name: 'Other Tenant',
        apiKeyHash: 'other-hash',
      });

      await db.insert(connections).values({
        id: 'conn-1',
        tenantId: otherTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
      });

      const res = await app.request(`/${testUserId}/connections/github`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});

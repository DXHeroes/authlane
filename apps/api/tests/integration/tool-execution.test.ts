/**
 * Integration tests for Tool Execution
 * Tests the POST /api/v1/users/:userId/tools/:toolName/execute endpoint
 */

import { connections, organization, services, user } from '@authlane/database';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolsRouter } from '../../src/routes/tools.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { testAuthMiddleware } from '../setup/test-helpers.js';

// Mock crypto module for encryption
vi.mock('@authlane/crypto', () => ({
  encrypt: vi.fn((data: string) => `encrypted:${data}`),
  decrypt: vi.fn((data: string) => data.replace('encrypted:', '')),
  getEncryptionKey: vi.fn(() => '0'.repeat(64)),
}));

// Mock the tool executor to avoid loading real integrations
vi.mock('../../src/lib/tool-executor.js', () => ({
  executeTool: vi.fn(
    async (_userId: string, toolName: string, parameters: Record<string, unknown>) => {
      // Simulate successful execution
      if (toolName === 'github_create_issue') {
        return {
          data: {
            id: 123,
            number: 456,
            title: parameters.title,
            url: 'https://github.com/owner/repo/issues/456',
          },
          error: null,
        };
      }

      // Simulate tool not found
      if (toolName === 'invalid_tool') {
        return {
          data: null,
          error: {
            message: 'Tool not found',
            code: 'NOT_FOUND',
            hint: 'Check the tool name and try again',
            statusCode: 404,
          },
        };
      }

      // Simulate validation error
      if (toolName === 'github_create_pr') {
        if (!parameters.title) {
          return {
            data: null,
            error: {
              message: 'Validation error',
              code: 'VALIDATION_ERROR',
              hint: 'title is required',
              statusCode: 400,
            },
          };
        }
      }

      return { data: { success: true }, error: null };
    }
  ),
}));

describe('Tool Execution API', () => {
  const db = getTestDb();
  const app = new Hono();
  const testOrgId = 'org-123';
  const testUserId = 'user-456';
  const testConnectionId = 'conn-789';

  beforeEach(async () => {
    await cleanDatabase(db);

    // Seed organization
    await db.insert(organization).values({
      id: testOrgId,
      name: 'Test Organization',
      slug: 'test-org',
      createdAt: new Date(),
    });

    // Seed user
    await db.insert(user).values({
      id: testUserId,
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed GitHub service
    await db.insert(services).values({
      id: 'github',
      name: 'GitHub',
      description: 'GitHub integration',
      authType: 'oauth2',
      enabled: true,
      config: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'user'],
      },
    });

    // Seed connection
    await db.insert(connections).values({
      id: testConnectionId,
      userId: testUserId,
      organizationId: testOrgId,
      scope: 'user',
      serviceId: 'github',
      externalUserId: 'github-user-123',
      status: 'connected',
      credentialsEnc: 'encrypted:{"access_token":"ghp_test123","token_type":"bearer"}',
      connectedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    });

    // Setup app with middleware
    const testApp = new Hono();
    testApp.use(
      '*',
      testAuthMiddleware({ user: { id: testUserId }, organization: { id: testOrgId } })
    );
    testApp.route('/', createToolsRouter(db));
    app.route('/', testApp);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/users/:userId/tools/:toolName/execute', () => {
    it('should successfully execute a tool with valid parameters', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            owner: 'test-owner',
            repo: 'test-repo',
            title: 'Test Issue',
            body: 'This is a test issue',
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.title).toBe('Test Issue');
      expect(body.data.url).toContain('github.com');
    });

    it('should handle empty parameters object', async () => {
      const res = await app.request(`/${testUserId}/tools/github_list_repos/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {},
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
    });

    it('should handle missing parameters field in body', async () => {
      const res = await app.request(`/${testUserId}/tools/github_list_repos/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
    });

    it('should return 400 for invalid JSON body', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid JSON body');
    });

    it('should return 400 for invalid parameters type (array)', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: ['invalid'],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid parameters');
    });

    it('should return 400 for invalid parameters type (null)', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: null,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await app.request(`/${testUserId}/tools/invalid_tool/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {},
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Tool not found');
    });

    it('should handle tool execution validation errors', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_pr/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            // Missing required 'title' parameter
            owner: 'test',
            repo: 'test',
          },
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle connection not found gracefully', async () => {
      // Delete the connection
      await db.delete(connections).where(() => true);

      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            title: 'Test',
          },
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should handle expired connections', async () => {
      // Update connection to be expired
      await db
        .update(connections)
        .set({ expiresAt: new Date(Date.now() - 3600000) }) // 1 hour ago
        .where(() => true);

      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            title: 'Test',
          },
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should handle disconnected connections', async () => {
      // Update connection status to 'expired'
      await db
        .update(connections)
        .set({ status: 'expired' })
        .where(() => true);

      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            title: 'Test',
          },
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should handle complex nested parameters', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            owner: 'test',
            repo: 'test',
            title: 'Complex Issue',
            labels: ['bug', 'high-priority'],
            metadata: {
              category: 'backend',
              severity: 'critical',
              assigned_to: ['user1', 'user2'],
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
    });

    it('should handle special characters in parameters', async () => {
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            owner: 'test-owner',
            repo: 'test-repo',
            title: 'Issue with "quotes" and \'apostrophes\'',
            body: 'Body with special chars: @#$%^&*(){}[]|\\:;"<>?,./`~',
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
    });

    it('should handle very large parameter values', async () => {
      const longString = 'a'.repeat(10000);
      const res = await app.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            owner: 'test',
            repo: 'test',
            title: 'Test',
            body: longString,
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
    });

    it('should isolate tool execution by user', async () => {
      const otherUserId = 'user-999';

      // Try to execute tool as different user
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: otherUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createToolsRouter(db));

      const res = await testApp.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            title: 'Test',
          },
        }),
      });

      // Should fail because otherUserId doesn't have a connection
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle database errors during execution', async () => {
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
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: testUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createToolsRouter(mockDb as any));

      const res = await testApp.request(`/${testUserId}/tools/github_create_issue/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            title: 'Test',
          },
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});

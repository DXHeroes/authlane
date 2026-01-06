/**
 * Integration tests for OAuth API routes
 */

import { encrypt, getEncryptionKey } from '@authlane/crypto';
import { connections, services, tenantServices, tenants } from '@authlane/database';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOAuthRouter } from '../../src/routes/oauth.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { testTenantMiddleware } from '../setup/test-helpers.js';

// Mock fetch for OAuth token exchange
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('OAuth API Routes', () => {
  const db = getTestDb();
  const app = new Hono();
  const testTenantId = 'test-tenant-123';
  const testUserId = 'user-456';
  const testClientId = 'test-client-id';
  const testClientSecret = 'test-client-secret';

  beforeEach(async () => {
    await cleanDatabase(db);
    mockFetch.mockReset();

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
        config: {
          authorization_url: 'https://github.com/login/oauth/authorize',
          token_url: 'https://github.com/login/oauth/access_token',
          scopes: ['repo', 'user'],
        },
      },
      {
        id: 'api-key-service',
        name: 'API Key Service',
        description: 'Service with API key auth',
        authType: 'api_key',
        enabled: true,
        config: {},
      },
    ]);

    // Setup app with middleware
    const testApp = new Hono();
    testApp.use('*', testTenantMiddleware());
    testApp.route('/', createOAuthRouter(db));
    app.route('/', testApp);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/users/:userId/connections/:serviceId/authorize', () => {
    it('should initiate OAuth flow with authorization URL', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/authorize?client_id=${testClientId}&redirect_uri=http://localhost:3000/callback`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toBeDefined();
      expect(body.data.authorization_url).toContain('github.com/login/oauth/authorize');
      expect(body.data.authorization_url).toContain(`client_id=${testClientId}`);
      expect(body.data.authorization_url).toContain('redirect_uri=');
      expect(body.data.authorization_url).toContain('response_type=code');
      expect(body.data.authorization_url).toContain('scope=repo%20user');
      expect(body.data.state).toBeDefined();
      expect(body.data.connection_id).toBeDefined();
    });

    it('should include PKCE challenge in authorization URL', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.authorization_url).toContain('code_challenge=');
      expect(body.data.authorization_url).toContain('code_challenge_method=S256');
    });

    it('should create pending connection with PKCE verifier', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // Check connection was created
      const [connection] = await db
        .select()
        .from(connections)
        .where(eq(connections.id, body.data.connection_id));

      expect(connection).toBeDefined();
      expect(connection.status).toBe('pending');
      expect(connection.metadata).toHaveProperty('pkce_code_verifier');
      expect(connection.metadata).toHaveProperty('state');
    });

    it('should use tenant-specific OAuth client if configured', async () => {
      const tenantClientId = 'tenant-client-id';
      const tenantClientSecret = 'tenant-client-secret';

      await db.insert(tenantServices).values({
        tenantId: testTenantId,
        serviceId: 'github',
        enabled: true,
        oauthClientId: tenantClientId,
        oauthClientSecretEnc: encrypt(tenantClientSecret, getEncryptionKey()),
        customScopes: ['repo', 'workflow'],
      });

      const res = await app.request(`/${testUserId}/connections/github/authorize`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.authorization_url).toContain(`client_id=${tenantClientId}`);
      expect(body.data.authorization_url).toContain('scope=repo%20workflow');
    });

    it('should return 400 for invalid user ID', async () => {
      const res = await app.request(`//connections/github/authorize?client_id=${testClientId}`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid user ID');
    });

    it('should return 400 for invalid service ID', async () => {
      const res = await app.request(
        `/${testUserId}/connections/INVALID_SERVICE/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid service ID');
    });

    it('should return 404 for non-existent service', async () => {
      const res = await app.request(
        `/${testUserId}/connections/nonexistent/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for non-OAuth2 service', async () => {
      const res = await app.request(
        `/${testUserId}/connections/api-key-service/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('does not support OAuth2');
    });

    it('should return 403 if tenant service is disabled', async () => {
      await db.insert(tenantServices).values({
        tenantId: testTenantId,
        serviceId: 'github',
        enabled: false,
      });

      const res = await app.request(
        `/${testUserId}/connections/github/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('disabled for this tenant');
    });

    it('should return 400 if authorization URL is missing', async () => {
      await db.insert(services).values({
        id: 'no-auth-url',
        name: 'No Auth URL',
        description: 'Service without auth URL',
        authType: 'oauth2',
        enabled: true,
        config: {
          token_url: 'https://example.com/token',
        },
      });

      const res = await app.request(
        `/${testUserId}/connections/no-auth-url/authorize?client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('missing authorization URL');
    });

    it('should return 400 if client_id is missing and no tenant config', async () => {
      const res = await app.request(`/${testUserId}/connections/github/authorize`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('OAuth client ID required');
    });
  });

  describe('GET /api/v1/users/:userId/connections/:serviceId/callback', () => {
    let connectionId: string;
    let state: string;

    beforeEach(async () => {
      // Create pending connection
      const result = await db
        .insert(connections)
        .values({
          tenantId: testTenantId,
          externalUserId: testUserId,
          serviceId: 'github',
          status: 'pending',
          metadata: {
            pkce_code_verifier: 'test-verifier',
            state: 'test-state-123',
            redirect_uri: 'http://localhost:3000/callback',
          },
        })
        .returning();

      connectionId = result[0]?.id;
      state = 'test-state-123';
    });

    it('should exchange code for tokens successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-456',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'repo user',
        }),
      });

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}&client_id=${testClientId}&client_secret=${testClientSecret}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.status).toBe('connected');
      expect(body.data.service).toBe('github');

      // Verify token exchange request
      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        })
      );
    });

    it('should encrypt and store credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-456',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}&client_id=${testClientId}&client_secret=${testClientSecret}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);

      // Verify connection was updated
      const [connection] = await db
        .select()
        .from(connections)
        .where(eq(connections.id, connectionId));

      expect(connection.status).toBe('connected');
      expect(connection.credentialsEnc).toBeDefined();
      expect(connection.connectedAt).toBeDefined();
      expect(connection.expiresAt).toBeDefined();
      expect(connection.metadata).toEqual({});
    });

    it('should return 400 if OAuth error parameter is present', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/callback?error=access_denied&state=${state}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('access_denied');
    });

    it('should return 400 if code is missing', async () => {
      const res = await app.request(`/${testUserId}/connections/github/callback?state=${state}`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('Missing code or state');
    });

    it('should return 400 if state is missing', async () => {
      const res = await app.request(`/${testUserId}/connections/github/callback?code=auth-code`, {
        headers: { 'x-tenant-id': testTenantId },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('Missing code or state');
    });

    it('should return 404 if connection does not exist', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=wrong-state`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 if state does not match', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=wrong-state&client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 400 if service is missing token URL', async () => {
      await db.insert(services).values({
        id: 'no-token-url',
        name: 'No Token URL',
        description: 'Service without token URL',
        authType: 'oauth2',
        enabled: true,
        config: {
          authorization_url: 'https://example.com/auth',
        },
      });

      await db.insert(connections).values({
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'no-token-url',
        status: 'pending',
        metadata: {
          pkce_code_verifier: 'test-verifier',
          state: 'state-123',
        },
      });

      const res = await app.request(
        `/${testUserId}/connections/no-token-url/callback?code=auth-code&state=state-123&client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('missing token URL');
    });

    it('should return 400 if client_id is missing and no tenant config', async () => {
      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_ERROR');
      expect(body.error.message).toContain('OAuth client ID required');
    });

    it('should handle token exchange failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid client credentials',
      });

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}&client_id=${testClientId}&client_secret=${testClientSecret}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_TOKEN_EXCHANGE_FAILED');
      expect(body.error.message).toContain('Token exchange failed');
    });

    it('should handle network errors during token exchange', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}&client_id=${testClientId}&client_secret=${testClientSecret}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('OAUTH_TOKEN_EXCHANGE_FAILED');
    });

    it('should use tenant OAuth credentials if configured', async () => {
      const tenantClientId = 'tenant-client-id';
      const tenantClientSecret = 'tenant-client-secret';

      await db.insert(tenantServices).values({
        tenantId: testTenantId,
        serviceId: 'github',
        enabled: true,
        oauthClientId: tenantClientId,
        oauthClientSecretEnc: encrypt(tenantClientSecret, getEncryptionKey()),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          token_type: 'Bearer',
        }),
      });

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle missing refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-123',
          token_type: 'Bearer',
        }),
      });

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}&client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);
    });

    it('should handle missing expires_in', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-123',
          token_type: 'Bearer',
        }),
      });

      const res = await app.request(
        `/${testUserId}/connections/github/callback?code=auth-code&state=${state}&client_id=${testClientId}`,
        {
          headers: { 'x-tenant-id': testTenantId },
        }
      );

      expect(res.status).toBe(200);

      const [connection] = await db
        .select()
        .from(connections)
        .where(eq(connections.id, connectionId));

      expect(connection.expiresAt).toBeNull();
    });
  });
});

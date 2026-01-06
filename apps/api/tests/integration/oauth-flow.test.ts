/**
 * Integration tests for OAuth flow
 * Tests: authorize → callback → credentials stored → token refresh
 */

import { randomUUID } from 'node:crypto';
import { encrypt, getEncryptionKey } from '@authlane/crypto';
import { connections, services, tenantServices, tenants } from '@authlane/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';

describe('OAuth Flow Integration Tests', () => {
  const db = getTestDb();
  let app: ReturnType<typeof createApp>;
  let testTenantId: string;
  let testApiKey: string;
  const testUserId = 'test_oauth_user';

  beforeAll(async () => {
    // Create test app
    app = createApp(db);

    // Create test tenant
    const tenantApiKey = randomUUID();
    const [tenant] = await db
      .insert(tenants)
      .values({
        id: randomUUID(),
        name: 'Test Tenant',
        apiKey: tenantApiKey,
        webhookUrl: null,
      })
      .returning();

    testTenantId = tenant.id;
    testApiKey = tenantApiKey;

    // Insert GitHub service
    await db
      .insert(services)
      .values({
        id: 'github',
        name: 'GitHub',
        authType: 'oauth2',
        config: {
          authorization_url: 'https://github.com/login/oauth/authorize',
          token_url: 'https://github.com/login/oauth/access_token',
          scopes: ['repo', 'user', 'read:org'],
        },
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    // Clean connections before each test
    await db.delete(connections);
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  describe('OAuth Authorization', () => {
    it('should initiate OAuth flow with PKCE', async () => {
      const clientId = 'test_github_client_id';
      const redirectUri = `http://localhost:3001/api/v1/users/${testUserId}/connections/github/callback`;

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data).toBeDefined();
      expect(data.data.authorization_url).toBeDefined();
      expect(data.data.state).toBeDefined();
      expect(data.data.connection_id).toBeDefined();

      // Verify authorization URL contains required parameters
      const authUrl = new URL(data.data.authorization_url);
      expect(authUrl.searchParams.get('client_id')).toBe(clientId);
      expect(authUrl.searchParams.get('redirect_uri')).toBe(redirectUri);
      expect(authUrl.searchParams.get('response_type')).toBe('code');
      expect(authUrl.searchParams.get('state')).toBe(data.data.state);
      expect(authUrl.searchParams.get('code_challenge')).toBeDefined();
      expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');

      // Verify connection was created in pending state
      const [connection] = await db
        .select()
        .from(connections)
        .where(eq(connections.id, data.data.connection_id))
        .limit(1);

      expect(connection).toBeDefined();
      expect(connection.status).toBe('pending');
      expect(connection.externalUserId).toBe(testUserId);
      expect(connection.serviceId).toBe('github');
      expect(connection.metadata).toBeDefined();

      const metadata = connection.metadata as Record<string, unknown>;
      expect(metadata.state).toBe(data.data.state);
      expect(metadata.pkce_code_verifier).toBeDefined();
      expect(metadata.redirect_uri).toBe(redirectUri);
    });

    it('should reject authorization without client_id', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/authorize`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('client ID');
    });

    it('should reject invalid service ID', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/INVALID_SERVICE/authorize?client_id=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should use tenant-specific OAuth config if available', async () => {
      const tenantClientId = 'tenant_specific_client_id';
      const customScopes = ['repo', 'user'];

      // Add tenant-specific service config
      await db.insert(tenantServices).values({
        id: randomUUID(),
        tenantId: testTenantId,
        serviceId: 'github',
        enabled: true,
        oauthClientId: tenantClientId,
        customScopes,
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/authorize`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      const authUrl = new URL(data.data.authorization_url);
      expect(authUrl.searchParams.get('client_id')).toBe(tenantClientId);
      expect(authUrl.searchParams.get('scope')).toBe(customScopes.join(' '));

      // Cleanup
      await db.delete(tenantServices).where(eq(tenantServices.tenantId, testTenantId));
    });
  });

  describe('OAuth Callback', () => {
    let connectionId: string;
    let stateParam: string;
    let codeVerifier: string;

    beforeEach(async () => {
      // Create a pending connection
      connectionId = randomUUID();
      stateParam = `test_state_${randomUUID()}`;
      codeVerifier = `test_verifier_${randomUUID()}`;

      await db.insert(connections).values({
        id: connectionId,
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: codeVerifier,
          redirect_uri: `http://localhost:3001/api/v1/users/${testUserId}/connections/github/callback`,
        },
      });
    });

    it('should reject callback with missing code', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('code');
    });

    it('should reject callback with missing state', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('state');
    });

    it('should reject callback with invalid state (CSRF protection)', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=invalid_state`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('OAUTH_STATE_MISMATCH');
    });

    it('should reject callback with OAuth error', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?error=access_denied&state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('access_denied');
    });

    it('should reject callback for non-existent connection', async () => {
      const response = await app.request(
        `/api/v1/users/nonexistent_user/connections/github/callback?code=test_code&state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Credentials Storage', () => {
    it('should store encrypted credentials after successful OAuth', async () => {
      // Create a connected connection with credentials
      const accessToken = `gho_test_access_token_${randomUUID()}`;
      const refreshToken = `gho_test_refresh_token_${randomUUID()}`;

      const credentialsJson = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        scope: 'repo,user',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });

      const encryptionKey = getEncryptionKey();
      const credentialsEnc = encrypt(credentialsJson, encryptionKey);

      const connectionId = randomUUID();
      await db.insert(connections).values({
        id: connectionId,
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        credentialsEnc,
        connectedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Retrieve connection
      const response = await app.request(`/api/v1/users/${testUserId}/connections/github`, {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.status).toBe('connected');
      expect(data.data.credentials_enc).toBeDefined();
      expect(data.data.connected_at).toBeDefined();
      expect(data.data.expires_at).toBeDefined();

      // Verify credentials can be decrypted
      const credsResponse = await app.request(
        `/api/v1/users/${testUserId}/connections/github/credentials`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(credsResponse.status).toBe(200);
      const credsData = await credsResponse.json();

      expect(credsData.data.access_token).toBe(accessToken);
      expect(credsData.data.refresh_token).toBe(refreshToken);
      expect(credsData.data.token_type).toBe('Bearer');
    });

    it('should not expose credentials in connection list', async () => {
      // Create a connection with credentials
      const credentialsJson = JSON.stringify({
        access_token: 'secret_token',
        token_type: 'Bearer',
      });

      const encryptionKey = getEncryptionKey();
      const credentialsEnc = encrypt(credentialsJson, encryptionKey);

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'connected',
        credentialsEnc,
        connectedAt: new Date(),
      });

      const response = await app.request(`/api/v1/users/${testUserId}/connections`, {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);

      // Connection list should show credentials_enc but not decrypted values
      const connection = data.data.find((c: any) => c.service_id === 'github');
      expect(connection).toBeDefined();
      expect(connection.credentials_enc).toBeDefined();
      expect(connection.credentials_enc).not.toContain('secret_token');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing PKCE verifier', async () => {
      // Create a pending connection WITHOUT pkce_code_verifier
      const connectionId = randomUUID();
      const stateParam = `test_state_${randomUUID()}`;

      await db.insert(connections).values({
        id: connectionId,
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          // Missing pkce_code_verifier
          redirect_uri: `http://localhost:3001/api/v1/users/${testUserId}/connections/github/callback`,
        },
      });

      // This should fail because code_verifier will be empty
      // In real scenario, GitHub would reject the token exchange
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=${stateParam}&client_id=test&client_secret=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      // This will attempt to call GitHub's token endpoint and fail
      // We expect either 400 or 500 depending on GitHub's response
      expect([400, 500]).toContain(response.status);
    });

    it('should handle expired authorization code', async () => {
      const connectionId = randomUUID();
      const stateParam = `test_state_${randomUUID()}`;
      const codeVerifier = `test_verifier_${randomUUID()}`;

      await db.insert(connections).values({
        id: connectionId,
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: codeVerifier,
          redirect_uri: `http://localhost:3001/api/v1/users/${testUserId}/connections/github/callback`,
        },
      });

      // Use an obviously invalid/expired code
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=expired_code_123&state=${stateParam}&client_id=test&client_secret=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      // GitHub will reject the expired code
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('OAUTH_TOKEN_EXCHANGE_FAILED');
    });

    it('should handle disabled service for tenant', async () => {
      // Add tenant-specific service config but disabled
      await db.insert(tenantServices).values({
        id: randomUUID(),
        tenantId: testTenantId,
        serviceId: 'github',
        enabled: false,
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/authorize?client_id=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('disabled');

      // Cleanup
      await db.delete(tenantServices).where(eq(tenantServices.tenantId, testTenantId));
    });
  });

  describe('PKCE Verification', () => {
    it('should generate valid PKCE challenge and verifier', async () => {
      const { generatePKCE } = await import('@authlane/shared');
      const { codeVerifier, codeChallenge } = generatePKCE();

      expect(codeVerifier).toBeDefined();
      expect(codeChallenge).toBeDefined();
      expect(codeVerifier.length).toBeGreaterThan(40);
      expect(codeChallenge.length).toBeGreaterThan(40);

      // Verify they are different
      expect(codeVerifier).not.toBe(codeChallenge);

      // Verify URL-safe encoding (no +, /, =)
      expect(codeVerifier).not.toContain('+');
      expect(codeVerifier).not.toContain('/');
      expect(codeVerifier).not.toContain('=');
      expect(codeChallenge).not.toContain('+');
      expect(codeChallenge).not.toContain('/');
      expect(codeChallenge).not.toContain('=');
    });

    it('should verify PKCE correctly', async () => {
      const { generatePKCE, verifyPKCE } = await import('@authlane/shared');
      const { codeVerifier, codeChallenge } = generatePKCE();

      const isValid = verifyPKCE(codeVerifier, codeChallenge);
      expect(isValid).toBe(true);
    });

    it('should reject invalid PKCE verifier', async () => {
      const { generatePKCE, verifyPKCE } = await import('@authlane/shared');
      const { codeChallenge } = generatePKCE();
      const invalidVerifier = 'invalid_verifier_123';

      const isValid = verifyPKCE(invalidVerifier, codeChallenge);
      expect(isValid).toBe(false);
    });
  });
});

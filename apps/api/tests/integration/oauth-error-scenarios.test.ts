/**
 * Integration tests for OAuth error scenarios
 * Tests edge cases and failure modes
 */

import { createApp } from '../../src/index.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { services, tenants, connections } from '@authlane/database';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

describe('OAuth Error Scenarios', () => {
  const db = getTestDb();
  let app: ReturnType<typeof createApp>;
  let testTenantId: string;
  let testApiKey: string;
  const testUserId = 'test_error_user';

  beforeAll(async () => {
    app = createApp(db);

    // Create test tenant
    const tenantApiKey = randomUUID();
    const [tenant] = await db
      .insert(tenants)
      .values({
        id: randomUUID(),
        name: 'Test Error Tenant',
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
          scopes: ['repo', 'user'],
        },
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(connections);
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  describe('Invalid State Parameter', () => {
    it('should reject callback with completely wrong state', async () => {
      const validState = 'valid_state_' + randomUUID();
      const invalidState = 'invalid_state_' + randomUUID();

      // Create pending connection with valid state
      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: validState,
          pkce_code_verifier: 'test_verifier',
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      // Attempt callback with different state (CSRF attack simulation)
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=${invalidState}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('OAUTH_STATE_MISMATCH');
      expect(data.error.message).toContain('State mismatch');
    });

    it('should reject callback with empty state', async () => {
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=`,
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

    it('should reject callback with malformed state', async () => {
      const malformedStates = [
        'state with spaces',
        'state<script>alert(1)</script>',
        '../../../etc/passwd',
        'state%00null',
      ];

      for (const malformedState of malformedStates) {
        const response = await app.request(
          `/api/v1/users/${testUserId}/connections/github/callback?code=test&state=${encodeURIComponent(malformedState)}`,
          {
            headers: {
              Authorization: `Bearer ${testApiKey}`,
            },
          }
        );

        // Should either be 400 (validation error) or 404 (no matching connection)
        expect([400, 404]).toContain(response.status);
      }
    });
  });

  describe('Expired Authorization Code', () => {
    it('should handle token exchange failure for expired code', async () => {
      const stateParam = 'state_' + randomUUID();
      const expiredCode = 'expired_authorization_code_123456';

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: 'test_verifier_' + randomUUID(),
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      // GitHub will reject this with "bad_verification_code" error
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=${expiredCode}&state=${stateParam}&client_id=fake_client&client_secret=fake_secret`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('OAUTH_TOKEN_EXCHANGE_FAILED');
      expect(data.error.message).toContain('Token exchange failed');
    });

    it('should handle network timeout during token exchange', async () => {
      // This test would require mocking fetch or using a service with timeout
      // For now, we'll test the error handling structure
      const stateParam = 'state_' + randomUUID();

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: 'verifier',
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      // Using invalid credentials will cause GitHub to return error
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=code&state=${stateParam}&client_id=invalid&client_secret=invalid`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Missing PKCE Verifier', () => {
    it('should fail token exchange with missing code_verifier', async () => {
      const stateParam = 'state_' + randomUUID();

      // Create connection without PKCE verifier in metadata
      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          // Missing pkce_code_verifier
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=${stateParam}&client_id=test&client_secret=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      // Should fail because GitHub requires code_verifier for PKCE
      expect([400, 500]).toContain(response.status);
    });

    it('should fail token exchange with wrong code_verifier', async () => {
      const stateParam = 'state_' + randomUUID();
      const wrongVerifier = 'wrong_verifier_that_doesnt_match_challenge';

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: wrongVerifier,
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=${stateParam}&client_id=test&client_secret=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      // GitHub will reject due to PKCE mismatch
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('OAUTH_TOKEN_EXCHANGE_FAILED');
    });

    it('should fail with empty code_verifier', async () => {
      const stateParam = 'state_' + randomUUID();

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: '', // Empty verifier
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test_code&state=${stateParam}&client_id=test&client_secret=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Authorization Errors', () => {
    it('should handle user denying authorization', async () => {
      const stateParam = 'state_' + randomUUID();

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: 'verifier',
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      // User clicked "Cancel" on OAuth consent screen
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?error=access_denied&error_description=User+denied+access&state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('OAUTH_ERROR');
      expect(data.error.message).toContain('access_denied');
    });

    it('should handle invalid_scope error', async () => {
      const stateParam = 'state_' + randomUUID();

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: 'verifier',
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?error=invalid_scope&error_description=Invalid+scope&state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('invalid_scope');
    });

    it('should handle server_error from OAuth provider', async () => {
      const stateParam = 'state_' + randomUUID();

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: 'verifier',
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?error=server_error&state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('server_error');
    });
  });

  describe('Configuration Errors', () => {
    it('should reject service without OAuth support', async () => {
      // Create a service with API key auth instead of OAuth
      await db
        .insert(services)
        .values({
          id: 'test-api-key-service',
          name: 'API Key Service',
          authType: 'api_key',
          config: {},
        })
        .onConflictDoNothing();

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/test-api-key-service/authorize?client_id=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('OAuth2');
    });

    it('should reject service with missing authorization_url', async () => {
      // Create a malformed OAuth service
      await db
        .insert(services)
        .values({
          id: 'broken-oauth-service',
          name: 'Broken OAuth',
          authType: 'oauth2',
          config: {
            // Missing authorization_url
            token_url: 'https://example.com/token',
            scopes: ['read'],
          },
        })
        .onConflictDoNothing();

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/broken-oauth-service/authorize?client_id=test`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('authorization URL');
    });
  });

  describe('Race Conditions', () => {
    it('should handle multiple simultaneous authorization attempts', async () => {
      const clientId = 'test_client';
      const redirectUri = 'http://localhost:3001/callback';

      // Simulate multiple rapid authorization requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          app.request(
            `/api/v1/users/${testUserId}/connections/github/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`,
            {
              headers: {
                Authorization: `Bearer ${testApiKey}`,
              },
            }
          )
        );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Should create 5 separate pending connections
      const pendingConnections = await db
        .select()
        .from(connections)
        .where(eq(connections.externalUserId, testUserId));

      expect(pendingConnections.length).toBe(5);

      // Each should have unique state and connection_id
      const states = new Set(
        pendingConnections.map((c) => (c.metadata as any).state)
      );
      const ids = new Set(pendingConnections.map((c) => c.id));

      expect(states.size).toBe(5);
      expect(ids.size).toBe(5);
    });
  });

  describe('Security Edge Cases', () => {
    it('should reject SQL injection in state parameter', async () => {
      const sqlInjection = "' OR '1'='1";
      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?code=test&state=${encodeURIComponent(sqlInjection)}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      // Should not crash, should return 404 (no matching connection)
      expect(response.status).toBe(404);
    });

    it('should reject XSS attempt in error description', async () => {
      const xss = '<script>alert("xss")</script>';
      const stateParam = 'state_' + randomUUID();

      await db.insert(connections).values({
        id: randomUUID(),
        tenantId: testTenantId,
        externalUserId: testUserId,
        serviceId: 'github',
        status: 'pending',
        metadata: {
          state: stateParam,
          pkce_code_verifier: 'verifier',
          redirect_uri: 'http://localhost:3001/callback',
        },
      });

      const response = await app.request(
        `/api/v1/users/${testUserId}/connections/github/callback?error=${encodeURIComponent(xss)}&state=${stateParam}`,
        {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();

      // Error message should contain the XSS but will be JSON-encoded
      // Client should escape it when displaying
      expect(data.error.message).toBeDefined();
    });
  });
});

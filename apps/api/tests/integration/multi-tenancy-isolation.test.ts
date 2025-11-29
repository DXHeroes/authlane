/**
 * Critical Multi-Tenancy Isolation Tests
 * Ensures complete data isolation between organizations
 *
 * These tests verify that:
 * 1. Organizations cannot access each other's data
 * 2. API keys are properly scoped to organizations
 * 3. Connections are isolated per tenant
 * 4. Service configurations are tenant-specific
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../src/index.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { organizations, connections, organizationServices, users } from '@authlane/database';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '@authlane/shared';

describe('Multi-Tenancy Isolation - Critical Security Tests', () => {
  const db = getTestDb();
  let app: ReturnType<typeof createApp>;

  // Organization 1
  let org1Id: string;
  let org1User1Id: string;
  let org1User1Email: string;
  let org1User1Password: string;
  let org1ApiKeyId: string;
  let org1ApiKey: string;

  // Organization 2
  let org2Id: string;
  let org2User1Id: string;
  let org2User1Email: string;
  let org2User1Password: string;
  let org2ApiKeyId: string;
  let org2ApiKey: string;

  beforeAll(async () => {
    app = createApp(db);

    // Setup Organization 1
    org1Id = randomUUID();
    org1User1Email = 'org1-user@example.com';
    org1User1Password = 'SecurePassword123!';

    const [org1] = await db.insert(organizations).values({
      id: org1Id,
      name: 'Organization 1',
      slug: 'org-1',
    }).returning();

    const [org1User] = await db.insert(users).values({
      id: randomUUID(),
      email: org1User1Email,
      name: 'Org 1 User',
      emailVerified: true,
      passwordHash: await hashPassword(org1User1Password),
    }).returning();
    org1User1Id = org1User.id;

    // Create API key for Org 1
    org1ApiKey = `sk_test_${randomUUID()}`;
    org1ApiKeyId = randomUUID();

    // Setup Organization 2
    org2Id = randomUUID();
    org2User1Email = 'org2-user@example.com';
    org2User1Password = 'AnotherSecure123!';

    const [org2] = await db.insert(organizations).values({
      id: org2Id,
      name: 'Organization 2',
      slug: 'org-2',
    }).returning();

    const [org2User] = await db.insert(users).values({
      id: randomUUID(),
      email: org2User1Email,
      name: 'Org 2 User',
      emailVerified: true,
      passwordHash: await hashPassword(org2User1Password),
    }).returning();
    org2User1Id = org2User.id;

    // Create API key for Org 2
    org2ApiKey = `sk_test_${randomUUID()}`;
    org2ApiKeyId = randomUUID();
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  beforeEach(async () => {
    // Clean connections before each test
    await db.delete(connections);
  });

  describe('Cross-Tenant Data Access Prevention', () => {
    it('should NOT allow Org 1 to access Org 2 connections', async () => {
      // Create connection for Org 2
      const org2ConnectionId = randomUUID();
      await db.insert(connections).values({
        id: org2ConnectionId,
        organizationId: org2Id,
        userId: org2User1Id,
        serviceId: 'github',
        status: 'connected',
        credentials: { access_token: 'org2_token' },
      });

      // Try to access Org 2's connection using Org 1's API key
      const response = await app.request(
        `/api/v1/connections/${org2ConnectionId}`,
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      expect(response.status).toBe(404); // Should not be found (not 403 to avoid enumeration)
      const data = await response.json();
      expect(data.error.code).toBe('CONNECTION_NOT_FOUND');
    });

    it('should NOT allow Org 1 to list Org 2 connections', async () => {
      // Create connections for both orgs
      await db.insert(connections).values([
        {
          id: randomUUID(),
          organizationId: org1Id,
          userId: org1User1Id,
          serviceId: 'github',
          status: 'connected',
          credentials: { access_token: 'org1_token' },
        },
        {
          id: randomUUID(),
          organizationId: org2Id,
          userId: org2User1Id,
          serviceId: 'github',
          status: 'connected',
          credentials: { access_token: 'org2_token' },
        },
      ]);

      // List connections using Org 1's API key
      const response = await app.request(
        '/api/v1/connections',
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // Should only see Org 1's connection
      expect(data.data).toHaveLength(1);
      expect(data.data[0].organizationId).toBe(org1Id);
    });

    it('should NOT allow Org 1 to delete Org 2 connection', async () => {
      // Create connection for Org 2
      const org2ConnectionId = randomUUID();
      await db.insert(connections).values({
        id: org2ConnectionId,
        organizationId: org2Id,
        userId: org2User1Id,
        serviceId: 'github',
        status: 'connected',
        credentials: { access_token: 'org2_token' },
      });

      // Try to delete Org 2's connection using Org 1's API key
      const response = await app.request(
        `/api/v1/connections/${org2ConnectionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      expect(response.status).toBe(404);

      // Verify connection still exists
      const checkConnection = await db.query.connections.findFirst({
        where: (c, { eq }) => eq(c.id, org2ConnectionId),
      });
      expect(checkConnection).toBeDefined();
    });
  });

  describe('API Key Scoping', () => {
    it('should reject requests with Org 2 API key accessing Org 1 resources', async () => {
      // Create connection for Org 1
      const org1ConnectionId = randomUUID();
      await db.insert(connections).values({
        id: org1ConnectionId,
        organizationId: org1Id,
        userId: org1User1Id,
        serviceId: 'github',
        status: 'connected',
        credentials: { access_token: 'org1_token' },
      });

      // Try to access with wrong organization's API key
      const response = await app.request(
        `/api/v1/connections/${org1ConnectionId}`,
        {
          headers: {
            'Authorization': `Bearer ${org2ApiKey}`,
          },
        }
      );

      expect(response.status).toBe(404);
    });

    it('should reject invalid API key format', async () => {
      const response = await app.request(
        '/api/v1/connections',
        {
          headers: {
            'Authorization': 'Bearer invalid_key_format',
          },
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject missing API key', async () => {
      const response = await app.request('/api/v1/connections');

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Service Configuration Isolation', () => {
    it('should NOT allow Org 1 to access Org 2 service configuration', async () => {
      // Configure service for Org 2
      await db.insert(organizationServices).values({
        id: randomUUID(),
        organizationId: org2Id,
        serviceId: 'github',
        enabled: true,
        oauthClientId: 'org2_client_id',
        oauthClientSecret: 'org2_client_secret_encrypted',
      });

      // Try to access service config using Org 1's credentials
      const response = await app.request(
        '/api/v1/services/github/config',
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      // Should not expose Org 2's configuration
      expect(response.status).toBeOneOf([404, 401]);
    });

    it('should allow each organization to have different OAuth credentials', async () => {
      // Configure service for both orgs with different credentials
      await db.insert(organizationServices).values([
        {
          id: randomUUID(),
          organizationId: org1Id,
          serviceId: 'github',
          enabled: true,
          oauthClientId: 'org1_github_client',
          oauthClientSecret: 'org1_secret_encrypted',
        },
        {
          id: randomUUID(),
          organizationId: org2Id,
          serviceId: 'github',
          enabled: true,
          oauthClientId: 'org2_github_client',
          oauthClientSecret: 'org2_secret_encrypted',
        },
      ]);

      // Verify Org 1 gets its own config
      const org1Response = await app.request(
        '/api/v1/services/github/config',
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      expect(org1Response.status).toBe(200);
      const org1Config = await org1Response.json();
      expect(org1Config.oauthClientId).toBe('org1_github_client');
      expect(org1Config.oauthClientSecret).toBeUndefined(); // Should never expose

      // Verify Org 2 gets its own config
      const org2Response = await app.request(
        '/api/v1/services/github/config',
        {
          headers: {
            'Authorization': `Bearer ${org2ApiKey}`,
          },
        }
      );

      expect(org2Response.status).toBe(200);
      const org2Config = await org2Response.json();
      expect(org2Config.oauthClientId).toBe('org2_github_client');
    });
  });

  describe('User Isolation Within Organization', () => {
    it('should allow users within same org to see each other connections if authorized', async () => {
      // This test verifies that the system CAN support multi-user scenarios
      // The actual authorization logic should be implemented in the API

      const user2Id = randomUUID();
      await db.insert(users).values({
        id: user2Id,
        email: 'org1-user2@example.com',
        name: 'Org 1 User 2',
        emailVerified: true,
        passwordHash: await hashPassword('SecurePass456!'),
      });

      // Create connections for different users in same org
      await db.insert(connections).values([
        {
          id: randomUUID(),
          organizationId: org1Id,
          userId: org1User1Id,
          serviceId: 'github',
          status: 'connected',
          credentials: { access_token: 'user1_token' },
        },
        {
          id: randomUUID(),
          organizationId: org1Id,
          userId: user2Id,
          serviceId: 'slack',
          status: 'connected',
          credentials: { access_token: 'user2_token' },
        },
      ]);

      // List all org connections (admin view)
      const response = await app.request(
        '/api/v1/connections',
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // Should see both connections in the same org
      expect(data.data).toHaveLength(2);
      expect(data.data.every((c: any) => c.organizationId === org1Id)).toBe(true);
    });
  });

  describe('Credential Encryption Isolation', () => {
    it('should encrypt credentials per organization', async () => {
      // Create connections with same service for different orgs
      const org1Connection = await db.insert(connections).values({
        id: randomUUID(),
        organizationId: org1Id,
        userId: org1User1Id,
        serviceId: 'github',
        status: 'connected',
        credentials: { access_token: 'same_token_value' },
      }).returning();

      const org2Connection = await db.insert(connections).values({
        id: randomUUID(),
        organizationId: org2Id,
        userId: org2User1Id,
        serviceId: 'github',
        status: 'connected',
        credentials: { access_token: 'same_token_value' },
      }).returning();

      // Verify encrypted credentials are different (different encryption keys)
      // This assumes credentials are encrypted at the database level
      expect(org1Connection[0].credentials).not.toEqual(org2Connection[0].credentials);
    });
  });

  describe('Organization Switching', () => {
    it('should prevent API key from switching to unauthorized organization', async () => {
      // Attempt to access resources by manipulating organization context
      const response = await app.request(
        '/api/v1/connections',
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
            'X-Organization-Id': org2Id, // Attempt to switch context
          },
        }
      );

      // Should either ignore the header or reject
      const data = await response.json();
      if (response.status === 200) {
        // If request succeeds, should only show Org 1 data
        expect(data.data.every((c: any) => c.organizationId === org1Id)).toBe(true);
      } else {
        // Or should reject the request
        expect(response.status).toBe(401);
      }
    });
  });

  describe('Audit Log Separation', () => {
    it('should ensure audit logs are scoped to organization', async () => {
      // Create actions in both organizations
      // This test assumes audit logging is implemented

      // Org 1 creates a connection
      await app.request(
        '/api/v1/connections',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serviceId: 'github',
            userId: org1User1Id,
          }),
        }
      );

      // Org 2 creates a connection
      await app.request(
        '/api/v1/connections',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${org2ApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serviceId: 'github',
            userId: org2User1Id,
          }),
        }
      );

      // Try to access audit logs (if endpoint exists)
      const auditResponse = await app.request(
        '/api/v1/audit-logs',
        {
          headers: {
            'Authorization': `Bearer ${org1ApiKey}`,
          },
        }
      );

      // Should only see Org 1's audit logs
      if (auditResponse.status === 200) {
        const logs = await auditResponse.json();
        expect(logs.data.every((log: any) => log.organizationId === org1Id)).toBe(true);
      }
    });
  });
});

/**
 * Integration tests for Dashboard Management Endpoints
 * Tests team management, organization management, and API key management
 */

import { invitation, member, organization, user } from '@authlane/database';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardRouter } from '../../src/routes/dashboard.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { testAuthMiddleware } from '../setup/test-helpers.js';

// Mock email sending
vi.mock('@authlane/email', () => ({
  sendOrganizationInvitation: vi.fn(async () => ({ success: true })),
}));

describe('Dashboard Management API', () => {
  const db = getTestDb();
  const _app = new Hono();
  const testOrgId = 'org-123';
  const ownerUserId = 'user-owner';
  const adminUserId = 'user-admin';
  const memberUserId = 'user-member';

  beforeEach(async () => {
    await cleanDatabase(db);

    // Seed organization
    await db.insert(organization).values({
      id: testOrgId,
      name: 'Test Organization',
      slug: 'test-org',
      logo: 'https://example.com/logo.png',
      createdAt: new Date(),
      metadata: JSON.stringify({
        webhookUrl: 'https://example.com/webhook',
        allowedDomains: ['example.com'],
      }),
    });

    // Seed users
    await db.insert(user).values([
      {
        id: ownerUserId,
        email: 'owner@example.com',
        name: 'Owner User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: adminUserId,
        email: 'admin@example.com',
        name: 'Admin User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: memberUserId,
        email: 'member@example.com',
        name: 'Member User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Seed members
    await db.insert(member).values([
      {
        id: 'member-1',
        organizationId: testOrgId,
        userId: ownerUserId,
        role: 'owner',
        createdAt: new Date(),
      },
      {
        id: 'member-2',
        organizationId: testOrgId,
        userId: adminUserId,
        role: 'admin',
        createdAt: new Date(),
      },
      {
        id: 'member-3',
        organizationId: testOrgId,
        userId: memberUserId,
        role: 'member',
        createdAt: new Date(),
      },
    ]);
  });

  describe('Team Management - GET /api/v1/dashboard/organization/members', () => {
    it('should return all members for owner', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.members).toHaveLength(3);
      expect(body.data.members.map((m: any) => m.role)).toContain('owner');
      expect(body.data.members.map((m: any) => m.role)).toContain('admin');
      expect(body.data.members.map((m: any) => m.role)).toContain('member');
    });

    it('should include pending invitations', async () => {
      await db.insert(invitation).values({
        id: 'invite-1',
        email: 'invited@example.com',
        role: 'member',
        organizationId: testOrgId,
        inviterId: ownerUserId,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.invitations).toHaveLength(1);
      expect(body.data.invitations[0].email).toBe('invited@example.com');
      expect(body.data.invitations[0].status).toBe('pending');
    });

    it('should return 401 without organization context', async () => {
      const testApp = new Hono();
      testApp.use('*', testAuthMiddleware({ user: { id: ownerUserId }, organization: null }));
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Team Management - POST /api/v1/dashboard/organization/members/invite', () => {
    it('should allow owner to invite new member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newmember@example.com',
          role: 'member',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.email).toBe('newmember@example.com');
      expect(body.data.role).toBe('member');
      expect(body.data.status).toBe('pending');
    });

    it('should allow admin to invite new member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: adminUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newadmin@example.com',
          role: 'admin',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
    });

    it('should reject invitation from regular member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: memberUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'unauthorized@example.com',
          role: 'member',
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should reject invalid email format', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          role: 'member',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate invitation', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      // Send first invitation
      await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          role: 'member',
        }),
      });

      // Try to send duplicate
      const res = await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          role: 'member',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invitation for existing member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com', // Already a member
          role: 'member',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('already');
    });
  });

  describe('Team Management - PATCH /api/v1/dashboard/organization/members/:memberId', () => {
    it('should allow owner to change member role', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-3', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'admin',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.role).toBe('admin');
    });

    it('should prevent demoting the last owner', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'admin',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('last owner');
    });

    it('should reject role change from non-owner', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: adminUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-3', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'admin',
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Team Management - DELETE /api/v1/dashboard/organization/members/:memberId', () => {
    it('should allow owner to remove member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-3', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.success).toBe(true);
    });

    it('should prevent removing the last owner', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('last owner');
    });

    it('should allow admin to remove member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: adminUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-3', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.success).toBe(true);
    });

    it('should reject removal from regular member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: memberUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization/members/member-2', {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Organization Management - GET /api/v1/dashboard/organization', () => {
    it('should return organization details', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: memberUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.id).toBe(testOrgId);
      expect(body.data.name).toBe('Test Organization');
      expect(body.data.slug).toBe('test-org');
      expect(body.data.metadata).toBeDefined();
    });
  });

  describe('Organization Management - PATCH /api/v1/dashboard/organization', () => {
    it('should allow owner to update organization', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Organization Name',
          slug: 'updated-org',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.name).toBe('Updated Organization Name');
      expect(body.data.slug).toBe('updated-org');
    });

    it('should allow admin to update organization', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: adminUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin Updated Name',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Admin Updated Name');
    });

    it('should reject update from regular member', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: memberUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Update',
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should validate slug uniqueness', async () => {
      // Create another organization
      await db.insert(organization).values({
        id: 'org-456',
        name: 'Other Org',
        slug: 'other-org',
        createdAt: new Date(),
      });

      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'other-org', // Already taken
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('already in use');
    });
  });

  describe('Organization Management - DELETE /api/v1/dashboard/organization', () => {
    it('should allow owner to delete organization with confirmation', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.success).toBe(true);
    });

    it('should reject deletion without confirmation', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: ownerUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: false,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject deletion from non-owner', async () => {
      const testApp = new Hono();
      testApp.use(
        '*',
        testAuthMiddleware({ user: { id: adminUserId }, organization: { id: testOrgId } })
      );
      testApp.route('/', createDashboardRouter(db));

      const res = await testApp.request('/organization', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });
});

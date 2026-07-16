/**
 * Dashboard-specific routes
 * These routes are for the admin dashboard and use organization context from auth
 */

import { randomBytes } from 'node:crypto';
import { encrypt, getEncryptionKey } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import {
  and,
  apiKeys,
  connections,
  count,
  countDistinct,
  desc,
  eq,
  invitation,
  member,
  organization,
  organizationServices,
  services,
  sql,
  user,
} from '@authlane/database';
import { Errors, hashApiKey } from '@authlane/shared';
import { Hono } from 'hono';
import { API_SCOPES, normalizeApiScopes } from '../lib/api-principal.js';
import type { CacheStore } from '../lib/cache.js';
import { createInvitation, validateNotLastOwner } from '../lib/invitations.js';
import { createPaginatedResponse, parsePaginationParams } from '../lib/pagination.js';

// Types for settings stored in organization.metadata JSONB
interface OrganizationSettings {
  webhookUrl?: string;
  webhookSecret?: string;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  customDomain?: string;
  updatedAt?: string;
}

export function createDashboardRouter(db: Database, cache?: CacheStore) {
  const router = new Hono();

  /**
   * GET /api/v1/dashboard/stats
   * Returns dashboard statistics for the authenticated user's organization
   */
  router.get('/stats', async (c) => {
    try {
      const org = c.get('organization');
      const user = c.get('user');

      if (!org && !user) {
        return c.json(Errors.unauthorized('Authentication required'), 401);
      }

      // Build filter condition based on available context
      const orgId = org?.id;

      if (!orgId) {
        return c.json(Errors.unauthorized('Select an organization first'), 401);
      }
      const connectionsFilter = eq(connections.organizationId, orgId);

      const [connectionsCount] = await db
        .select({ count: count() })
        .from(connections)
        .where(connectionsFilter);

      // Count unique external users with connections
      const [usersCount] = await db
        .select({ count: countDistinct(connections.externalUserId) })
        .from(connections)
        .where(connectionsFilter);

      // Count enabled services for organization
      let enabledServicesCount = { count: 0 };
      if (orgId) {
        const [count_] = await db
          .select({ count: count() })
          .from(organizationServices)
          .where(
            and(
              eq(organizationServices.organizationId, orgId),
              eq(organizationServices.enabled, true)
            )
          );
        enabledServicesCount = count_ || { count: 0 };
      }

      // Count total services
      const [totalServicesCount] = await db
        .select({ count: count() })
        .from(services)
        .where(eq(services.enabled, true));

      return c.json({
        data: {
          totalConnections: connectionsCount?.count ?? 0,
          activeUsers: usersCount?.count ?? 0,
          apiCalls7Days: 0, // TODO: Implement API call tracking
          services: {
            enabled: enabledServicesCount?.count ?? 0,
            total: totalServicesCount?.count ?? 0,
          },
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to get dashboard stats:', error);
      return c.json(Errors.internalError('Failed to retrieve dashboard stats'), 500);
    }
  });

  /**
   * GET /api/v1/connections
   * Returns connections for the authenticated user/organization (dashboard view)
   * Query params: ?limit=20&offset=0&status=connected&serviceId=github
   */
  router.get('/connections', async (c) => {
    try {
      const org = c.get('organization');
      const user = c.get('user');

      if (!org && !user) {
        return c.json(Errors.unauthorized('Authentication required'), 401);
      }

      // Parse pagination parameters
      const limitParam = parseInt(c.req.query('limit') || '20', 10);
      const offsetParam = parseInt(c.req.query('offset') || '0', 10);
      const { limit, offset } = parsePaginationParams(limitParam, offsetParam, 100, 20);

      // Parse filter parameters
      const statusFilter = c.req.query('status'); // connected, expired, error
      const serviceIdFilter = c.req.query('serviceId'); // e.g., github, slack

      // Validate status filter if provided
      const validStatuses = ['connected', 'expired', 'error', 'pending'] as const;
      if (statusFilter && !validStatuses.includes(statusFilter as never)) {
        return c.json(
          Errors.validationError(
            'Invalid status filter',
            `Status must be one of: ${validStatuses.join(', ')}`
          ),
          400
        );
      }

      const orgId = org?.id;

      if (!orgId) {
        return c.json(Errors.unauthorized('Select an organization first'), 401);
      }
      const baseFilter = eq(connections.organizationId, orgId);

      // Build additional filters
      const filters = [baseFilter];

      if (statusFilter) {
        filters.push(
          eq(connections.status, statusFilter as 'connected' | 'expired' | 'error' | 'pending')
        );
      }

      if (serviceIdFilter) {
        filters.push(eq(connections.serviceId, serviceIdFilter));
      }

      const whereClause = filters.length > 1 ? and(...filters) : filters[0];

      // Get total count for pagination metadata
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(connections)
        .where(whereClause);

      const totalCount = countResult[0]?.count ?? 0;

      // Get paginated connections
      const userConnections = await db
        .select()
        .from(connections)
        .where(whereClause)
        .orderBy(desc(connections.connectedAt))
        .limit(limit)
        .offset(offset);

      // Map to the format expected by dashboard
      const formattedConnections = userConnections.map((conn) => ({
        id: conn.id,
        organizationId: conn.organizationId,
        serviceId: conn.serviceId,
        externalUserId: conn.externalUserId,
        status:
          conn.status === 'connected' ? 'active' : conn.status === 'expired' ? 'expired' : 'error',
        createdAt: conn.connectedAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: conn.connectedAt?.toISOString() ?? new Date().toISOString(),
      }));

      return c.json(createPaginatedResponse(formattedConnections, totalCount, limit, offset));
    } catch (error) {
      console.error('Failed to get connections:', error);
      return c.json(Errors.internalError('Failed to retrieve connections'), 500);
    }
  });

  /**
   * GET /api/v1/api-keys
   * Returns API keys for the authenticated organization
   */
  router.get('/api-keys', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const keys = await db.select().from(apiKeys).where(eq(apiKeys.organizationId, org.id));
      const formattedKeys = keys.map((key) => ({
        id: key.id,
        organizationId: org.id,
        name: key.name,
        keyPrefix: key.keyHint,
        scopes: key.scopes,
        enabled: key.enabled,
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: key.lastUsedAt?.toISOString(),
        expiresAt: key.expiresAt?.toISOString(),
      }));

      return c.json({
        data: formattedKeys,
        error: null,
      });
    } catch (error) {
      console.error('Failed to get API keys:', error);
      return c.json(Errors.internalError('Failed to retrieve API keys'), 500);
    }
  });

  /**
   * POST /api/v1/api-keys
   * Creates a new API key for the authenticated organization
   */
  router.post('/api-keys', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const body = await c.req.json();
      const { name, scopes, expiresAt, expiresInDays } = body as {
        name?: string;
        scopes?: unknown;
        expiresAt?: string;
        expiresInDays?: number;
      };

      if (!name || typeof name !== 'string' || name.length < 1) {
        return c.json(Errors.validationError('API key name is required'), 400);
      }

      const normalizedScopes = scopes === undefined ? [...API_SCOPES] : normalizeApiScopes(scopes);
      if (scopes !== undefined && normalizedScopes.length !== (scopes as unknown[]).length) {
        return c.json(Errors.validationError('One or more API key scopes are invalid'), 400);
      }
      const rawKey = `ak_${randomBytes(32).toString('base64url')}`;
      const keyPrefix = rawKey.substring(0, 10);
      const calculatedExpiry = expiresAt
        ? new Date(expiresAt)
        : expiresInDays
          ? new Date(Date.now() + expiresInDays * 86_400_000)
          : null;
      if (calculatedExpiry && Number.isNaN(calculatedExpiry.getTime())) {
        return c.json(Errors.validationError('Invalid API key expiration'), 400);
      }
      const [created] = await db
        .insert(apiKeys)
        .values({
          organizationId: org.id,
          name,
          keyHash: hashApiKey(rawKey),
          keyHint: keyPrefix,
          scopes: normalizedScopes,
          expiresAt: calculatedExpiry,
        })
        .returning();

      return c.json({
        data: {
          id: created?.id,
          organizationId: org.id,
          name: created?.name,
          keyPrefix,
          key: rawKey,
          scopes: created?.scopes,
          enabled: created?.enabled,
          createdAt: created?.createdAt.toISOString(),
          expiresAt: created?.expiresAt?.toISOString(),
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to create API key:', error);
      return c.json(Errors.internalError('Failed to create API key'), 500);
    }
  });

  /**
   * PATCH /api/v1/api-keys/:id
   * Updates an API key's properties (name, scopes, enabled, expiresAt)
   * Note: Cannot update keyHash for security reasons
   */
  router.patch('/api-keys/:id', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const keyId = c.req.param('id');

      // Parse request body
      let body: {
        name?: string;
        scopes?: string[];
        enabled?: boolean;
        expiresAt?: string | null;
      };

      try {
        body = await c.req.json();
      } catch {
        return c.json(
          Errors.validationError('Invalid JSON body', 'Request body must be valid JSON'),
          400
        );
      }

      // Validate at least one field is being updated
      if (
        body.name === undefined &&
        body.scopes === undefined &&
        body.enabled === undefined &&
        body.expiresAt === undefined
      ) {
        return c.json(
          Errors.validationError(
            'No fields to update',
            'At least one of: name, scopes, enabled, expiresAt must be provided'
          ),
          400
        );
      }

      // Validate scopes if provided
      if (body.scopes && !Array.isArray(body.scopes)) {
        return c.json(
          Errors.validationError('Invalid scopes', 'Scopes must be an array of strings'),
          400
        );
      }

      // Validate expiresAt if provided
      if (body.expiresAt && Number.isNaN(Date.parse(body.expiresAt))) {
        return c.json(
          Errors.validationError('Invalid expiresAt', 'expiresAt must be a valid ISO 8601 date'),
          400
        );
      }

      const [currentKey] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, org.id)))
        .limit(1);
      if (!currentKey) {
        return c.json(Errors.notFound('API Key', keyId), 404);
      }
      const normalizedScopes = body.scopes ? normalizeApiScopes(body.scopes) : undefined;
      if (body.scopes && normalizedScopes?.length !== body.scopes.length) {
        return c.json(Errors.validationError('One or more API key scopes are invalid'), 400);
      }
      const [updatedKey] = await db
        .update(apiKeys)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(normalizedScopes ? { scopes: normalizedScopes } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.expiresAt !== undefined
            ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, org.id)))
        .returning();
      await cache?.delete(`control-plane:principal:${currentKey.keyHash}`);

      return c.json({
        data: updatedKey
          ? {
              ...updatedKey,
              keyHash: undefined,
              keyPrefix: updatedKey.keyHint,
            }
          : null,
        error: null,
      });
    } catch (error) {
      console.error('Failed to update API key:', error);
      return c.json(Errors.internalError('Failed to update API key'), 500);
    }
  });

  /**
   * DELETE /api/v1/api-keys/:id
   * Revokes an API key
   */
  router.delete('/api-keys/:id', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const keyId = c.req.param('id');
      const [deleted] = await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, org.id)))
        .returning({ keyHash: apiKeys.keyHash });
      if (!deleted) {
        return c.json(Errors.notFound('API Key', keyId), 404);
      }
      await cache?.delete(`control-plane:principal:${deleted.keyHash}`);

      return c.json({
        data: { success: true },
        error: null,
      });
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      return c.json(Errors.internalError('Failed to revoke API key'), 500);
    }
  });

  /**
   * GET /api/v1/settings
   * Returns organization settings
   */
  router.get('/settings', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const settings = parseSettings(org.metadata);

      return c.json({
        data: {
          organizationId: org.id,
          webhookUrl: settings.webhookUrl,
          webhookSecret: settings.webhookSecret,
          rateLimit: settings.rateLimit || {
            requestsPerMinute: 60,
            requestsPerHour: 3600,
            requestsPerDay: 86400,
          },
          customDomain: settings.customDomain,
          updatedAt: settings.updatedAt || org.createdAt.toISOString(),
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to get settings:', error);
      return c.json(Errors.internalError('Failed to retrieve settings'), 500);
    }
  });

  /**
   * PUT /api/v1/settings
   * Updates organization settings
   */
  router.put('/settings', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const body = await c.req.json();
      const { webhookUrl, webhookSecret, rateLimit, customDomain } = body;

      const settings = parseSettings(org.metadata);

      // Update settings
      const updatedSettings: OrganizationSettings = {
        ...settings,
        webhookUrl: webhookUrl !== undefined ? webhookUrl : settings.webhookUrl,
        webhookSecret: webhookSecret !== undefined ? webhookSecret : settings.webhookSecret,
        rateLimit: rateLimit || settings.rateLimit,
        customDomain: customDomain !== undefined ? customDomain : settings.customDomain,
        updatedAt: new Date().toISOString(),
      };

      await db
        .update(organization)
        .set({ metadata: JSON.stringify(updatedSettings) })
        .where(eq(organization.id, org.id));

      return c.json({
        data: {
          organizationId: org.id,
          webhookUrl: updatedSettings.webhookUrl,
          webhookSecret: updatedSettings.webhookSecret,
          rateLimit: updatedSettings.rateLimit || {
            requestsPerMinute: 60,
            requestsPerHour: 3600,
            requestsPerDay: 86400,
          },
          customDomain: updatedSettings.customDomain,
          updatedAt: updatedSettings.updatedAt,
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to update settings:', error);
      return c.json(Errors.internalError('Failed to update settings'), 500);
    }
  });

  // ============================================
  // Organization Services Endpoints
  // ============================================

  /**
   * GET /api/v1/organization/services
   * Returns all organization-specific service configurations
   */
  router.get('/organization/services', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const orgServicesList = await db
        .select()
        .from(organizationServices)
        .where(eq(organizationServices.organizationId, org.id));

      return c.json({
        data: orgServicesList.map((os) => ({
          organizationId: os.organizationId,
          serviceId: os.serviceId,
          enabled: os.enabled,
          customClientId: os.oauthClientId,
          // Never return secrets
          apiKey: os.apiKeyEnc ? '********' : undefined,
          createdAt: os.createdAt?.toISOString(),
          updatedAt: os.updatedAt?.toISOString(),
        })),
        error: null,
      });
    } catch (error) {
      console.error('Failed to get organization services:', error);
      return c.json(Errors.internalError('Failed to retrieve organization services'), 500);
    }
  });

  /**
   * GET /api/v1/organization/services/:serviceId
   * Returns a specific organization service configuration
   */
  router.get('/organization/services/:serviceId', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const serviceId = c.req.param('serviceId');

      const [orgService] = await db
        .select()
        .from(organizationServices)
        .where(
          and(
            eq(organizationServices.organizationId, org.id),
            eq(organizationServices.serviceId, serviceId)
          )
        )
        .limit(1);

      if (!orgService) {
        // Return empty config if not yet configured
        return c.json({
          data: {
            organizationId: org.id,
            serviceId,
            enabled: false,
          },
          error: null,
        });
      }

      return c.json({
        data: {
          organizationId: orgService.organizationId,
          serviceId: orgService.serviceId,
          enabled: orgService.enabled,
          customClientId: orgService.oauthClientId,
          // Indicate if API key is set without revealing it
          apiKey: orgService.apiKeyEnc ? '********' : undefined,
          createdAt: orgService.createdAt?.toISOString(),
          updatedAt: orgService.updatedAt?.toISOString(),
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to get organization service:', error);
      return c.json(Errors.internalError('Failed to retrieve organization service'), 500);
    }
  });

  /**
   * PUT /api/v1/organization/services/:serviceId
   * Enable or disable a service for the organization
   */
  router.put('/organization/services/:serviceId', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const serviceId = c.req.param('serviceId');
      const body = await c.req.json();
      const { enabled } = body;

      if (typeof enabled !== 'boolean') {
        return c.json(Errors.validationError('enabled must be a boolean'), 400);
      }

      // Upsert the organization service
      await db
        .insert(organizationServices)
        .values({
          organizationId: org.id,
          serviceId,
          enabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [organizationServices.organizationId, organizationServices.serviceId],
          set: {
            enabled,
            updatedAt: new Date(),
          },
        });
      await cache?.delete(`control-plane:tenant-services:${org.id}`);

      return c.json({
        data: { success: true, enabled },
        error: null,
      });
    } catch (error) {
      console.error('Failed to update organization service:', error);
      return c.json(Errors.internalError('Failed to update organization service'), 500);
    }
  });

  /**
   * PUT /api/v1/organization/services/:serviceId/config
   * Update OAuth credentials or API key for a service
   */
  router.put('/organization/services/:serviceId/config', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const serviceId = c.req.param('serviceId');
      const body = await c.req.json();
      const { customClientId, customClientSecret, apiKey } = body;
      const encryptionKey = getEncryptionKey();
      const encryptedClientSecret = customClientSecret
        ? encrypt(customClientSecret, encryptionKey)
        : null;
      const encryptedApiKey = apiKey ? encrypt(apiKey, encryptionKey) : null;

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (customClientId !== undefined) {
        updateData.oauthClientId = customClientId || null;
      }

      if (customClientSecret) {
        updateData.oauthClientSecretEnc = encryptedClientSecret;
      }

      if (apiKey) {
        updateData.apiKeyEnc = encryptedApiKey;
      }

      // Upsert the organization service
      await db
        .insert(organizationServices)
        .values({
          organizationId: org.id,
          serviceId,
          enabled: true,
          oauthClientId: customClientId || null,
          oauthClientSecretEnc: encryptedClientSecret,
          apiKeyEnc: encryptedApiKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [organizationServices.organizationId, organizationServices.serviceId],
          set: updateData,
        });
      await cache?.delete(`control-plane:tenant-services:${org.id}`);

      return c.json({
        data: { success: true },
        error: null,
      });
    } catch (error) {
      console.error('Failed to update organization service config:', error);
      return c.json(Errors.internalError('Failed to update service configuration'), 500);
    }
  });

  /**
   * GET /api/v1/dashboard/organization/members
   * List all members and pending invitations for the organization
   */
  router.get('/organization/members', async (c) => {
    try {
      const org = c.get('organization');

      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Get all members with user details
      const members = await db
        .select({
          id: member.id,
          userId: member.userId,
          role: member.role,
          createdAt: member.createdAt,
          userName: user.name,
          userEmail: user.email,
          userImage: user.image,
        })
        .from(member)
        .leftJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, org.id));

      // Get all pending invitations
      const invitations = await db
        .select()
        .from(invitation)
        .where(and(eq(invitation.organizationId, org.id), eq(invitation.status, 'pending')));

      // Filter out expired invitations
      const now = new Date();
      const pendingInvitations = invitations.filter((inv) => new Date(inv.expiresAt) > now);

      return c.json({
        data: {
          members,
          invitations: pendingInvitations,
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch organization members:', error);
      return c.json(Errors.internalError('Failed to fetch members'), 500);
    }
  });

  /**
   * POST /api/v1/dashboard/organization/members/invite
   * Invite a new member to the organization
   */
  router.post('/organization/members/invite', async (c) => {
    try {
      const org = c.get('organization');
      const currentUser = c.get('user');

      if (!org || !currentUser) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Check if user has admin or owner role
      const [currentMember] = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, currentUser.id)))
        .limit(1);

      if (!currentMember || (currentMember.role !== 'admin' && currentMember.role !== 'owner')) {
        return c.json(Errors.unauthorized('Only admins and owners can invite members'), 403);
      }

      // Parse request body
      const body = await c.req.json<{ email: string; role: string }>();
      const { email, role } = body;

      if (!email || !role) {
        return c.json(
          Errors.validationError('Missing required fields', 'email and role are required'),
          400
        );
      }

      // Create invitation
      const result = await createInvitation(email, role, org.id, org.name, currentUser.id, db);

      if (result.error) {
        const statusCode = result.error.code === 'VALIDATION_ERROR' ? 400 : 500;
        return c.json(result, statusCode);
      }

      return c.json(result, 201);
    } catch (error) {
      console.error('Failed to create invitation:', error);
      return c.json(Errors.internalError('Failed to create invitation'), 500);
    }
  });

  /**
   * PATCH /api/v1/dashboard/organization/members/:memberId
   * Update a member's role
   */
  router.patch('/organization/members/:memberId', async (c) => {
    try {
      const org = c.get('organization');
      const currentUser = c.get('user');
      const memberId = c.req.param('memberId');

      if (!org || !currentUser) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Check if current user is owner (only owners can update roles)
      const [currentMember] = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, currentUser.id)))
        .limit(1);

      if (!currentMember || currentMember.role !== 'owner') {
        return c.json(Errors.unauthorized('Only owners can update member roles'), 403);
      }

      // Parse request body
      const body = await c.req.json<{ role: string }>();
      const { role } = body;

      if (!role) {
        return c.json(Errors.validationError('Missing required field', 'role is required'), 400);
      }

      // Validate role
      const validRoles = ['owner', 'admin', 'member'];
      if (!validRoles.includes(role)) {
        return c.json(
          Errors.validationError('Invalid role', `Role must be one of: ${validRoles.join(', ')}`),
          400
        );
      }

      // If demoting an owner, check not last owner
      if (role !== 'owner') {
        const validation = await validateNotLastOwner(org.id, memberId, db);
        if (validation.error) {
          return c.json(validation, 400);
        }
      }

      // Update member role
      const [updatedMember] = await db
        .update(member)
        .set({ role })
        .where(and(eq(member.id, memberId), eq(member.organizationId, org.id)))
        .returning();

      if (!updatedMember) {
        return c.json(Errors.notFound('Member', memberId), 404);
      }

      return c.json({
        data: updatedMember,
        error: null,
      });
    } catch (error) {
      console.error('Failed to update member:', error);
      return c.json(Errors.internalError('Failed to update member'), 500);
    }
  });

  /**
   * DELETE /api/v1/dashboard/organization/members/:memberId
   * Remove a member from the organization
   */
  router.delete('/organization/members/:memberId', async (c) => {
    try {
      const org = c.get('organization');
      const currentUser = c.get('user');
      const memberId = c.req.param('memberId');

      if (!org || !currentUser) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Check if current user has admin or owner role
      const [currentMember] = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, currentUser.id)))
        .limit(1);

      if (!currentMember || (currentMember.role !== 'admin' && currentMember.role !== 'owner')) {
        return c.json(Errors.unauthorized('Only admins and owners can remove members'), 403);
      }

      // Validate not removing last owner
      const validation = await validateNotLastOwner(org.id, memberId, db);
      if (validation.error) {
        return c.json(validation, 400);
      }

      // Delete member (soft delete by setting deletedAt)
      // For now, we'll do a hard delete since there's no deletedAt field
      const [deletedMember] = await db
        .delete(member)
        .where(and(eq(member.id, memberId), eq(member.organizationId, org.id)))
        .returning();

      if (!deletedMember) {
        return c.json(Errors.notFound('Member', memberId), 404);
      }

      return c.json({
        data: { success: true },
        error: null,
      });
    } catch (error) {
      console.error('Failed to remove member:', error);
      return c.json(Errors.internalError('Failed to remove member'), 500);
    }
  });

  /**
   * GET /api/v1/dashboard/organization
   * Get organization details including metadata
   */
  router.get('/organization', async (c) => {
    try {
      const org = c.get('organization');

      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Get full organization details
      const [orgDetails] = await db
        .select()
        .from(organization)
        .where(eq(organization.id, org.id))
        .limit(1);

      if (!orgDetails) {
        return c.json(Errors.notFound('Organization', org.id), 404);
      }

      // Parse metadata
      const settings = parseSettings(orgDetails.metadata);

      return c.json({
        data: {
          id: orgDetails.id,
          name: orgDetails.name,
          slug: orgDetails.slug,
          logo: orgDetails.logo,
          createdAt: orgDetails.createdAt,
          settings,
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      return c.json(Errors.internalError('Failed to fetch organization'), 500);
    }
  });

  /**
   * PATCH /api/v1/dashboard/organization
   * Update organization details (name, slug, logo, metadata)
   */
  router.patch('/organization', async (c) => {
    try {
      const org = c.get('organization');
      const currentUser = c.get('user');

      if (!org || !currentUser) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Check if user has admin or owner role
      const [currentMember] = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, currentUser.id)))
        .limit(1);

      if (!currentMember || (currentMember.role !== 'admin' && currentMember.role !== 'owner')) {
        return c.json(Errors.unauthorized('Only admins and owners can update organization'), 403);
      }

      // Parse request body
      const body = await c.req.json<{
        name?: string;
        slug?: string;
        logo?: string;
        metadata?: Record<string, unknown>;
      }>();

      const updateData: Record<string, unknown> = {};

      if (body.name) {
        updateData.name = body.name;
      }

      if (body.slug) {
        // Validate slug format (alphanumeric and hyphens only)
        if (!/^[a-z0-9-]+$/.test(body.slug)) {
          return c.json(
            Errors.validationError(
              'Invalid slug format',
              'Slug must contain only lowercase letters, numbers, and hyphens'
            ),
            400
          );
        }

        // Check slug uniqueness
        const [existingOrg] = await db
          .select()
          .from(organization)
          .where(eq(organization.slug, body.slug))
          .limit(1);

        if (existingOrg && existingOrg.id !== org.id) {
          return c.json(
            Errors.validationError('Slug already taken', 'This slug is already in use'),
            400
          );
        }

        updateData.slug = body.slug;
      }

      if (body.logo !== undefined) {
        updateData.logo = body.logo;
      }

      if (body.metadata) {
        // Merge with existing metadata
        const [currentOrg] = await db
          .select()
          .from(organization)
          .where(eq(organization.id, org.id))
          .limit(1);

        const currentSettings = currentOrg ? parseSettings(currentOrg.metadata) : {};
        const mergedSettings = { ...currentSettings, ...body.metadata };
        updateData.metadata = JSON.stringify(mergedSettings);
      }

      // Update organization
      const [updatedOrg] = await db
        .update(organization)
        .set(updateData)
        .where(eq(organization.id, org.id))
        .returning();

      if (!updatedOrg) {
        return c.json(Errors.internalError('Failed to update organization'), 500);
      }

      return c.json({
        data: {
          id: updatedOrg.id,
          name: updatedOrg.name,
          slug: updatedOrg.slug,
          logo: updatedOrg.logo,
          createdAt: updatedOrg.createdAt,
          settings: parseSettings(updatedOrg.metadata),
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to update organization:', error);
      return c.json(Errors.internalError('Failed to update organization'), 500);
    }
  });

  /**
   * DELETE /api/v1/dashboard/organization
   * Delete organization (requires confirmation and owner role)
   */
  router.delete('/organization', async (c) => {
    try {
      const org = c.get('organization');
      const currentUser = c.get('user');

      if (!org || !currentUser) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      // Check if user is owner
      const [currentMember] = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, currentUser.id)))
        .limit(1);

      if (!currentMember || currentMember.role !== 'owner') {
        return c.json(Errors.unauthorized('Only owners can delete organization'), 403);
      }

      // Parse request body for confirmation
      const body = await c.req.json<{ confirm?: boolean }>();

      if (!body.confirm) {
        return c.json(
          Errors.validationError(
            'Confirmation required',
            'You must set confirm: true to delete the organization'
          ),
          400
        );
      }

      // Delete organization (cascade will delete related data)
      // Note: PostgreSQL foreign key CASCADE will handle:
      // - members
      // - invitations
      // - connections
      // - organization_services
      await db.delete(organization).where(eq(organization.id, org.id));

      // TODO: Send email notification to all members
      // TODO: Cancel any active subscriptions
      // TODO: Archive organization data for compliance

      return c.json({
        data: { success: true, message: 'Organization deleted successfully' },
        error: null,
      });
    } catch (error) {
      console.error('Failed to delete organization:', error);
      return c.json(Errors.internalError('Failed to delete organization'), 500);
    }
  });

  return router;
}

/**
 * Helper to parse organization metadata JSON
 */
function parseSettings(metadata: string | null): OrganizationSettings {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as OrganizationSettings;
  } catch {
    return {};
  }
}

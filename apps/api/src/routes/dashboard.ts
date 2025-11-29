/**
 * Dashboard-specific routes
 * These routes are for the admin dashboard and use organization context from auth
 */

import { randomUUID } from 'node:crypto';
import type { Database } from '@authlane/database';
import { connections, organization, organizationServices, services, and, count, countDistinct, desc, eq, or } from '@authlane/database';
import { Errors, hashApiKey } from '@authlane/shared';
import { Hono } from 'hono';

// Types for settings stored in organization.metadata JSONB
interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

interface OrganizationSettings {
  apiKeys?: ApiKeyEntry[];
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

export function createDashboardRouter(db: Database) {
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
      const userId = user?.id;
      const orgId = org?.id;

      // Count connections (either user-scoped or org-scoped)
      const connectionsFilter = orgId 
        ? or(
            and(eq(connections.scope, 'organization'), eq(connections.organizationId, orgId)),
            and(eq(connections.scope, 'user'), eq(connections.userId, userId || ''))
          )
        : eq(connections.userId, userId || '');

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
          .where(and(eq(organizationServices.organizationId, orgId), eq(organizationServices.enabled, true)));
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
   */
  router.get('/connections', async (c) => {
    try {
      const org = c.get('organization');
      const user = c.get('user');
      
      if (!org && !user) {
        return c.json(Errors.unauthorized('Authentication required'), 401);
      }

      const limit = parseInt(c.req.query('limit') || '50', 10);
      const userId = user?.id;
      const orgId = org?.id;

      // Filter connections based on context
      const connectionsFilter = orgId 
        ? or(
            and(eq(connections.scope, 'organization'), eq(connections.organizationId, orgId)),
            and(eq(connections.scope, 'user'), eq(connections.userId, userId || ''))
          )
        : eq(connections.userId, userId || '');

      const userConnections = await db
        .select()
        .from(connections)
        .where(connectionsFilter)
        .orderBy(desc(connections.connectedAt))
        .limit(limit);

      // Map to the format expected by dashboard
      const formattedConnections = userConnections.map((conn) => ({
        id: conn.id,
        scope: conn.scope,
        userId: conn.userId,
        organizationId: conn.organizationId,
        serviceId: conn.serviceId,
        externalUserId: conn.externalUserId,
        status: conn.status === 'connected' ? 'active' : conn.status === 'expired' ? 'expired' : 'error',
        createdAt: conn.connectedAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: conn.connectedAt?.toISOString() ?? new Date().toISOString(),
      }));

      return c.json({
        data: formattedConnections,
        error: null,
      });
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

      const settings = parseSettings(org.metadata);
      const apiKeys = settings.apiKeys || [];

      // Return keys without the hash
      const formattedKeys = apiKeys.map((key) => ({
        id: key.id,
        organizationId: org.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
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
      const { name, expiresAt } = body;

      if (!name || typeof name !== 'string' || name.length < 1) {
        return c.json(Errors.validationError('API key name is required'), 400);
      }

      // Generate new API key
      const apiKey = `ak_${randomUUID().replace(/-/g, '')}`;
      const keyPrefix = apiKey.substring(0, 10);
      const keyHash = hashApiKey(apiKey);

      const newKeyEntry: ApiKeyEntry = {
        id: randomUUID(),
        name,
        keyPrefix,
        keyHash,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || undefined,
      };

      const settings = parseSettings(org.metadata);
      const apiKeys = settings.apiKeys || [];
      apiKeys.push(newKeyEntry);

      // Update organization metadata
      await db
        .update(organization)
        .set({ metadata: JSON.stringify({ ...settings, apiKeys }) })
        .where(eq(organization.id, org.id));

      return c.json({
        data: {
          id: newKeyEntry.id,
          organizationId: org.id,
          name: newKeyEntry.name,
          keyPrefix: newKeyEntry.keyPrefix,
          key: apiKey, // Only returned once during creation!
          createdAt: newKeyEntry.createdAt,
          expiresAt: newKeyEntry.expiresAt,
        },
        error: null,
      });
    } catch (error) {
      console.error('Failed to create API key:', error);
      return c.json(Errors.internalError('Failed to create API key'), 500);
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
      const settings = parseSettings(org.metadata);
      const apiKeys = settings.apiKeys || [];
      const keyIndex = apiKeys.findIndex((k) => k.id === keyId);

      if (keyIndex === -1) {
        return c.json(Errors.notFound('API Key', keyId), 404);
      }

      apiKeys.splice(keyIndex, 1);

      // Update organization metadata
      await db
        .update(organization)
        .set({ metadata: JSON.stringify({ ...settings, apiKeys }) })
        .where(eq(organization.id, org.id));

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
        data: orgServicesList.map(os => ({
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
        .where(and(
          eq(organizationServices.organizationId, org.id),
          eq(organizationServices.serviceId, serviceId)
        ))
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

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (customClientId !== undefined) {
        updateData.oauthClientId = customClientId || null;
      }

      if (customClientSecret) {
        // TODO: Encrypt the client secret using @authlane/crypto
        updateData.oauthClientSecretEnc = customClientSecret;
      }

      if (apiKey) {
        // TODO: Encrypt the API key using @authlane/crypto
        updateData.apiKeyEnc = apiKey;
      }

      // Upsert the organization service
      await db
        .insert(organizationServices)
        .values({
          organizationId: org.id,
          serviceId,
          enabled: true,
          oauthClientId: customClientId || null,
          oauthClientSecretEnc: customClientSecret || null,
          apiKeyEnc: apiKey || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [organizationServices.organizationId, organizationServices.serviceId],
          set: updateData,
        });

      return c.json({
        data: { success: true },
        error: null,
      });
    } catch (error) {
      console.error('Failed to update organization service config:', error);
      return c.json(Errors.internalError('Failed to update service configuration'), 500);
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

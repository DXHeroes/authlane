/**
 * OAuth2 routes
 * Handles OAuth authorization and callback flows
 */

import { randomUUID } from 'node:crypto';
import { decrypt, encrypt, getEncryptionKey } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { connections, services, tenantServices } from '@authlane/database';
import {
  Errors,
  generatePKCE,
  generateState,
  isValidServiceId,
  isValidUserId,
} from '@authlane/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getTenantId } from '../utils/tenant-context.js';

export function createOAuthRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/users/:userId/connections/:serviceId/authorize
   * Initiates OAuth2 authorization flow
   */
  router.get('/:userId/connections/:serviceId/authorize', async (c) => {
    const userId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');
    const tenantId = getTenantId(c);

    if (!isValidUserId(userId)) {
      return c.json(
        Errors.validationError('Invalid user ID', 'User ID must be a non-empty string'),
        400
      );
    }

    if (!isValidServiceId(serviceId)) {
      return c.json(
        Errors.validationError(
          'Invalid service ID',
          'Service ID must be lowercase alphanumeric with hyphens'
        ),
        400
      );
    }

    // Get service configuration
    const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);

    if (!service) {
      return c.json(Errors.notFound('Service', serviceId), 404);
    }

    if (service.authType !== 'oauth2') {
      return c.json(Errors.oauthError('Service does not support OAuth2'), 400);
    }

    // Check for tenant-specific configuration
    const [tenantService] = await db
      .select()
      .from(tenantServices)
      .where(and(eq(tenantServices.tenantId, tenantId), eq(tenantServices.serviceId, serviceId)))
      .limit(1);

    if (tenantService && !tenantService.enabled) {
      return c.json(Errors.oauthError('Service is disabled for this tenant'), 403);
    }

    const config = service.config as {
      authorization_url?: string;
      token_url?: string;
      scopes?: string[];
    };

    if (!config.authorization_url) {
      return c.json(Errors.oauthError('Service missing authorization URL'), 400);
    }

    // Use tenant-specific OAuth client if configured, otherwise use query param
    const clientId = tenantService?.oauthClientId || c.req.query('client_id') || '';
    const scopes = tenantService?.customScopes || config.scopes || [];

    // Generate PKCE and state
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();

    // Store PKCE verifier and state in connection (temporary)
    // In production, use Redis or session storage
    const connectionId = randomUUID();
    const redirectUri = c.req.query('redirect_uri') || `${c.req.url.split('?')[0]}/callback`;

    await db.insert(connections).values({
      id: connectionId,
      tenantId,
      externalUserId: userId,
      serviceId,
      status: 'pending',
      metadata: {
        pkce_code_verifier: codeVerifier,
        state,
        redirect_uri: redirectUri,
      },
    });

    if (!clientId) {
      return c.json(
        Errors.oauthError(
          'OAuth client ID required. Provide via query parameter or configure tenant service.'
        ),
        400
      );
    }

    // Build authorization URL
    const authUrl = new URL(config.authorization_url);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return c.json({
      data: {
        authorization_url: authUrl.toString(),
        state,
        connection_id: connectionId,
      },
      error: null,
    });
  });

  /**
   * GET /api/v1/users/:userId/connections/:serviceId/callback
   * Handles OAuth2 callback
   */
  router.get('/:userId/connections/:serviceId/callback', async (c) => {
    const userId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');
    const tenantId = getTenantId(c);
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.json(Errors.oauthError(`OAuth error: ${error}`), 400);
    }

    if (!code || !state) {
      return c.json(Errors.oauthError('Missing code or state parameter'), 400);
    }

    // Find pending connection with matching state
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.tenantId, tenantId),
          eq(connections.externalUserId, userId),
          eq(connections.serviceId, serviceId),
          eq(connections.status, 'pending')
        )
      )
      .limit(1);

    if (!connection) {
      return c.json(Errors.notFound('Connection', `${userId}/${serviceId}`), 404);
    }

    const metadata = connection.metadata as {
      pkce_code_verifier?: string;
      state?: string;
      redirect_uri?: string;
    };

    // Verify state
    if (metadata.state !== state) {
      return c.json(Errors.oauthStateMismatch('State mismatch'), 400);
    }

    // Get service configuration
    const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);

    if (!service) {
      return c.json(Errors.notFound('Service', serviceId), 404);
    }

    // Check for tenant-specific configuration
    const [tenantService] = await db
      .select()
      .from(tenantServices)
      .where(and(eq(tenantServices.tenantId, tenantId), eq(tenantServices.serviceId, serviceId)))
      .limit(1);

    const config = service.config as {
      token_url?: string;
    };

    if (!config.token_url) {
      return c.json(Errors.oauthError('Service missing token URL'), 400);
    }

    // Get client credentials (tenant-specific or from query)
    let clientId = c.req.query('client_id') || '';
    let clientSecret = c.req.query('client_secret') || '';

    if (tenantService?.oauthClientId) {
      clientId = tenantService.oauthClientId;
      if (tenantService.oauthClientSecretEnc) {
        const encryptionKey = getEncryptionKey();
        try {
          clientSecret = decrypt(tenantService.oauthClientSecretEnc, encryptionKey);
        } catch (_error) {
          return c.json(Errors.oauthError('Failed to decrypt tenant OAuth client secret'), 500);
        }
      }
    }

    if (!clientId) {
      return c.json(Errors.oauthError('OAuth client ID required'), 400);
    }

    // Exchange code for tokens
    try {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: metadata.redirect_uri || '',
        client_id: clientId,
        code_verifier: metadata.pkce_code_verifier || '',
      });

      // Add client_secret only if provided (some OAuth providers require it)
      if (clientSecret) {
        tokenBody.set('client_secret', clientSecret);
      }

      const tokenResponse = await fetch(config.token_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: tokenBody,
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        return c.json(Errors.oauthTokenExchangeFailed(`Token exchange failed: ${errorText}`), 400);
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      };

      // Encrypt credentials
      const encryptionKey = getEncryptionKey();
      const credentialsJson = JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || 'Bearer',
        scope: tokens.scope,
        expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : undefined,
      });

      const credentialsEnc = encrypt(credentialsJson, encryptionKey);

      // Update connection
      const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

      await db
        .update(connections)
        .set({
          status: 'connected',
          credentialsEnc,
          connectedAt: new Date(),
          expiresAt,
          metadata: {},
        })
        .where(eq(connections.id, connection.id));

      // Schedule token refresh if Redis is configured
      if (expiresAt && process.env.REDIS_URL) {
        try {
          const { scheduleTokenRefresh } = await import('../jobs/setup.js');
          await scheduleTokenRefresh(connection.id, tenantId, serviceId, expiresAt);
        } catch (error) {
          console.warn('Failed to schedule token refresh:', error);
          // Non-critical, continue
        }
      }

      return c.json({
        data: {
          connection_id: connection.id,
          status: 'connected',
          service: serviceId,
        },
        error: null,
      });
    } catch (error) {
      console.error('OAuth token exchange error:', error);
      return c.json(
        Errors.oauthTokenExchangeFailed(error instanceof Error ? error.message : 'Unknown error'),
        500
      );
    }
  });

  return router;
}

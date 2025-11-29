/**
 * OAuth2 routes
 * Handles OAuth authorization and callback flows
 */

import { decrypt, encrypt, getEncryptionKey } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { connections, organizationServices, services, and, eq } from '@authlane/database';
import {
  Errors,
  generatePKCE,
  generateState,
  isValidServiceId,
  isValidUserId,
} from '@authlane/shared';
import { Hono } from 'hono';

export function createOAuthRouter(db: Database) {
  const router = new Hono();

  /**
   * GET /api/v1/users/:userId/connections/:serviceId/authorize
   * Initiates OAuth2 authorization flow
   */
  router.get('/:userId/connections/:serviceId/authorize', async (c) => {
    const externalUserId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');
    const user = c.get('user');
    const org = c.get('organization');
    
    // Determine scope from query param, default to 'user'
    const scope = (c.req.query('scope') as 'user' | 'organization') || 'user';

    if (!isValidUserId(externalUserId)) {
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

    // Check for organization-specific configuration
    let orgService = null;
    if (org) {
      const [found] = await db
        .select()
        .from(organizationServices)
        .where(and(eq(organizationServices.organizationId, org.id), eq(organizationServices.serviceId, serviceId)))
        .limit(1);
      orgService = found;
    }

    if (orgService && !orgService.enabled) {
      return c.json(Errors.oauthError('Service is disabled for this organization'), 403);
    }

    const config = service.config as {
      authorization_url?: string;
      token_url?: string;
      scopes?: string[];
    };

    if (!config.authorization_url) {
      return c.json(Errors.oauthError('Service missing authorization URL'), 400);
    }

    // Use organization-specific OAuth client if configured, otherwise use query param
    const clientId = orgService?.oauthClientId || c.req.query('client_id') || '';
    const scopes = orgService?.customScopes || config.scopes || [];

    // Generate PKCE and state
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();

    // Store PKCE verifier and state in connection (temporary)
    const connectionId = crypto.randomUUID();
    const redirectUri = c.req.query('redirect_uri') || `${c.req.url.split('?')[0]}/callback`;

    await db.insert(connections).values({
      id: connectionId,
      scope,
      userId: user?.id || null,
      organizationId: scope === 'organization' ? org?.id : null,
      externalUserId,
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
          'OAuth client ID required. Provide via query parameter or configure organization service.'
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
    const externalUserId = c.req.param('userId');
    const serviceId = c.req.param('serviceId');
    // User and org context available from middleware for authorization
    void c.get('user');
    const org = c.get('organization');
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
          eq(connections.externalUserId, externalUserId),
          eq(connections.serviceId, serviceId),
          eq(connections.status, 'pending')
        )
      )
      .limit(1);

    if (!connection) {
      return c.json(Errors.notFound('Connection', `${externalUserId}/${serviceId}`), 404);
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

    // Check for organization-specific configuration
    let orgService = null;
    if (org) {
      const [found] = await db
        .select()
        .from(organizationServices)
        .where(and(eq(organizationServices.organizationId, org.id), eq(organizationServices.serviceId, serviceId)))
        .limit(1);
      orgService = found;
    }

    const config = service.config as {
      token_url?: string;
    };

    if (!config.token_url) {
      return c.json(Errors.oauthError('Service missing token URL'), 400);
    }

    // Get client credentials (organization-specific or from query)
    let clientId = c.req.query('client_id') || '';
    let clientSecret = c.req.query('client_secret') || '';

    if (orgService?.oauthClientId) {
      clientId = orgService.oauthClientId;
      if (orgService.oauthClientSecretEnc) {
        const encryptionKey = getEncryptionKey();
        try {
          clientSecret = decrypt(orgService.oauthClientSecretEnc, encryptionKey);
        } catch (_error) {
          return c.json(Errors.oauthError('Failed to decrypt organization OAuth client secret'), 500);
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
          await scheduleTokenRefresh(
            connection.id, 
            serviceId, 
            connection.userId || undefined, 
            connection.organizationId || undefined, 
            expiresAt
          );
        } catch (err) {
          console.warn('Failed to schedule token refresh:', err);
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
    } catch (err) {
      console.error('OAuth token exchange error:', err);
      return c.json(
        Errors.oauthTokenExchangeFailed(err instanceof Error ? err.message : 'Unknown error'),
        500
      );
    }
  });

  return router;
}

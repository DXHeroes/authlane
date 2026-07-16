import { decrypt, encrypt, getEncryptionKey } from '@authlane/crypto';
import type { ConnectSession, Database } from '@authlane/database';
import {
  and,
  connections,
  connectSessions,
  eq,
  inArray,
  organizationServices,
  outboxEvents,
  services,
  sql,
} from '@authlane/database';
import {
  Errors,
  generatePKCE,
  generateState,
  getEffectiveConnectionStatus,
  hashApiKey,
  isValidServiceId,
  isValidUserId,
} from '@authlane/shared';
import { Hono } from 'hono';
import { createConnectSessionToken, isUsableConnectSession } from '../lib/connect-session.js';
import { requireScope } from '../middleware/scope.js';

interface ConnectSessionBody {
  externalUserId?: string;
  allowedServices?: string[];
  allowedOrigin?: string;
  expiresInSeconds?: number;
}

interface ConnectActionBody {
  connectToken?: string;
  parentOrigin?: string;
}

function connectTokenFromRequest(
  authorization: string | undefined,
  body: ConnectActionBody
): string | null {
  const headerToken = authorization?.match(/^ConnectSession\s+(.+)$/i)?.[1];
  return headerToken ?? body.connectToken ?? null;
}

async function loadConnectSession(
  db: Database,
  token: string,
  serviceId: string,
  parentOrigin: string
): Promise<ConnectSession | null> {
  const [session] = await db
    .select()
    .from(connectSessions)
    .where(eq(connectSessions.tokenHash, hashApiKey(token)))
    .limit(1);
  if (!session || !isUsableConnectSession(session, serviceId, parentOrigin)) return null;
  return session;
}

async function loadConnectSessionByToken(
  db: Database,
  token: string,
  parentOrigin: string
): Promise<ConnectSession | null> {
  const [session] = await db
    .select()
    .from(connectSessions)
    .where(eq(connectSessions.tokenHash, hashApiKey(token)))
    .limit(1);
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    session.allowedOrigin !== parentOrigin
  ) {
    return null;
  }
  return session;
}

function parseAllowedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const localDevelopment =
      process.env.NODE_ENV !== 'production' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localDevelopment) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createOAuthRouter(db: Database) {
  const router = new Hono();

  router.post('/connect-sessions', requireScope('connect-sessions:write'), async (c) => {
    let body: ConnectSessionBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json(Errors.validationError('Request body must be valid JSON'), 400);
    }

    const externalUserId = body.externalUserId;
    const requestedServices = [...new Set(body.allowedServices ?? [])];
    const allowedOrigin = body.allowedOrigin ? parseAllowedOrigin(body.allowedOrigin) : null;
    const expiresInSeconds = Math.min(Math.max(body.expiresInSeconds ?? 600, 60), 900);
    if (
      !isValidUserId(externalUserId) ||
      requestedServices.length === 0 ||
      requestedServices.some((serviceId) => !isValidServiceId(serviceId)) ||
      !allowedOrigin
    ) {
      return c.json(
        Errors.validationError(
          'externalUserId, allowedServices, and an HTTPS allowedOrigin are required'
        ),
        400
      );
    }

    const principal = c.get('principal');
    const enabledServices = await db
      .select({ serviceId: organizationServices.serviceId })
      .from(organizationServices)
      .where(
        and(
          eq(organizationServices.organizationId, principal.organizationId),
          eq(organizationServices.enabled, true),
          inArray(organizationServices.serviceId, requestedServices)
        )
      );
    if (enabledServices.length !== requestedServices.length) {
      return c.json(Errors.validationError('One or more requested services are disabled'), 400);
    }

    const { token, tokenHash } = createConnectSessionToken();
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1_000);
    const [session] = await db
      .insert(connectSessions)
      .values({
        organizationId: principal.organizationId,
        externalUserId,
        tokenHash,
        allowedServices: requestedServices,
        allowedOrigin,
        expiresAt,
      })
      .returning({ id: connectSessions.id });
    const connectUrl = new URL('/connect', c.req.url);
    connectUrl.searchParams.set('session', token);
    connectUrl.searchParams.set('origin', allowedOrigin);

    return c.json(
      {
        data: {
          id: session?.id,
          token,
          url: connectUrl.toString(),
          expiresAt: expiresAt.toISOString(),
        },
        error: null,
      },
      201
    );
  });

  router.get('/connect/session', async (c) => {
    const token = c.req.query('session');
    const parentOrigin = c.req.query('origin');
    if (!token || !parentOrigin) {
      return c.json(Errors.unauthorized('A valid connect session is required'), 401);
    }
    const session = await loadConnectSessionByToken(db, token, parentOrigin);
    if (!session) return c.json(Errors.unauthorized('Connect session is invalid or expired'), 401);

    const [allowedServiceRows, connectionRows] = await Promise.all([
      db
        .select({ id: services.id, name: services.name, authType: services.authType })
        .from(services)
        .where(and(eq(services.enabled, true), inArray(services.id, session.allowedServices))),
      db
        .select({
          serviceId: connections.serviceId,
          status: connections.status,
          credentialsEnc: connections.credentialsEnc,
          expiresAt: connections.expiresAt,
        })
        .from(connections)
        .where(
          and(
            eq(connections.organizationId, session.organizationId),
            eq(connections.externalUserId, session.externalUserId),
            inArray(connections.serviceId, session.allowedServices)
          )
        ),
    ]);
    const connectionsByService = new Map(
      connectionRows.map((connection) => [connection.serviceId, connection])
    );
    return c.json({
      data: {
        externalUserId: session.externalUserId,
        expiresAt: session.expiresAt.toISOString(),
        services: allowedServiceRows.map((service) => {
          const connection = connectionsByService.get(service.id);
          const status = getEffectiveConnectionStatus(
            connection
              ? {
                  status: connection.status,
                  hasCredentials: Boolean(connection.credentialsEnc),
                  expiresAt: connection.expiresAt,
                }
              : null
          );
          return { ...service, status };
        }),
      },
      error: null,
    });
  });

  router.post('/connect/:serviceId/authorize', async (c) => {
    const serviceId = c.req.param('serviceId');
    let body: ConnectActionBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json(Errors.validationError('Request body must be valid JSON'), 400);
    }
    const token = connectTokenFromRequest(c.req.header('authorization'), body);
    if (!token || !body.parentOrigin || !isValidServiceId(serviceId)) {
      return c.json(Errors.unauthorized('A valid connect session is required'), 401);
    }
    const session = await loadConnectSession(db, token, serviceId, body.parentOrigin);
    if (!session) {
      return c.json(Errors.unauthorized('Connect session is invalid or expired'), 401);
    }

    const [[service], [tenantService]] = await Promise.all([
      db.select().from(services).where(eq(services.id, serviceId)).limit(1),
      db
        .select()
        .from(organizationServices)
        .where(
          and(
            eq(organizationServices.organizationId, session.organizationId),
            eq(organizationServices.serviceId, serviceId),
            eq(organizationServices.enabled, true)
          )
        )
        .limit(1),
    ]);
    if (!service || !tenantService) {
      return c.json(Errors.notFound('Enabled service', serviceId), 404);
    }
    if (service.authType !== 'oauth2') {
      return c.json(Errors.oauthError('This service does not use OAuth2'), 400);
    }

    const config = service.config as {
      authorization_url?: string;
      scopes?: string[];
    };
    if (!config.authorization_url || !tenantService.oauthClientId) {
      return c.json(Errors.oauthError('OAuth provider is not configured'), 409);
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    const callbackUrl = new URL(`/api/v1/oauth/${serviceId}/callback`, c.req.url).toString();
    const connectionId = crypto.randomUUID();
    await db
      .insert(connections)
      .values({
        id: connectionId,
        organizationId: session.organizationId,
        externalUserId: session.externalUserId,
        serviceId,
        status: 'pending',
        credentialsEnc: null,
        expiresAt: null,
        lastErrorCode: null,
        metadata: {
          state,
          pkceCodeVerifier: codeVerifier,
          callbackUrl,
          connectSessionId: session.id,
          allowedOrigin: session.allowedOrigin,
        },
      })
      .onConflictDoUpdate({
        target: [connections.organizationId, connections.externalUserId, connections.serviceId],
        set: {
          status: 'pending',
          credentialsEnc: null,
          expiresAt: null,
          lastErrorCode: null,
          metadata: {
            state,
            pkceCodeVerifier: codeVerifier,
            callbackUrl,
            connectSessionId: session.id,
            allowedOrigin: session.allowedOrigin,
          },
          updatedAt: new Date(),
        },
      });

    const authorizationUrl = new URL(config.authorization_url);
    authorizationUrl.searchParams.set('client_id', tenantService.oauthClientId);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set(
      'scope',
      (tenantService.customScopes ?? config.scopes ?? []).join(' ')
    );
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    return c.json({ data: { authorizationUrl: authorizationUrl.toString() }, error: null });
  });

  router.get('/oauth/:serviceId/callback', async (c) => {
    const serviceId = c.req.param('serviceId');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const providerError = c.req.query('error');
    if (providerError) return c.json(Errors.oauthError(providerError), 400);
    if (!code || !state || !isValidServiceId(serviceId)) {
      return c.json(Errors.oauthError('Missing OAuth code or state'), 400);
    }

    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.serviceId, serviceId),
          eq(connections.status, 'pending'),
          sql`${connections.metadata}->>'state' = ${state}`
        )
      )
      .limit(1);
    if (!connection) return c.json(Errors.oauthStateMismatch('Unknown or consumed state'), 400);

    const metadata = connection.metadata as {
      pkceCodeVerifier?: string;
      callbackUrl?: string;
      allowedOrigin?: string;
    };
    const [[service], [tenantService]] = await Promise.all([
      db.select().from(services).where(eq(services.id, serviceId)).limit(1),
      db
        .select()
        .from(organizationServices)
        .where(
          and(
            eq(organizationServices.organizationId, connection.organizationId),
            eq(organizationServices.serviceId, serviceId)
          )
        )
        .limit(1),
    ]);
    if (!service || !tenantService?.oauthClientId) {
      return c.json(Errors.oauthError('OAuth provider is no longer configured'), 409);
    }
    const config = service.config as { token_url?: string };
    if (!config.token_url || !metadata.callbackUrl || !metadata.pkceCodeVerifier) {
      return c.json(Errors.oauthError('OAuth flow metadata is incomplete'), 400);
    }

    let clientSecret = '';
    if (tenantService.oauthClientSecretEnc) {
      clientSecret = decrypt(tenantService.oauthClientSecretEnc, getEncryptionKey());
    }
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: metadata.callbackUrl,
      client_id: tenantService.oauthClientId,
      code_verifier: metadata.pkceCodeVerifier,
    });
    if (clientSecret) tokenBody.set('client_secret', clientSecret);

    const tokenResponse = await fetch(config.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: tokenBody,
    });
    if (!tokenResponse.ok) {
      await db
        .update(connections)
        .set({
          status: 'error',
          lastErrorCode: 'OAUTH_TOKEN_EXCHANGE_FAILED',
          updatedAt: new Date(),
        })
        .where(eq(connections.id, connection.id));
      return c.json(Errors.oauthTokenExchangeFailed('Provider rejected the token exchange'), 400);
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };
    if (!tokens.access_token) {
      return c.json(
        Errors.oauthTokenExchangeFailed('Provider did not return an access token'),
        400
      );
    }
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1_000) : null;
    const credentialsEnc = encrypt(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type ?? 'Bearer',
        scope: tokens.scope,
        expires_at: expiresAt?.toISOString(),
      }),
      getEncryptionKey()
    );
    await db
      .update(connections)
      .set({
        status: 'connected',
        credentialsEnc,
        connectedAt: new Date(),
        expiresAt,
        lastErrorCode: null,
        metadata: {},
        updatedAt: new Date(),
      })
      .where(eq(connections.id, connection.id));
    await db.insert(outboxEvents).values({
      organizationId: connection.organizationId,
      eventType: 'connection.connected',
      payload: {
        externalUserId: connection.externalUserId,
        serviceId,
        connectionId: connection.id,
      },
    });

    if (expiresAt && process.env.REDIS_URL) {
      const { scheduleTokenRefresh } = await import('../jobs/setup.js');
      await scheduleTokenRefresh(connection.id, serviceId, connection.organizationId, expiresAt);
    }
    const completedUrl = new URL('/connect/callback', c.req.url);
    completedUrl.searchParams.set('status', 'connected');
    completedUrl.searchParams.set('serviceId', serviceId);
    if (metadata.allowedOrigin) completedUrl.searchParams.set('origin', metadata.allowedOrigin);
    return c.redirect(completedUrl.toString());
  });

  router.delete('/connect/:serviceId', async (c) => {
    const serviceId = c.req.param('serviceId');
    let body: ConnectActionBody;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const token = connectTokenFromRequest(c.req.header('authorization'), body);
    if (!token || !body.parentOrigin || !isValidServiceId(serviceId)) {
      return c.json(Errors.unauthorized('A valid connect session is required'), 401);
    }
    const session = await loadConnectSession(db, token, serviceId, body.parentOrigin);
    if (!session) return c.json(Errors.unauthorized('Connect session is invalid or expired'), 401);

    const [deleted] = await db
      .delete(connections)
      .where(
        and(
          eq(connections.organizationId, session.organizationId),
          eq(connections.externalUserId, session.externalUserId),
          eq(connections.serviceId, serviceId)
        )
      )
      .returning({ id: connections.id });
    if (deleted) {
      await db.insert(outboxEvents).values({
        organizationId: session.organizationId,
        eventType: 'connection.disconnected',
        payload: {
          externalUserId: session.externalUserId,
          serviceId,
          connectionId: deleted.id,
        },
      });
    }
    return c.json({ data: { disconnected: Boolean(deleted) }, error: null });
  });

  return router;
}

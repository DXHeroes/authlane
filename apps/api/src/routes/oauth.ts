import type { ConnectSession, Database, SecretStore } from '@authlane/database';
import {
  and,
  asc,
  connections,
  connectSessions,
  eq,
  gt,
  inArray,
  isNull,
  listEnabledMcpServers,
  mcpEndpointProvenance,
  oauthTransactions,
  organizationServices,
  outboxEvents,
  readMcpServerConnectConfig,
  services,
  sql,
  withSecurityLookupContext,
  withTenantContext,
} from '@authlane/database';
import type { OAuthProviderContext } from '@authlane/shared';
import {
  Errors,
  generatePKCE,
  generateState,
  getAllowedServiceIds,
  getEffectiveConnectionStatus,
  getOAuthAuthorizationParameters,
  getPlatformOAuthCredentials,
  hashApiKey,
  isConnectableServiceId,
  isMcpServerId,
  isValidServiceId,
  isValidUserId,
  normalizeOAuthScopeNames,
  parseOAuthProviderContext,
} from '@authlane/shared';
import { Hono } from 'hono';
import { errorResult } from '../lib/api-response.js';
import type { CacheStore } from '../lib/cache.js';
import {
  canPerformDestructiveAction,
  createConnectSessionToken,
  filterCurrentlyEnabledServices,
  isUsableConnectSession,
  resolveAllowedServiceSnapshot,
} from '../lib/connect-session.js';
import type { McpDiscoveryDeps } from '../lib/mcp-discovery-run.js';
import { discoverAfterFirstAuthorization } from '../lib/mcp-first-authorization.js';
import type { AuthorizationRefusal } from '../lib/oauth-provider-resolution.js';
import {
  resolveBuiltInAuthorization,
  resolveMcpAuthorization,
} from '../lib/oauth-provider-resolution.js';
import { fetchOAuthToken, validateOAuthEndpoint } from '../lib/provider-http.js';
import { oauthCallbackUrl, publicApiBase } from '../lib/public-api-base.js';
import { brandingOf, deriveInitials } from '../lib/service-branding.js';
import {
  readTenantServiceSettings,
  serviceEnabledForOrganization,
  tenantServiceJoin,
} from '../lib/service-enablement.js';
import { requireScope } from '../middleware/scope.js';

interface ConnectSessionBody {
  externalUserId?: string;
  allowedServices?: string[];
  allowedOrigin?: string;
  expiresInSeconds?: number;
  reauthenticatedAt?: string;
}

interface ConnectActionBody {
  parentOrigin?: string;
}

function connectTokenFromRequest(authorization: string | undefined): string | null {
  const headerToken = authorization?.match(/^ConnectSession\s+(.+)$/i)?.[1];
  return headerToken ?? null;
}

async function loadConnectSession(
  db: Database,
  token: string,
  serviceId: string,
  parentOrigin: string
): Promise<ConnectSession | null> {
  const tokenHash = hashApiKey(token);
  const [session] = await withSecurityLookupContext(
    db,
    'authlane.connect_token_hash',
    tokenHash,
    () => db.select().from(connectSessions).where(eq(connectSessions.tokenHash, tokenHash)).limit(1)
  );
  if (!session || !isUsableConnectSession(session, serviceId, parentOrigin)) return null;
  return session;
}

async function loadConnectSessionByToken(
  db: Database,
  token: string,
  parentOrigin: string
): Promise<ConnectSession | null> {
  const tokenHash = hashApiKey(token);
  const [session] = await withSecurityLookupContext(
    db,
    'authlane.connect_token_hash',
    tokenHash,
    () => db.select().from(connectSessions).where(eq(connectSessions.tokenHash, tokenHash)).limit(1)
  );
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

function parseRecentReauthentication(value: string | undefined, now: Date): Date | null | false {
  if (value === undefined) return null;
  const reauthenticatedAt = new Date(value);
  const ageMs = now.getTime() - reauthenticatedAt.getTime();
  if (!Number.isFinite(reauthenticatedAt.getTime()) || ageMs < -30_000 || ageMs > 5 * 60_000) {
    return false;
  }
  return reauthenticatedAt;
}

async function listEnabledServiceIds(db: Database, organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ serviceId: services.id })
    .from(services)
    .leftJoin(organizationServices, tenantServiceJoin(organizationId))
    .where(
      and(
        eq(services.enabled, true),
        inArray(services.id, getAllowedServiceIds()),
        serviceEnabledForOrganization()
      )
    )
    .orderBy(asc(services.id));

  // A tenant's own MCP servers are connectable alongside the built-in catalog. They live in their
  // own table because `services` is global, so they are unioned here rather than joined.
  const tenantServers = await listEnabledMcpServers(db, organizationId);

  return [...rows.map((row) => row.serviceId), ...tenantServers.map((server) => server.id)];
}

/**
 * The 409 an unconfigurable service gets, named by cause.
 *
 * Every one of these read "OAuth provider is not configured", from both the MCP branch and the
 * built-in one. A caller could not tell which kind of service had failed, nor a missing client id
 * from a missing endpoint, so the only way to find out was to go and read the row. The wording
 * follows the `notConnectableReason` the catalogue publishes for the same service.
 */
function mcpAuthorizationConflict(
  reason: Exclude<AuthorizationRefusal, 'not_found' | 'not_oauth'>
) {
  switch (reason) {
    case 'untrusted_endpoint':
      return Errors.oauthError(
        'This MCP server has a stored OAuth endpoint Authlane will not use',
        'Re-run discovery for the server. Its stored authorization or token endpoint is not one the server, or the issuer the server named, published.'
      );
    case 'disabled':
      return Errors.oauthError(
        'This MCP server is turned off',
        'Enable the server in the Authlane dashboard. A server whose first discovery failed stays off until discovery succeeds.'
      );
    case 'missing_oauth_client':
      return Errors.oauthError(
        'This MCP server has no OAuth client',
        'Authlane could not register itself with this server. Add an OAuth client for it under MCP servers in the Authlane dashboard.'
      );
    case 'missing_authorization_url':
      return Errors.oauthError(
        'This MCP server advertises no https authorization endpoint',
        'Re-run discovery for the server. Its stored OAuth metadata has no authorization endpoint, or the endpoint is not https.'
      );
  }
}

function builtInAuthorizationConflict(
  serviceId: string,
  reason: Exclude<AuthorizationRefusal, 'not_found' | 'not_oauth'>
) {
  switch (reason) {
    case 'untrusted_endpoint':
      return Errors.oauthError(
        `${serviceId} has an authorization URL Authlane will not use`,
        'This is a defect in the Authlane service catalog rather than in your configuration. Please report it.'
      );
    case 'disabled':
      return Errors.oauthError(
        `${serviceId} is turned off for this organization`,
        'Enable the service in the Authlane dashboard.'
      );
    case 'missing_oauth_client':
      return Errors.oauthError(
        `No OAuth client is configured for ${serviceId}`,
        `Add a client ID and secret for ${serviceId} in the Authlane dashboard, and register the redirect URI shown there with the provider.`
      );
    case 'missing_authorization_url':
      return Errors.oauthError(
        `${serviceId} has no authorization URL in the service catalog`,
        'This is a defect in the Authlane service catalog rather than in your configuration. Please report it.'
      );
  }
}

interface AuthorizationRedirect {
  authorizationEndpoint: string;
  oauthClientId: string;
  /** Provider-specific query parameters, including scope. Empty for a tenant MCP server. */
  providerParameters: Iterable<readonly [string, string]>;
}

/**
 * Mints PKCE, records the pending connection and builds the authorization URL.
 *
 * Both a built-in provider and a tenant MCP server run through this, so there is one
 * implementation of the parts that matter: the verifier never outlives the request in plaintext,
 * the connection and the transaction are written atomically, and a failure removes the stored
 * verifier rather than leaving it behind.
 */
async function issueAuthorizationRedirect(
  db: Database,
  secretStore: SecretStore,
  requestUrl: string,
  session: ConnectSession,
  serviceId: string,
  redirect: AuthorizationRedirect
): Promise<string> {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();
  const callbackUrl = oauthCallbackUrl(publicApiBase(requestUrl), serviceId);
  const connectionId = crypto.randomUUID();
  const verifierBytes = Buffer.from(codeVerifier, 'utf8');
  let pkceSecretId: string;
  try {
    pkceSecretId = await secretStore.put({
      organizationId: session.organizationId,
      purpose: 'oauth_pkce_verifier',
      plaintext: verifierBytes,
    });
  } finally {
    verifierBytes.fill(0);
  }

  try {
    await db.transaction(async (tx) => {
      const [connection] = await tx
        .insert(connections)
        .values({
          id: connectionId,
          organizationId: session.organizationId,
          externalUserId: session.externalUserId,
          serviceId,
          status: 'pending',
          credentialSecretId: null,
          expiresAt: null,
          lastErrorCode: null,
          metadata: {},
        })
        .onConflictDoUpdate({
          target: [connections.organizationId, connections.externalUserId, connections.serviceId],
          set: { lastErrorCode: null, updatedAt: new Date() },
        })
        .returning({ id: connections.id });
      if (!connection) throw new Error('Connection transaction did not return a record');
      await tx.insert(oauthTransactions).values({
        organizationId: session.organizationId,
        connectionId: connection.id,
        connectSessionId: session.id,
        serviceId,
        stateHash: hashApiKey(state),
        pkceSecretId,
        callbackUrl,
        allowedOrigin: session.allowedOrigin,
        expiresAt: new Date(Math.min(session.expiresAt.getTime(), Date.now() + 10 * 60_000)),
      });
    });
  } catch (error) {
    await secretStore.delete?.(pkceSecretId, session.organizationId, 'oauth_pkce_verifier');
    throw error;
  }

  const authorizationUrl = new URL(redirect.authorizationEndpoint);
  authorizationUrl.searchParams.set('client_id', redirect.oauthClientId);
  authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizationUrl.searchParams.set('response_type', 'code');
  for (const [name, value] of redirect.providerParameters) {
    authorizationUrl.searchParams.set(name, value);
  }
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  return authorizationUrl.toString();
}

export function createOAuthRouter(
  db: Database,
  secretStore: SecretStore,
  discoveryDeps?: McpDiscoveryDeps,
  cache?: CacheStore
) {
  const router = new Hono();
  router.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store, private');
    c.header('Pragma', 'no-cache');
    c.header('Referrer-Policy', 'no-referrer');
  });

  router.post('/connect-sessions', requireScope('connect-sessions:create'), async (c) => {
    let body: ConnectSessionBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResult(Errors.validationError('Request body must be valid JSON')), 400);
    }

    const externalUserId = body.externalUserId;
    const allowedOrigin = body.allowedOrigin ? parseAllowedOrigin(body.allowedOrigin) : null;
    const now = new Date();
    const expiresInSeconds = Math.min(Math.max(body.expiresInSeconds ?? 600, 60), 900);
    const reauthenticatedAt = parseRecentReauthentication(body.reauthenticatedAt, now);
    if (!isValidUserId(externalUserId) || !allowedOrigin || reauthenticatedAt === false) {
      return c.json(
        errorResult(
          Errors.validationError(
            'externalUserId, allowedServices, an HTTPS allowedOrigin, and a valid reauthentication timestamp are required'
          )
        ),
        400
      );
    }

    const principal = c.get('principal');
    const enabledServiceIds = await listEnabledServiceIds(db, principal.organizationId);
    const allowedServices = resolveAllowedServiceSnapshot(body.allowedServices, enabledServiceIds);
    if (allowedServices.error) {
      return c.json(errorResult(allowedServices.error), 400);
    }

    const { token, tokenHash } = createConnectSessionToken();
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1_000);
    const destructiveActionExpiresAt = reauthenticatedAt
      ? new Date(Math.min(expiresAt.getTime(), reauthenticatedAt.getTime() + 5 * 60_000))
      : null;
    const [session] = await db
      .insert(connectSessions)
      .values({
        organizationId: principal.organizationId,
        externalUserId,
        tokenHash,
        allowedServices: allowedServices.data,
        allowedOrigin,
        expiresAt,
        destructiveActionExpiresAt,
      })
      .returning({ id: connectSessions.id });
    const connectUrl = new URL('/connect', publicApiBase(c.req.url));
    connectUrl.searchParams.set('origin', allowedOrigin);
    connectUrl.hash = new URLSearchParams({ session: token }).toString();

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

  /**
   * Connects a tenant MCP server that authenticates with an API key.
   *
   * The key belongs to the end user, not the workspace: it is stored per connection, so revoking
   * one person's access does not disturb anyone else's, and the audit trail stays per user. The
   * key is written straight to the secret store and never echoed back, not even masked.
   */
  router.post('/connect/:serviceId/api-key', async (c) => {
    const serviceId = c.req.param('serviceId');
    let body: ConnectActionBody & { apiKey?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResult(Errors.validationError('Request body must be valid JSON')), 400);
    }

    const token = connectTokenFromRequest(c.req.header('authorization'));
    if (!token || !body.parentOrigin || !isValidServiceId(serviceId) || !isMcpServerId(serviceId)) {
      return c.json(errorResult(Errors.unauthorized('A valid connect session is required')), 401);
    }
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey || apiKey.length > 4096) {
      return c.json(errorResult(Errors.validationError('An API key is required')), 400);
    }

    const session = await loadConnectSession(db, token, serviceId, body.parentOrigin);
    if (!session) {
      return c.json(errorResult(Errors.unauthorized('Connect session is invalid or expired')), 401);
    }

    return withTenantContext(db, session.organizationId, async () => {
      const server = await readMcpServerConnectConfig(db, serviceId);
      if (!server?.enabled) {
        return c.json(errorResult(Errors.notFound('Enabled service', serviceId)), 404);
      }
      if (server.authType !== 'api_key') {
        return c.json(
          errorResult(
            Errors.validationError('This service is connected with OAuth, not an API key')
          ),
          400
        );
      }

      // Stored in the same envelope shape a credential lease reads. `placement` tells the
      // consuming runtime how to present the key; MCP servers take a bearer Authorization header.
      const keyBytes = Buffer.from(
        JSON.stringify({
          api_key: apiKey,
          placement: { type: 'header', name: 'Authorization', prefix: 'Bearer ' },
        }),
        'utf8'
      );
      let credentialSecretId: string;
      try {
        credentialSecretId = await secretStore.put({
          organizationId: session.organizationId,
          purpose: 'connection_credentials',
          plaintext: keyBytes,
        });
      } finally {
        keyBytes.fill(0);
      }

      await db
        .insert(connections)
        .values({
          id: crypto.randomUUID(),
          organizationId: session.organizationId,
          externalUserId: session.externalUserId,
          serviceId,
          status: 'connected',
          credentialSecretId,
          connectedAt: new Date(),
          expiresAt: null,
          lastErrorCode: null,
          metadata: {},
        })
        .onConflictDoUpdate({
          target: [connections.organizationId, connections.externalUserId, connections.serviceId],
          set: {
            status: 'connected',
            credentialSecretId,
            connectedAt: new Date(),
            lastErrorCode: null,
            updatedAt: new Date(),
          },
        });

      return c.json({ data: { serviceId, status: 'connected' }, error: null });
    });
  });

  router.post('/connect/session', async (c) => {
    let body: ConnectActionBody;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const token = connectTokenFromRequest(c.req.header('authorization'));
    if (!token || !body.parentOrigin) {
      return c.json(errorResult(Errors.unauthorized('A valid connect session is required')), 401);
    }
    const session = await loadConnectSessionByToken(db, token, body.parentOrigin);
    if (!session) {
      return c.json(errorResult(Errors.unauthorized('Connect session is invalid or expired')), 401);
    }

    const apiBaseUrl = publicApiBase(c.req.url);

    return withTenantContext(db, session.organizationId, async () => {
      const builtInRows = await db
        .select({
          id: services.id,
          name: services.name,
          authType: services.authType,
          description: services.description,
          iconPath: services.iconPath,
          brandColor: services.brandColor,
          initials: services.initials,
          category: services.category,
        })
        .from(services)
        .leftJoin(organizationServices, tenantServiceJoin(session.organizationId))
        .where(
          and(
            eq(services.enabled, true),
            inArray(services.id, getAllowedServiceIds()),
            inArray(services.id, session.allowedServices),
            serviceEnabledForOrganization()
          )
        )
        .orderBy(asc(services.id));

      /*
       * The tenant's own servers, which `services` has no row for.
       *
       * Without this the widget filtered them out twice — once against a table they are not in,
       * once against the built-in id list — while `/connect/:serviceId/authorize` would have
       * authorized them happily. A tenant could put an MCP server in `allowedServices`, send a
       * user to the hosted page, and watch it render an empty list.
       */
      const allowedMcpServers = (await listEnabledMcpServers(db, session.organizationId))
        .filter((server) => session.allowedServices.includes(server.id))
        .map((server) => ({
          id: server.id,
          name: server.name,
          authType: server.authType,
          // A tenant has nowhere to declare branding for its own server yet. Initials derive from
          // the name it did give, so the card still has something to draw.
          description: null,
          iconPath: null,
          brandColor: null,
          initials: deriveInitials(server.name),
          category: null,
        }));

      const allowedServiceRows = [...builtInRows, ...allowedMcpServers];
      const visibleServiceIds = filterCurrentlyEnabledServices(
        session.allowedServices,
        allowedServiceRows.map((service) => service.id)
      );
      if (visibleServiceIds.length === 0) {
        return c.json({
          data: {
            externalUserId: session.externalUserId,
            expiresAt: session.expiresAt.toISOString(),
            services: [],
          },
          error: null,
        });
      }
      const connectionRows = await db
        .select({
          serviceId: connections.serviceId,
          status: connections.status,
          credentialSecretId: connections.credentialSecretId,
          expiresAt: connections.expiresAt,
        })
        .from(connections)
        .where(
          and(
            eq(connections.organizationId, session.organizationId),
            eq(connections.externalUserId, session.externalUserId),
            inArray(connections.serviceId, visibleServiceIds)
          )
        );
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
                    hasCredentials: Boolean(connection.credentialSecretId),
                    expiresAt: connection.expiresAt,
                  }
                : null
            );
            const { iconPath, ...rest } = service;
            return { ...rest, ...brandingOf(service, apiBaseUrl), status };
          }),
        },
        error: null,
      });
    });
  });

  router.post('/connect/:serviceId/authorize', async (c) => {
    const serviceId = c.req.param('serviceId');
    let body: ConnectActionBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResult(Errors.validationError('Request body must be valid JSON')), 400);
    }
    const token = connectTokenFromRequest(c.req.header('authorization'));
    if (
      !token ||
      !body.parentOrigin ||
      !isValidServiceId(serviceId) ||
      !isConnectableServiceId(serviceId)
    ) {
      return c.json(errorResult(Errors.unauthorized('A valid connect session is required')), 401);
    }
    const session = await loadConnectSession(db, token, serviceId, body.parentOrigin);
    if (!session) {
      return c.json(errorResult(Errors.unauthorized('Connect session is invalid or expired')), 401);
    }

    return withTenantContext(db, session.organizationId, async () => {
      // A tenant's own server resolves from the metadata captured at discovery; the global
      // catalog has no row for it. Everything after this point is the same shared redirect.
      if (isMcpServerId(serviceId)) {
        const resolution = resolveMcpAuthorization(await readMcpServerConnectConfig(db, serviceId));
        if (!resolution.ok) {
          if (resolution.reason === 'not_found') {
            return c.json(errorResult(Errors.notFound('Enabled service', serviceId)), 404);
          }
          if (resolution.reason === 'not_oauth') {
            return c.json(errorResult(Errors.oauthError('This service does not use OAuth2')), 400);
          }
          return c.json(errorResult(mcpAuthorizationConflict(resolution.reason)), 409);
        }

        const authorizationUrl = await issueAuthorizationRedirect(
          db,
          secretStore,
          c.req.url,
          session,
          serviceId,
          {
            authorizationEndpoint: resolution.authorizationEndpoint,
            oauthClientId: resolution.oauthClientId,
            // MCP servers advertise capability through their tool list, not static scopes.
            providerParameters: [],
          }
        );
        return c.json({ data: { authorizationUrl }, error: null });
      }

      const [[service], tenantService] = await Promise.all([
        db
          .select()
          .from(services)
          .where(and(eq(services.id, serviceId), eq(services.enabled, true)))
          .limit(1),
        readTenantServiceSettings(db, session.organizationId, serviceId),
      ]);
      if (!service || !tenantService) {
        return c.json(errorResult(Errors.notFound('Enabled service', serviceId)), 404);
      }

      const config = service.config as {
        scopes?: unknown;
        default_scopes?: unknown;
        read_only_scopes?: unknown;
      };
      /*
       * The resolver the catalogue reads, so a service it published as connectable gets past here.
       *
       * `enabled` is settled rather than re-derived: readTenantServiceSettings returns null for a
       * service this organization may not use, and that already left as a 404 above.
       */
      const resolution = resolveBuiltInAuthorization({
        serviceId,
        authType: service.authType,
        enabled: true,
        config: service.config,
        tenantOAuthClientId: tenantService.oauthClientId,
      });
      if (!resolution.ok) {
        if (resolution.reason === 'not_oauth') {
          return c.json(errorResult(Errors.oauthError('This service does not use OAuth2')), 400);
        }
        return c.json(errorResult(builtInAuthorizationConflict(serviceId, resolution.reason)), 409);
      }

      let authorizationEndpoint: string;
      try {
        authorizationEndpoint = validateOAuthEndpoint(
          serviceId,
          'authorization',
          resolution.authorizationUrl
        );
      } catch {
        return c.json(
          errorResult(Errors.oauthError('OAuth provider endpoint is not approved')),
          409
        );
      }

      const configuredScopes = normalizeOAuthScopeNames(
        tenantService.toolAccessPolicy === 'read_only'
          ? (config.read_only_scopes ?? config.default_scopes ?? config.scopes ?? [])
          : (config.default_scopes ?? config.scopes ?? [])
      );
      if (!configuredScopes) {
        return c.json(
          errorResult(Errors.oauthError('OAuth scopes are not configured safely')),
          409
        );
      }
      const requestedScopes = tenantService.customScopes ?? configuredScopes;

      const authorizationUrl = await issueAuthorizationRedirect(
        db,
        secretStore,
        c.req.url,
        session,
        serviceId,
        {
          authorizationEndpoint,
          oauthClientId: resolution.oauthClientId,
          providerParameters: getOAuthAuthorizationParameters(serviceId, requestedScopes),
        }
      );
      return c.json({ data: { authorizationUrl }, error: null });
    });
  });

  router.get('/oauth/:serviceId/callback', async (c) => {
    const serviceId = c.req.param('serviceId');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const providerError = c.req.query('error');
    if (providerError) {
      return c.json(errorResult(Errors.oauthError('Provider denied authorization')), 400);
    }
    if (
      !code ||
      !state ||
      state.length > 512 ||
      !isValidServiceId(serviceId) ||
      !isConnectableServiceId(serviceId)
    ) {
      return c.json(errorResult(Errors.oauthError('Missing OAuth code or state')), 400);
    }

    const now = new Date();
    const stateHash = hashApiKey(state);
    const [oauthTransaction] = await withSecurityLookupContext(
      db,
      'authlane.oauth_state_hash',
      stateHash,
      () =>
        db
          .update(oauthTransactions)
          .set({ consumedAt: now })
          .where(
            and(
              eq(oauthTransactions.serviceId, serviceId),
              eq(oauthTransactions.stateHash, stateHash),
              isNull(oauthTransactions.consumedAt),
              gt(oauthTransactions.expiresAt, now)
            )
          )
          .returning()
    );
    if (!oauthTransaction) {
      return c.json(
        errorResult(Errors.oauthStateMismatch('Unknown, expired, or consumed state')),
        400
      );
    }

    return withTenantContext(db, oauthTransaction.organizationId, async () => {
      const [[connection], [service], tenantService] = await Promise.all([
        db
          .select()
          .from(connections)
          .where(
            and(
              eq(connections.id, oauthTransaction.connectionId),
              eq(connections.organizationId, oauthTransaction.organizationId),
              eq(connections.serviceId, serviceId)
            )
          )
          .limit(1),
        db.select().from(services).where(eq(services.id, serviceId)).limit(1),
        readTenantServiceSettings(db, oauthTransaction.organizationId, serviceId),
      ]);
      // A tenant server carries its own token endpoint and client; a built-in one mirrors the
      // authorize step, where a tenant application wins over the platform application.
      const mcpServer = isMcpServerId(serviceId)
        ? await readMcpServerConnectConfig(db, serviceId)
        : null;
      const platformCredentials = isMcpServerId(serviceId)
        ? null
        : getPlatformOAuthCredentials(serviceId);
      const oauthClientId = isMcpServerId(serviceId)
        ? (mcpServer?.oauthClientId ?? null)
        : (tenantService?.oauthClientId ?? platformCredentials?.clientId ?? null);
      const tokenUrl = isMcpServerId(serviceId)
        ? (mcpServer?.tokenEndpoint ?? null)
        : ((service?.config as { token_url?: string } | undefined)?.token_url ?? null);
      // The rule discovery accepted the token endpoint under, carried to the one place that acts on
      // it. Re-deriving a stricter rule here is what used to break the exchange for every server
      // whose issuer sits beside its MCP host.
      const mcpProvenance = mcpServer ? mcpEndpointProvenance(mcpServer) : undefined;
      const clientSecretId = isMcpServerId(serviceId)
        ? (mcpServer?.oauthClientSecretId ?? null)
        : (tenantService?.oauthClientSecretId ?? null);

      if (
        !connection ||
        !oauthClientId ||
        (!isMcpServerId(serviceId) && (!service || !tenantService))
      ) {
        return c.json(
          errorResult(Errors.oauthError('OAuth provider is no longer configured')),
          409
        );
      }
      if (!tokenUrl) {
        return c.json(errorResult(Errors.oauthError('OAuth flow metadata is incomplete')), 400);
      }

      const verifierBuffer = await secretStore.read(
        oauthTransaction.pkceSecretId,
        connection.organizationId,
        'oauth_pkce_verifier'
      );
      let codeVerifier: string;
      try {
        codeVerifier = verifierBuffer.toString('utf8');
      } finally {
        verifierBuffer.fill(0);
        await secretStore.delete?.(
          oauthTransaction.pkceSecretId,
          connection.organizationId,
          'oauth_pkce_verifier'
        );
      }

      let clientSecret = '';
      if (clientSecretId) {
        const clientSecretBuffer = await secretStore.read(
          clientSecretId,
          connection.organizationId,
          'oauth_client_secret'
        );
        try {
          clientSecret = clientSecretBuffer.toString('utf8');
        } finally {
          clientSecretBuffer.fill(0);
        }
      } else if (!isMcpServerId(serviceId) && !tenantService?.oauthClientId) {
        // Only pair the platform secret with the platform client id, never with a tenant's.
        clientSecret = platformCredentials?.clientSecret ?? '';
      }
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthTransaction.callbackUrl,
        client_id: oauthClientId,
        code_verifier: codeVerifier,
      });
      if (clientSecret) tokenBody.set('client_secret', clientSecret);

      let tokenResult: Awaited<ReturnType<typeof fetchOAuthToken>>;
      try {
        tokenResult = await fetchOAuthToken(serviceId, tokenUrl, tokenBody, {
          clientId: oauthClientId,
          clientSecret,
          mcpProvenance,
        });
      } catch {
        await db
          .update(connections)
          .set({
            status: connection.status === 'connected' ? 'connected' : 'error',
            lastErrorCode: 'OAUTH_TOKEN_EXCHANGE_FAILED',
            updatedAt: new Date(),
          })
          .where(eq(connections.id, connection.id));
        return c.json(
          errorResult(Errors.oauthTokenExchangeFailed('Provider rejected the token exchange')),
          400
        );
      }
      if (!tokenResult.response.ok) {
        await db
          .update(connections)
          .set({
            status: connection.status === 'connected' ? 'connected' : 'error',
            lastErrorCode: 'OAUTH_TOKEN_EXCHANGE_FAILED',
            updatedAt: new Date(),
          })
          .where(eq(connections.id, connection.id));
        return c.json(
          errorResult(Errors.oauthTokenExchangeFailed('Provider rejected the token exchange')),
          400
        );
      }

      const tokens = tokenResult.body;
      if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
        return c.json(
          errorResult(Errors.oauthTokenExchangeFailed('Provider did not return an access token')),
          400
        );
      }
      const expiresIn =
        typeof tokens.expires_in === 'number' &&
        Number.isFinite(tokens.expires_in) &&
        tokens.expires_in > 0
          ? Math.min(tokens.expires_in, 60 * 60 * 24 * 365)
          : null;
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null;
      let providerContext: OAuthProviderContext | undefined;
      try {
        providerContext = parseOAuthProviderContext(serviceId, tokens);
      } catch {
        await db
          .update(connections)
          .set({
            status: connection.status === 'connected' ? 'connected' : 'error',
            lastErrorCode: 'OAUTH_PROVIDER_CONTEXT_INVALID',
            updatedAt: new Date(),
          })
          .where(eq(connections.id, connection.id));
        return c.json(
          errorResult(
            Errors.oauthTokenExchangeFailed('Provider returned invalid routing metadata')
          ),
          400
        );
      }
      const credentialBytes = Buffer.from(
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token:
            typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
          token_type: typeof tokens.token_type === 'string' ? tokens.token_type : 'Bearer',
          scope: typeof tokens.scope === 'string' ? tokens.scope : undefined,
          expires_at: expiresAt?.toISOString(),
          provider_context: providerContext,
        }),
        'utf8'
      );
      let credentialSecretId: string;
      try {
        credentialSecretId = await secretStore.put({
          organizationId: connection.organizationId,
          purpose: 'connection_credentials',
          plaintext: credentialBytes,
        });
      } finally {
        credentialBytes.fill(0);
      }
      try {
        await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(connections)
            .set({
              status: 'connected',
              credentialSecretId,
              connectedAt: new Date(),
              expiresAt,
              lastErrorCode: null,
              metadata: {},
              version: sql`${connections.version} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(eq(connections.id, connection.id), eq(connections.version, connection.version))
            )
            .returning({ id: connections.id });
          if (!updated) throw new Error('Connection changed while OAuth was in progress');
          await tx.insert(outboxEvents).values({
            organizationId: connection.organizationId,
            eventType: 'connection.connected',
            payload: {
              externalUserId: connection.externalUserId,
              serviceId,
              connectionId: connection.id,
            },
          });
        });
      } catch (error) {
        await secretStore.delete?.(
          credentialSecretId,
          connection.organizationId,
          'connection_credentials'
        );
        throw error;
      }
      if (connection.credentialSecretId && connection.credentialSecretId !== credentialSecretId) {
        await secretStore.delete?.(
          connection.credentialSecretId,
          connection.organizationId,
          'connection_credentials'
        );
      }

      if (expiresAt && process.env.REDIS_URL) {
        const { scheduleTokenRefresh } = await import('../jobs/setup.js');
        await scheduleTokenRefresh(connection.id, serviceId, connection.organizationId, expiresAt);
      }

      /*
       * The first credential this server has ever been offered.
       *
       * Discovery asks without one, so an OAuth-protected server answers 401 and its tool list
       * stays empty. Until now nothing asked again, which left every such server permanently
       * "awaiting authorization" with nothing to offer even after a user had authorized it.
       *
       * Deliberately awaited rather than left running: the redirect that follows lands the user on
       * a page that lists what they just connected, and a contract that arrives after it is a
       * screen that looks broken. It never throws, so the worst case is the old empty list.
       */
      if (mcpServer && discoveryDeps && typeof tokens.access_token === 'string') {
        await discoverAfterFirstAuthorization(db, discoveryDeps, cache, {
          serverId: serviceId,
          organizationId: connection.organizationId,
          accessToken: tokens.access_token,
          authorizationRequired: mcpServer.authorizationRequired,
        });
      }

      const completedUrl = new URL('/connect/callback', publicApiBase(c.req.url));
      completedUrl.searchParams.set('status', 'connected');
      completedUrl.searchParams.set('serviceId', serviceId);
      return c.redirect(completedUrl.toString());
    });
  });

  router.delete('/connect/:serviceId', async (c) => {
    const serviceId = c.req.param('serviceId');
    let body: ConnectActionBody;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const token = connectTokenFromRequest(c.req.header('authorization'));
    if (
      !token ||
      !body.parentOrigin ||
      !isValidServiceId(serviceId) ||
      !isConnectableServiceId(serviceId)
    ) {
      return c.json(errorResult(Errors.unauthorized('A valid connect session is required')), 401);
    }
    const session = await loadConnectSession(db, token, serviceId, body.parentOrigin);
    if (!session) {
      return c.json(errorResult(Errors.unauthorized('Connect session is invalid or expired')), 401);
    }
    if (!canPerformDestructiveAction(session)) {
      return c.json(errorResult(Errors.stepUpRequired()), 403);
    }

    return withTenantContext(db, session.organizationId, async () => {
      const deleted = await db.transaction(async (tx) => {
        const [removed] = await tx
          .delete(connections)
          .where(
            and(
              eq(connections.organizationId, session.organizationId),
              eq(connections.externalUserId, session.externalUserId),
              eq(connections.serviceId, serviceId)
            )
          )
          .returning({ id: connections.id, credentialSecretId: connections.credentialSecretId });
        await tx
          .update(connectSessions)
          .set({ revokedAt: new Date() })
          .where(eq(connectSessions.id, session.id));
        if (removed) {
          await tx.insert(outboxEvents).values({
            organizationId: session.organizationId,
            eventType: 'connection.disconnected',
            payload: {
              externalUserId: session.externalUserId,
              serviceId,
              connectionId: removed.id,
            },
          });
        }
        return removed;
      });
      if (deleted) {
        if (deleted.credentialSecretId) {
          await secretStore.delete?.(
            deleted.credentialSecretId,
            session.organizationId,
            'connection_credentials'
          );
        }
      }
      return c.json({ data: { disconnected: Boolean(deleted) }, error: null });
    });
  });

  return router;
}

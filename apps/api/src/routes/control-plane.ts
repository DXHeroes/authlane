import type { SecretStore } from '@authlane/database';
import type {
  ConnectionStatus,
  CredentialLease,
  CredentialPlacement,
  OAuthProviderContext,
  ToolAccessPolicy,
  ToolFormat,
} from '@authlane/shared';
import {
  Errors,
  getEffectiveConnectionStatus,
  isConnectableServiceId,
  isValidServiceId,
  isValidUserId,
  validateOAuthProviderContext,
} from '@authlane/shared';
import { Hono } from 'hono';
import { errorResult } from '../lib/api-response.js';
import { requireScope } from '../middleware/scope.js';

export interface ControlPlaneService {
  id: string;
  name: string;
  authType: string;
  enabled: boolean;
  toolAccessPolicy: ToolAccessPolicy;
  config: unknown;
}

export interface ControlPlaneConnection {
  id: string;
  serviceId: string;
  status: Exclude<ConnectionStatus, 'disconnected'>;
  credentialSecretId: string | null;
  expiresAt: Date | null;
  connectedAt: Date | null;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
}

export interface CredentialAuditInput {
  organizationId: string;
  externalUserId: string;
  serviceId: string;
  apiKeyId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ControlPlaneRepository {
  listTenantServices(organizationId: string): Promise<ControlPlaneService[]>;
  listConnections(
    organizationId: string,
    externalUserId: string
  ): Promise<ControlPlaneConnection[]>;
  getConnection(
    organizationId: string,
    externalUserId: string,
    serviceId: string
  ): Promise<ControlPlaneConnection | undefined>;
  auditCredentialAccess(input: CredentialAuditInput): Promise<void>;
}

export interface ToolRegistry {
  getTools(
    serviceIds: string[],
    format: ToolFormat,
    toolAccessPolicies?: Readonly<Record<string, ToolAccessPolicy>>
  ): Promise<{ tools?: unknown[]; functions?: unknown[] }>;
  getVersion(
    serviceIds: string[],
    format: ToolFormat,
    toolAccessPolicies?: Readonly<Record<string, ToolAccessPolicy>>
  ): Promise<string>;
}

interface ControlPlaneRouterOptions {
  now?: () => Date;
  createLeaseId?: () => string;
}

interface StoredCredentials {
  access_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_at?: unknown;
  provider_context?: unknown;
  api_key?: unknown;
  placement?: unknown;
}

function isCredentialPlacement(value: unknown): value is CredentialPlacement {
  if (!value || typeof value !== 'object') return false;
  const placement = value as Record<string, unknown>;
  if (placement.type === 'query') {
    return (
      typeof placement.name === 'string' &&
      placement.name.length > 0 &&
      placement.name.length <= 128 &&
      /^[A-Za-z0-9_.~-]+$/.test(placement.name)
    );
  }
  return (
    placement.type === 'header' &&
    typeof placement.name === 'string' &&
    placement.name.length > 0 &&
    placement.name.length <= 128 &&
    /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(placement.name) &&
    (placement.prefix === undefined ||
      (typeof placement.prefix === 'string' &&
        placement.prefix.length <= 128 &&
        !/[\r\n]/.test(placement.prefix)))
  );
}

function toCredentialLease(
  stored: StoredCredentials,
  leaseId: string,
  connectionExpiresAt: Date | null,
  serviceId: string
): CredentialLease | null {
  let storedExpiresAt: Date | null = null;
  if (stored.expires_at !== undefined && stored.expires_at !== null) {
    if (typeof stored.expires_at !== 'string') return null;
    storedExpiresAt = new Date(stored.expires_at);
    if (Number.isNaN(storedExpiresAt.getTime())) return null;
  }
  const effectiveExpiry =
    storedExpiresAt && connectionExpiresAt
      ? new Date(Math.min(storedExpiresAt.getTime(), connectionExpiresAt.getTime()))
      : (storedExpiresAt ?? connectionExpiresAt);
  const expiresAt = effectiveExpiry?.toISOString() ?? null;

  if (typeof stored.access_token === 'string' && stored.access_token.length > 0) {
    let providerContext: OAuthProviderContext | undefined;
    try {
      providerContext = validateOAuthProviderContext(serviceId, stored.provider_context);
    } catch {
      return null;
    }
    return {
      type: 'oauth2',
      leaseId,
      accessToken: stored.access_token,
      tokenType:
        typeof stored.token_type === 'string' && stored.token_type.length > 0
          ? stored.token_type
          : 'Bearer',
      scopes:
        typeof stored.scope === 'string'
          ? stored.scope.split(/\s+/).filter((scope) => scope.length > 0)
          : [],
      expiresAt,
      ...(providerContext ? { providerContext } : {}),
    };
  }

  if (
    typeof stored.api_key === 'string' &&
    stored.api_key.length > 0 &&
    isCredentialPlacement(stored.placement)
  ) {
    return {
      type: 'api_key',
      leaseId,
      value: stored.api_key,
      placement: stored.placement,
      expiresAt,
    };
  }

  return null;
}

function parseFormat(value: string | undefined): ToolFormat | null {
  if (!value || value === 'mcp') return 'mcp';
  return value === 'openai' ? 'openai' : null;
}

function connectionView(
  serviceId: string,
  connection: ControlPlaneConnection | undefined,
  now: Date
) {
  const status = getEffectiveConnectionStatus(
    connection
      ? {
          status: connection.status,
          hasCredentials: Boolean(connection.credentialSecretId),
          expiresAt: connection.expiresAt,
        }
      : null,
    now
  );

  return {
    serviceId,
    status,
    connected: status === 'connected',
    expiresAt: connection?.expiresAt?.toISOString() ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    lastCheckedAt: connection?.lastCheckedAt?.toISOString() ?? null,
    errorCode: connection?.lastErrorCode ?? null,
  };
}

export function createControlPlaneRouter(
  repository: ControlPlaneRepository,
  registry: ToolRegistry,
  secretStore: SecretStore,
  options: ControlPlaneRouterOptions = {}
) {
  const router = new Hono();
  const now = options.now ?? (() => new Date());
  const createLeaseId = options.createLeaseId ?? (() => crypto.randomUUID());

  router.get('/catalog/services', requireScope('catalog:read'), async (c) => {
    const principal = c.get('principal');
    const tenantServices = await repository.listTenantServices(principal.organizationId);
    return c.json({ data: tenantServices, error: null });
  });

  router.get('/users/:externalUserId/connections', requireScope('connections:read'), async (c) => {
    const externalUserId = c.req.param('externalUserId');
    if (!isValidUserId(externalUserId)) {
      return c.json(errorResult(Errors.validationError('Invalid external user ID')), 400);
    }

    const principal = c.get('principal');
    const [tenantServices, storedConnections] = await Promise.all([
      repository.listTenantServices(principal.organizationId),
      repository.listConnections(principal.organizationId, externalUserId),
    ]);
    const connectionsByService = new Map(
      storedConnections.map((connection) => [connection.serviceId, connection])
    );
    const data = tenantServices.map((service) =>
      connectionView(service.id, connectionsByService.get(service.id), now())
    );
    return c.json({ data, error: null });
  });

  router.get('/users/:externalUserId/capabilities', requireScope('connections:read'), async (c) => {
    const externalUserId = c.req.param('externalUserId');
    const format = parseFormat(c.req.query('format'));
    if (!isValidUserId(externalUserId) || !format) {
      return c.json(
        errorResult(
          Errors.validationError('Invalid external user ID or tool format', 'Use mcp or openai')
        ),
        400
      );
    }

    const principal = c.get('principal');
    const [tenantServices, storedConnections] = await Promise.all([
      repository.listTenantServices(principal.organizationId),
      repository.listConnections(principal.organizationId, externalUserId),
    ]);
    const connectionsByService = new Map(
      storedConnections.map((connection) => [connection.serviceId, connection])
    );
    const requestTime = now();
    const views = tenantServices.map((service) => ({
      ...connectionView(service.id, connectionsByService.get(service.id), requestTime),
      toolAccessPolicy: service.toolAccessPolicy,
    }));
    const connectedServiceIds = views
      .filter((connection) => connection.connected)
      .map((connection) => connection.serviceId);
    const toolAccessPolicies = Object.fromEntries(
      tenantServices.map((service) => [service.id, service.toolAccessPolicy])
    );

    const [version, servicesWithTools] = await Promise.all([
      registry.getVersion(connectedServiceIds, format, toolAccessPolicies),
      Promise.all(
        views.map(async (connection) => {
          if (!connection.connected) {
            return { ...connection, tools: [] };
          }
          const definitions = await registry.getTools(
            [connection.serviceId],
            format,
            toolAccessPolicies
          );
          return {
            ...connection,
            tools: format === 'mcp' ? (definitions.tools ?? []) : (definitions.functions ?? []),
          };
        })
      ),
    ]);

    const services = servicesWithTools.map(
      ({
        connectedAt: _connectedAt,
        lastCheckedAt: _lastCheckedAt,
        errorCode: _errorCode,
        ...service
      }) => service
    );
    return c.json({
      data: { externalUserId, format, version, services },
      error: null,
    });
  });

  router.get('/users/:externalUserId/tools', requireScope('connections:read'), async (c) => {
    const externalUserId = c.req.param('externalUserId');
    const format = parseFormat(c.req.query('format'));
    if (!isValidUserId(externalUserId) || !format) {
      return c.json(
        errorResult(Errors.validationError('Invalid external user ID or tool format')),
        400
      );
    }
    const principal = c.get('principal');
    const [tenantServices, storedConnections] = await Promise.all([
      repository.listTenantServices(principal.organizationId),
      repository.listConnections(principal.organizationId, externalUserId),
    ]);
    const enabledServiceIds = new Set(tenantServices.map((service) => service.id));
    const toolAccessPolicies = Object.fromEntries(
      tenantServices.map((service) => [service.id, service.toolAccessPolicy])
    );
    const requestTime = now();
    const connectedServiceIds = storedConnections
      .filter(
        (connection) =>
          getEffectiveConnectionStatus(
            {
              status: connection.status,
              hasCredentials: Boolean(connection.credentialSecretId),
              expiresAt: connection.expiresAt,
            },
            requestTime
          ) === 'connected'
      )
      .filter((connection) => enabledServiceIds.has(connection.serviceId))
      .map((connection) => connection.serviceId);
    const [definitions, version] = await Promise.all([
      registry.getTools(connectedServiceIds, format, toolAccessPolicies),
      registry.getVersion(connectedServiceIds, format, toolAccessPolicies),
    ]);
    return c.json({ data: { ...definitions, version }, error: null });
  });

  router.post(
    '/users/:externalUserId/connections/:serviceId/credential-leases',
    requireScope('credentials:issue'),
    async (c) => {
      const externalUserId = c.req.param('externalUserId');
      const serviceId = c.req.param('serviceId');
      if (
        !isValidUserId(externalUserId) ||
        !isValidServiceId(serviceId) ||
        !isConnectableServiceId(serviceId)
      ) {
        return c.json(
          errorResult(Errors.validationError('Invalid external user ID or service ID')),
          400
        );
      }

      const principal = c.get('principal');
      const connection = await repository.getConnection(
        principal.organizationId,
        externalUserId,
        serviceId
      );
      if (!connection) {
        return c.json(errorResult(Errors.notFound('Connection')), 404);
      }
      const requestTime = now();
      const effectiveStatus = getEffectiveConnectionStatus(
        {
          status: connection.status,
          hasCredentials: Boolean(connection.credentialSecretId),
          expiresAt: connection.expiresAt,
        },
        requestTime
      );
      if (effectiveStatus !== 'connected' || !connection.credentialSecretId) {
        return c.json(
          errorResult(Errors.connectionNotConnected(`Connection to ${serviceId} is not connected`)),
          409
        );
      }

      const secret = await secretStore.read(
        connection.credentialSecretId,
        principal.organizationId,
        'connection_credentials'
      );
      let parsed: unknown;
      try {
        parsed = JSON.parse(secret.toString('utf8')) as unknown;
      } catch {
        return c.json(
          errorResult(Errors.encryptionError('Stored credential material is invalid')),
          500
        );
      } finally {
        secret.fill(0);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return c.json(
          errorResult(Errors.encryptionError('Stored credential material is invalid')),
          500
        );
      }
      const stored = parsed as StoredCredentials;
      const lease = toCredentialLease(stored, createLeaseId(), connection.expiresAt, serviceId);
      if (!lease) {
        return c.json(
          errorResult(Errors.encryptionError('Stored credential material is invalid')),
          500
        );
      }

      await repository.auditCredentialAccess({
        organizationId: principal.organizationId,
        externalUserId,
        serviceId,
        apiKeyId: principal.apiKeyId,
        ipAddress: c.get('clientIp') || null,
        userAgent: c.req.header('user-agent') ?? null,
      });
      c.header('Cache-Control', 'no-store, private');
      c.header('Pragma', 'no-cache');
      return c.json({ data: lease, error: null }, 201);
    }
  );

  return router;
}

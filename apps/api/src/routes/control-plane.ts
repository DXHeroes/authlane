import { decrypt, getEncryptionKey } from '@authlane/crypto';
import type { ConnectionStatus, CredentialMaterial, ToolFormat } from '@authlane/shared';
import {
  Errors,
  getEffectiveConnectionStatus,
  isValidServiceId,
  isValidUserId,
} from '@authlane/shared';
import { Hono } from 'hono';
import { requireScope } from '../middleware/scope.js';

export interface ControlPlaneService {
  id: string;
  name: string;
  authType: string;
  enabled: boolean;
  config: unknown;
}

export interface ControlPlaneConnection {
  id: string;
  serviceId: string;
  status: Exclude<ConnectionStatus, 'disconnected'>;
  credentialsEnc: string | null;
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
    format: ToolFormat
  ): Promise<{ tools?: unknown[]; functions?: unknown[] }>;
  getVersion(serviceIds: string[], format: ToolFormat): Promise<string>;
}

interface ControlPlaneRouterOptions {
  now?: () => Date;
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
          hasCredentials: Boolean(connection.credentialsEnc),
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

function exposeCredentials(value: unknown): CredentialMaterial | null {
  if (!value || typeof value !== 'object') return null;
  const credential = value as Record<string, unknown>;

  if (typeof credential.access_token === 'string') {
    return {
      type: 'oauth2',
      accessToken: credential.access_token,
      tokenType: typeof credential.token_type === 'string' ? credential.token_type : 'Bearer',
      scopes:
        typeof credential.scope === 'string' ? credential.scope.split(/\s+/).filter(Boolean) : [],
      expiresAt: typeof credential.expires_at === 'string' ? credential.expires_at : null,
    };
  }

  if (typeof credential.api_key === 'string') {
    return {
      type: 'api_key',
      apiKey: credential.api_key,
      ...(typeof credential.api_secret === 'string' ? { apiSecret: credential.api_secret } : {}),
    };
  }

  if (credential.headers && typeof credential.headers === 'object') {
    const headers = Object.fromEntries(
      Object.entries(credential.headers as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
    return { type: 'header', headers };
  }

  return null;
}

export function createControlPlaneRouter(
  repository: ControlPlaneRepository,
  registry: ToolRegistry,
  options: ControlPlaneRouterOptions = {}
) {
  const router = new Hono();
  const now = options.now ?? (() => new Date());

  router.get('/catalog/services', requireScope('catalog:read'), async (c) => {
    const principal = c.get('principal');
    const tenantServices = await repository.listTenantServices(principal.organizationId);
    return c.json({ data: tenantServices, error: null });
  });

  router.get('/users/:externalUserId/connections', requireScope('connections:read'), async (c) => {
    const externalUserId = c.req.param('externalUserId');
    if (!isValidUserId(externalUserId)) {
      return c.json(Errors.validationError('Invalid external user ID'), 400);
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
        Errors.validationError('Invalid external user ID or tool format', 'Use mcp or openai'),
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
    const views = tenantServices.map((service) =>
      connectionView(service.id, connectionsByService.get(service.id), requestTime)
    );
    const connectedServiceIds = views
      .filter((connection) => connection.connected)
      .map((connection) => connection.serviceId);

    const [version, servicesWithTools] = await Promise.all([
      registry.getVersion(connectedServiceIds, format),
      Promise.all(
        views.map(async (connection) => {
          if (!connection.connected) {
            return { ...connection, tools: [] };
          }
          const definitions = await registry.getTools([connection.serviceId], format);
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
      return c.json(Errors.validationError('Invalid external user ID or tool format'), 400);
    }
    const principal = c.get('principal');
    const storedConnections = await repository.listConnections(
      principal.organizationId,
      externalUserId
    );
    const requestTime = now();
    const connectedServiceIds = storedConnections
      .filter(
        (connection) =>
          getEffectiveConnectionStatus(
            {
              status: connection.status,
              hasCredentials: Boolean(connection.credentialsEnc),
              expiresAt: connection.expiresAt,
            },
            requestTime
          ) === 'connected'
      )
      .map((connection) => connection.serviceId);
    const [definitions, version] = await Promise.all([
      registry.getTools(connectedServiceIds, format),
      registry.getVersion(connectedServiceIds, format),
    ]);
    return c.json({ data: { ...definitions, version }, error: null });
  });

  router.get(
    '/users/:externalUserId/connections/:serviceId/credentials',
    requireScope('credentials:read'),
    async (c) => {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      const externalUserId = c.req.param('externalUserId');
      const serviceId = c.req.param('serviceId');
      if (!isValidUserId(externalUserId) || !isValidServiceId(serviceId)) {
        return c.json(Errors.validationError('Invalid external user ID or service ID'), 400);
      }

      const principal = c.get('principal');
      const connection = await repository.getConnection(
        principal.organizationId,
        externalUserId,
        serviceId
      );
      const effectiveStatus = getEffectiveConnectionStatus(
        connection
          ? {
              status: connection.status,
              hasCredentials: Boolean(connection.credentialsEnc),
              expiresAt: connection.expiresAt,
            }
          : null,
        now()
      );
      if (!connection || effectiveStatus !== 'connected' || !connection.credentialsEnc) {
        return c.json(Errors.connectionNotConnected(`${serviceId} is ${effectiveStatus}`), 409);
      }

      const exposed = exposeCredentials(
        JSON.parse(decrypt(connection.credentialsEnc, getEncryptionKey()))
      );
      if (!exposed) {
        return c.json(Errors.encryptionError('Unsupported credential material'), 500);
      }

      await repository.auditCredentialAccess({
        organizationId: principal.organizationId,
        externalUserId,
        serviceId,
        apiKeyId: principal.apiKeyId,
        ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null,
        userAgent: c.req.header('user-agent') ?? null,
      });
      return c.json({ data: exposed, error: null });
    }
  );

  return router;
}

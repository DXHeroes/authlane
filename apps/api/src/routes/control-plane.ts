import type { ConnectionStatus, ToolFormat } from '@authlane/shared';
import {
  Errors,
  getEffectiveConnectionStatus,
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

  return router;
}

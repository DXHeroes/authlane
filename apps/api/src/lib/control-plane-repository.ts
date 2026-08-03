import type { Database } from '@authlane/database';
import {
  and,
  connections,
  credentialAccessLogs,
  eq,
  inArray,
  organizationServices,
  services,
} from '@authlane/database';
import { getAllowedServiceIds } from '@authlane/shared';
import type {
  ControlPlaneConnection,
  ControlPlaneRepository,
  CredentialAuditInput,
} from '../routes/control-plane.js';
import type { CacheStore } from './cache.js';
import { recordCacheHit, recordCacheMiss } from './metrics.js';

export class DrizzleControlPlaneRepository implements ControlPlaneRepository {
  constructor(private readonly db: Database) {}

  async listTenantServices(organizationId: string) {
    const rows = await this.db
      .select({
        id: services.id,
        name: services.name,
        authType: services.authType,
        enabled: organizationServices.enabled,
        toolAccessPolicy: organizationServices.toolAccessPolicy,
        config: services.config,
      })
      .from(organizationServices)
      .innerJoin(services, eq(services.id, organizationServices.serviceId))
      .where(
        and(
          eq(organizationServices.organizationId, organizationId),
          eq(organizationServices.enabled, true),
          eq(services.enabled, true),
          inArray(services.id, getAllowedServiceIds())
        )
      );
    return rows.map((row) => ({
      ...row,
      toolAccessPolicy:
        row.toolAccessPolicy === 'full' ? ('full' as const) : ('read_only' as const),
    }));
  }

  async listConnections(organizationId: string, externalUserId: string) {
    return this.db
      .select({
        id: connections.id,
        serviceId: connections.serviceId,
        status: connections.status,
        credentialSecretId: connections.credentialSecretId,
        expiresAt: connections.expiresAt,
        connectedAt: connections.connectedAt,
        lastCheckedAt: connections.lastCheckedAt,
        lastErrorCode: connections.lastErrorCode,
      })
      .from(connections)
      .where(
        and(
          eq(connections.organizationId, organizationId),
          eq(connections.externalUserId, externalUserId),
          inArray(connections.serviceId, getAllowedServiceIds())
        )
      );
  }

  async getConnection(organizationId: string, externalUserId: string, serviceId: string) {
    const [connection] = await this.db
      .select({
        id: connections.id,
        serviceId: connections.serviceId,
        status: connections.status,
        credentialSecretId: connections.credentialSecretId,
        expiresAt: connections.expiresAt,
        connectedAt: connections.connectedAt,
        lastCheckedAt: connections.lastCheckedAt,
        lastErrorCode: connections.lastErrorCode,
      })
      .from(connections)
      .where(
        and(
          eq(connections.organizationId, organizationId),
          eq(connections.externalUserId, externalUserId),
          eq(connections.serviceId, serviceId)
        )
      )
      .limit(1);
    return connection;
  }

  async auditCredentialAccess(input: CredentialAuditInput): Promise<void> {
    await this.db.insert(credentialAccessLogs).values(input);
  }
}

interface SerializedConnection
  extends Omit<ControlPlaneConnection, 'expiresAt' | 'connectedAt' | 'lastCheckedAt'> {
  expiresAt: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
}

function serializeConnection(connection: ControlPlaneConnection): SerializedConnection {
  return {
    ...connection,
    expiresAt: connection.expiresAt?.toISOString() ?? null,
    connectedAt: connection.connectedAt?.toISOString() ?? null,
    lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
  };
}

function deserializeConnection(connection: SerializedConnection): ControlPlaneConnection {
  return {
    ...connection,
    expiresAt: connection.expiresAt ? new Date(connection.expiresAt) : null,
    connectedAt: connection.connectedAt ? new Date(connection.connectedAt) : null,
    lastCheckedAt: connection.lastCheckedAt ? new Date(connection.lastCheckedAt) : null,
  };
}

export class CachedControlPlaneRepository implements ControlPlaneRepository {
  constructor(
    private readonly source: ControlPlaneRepository,
    private readonly cache: CacheStore
  ) {}

  async listTenantServices(organizationId: string) {
    const key = `control-plane:tenant-services:${organizationId}`;
    const cached =
      await this.cache.get<Awaited<ReturnType<ControlPlaneRepository['listTenantServices']>>>(key);
    if (cached) {
      recordCacheHit('tenant_services');
      return cached;
    }
    recordCacheMiss('tenant_services');

    const value = await this.source.listTenantServices(organizationId);
    await this.cache.set(key, value, 300);
    return value;
  }

  async listConnections(organizationId: string, externalUserId: string) {
    const key = `control-plane:connections:${organizationId}:${externalUserId}`;
    const cached = await this.cache.get<SerializedConnection[]>(key);
    if (cached) {
      recordCacheHit('connections');
      return cached.map(deserializeConnection);
    }
    recordCacheMiss('connections');

    const value = await this.source.listConnections(organizationId, externalUserId);
    await this.cache.set(key, value.map(serializeConnection), 30);
    return value;
  }

  getConnection(organizationId: string, externalUserId: string, serviceId: string) {
    return this.source.getConnection(organizationId, externalUserId, serviceId);
  }

  auditCredentialAccess(input: CredentialAuditInput) {
    return this.source.auditCredentialAccess(input);
  }
}

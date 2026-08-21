import type { Database } from '@authlane/database';
import {
  and,
  connections,
  credentialAccessLogs,
  eq,
  inArray,
  like,
  listEnabledMcpServers,
  MCP_SERVER_ID_PREFIX,
  or,
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
import {
  connectabilityOf,
  resolveBuiltInAuthorization,
  resolveMcpAuthorization,
} from './oauth-provider-resolution.js';
import { deriveInitials } from './service-branding.js';
import { serviceEnabledForOrganization, tenantServiceJoin } from './service-enablement.js';

/**
 * Where an organization's catalogue is cached.
 *
 * Exported because every route that changes what the catalogue would say has to drop this exact
 * key. Written out at each of those call sites, one of them would eventually be spelled
 * differently and a workspace would keep being told a service is unconnectable for five minutes
 * after its owner fixed it.
 */
export function tenantServicesCacheKey(organizationId: string): string {
  return `control-plane:tenant-services:${organizationId}`;
}

export class DrizzleControlPlaneRepository implements ControlPlaneRepository {
  constructor(private readonly db: Database) {}

  async listTenantServices(organizationId: string) {
    const rows = await this.db
      .select({
        id: services.id,
        name: services.name,
        authType: services.authType,
        enabled: organizationServices.enabled,
        oauthClientId: organizationServices.oauthClientId,
        toolAccessPolicy: organizationServices.toolAccessPolicy,
        config: services.config,
        description: services.description,
        iconPath: services.iconPath,
        brandColor: services.brandColor,
        initials: services.initials,
        category: services.category,
      })
      .from(services)
      .leftJoin(organizationServices, tenantServiceJoin(organizationId))
      .where(
        and(
          eq(services.enabled, true),
          inArray(services.id, getAllowedServiceIds()),
          serviceEnabledForOrganization()
        )
      );
    const builtIn = rows.map(({ oauthClientId, ...row }) => {
      /*
       * A left join leaves this null for a service the organization never configured, which the
       * where clause only admits when the platform can authorize it on its own credentials — so an
       * absent row means on. This used to be a hardcoded `true`, which happened to agree with the
       * query and would have gone on agreeing with it silently after the query changed.
       */
      const enabled = row.enabled ?? true;
      return {
        ...row,
        kind: 'service' as const,
        enabled,
        toolAccessPolicy:
          row.toolAccessPolicy === 'full' ? ('full' as const) : ('read_only' as const),
        ...connectabilityOf(
          resolveBuiltInAuthorization({
            serviceId: row.id,
            authType: row.authType,
            enabled,
            config: row.config,
            tenantOAuthClientId: oauthClientId,
          })
        ),
      };
    });

    // Servers the tenant registered itself. They are not in `services`, which is a global catalog,
    // so without this the SDK would never surface them and no user could be offered one.
    const tenantServers = await listEnabledMcpServers(this.db, organizationId);
    return [
      ...builtIn,
      ...tenantServers.map((server) => ({
        id: server.id,
        name: server.name,
        authType: server.authType,
        kind: 'mcp_server' as const,
        enabled: server.enabled,
        /*
         * A tenant has nowhere to declare branding for its own server yet, so these are honestly
         * absent rather than guessed. `initials` is the exception: it derives from the name the
         * tenant already gave, so a card always has something to draw.
         */
        description: null,
        iconPath: null,
        brandColor: null,
        initials: deriveInitials(server.name),
        category: null,
        // Per-tool risk is stored on the contract, so the service-level policy stays permissive
        // and the read_only decision is made per tool when they are issued.
        toolAccessPolicy: 'full' as const,
        /*
         * The same shape a built-in service carries, so a runtime reads one field for both kinds.
         *
         * This used to be `{}`, which meant a tenant could be offered a server and issued a
         * credential for it while never being told where to send it. The only way to run an MCP
         * server's tools was to already know its address, so every consumer transcribed a table of
         * them by hand and could serve nothing else.
         */
        config: {
          execution: {
            preferred: 'provider_mcp',
            provider_mcp: { endpoint: server.serverUrl },
          },
        },
        // The whole row goes to the same resolver the authorize route calls, so the catalogue
        // cannot advertise a connection that route would refuse.
        ...connectabilityOf(resolveMcpAuthorization(server)),
      })),
    ];
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
          // Built-in ids come from a fixed list; a tenant server's id is generated, so it is
          // matched by prefix. RLS still confines the rows to this organization.
          or(
            inArray(connections.serviceId, getAllowedServiceIds()),
            like(connections.serviceId, `${MCP_SERVER_ID_PREFIX}%`)
          )
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
    const key = tenantServicesCacheKey(organizationId);
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

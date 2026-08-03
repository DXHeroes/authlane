/**
 * Which catalog services a workspace may use.
 *
 * A service the platform holds OAuth credentials for is available in every workspace without anyone
 * enabling it first. Otherwise each new tenant would face a catalog where nothing works until they
 * walk the whole list, even though Authlane already has the application registered.
 *
 * An `organization_services` row therefore means "this tenant decided", and its absence means "take
 * the platform default". A present row always wins, so a tenant can still switch a service off, and
 * a service without platform credentials stays off until someone supplies their own application.
 */

import {
  and,
  type Database,
  eq,
  inArray,
  isNull,
  or,
  organizationServices,
  services,
  sql,
} from '@authlane/database';
import { getAllowedServiceIds, getPlatformOAuthCredentials } from '@authlane/shared';
import type { SQL } from 'drizzle-orm';

/** Settings a service falls back to when the tenant has never configured it. */
export const PLATFORM_DEFAULT_SERVICE_SETTINGS = {
  /** Matches the `organization_services.tool_access_policy` column default. */
  toolAccessPolicy: 'read_only' as const,
  oauthClientId: null,
  oauthClientSecretId: null,
  customScopes: null,
} satisfies {
  toolAccessPolicy: 'read_only';
  oauthClientId: null;
  oauthClientSecretId: null;
  customScopes: null;
};

/**
 * Catalog services Authlane can authorize on its own credentials.
 *
 * Read from the environment on every call rather than cached, so adding a credential to the
 * deployment takes effect on the next request instead of the next restart.
 */
export function platformDefaultServiceIds(): string[] {
  return getAllowedServiceIds().filter((id) => getPlatformOAuthCredentials(id) !== null);
}

export function isPlatformDefaultService(serviceId: string): boolean {
  return getPlatformOAuthCredentials(serviceId) !== null;
}

/**
 * Join condition pairing a catalog service with this organization's row, if it has one.
 *
 * Always use with `leftJoin` — an inner join would drop exactly the platform-default services this
 * module exists to surface.
 */
export function tenantServiceJoin(organizationId: string): SQL {
  return and(
    eq(organizationServices.serviceId, services.id),
    eq(organizationServices.organizationId, organizationId)
  ) as SQL;
}

/**
 * Where predicate for "this service is usable by the joined organization".
 *
 * Pairs with {@link tenantServiceJoin}: either the tenant enabled it, or it has no row and the
 * platform can authorize it.
 */
export function serviceEnabledForOrganization(): SQL {
  const defaults = platformDefaultServiceIds();
  const platformDefault =
    defaults.length > 0
      ? and(isNull(organizationServices.serviceId), inArray(services.id, defaults))
      : sql`false`;

  return or(eq(organizationServices.enabled, true), platformDefault) as SQL;
}

export type TenantServiceSettings = {
  toolAccessPolicy: string;
  oauthClientId: string | null;
  oauthClientSecretId: string | null;
  customScopes: string[] | null;
};

/**
 * How one organization is configured for one catalog service, or null when it may not use it.
 *
 * A stored row decides on its own — including a disabled one, which blocks the service even though
 * the platform could authorize it. Only an absent row falls back to the platform default.
 */
export async function readTenantServiceSettings(
  db: Database,
  organizationId: string,
  serviceId: string
): Promise<TenantServiceSettings | null> {
  const [row] = await db
    .select({
      enabled: organizationServices.enabled,
      toolAccessPolicy: organizationServices.toolAccessPolicy,
      oauthClientId: organizationServices.oauthClientId,
      oauthClientSecretId: organizationServices.oauthClientSecretId,
      customScopes: organizationServices.customScopes,
    })
    .from(organizationServices)
    .where(
      and(
        eq(organizationServices.organizationId, organizationId),
        eq(organizationServices.serviceId, serviceId)
      )
    )
    .limit(1);

  if (row) {
    if (!row.enabled) return null;
    return {
      toolAccessPolicy: row.toolAccessPolicy,
      oauthClientId: row.oauthClientId,
      oauthClientSecretId: row.oauthClientSecretId,
      customScopes: row.customScopes,
    };
  }

  return isPlatformDefaultService(serviceId) ? { ...PLATFORM_DEFAULT_SERVICE_SETTINGS } : null;
}

import { and, eq, inArray, organizationServices, services } from '@authlane/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isPlatformDefaultService,
  PLATFORM_DEFAULT_SERVICE_SETTINGS,
  platformDefaultServiceIds,
  readTenantServiceSettings,
  serviceEnabledForOrganization,
  tenantServiceJoin,
} from '../../src/lib/service-enablement.js';

const GITHUB_CLIENT_ID = 'AUTHLANE_OAUTH_GITHUB_CLIENT_ID';
const GITHUB_CLIENT_SECRET = 'AUTHLANE_OAUTH_GITHUB_CLIENT_SECRET';

afterEach(() => {
  delete process.env[GITHUB_CLIENT_ID];
  delete process.env[GITHUB_CLIENT_SECRET];
});

/** Returns whatever `rows` holds for the single select the helper performs. */
function fakeDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => rows }) }),
    }),
  } as unknown as Parameters<typeof readTenantServiceSettings>[0];
}

describe('platform default services', () => {
  it('lists only services the platform has a client id for', () => {
    expect(platformDefaultServiceIds()).not.toContain('github');

    process.env[GITHUB_CLIENT_ID] = 'client-id';
    process.env[GITHUB_CLIENT_SECRET] = 'client-secret';

    expect(platformDefaultServiceIds()).toContain('github');
    expect(isPlatformDefaultService('github')).toBe(true);
  });

  it('reads the environment on every call, so a new credential needs no restart', () => {
    expect(isPlatformDefaultService('github')).toBe(false);
    process.env[GITHUB_CLIENT_ID] = 'client-id';
    expect(isPlatformDefaultService('github')).toBe(true);
  });
});

describe('readTenantServiceSettings', () => {
  it('falls back to the platform default when the organization has no row', async () => {
    process.env[GITHUB_CLIENT_ID] = 'client-id';

    const settings = await readTenantServiceSettings(fakeDb([]), 'org-1', 'github');

    expect(settings).toEqual(PLATFORM_DEFAULT_SERVICE_SETTINGS);
  });

  it('refuses a service the platform cannot authorize and the tenant never configured', async () => {
    expect(await readTenantServiceSettings(fakeDb([]), 'org-1', 'github')).toBeNull();
  });

  it('honours an explicit opt-out even when the platform could authorize it', async () => {
    process.env[GITHUB_CLIENT_ID] = 'client-id';
    const disabled = [
      {
        enabled: false,
        toolAccessPolicy: 'full',
        oauthClientId: null,
        oauthClientSecretId: null,
        customScopes: null,
      },
    ];

    expect(await readTenantServiceSettings(fakeDb(disabled), 'org-1', 'github')).toBeNull();
  });

  it("returns the tenant's own application when it has one", async () => {
    const row = [
      {
        enabled: true,
        toolAccessPolicy: 'full',
        oauthClientId: 'tenant-client',
        oauthClientSecretId: 'secret-1',
        customScopes: ['repo'],
      },
    ];

    expect(await readTenantServiceSettings(fakeDb(row), 'org-1', 'github')).toEqual({
      toolAccessPolicy: 'full',
      oauthClientId: 'tenant-client',
      oauthClientSecretId: 'secret-1',
      customScopes: ['repo'],
    });
  });
});

/** Compiles the predicate without a database, so its SQL shape is checked, not just its inputs. */
function compileCatalogQuery() {
  const db = drizzle({} as never, { schema: {} });
  return db
    .select({ id: services.id })
    .from(services)
    .leftJoin(organizationServices, tenantServiceJoin('org-1'))
    .where(
      and(
        eq(services.enabled, true),
        inArray(services.id, ['github', 'slack']),
        serviceEnabledForOrganization()
      )
    )
    .toSQL();
}

describe('catalog query', () => {
  it('accepts a service with no row once the platform holds credentials for it', () => {
    process.env[GITHUB_CLIENT_ID] = 'client-id';

    const { sql, params } = compileCatalogQuery();

    // The join has to be a left join, or the rows this whole module exists to surface are dropped
    // before the predicate ever runs.
    expect(sql).toContain('left join "organization_services"');
    expect(sql).toContain('"organization_services"."service_id" is null');
    expect(params).toContain('github');
  });

  it('admits nothing extra when the platform has no credentials at all', () => {
    const { sql } = compileCatalogQuery();

    expect(sql).toContain('or false');
    expect(sql).not.toContain('is null');
  });
});

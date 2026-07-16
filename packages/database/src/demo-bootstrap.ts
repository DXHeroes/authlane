import { randomBytes, randomUUID } from 'node:crypto';
import { createApiKey, getLookupKeyring } from '@authlane/crypto';
import { hashUserPassword } from '@authlane/shared';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Database } from './client.js';
import {
  account,
  apiKeys,
  connections,
  connectSessions,
  invitation,
  member,
  oauthTransactions,
  organization,
  organizationServices,
  outboxEvents,
  secretRecords,
  services,
  user,
} from './schema/index.js';
import { createDatabaseSecretStore } from './secret-store.js';

export const DEMO_ORGANIZATION_ID = 'authlane_demo_org';
export const DEMO_USER_ID = 'authlane_demo_admin';
export const DEMO_ADMIN_EMAIL = 'admin@demo.authlane.local';
export const DEMO_EXTERNAL_USER_ID = 'demo_user_123';

export function demoServiceConfig() {
  return {
    authorization_url: 'http://localhost:5175/demo-provider/authorize',
    token_url: 'http://localhost:5175/demo-provider/token',
    api_base_url: 'http://localhost:5175/demo-provider',
    scopes: [
      {
        name: 'demo:read',
        description: 'Read deterministic local demo resources',
        required: true,
      },
    ],
    default_scopes: ['demo:read'],
    pkce_required: true,
    supports_refresh_token: true,
    docs_url: 'http://localhost:5175/',
  };
}

export const DEMO_SERVICE = {
  id: 'authlane-demo',
  name: 'Authlane Demo Provider',
  authType: 'oauth2',
  enabled: true,
} as const;

interface BootstrapDemoOptions {
  adminDatabaseUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  github?: { clientId: string; clientSecret: string };
  apiKeyTtlMs?: number;
}

export interface DemoBootstrapResult {
  adminEmail: string;
  adminPassword: string;
  apiKey: string;
  organizationId: string;
  externalUserId: string;
}

function randomPassword(): string {
  return `Authlane-${randomBytes(32).toString('base64url')}`;
}

export async function bootstrapDemo(options: BootstrapDemoOptions): Promise<DemoBootstrapResult> {
  if (!options.oauthClientId || !options.oauthClientSecret) {
    throw new Error('Demo OAuth client credentials are required');
  }
  const sql = postgres(options.adminDatabaseUrl, { max: 1 });
  const db = drizzle(sql, {
    schema: {
      account,
      apiKeys,
      member,
      organization,
      organizationServices,
      services,
      user,
    },
  });
  const adminPassword = randomPassword();
  const passwordHash = await hashUserPassword(adminPassword);

  try {
    await db
      .insert(organization)
      .values({
        id: DEMO_ORGANIZATION_ID,
        name: 'Authlane Local Demo',
        slug: 'authlane-local-demo',
      })
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: 'Authlane Local Demo', slug: 'authlane-local-demo' },
      });
    await db
      .insert(user)
      .values({
        id: DEMO_USER_ID,
        name: 'Authlane Demo Admin',
        email: DEMO_ADMIN_EMAIL,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: user.id,
        set: {
          name: 'Authlane Demo Admin',
          email: DEMO_ADMIN_EMAIL,
          emailVerified: true,
          updatedAt: new Date(),
        },
      });
    await db
      .insert(account)
      .values({
        id: 'authlane_demo_credential',
        accountId: DEMO_USER_ID,
        providerId: 'credential',
        userId: DEMO_USER_ID,
        password: passwordHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: account.id,
        set: { password: passwordHash, updatedAt: new Date() },
      });
    await db
      .insert(member)
      .values({
        id: 'authlane_demo_membership',
        organizationId: DEMO_ORGANIZATION_ID,
        userId: DEMO_USER_ID,
        role: 'owner',
      })
      .onConflictDoUpdate({ target: member.id, set: { role: 'owner' } });

    await db
      .insert(services)
      .values({ ...DEMO_SERVICE, config: demoServiceConfig() })
      .onConflictDoUpdate({
        target: services.id,
        set: { ...DEMO_SERVICE, config: demoServiceConfig() },
      });

    const secretStore = createDatabaseSecretStore(db as unknown as Database);
    const demoSecret = Buffer.from(options.oauthClientSecret, 'utf8');
    let demoClientSecretId: string;
    try {
      demoClientSecretId = await secretStore.put({
        id: 'authlane-demo-oauth-client-secret',
        organizationId: DEMO_ORGANIZATION_ID,
        purpose: 'oauth_client_secret',
        plaintext: demoSecret,
      });
    } finally {
      demoSecret.fill(0);
    }
    await db
      .insert(organizationServices)
      .values({
        organizationId: DEMO_ORGANIZATION_ID,
        serviceId: DEMO_SERVICE.id,
        enabled: true,
        oauthClientId: options.oauthClientId,
        oauthClientSecretId: demoClientSecretId,
        customScopes: ['demo:read'],
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [organizationServices.organizationId, organizationServices.serviceId],
        set: {
          enabled: true,
          oauthClientId: options.oauthClientId,
          oauthClientSecretId: demoClientSecretId,
          customScopes: ['demo:read'],
          updatedAt: new Date(),
        },
      });

    if (options.github) {
      const githubSecret = Buffer.from(options.github.clientSecret, 'utf8');
      let githubSecretId: string;
      try {
        githubSecretId = await secretStore.put({
          id: 'authlane-demo-github-client-secret',
          organizationId: DEMO_ORGANIZATION_ID,
          purpose: 'oauth_client_secret',
          plaintext: githubSecret,
        });
      } finally {
        githubSecret.fill(0);
      }
      await db
        .insert(organizationServices)
        .values({
          organizationId: DEMO_ORGANIZATION_ID,
          serviceId: 'github',
          enabled: true,
          oauthClientId: options.github.clientId,
          oauthClientSecretId: githubSecretId,
          customScopes: ['read:user', 'public_repo'],
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [organizationServices.organizationId, organizationServices.serviceId],
          set: {
            enabled: true,
            oauthClientId: options.github.clientId,
            oauthClientSecretId: githubSecretId,
            customScopes: ['read:user', 'public_repo'],
            updatedAt: new Date(),
          },
        });
    }

    await db
      .update(apiKeys)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(apiKeys.organizationId, DEMO_ORGANIZATION_ID),
          eq(apiKeys.name, 'Example SaaS demo key')
        )
      );
    const apiKeyId = `demo_${randomUUID().replaceAll('-', '')}`;
    const issued = createApiKey(apiKeyId, getLookupKeyring());
    await db.insert(apiKeys).values({
      id: apiKeyId,
      organizationId: DEMO_ORGANIZATION_ID,
      name: 'Example SaaS demo key',
      keyHash: issued.keyHash,
      keyHint: issued.keyHint,
      scopes: ['catalog:read', 'connections:read', 'connect-sessions:create', 'credentials:issue'],
      expiresAt: new Date(Date.now() + (options.apiKeyTtlMs ?? 8 * 60 * 60 * 1000)),
    });

    return {
      adminEmail: DEMO_ADMIN_EMAIL,
      adminPassword,
      apiKey: issued.rawKey,
      organizationId: DEMO_ORGANIZATION_ID,
      externalUserId: DEMO_EXTERNAL_USER_ID,
    };
  } finally {
    await sql.end();
  }
}

export async function resetDemoData(adminDatabaseUrl: string): Promise<void> {
  const sql = postgres(adminDatabaseUrl, { max: 1 });
  const db = drizzle(sql);
  try {
    await db.transaction(async (tx) => {
      // Credential access audit rows are deliberately append-only. Keep the
      // demo organization as their tenant anchor and remove only mutable demo state.
      await tx
        .delete(oauthTransactions)
        .where(eq(oauthTransactions.organizationId, DEMO_ORGANIZATION_ID));
      await tx.delete(connections).where(eq(connections.organizationId, DEMO_ORGANIZATION_ID));
      await tx
        .delete(connectSessions)
        .where(eq(connectSessions.organizationId, DEMO_ORGANIZATION_ID));
      await tx
        .delete(organizationServices)
        .where(eq(organizationServices.organizationId, DEMO_ORGANIZATION_ID));
      await tx.delete(outboxEvents).where(eq(outboxEvents.organizationId, DEMO_ORGANIZATION_ID));
      await tx
        .update(apiKeys)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(apiKeys.organizationId, DEMO_ORGANIZATION_ID));
      await tx.delete(invitation).where(eq(invitation.organizationId, DEMO_ORGANIZATION_ID));
      await tx.delete(secretRecords).where(eq(secretRecords.organizationId, DEMO_ORGANIZATION_ID));
      await tx.delete(user).where(eq(user.id, DEMO_USER_ID));
      // The demo service is also retained because immutable audit rows reference it.
    });
  } finally {
    await sql.end();
  }
}

import {
  fetchOAuthToken,
  getPlatformOAuthCredentials,
  parseOAuthProviderContext,
} from '@authlane/shared';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { connections, organizationServices, outboxEvents, services } from '../schema/index.js';
import { createDatabaseSecretStore, type SecretStore } from '../secret-store.js';

export interface TokenRefreshData {
  connectionId: string;
  serviceId: string;
  organizationId: string;
}

export interface TokenRefreshResult {
  success: boolean;
  error?: string;
  retryable?: boolean;
  expiresAt?: string | null;
}

/** Refreshes one connection under a short database-backed lease. */
export async function refreshToken(
  db: Database,
  data: TokenRefreshData,
  secretStore: SecretStore = createDatabaseSecretStore(db)
): Promise<TokenRefreshResult> {
  const lockToken = crypto.randomUUID();
  const now = new Date();
  const [connection] = await db
    .update(connections)
    .set({
      refreshLockToken: lockToken,
      refreshLockExpiresAt: new Date(now.getTime() + 2 * 60_000),
    })
    .where(
      and(
        eq(connections.id, data.connectionId),
        eq(connections.organizationId, data.organizationId),
        eq(connections.serviceId, data.serviceId),
        eq(connections.status, 'connected'),
        or(isNull(connections.refreshLockExpiresAt), lt(connections.refreshLockExpiresAt, now))
      )
    )
    .returning();

  if (!connection) {
    return { success: true, expiresAt: null };
  }

  const failPermanently = async (error: string, code: string): Promise<TokenRefreshResult> => {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(connections)
        .set({
          status: 'error',
          lastErrorCode: code,
          refreshLockToken: null,
          refreshLockExpiresAt: null,
          version: sql`${connections.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(connections.id, connection.id), eq(connections.refreshLockToken, lockToken)))
        .returning({ id: connections.id });
      if (updated) {
        await tx.insert(outboxEvents).values({
          organizationId: connection.organizationId,
          eventType: 'connection.error',
          payload: {
            externalUserId: connection.externalUserId,
            serviceId: connection.serviceId,
            connectionId: connection.id,
            errorCode: code,
          },
        });
      }
    });
    return { success: false, error, retryable: false };
  };

  try {
    if (!connection.credentialSecretId) {
      return await failPermanently('No credentials found', 'CREDENTIALS_MISSING');
    }

    const [[service], [organizationService]] = await Promise.all([
      db.select().from(services).where(eq(services.id, data.serviceId)).limit(1),
      db
        .select()
        .from(organizationServices)
        .where(
          and(
            eq(organizationServices.organizationId, data.organizationId),
            eq(organizationServices.serviceId, data.serviceId),
            eq(organizationServices.enabled, true)
          )
        )
        .limit(1),
    ]);
    const config = service?.config as { token_url?: string } | undefined;
    if (!service || !organizationService || !config?.token_url) {
      return await failPermanently('OAuth provider is not configured', 'TOKEN_URL_MISSING');
    }

    const credentialsBuffer = await secretStore.read(
      connection.credentialSecretId,
      connection.organizationId,
      'connection_credentials'
    );
    let credentials: {
      access_token: string;
      refresh_token?: string;
      expires_at?: string;
      scope?: string;
      token_type?: string;
      provider_context?: { apiBaseUrl: string };
    };
    try {
      credentials = JSON.parse(credentialsBuffer.toString('utf8'));
    } finally {
      credentialsBuffer.fill(0);
    }
    if (!credentials.refresh_token) {
      return await failPermanently('No refresh token available', 'REFRESH_TOKEN_MISSING');
    }

    const tokenBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refresh_token,
    });

    // Mirror the authorize and callback steps: a tenant application wins,
    // otherwise the platform application. Without this fallback a tenant on the
    // platform OAuth app sent a refresh_token grant carrying NO client
    // credentials at all — providers answer 400, which is not retryable, so the
    // connection died permanently with OAUTH_REFRESH_REJECTED about an hour
    // after the user connected it. Connecting worked, staying connected did not.
    const platformCredentials = getPlatformOAuthCredentials(data.serviceId);
    const clientId = organizationService.oauthClientId ?? platformCredentials?.clientId ?? null;
    let clientSecret = '';
    if (clientId) {
      tokenBody.set('client_id', clientId);
    }
    if (organizationService.oauthClientSecretId) {
      const clientSecretBuffer = await secretStore.read(
        organizationService.oauthClientSecretId,
        connection.organizationId,
        'oauth_client_secret'
      );
      try {
        clientSecret = clientSecretBuffer.toString('utf8');
      } finally {
        clientSecretBuffer.fill(0);
      }
    } else if (!organizationService.oauthClientId) {
      // Only reach for the platform secret when the tenant has no application
      // of its own — pairing a tenant client_id with the platform secret would
      // be worse than sending neither.
      clientSecret = platformCredentials?.clientSecret ?? '';
    }
    if (clientSecret) {
      tokenBody.set('client_secret', clientSecret);
    }

    let tokenResult: Awaited<ReturnType<typeof fetchOAuthToken>>;
    try {
      tokenResult = await fetchOAuthToken(data.serviceId, config.token_url, tokenBody, {
        clientId: clientId ?? undefined,
        clientSecret,
      });
    } catch {
      return { success: false, error: 'OAuth refresh request failed', retryable: true };
    }
    if (!tokenResult.response.ok) {
      const retryable = tokenResult.response.status === 429 || tokenResult.response.status >= 500;
      if (retryable) {
        return { success: false, error: 'OAuth provider is temporarily unavailable', retryable };
      }
      return await failPermanently('OAuth provider rejected refresh', 'OAUTH_REFRESH_REJECTED');
    }

    const tokens = tokenResult.body;
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
      return await failPermanently('OAuth provider omitted access token', 'OAUTH_REFRESH_INVALID');
    }
    const expiresIn =
      typeof tokens.expires_in === 'number' &&
      Number.isFinite(tokens.expires_in) &&
      tokens.expires_in > 0
        ? Math.min(tokens.expires_in, 60 * 60 * 24 * 365)
        : null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : connection.expiresAt;
    let providerContext = credentials.provider_context;
    try {
      providerContext =
        parseOAuthProviderContext(data.serviceId, tokens, { required: false }) ?? providerContext;
    } catch {
      return await failPermanently(
        'OAuth provider returned invalid routing metadata',
        'OAUTH_PROVIDER_CONTEXT_INVALID'
      );
    }
    const newCredentialBytes = Buffer.from(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token:
          typeof tokens.refresh_token === 'string'
            ? tokens.refresh_token
            : credentials.refresh_token,
        token_type:
          typeof tokens.token_type === 'string'
            ? tokens.token_type
            : credentials.token_type || 'Bearer',
        scope: typeof tokens.scope === 'string' ? tokens.scope : credentials.scope,
        expires_at: expiresAt?.toISOString() ?? credentials.expires_at,
        provider_context: providerContext,
      }),
      'utf8'
    );
    let newCredentialSecretId: string;
    try {
      newCredentialSecretId = await secretStore.put({
        organizationId: connection.organizationId,
        purpose: 'connection_credentials',
        plaintext: newCredentialBytes,
      });
    } finally {
      newCredentialBytes.fill(0);
    }

    try {
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(connections)
          .set({
            credentialSecretId: newCredentialSecretId,
            expiresAt,
            connectedAt: new Date(),
            refreshLockToken: null,
            refreshLockExpiresAt: null,
            version: sql`${connections.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(connections.id, connection.id),
              eq(connections.version, connection.version),
              eq(connections.refreshLockToken, lockToken)
            )
          )
          .returning({ id: connections.id });
        if (!updated) throw new Error('Refresh lease was lost');
        await tx.insert(outboxEvents).values({
          organizationId: connection.organizationId,
          eventType: 'connection.refreshed',
          payload: {
            externalUserId: connection.externalUserId,
            serviceId: connection.serviceId,
            connectionId: connection.id,
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        });
      });
    } catch (error) {
      await secretStore.delete?.(
        newCredentialSecretId,
        connection.organizationId,
        'connection_credentials'
      );
      throw error;
    }
    await secretStore.delete?.(
      connection.credentialSecretId,
      connection.organizationId,
      'connection_credentials'
    );
    return { success: true, expiresAt: expiresIn ? (expiresAt?.toISOString() ?? null) : null };
  } catch {
    return { success: false, error: 'Token refresh failed', retryable: true };
  } finally {
    await db
      .update(connections)
      .set({ refreshLockToken: null, refreshLockExpiresAt: null })
      .where(and(eq(connections.id, connection.id), eq(connections.refreshLockToken, lockToken)));
  }
}

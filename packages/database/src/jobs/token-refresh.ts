/**
 * Token refresh job processor
 * Handles automatic OAuth token refresh using BullMQ
 */

import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { connections, outboxEvents, services } from '../schema/index.js';
import { createDatabaseSecretStore, type SecretStore } from '../secret-store.js';

export interface TokenRefreshData {
  connectionId: string;
  serviceId: string;
  organizationId: string;
}

/**
 * Refreshes an OAuth token for a connection
 */
export async function refreshToken(
  db: Database,
  data: TokenRefreshData,
  secretStore: SecretStore = createDatabaseSecretStore(db)
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get connection
    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, data.connectionId))
      .limit(1);

    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const failConnection = async (message: string, code: string) => {
      await db
        .update(connections)
        .set({ status: 'error', lastErrorCode: code, updatedAt: new Date() })
        .where(eq(connections.id, connection.id));
      await db.insert(outboxEvents).values({
        organizationId: connection.organizationId,
        eventType: 'connection.error',
        payload: {
          externalUserId: connection.externalUserId,
          serviceId: connection.serviceId,
          connectionId: connection.id,
          errorCode: code,
        },
      });
      return { success: false as const, error: message };
    };

    if (connection.status !== 'connected') {
      return { success: false, error: 'Connection is not connected' };
    }

    if (!connection.credentialSecretId) {
      return failConnection('No credentials found', 'CREDENTIALS_MISSING');
    }

    // Get service configuration
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, data.serviceId))
      .limit(1);

    if (!service) {
      return failConnection('Service not found', 'SERVICE_NOT_FOUND');
    }

    const config = service.config as {
      token_url?: string;
    };

    if (!config.token_url) {
      return failConnection('Service missing token URL', 'TOKEN_URL_MISSING');
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
    };
    try {
      credentials = JSON.parse(credentialsBuffer.toString('utf8'));
    } finally {
      credentialsBuffer.fill(0);
    }

    if (!credentials.refresh_token) {
      return failConnection('No refresh token available', 'REFRESH_TOKEN_MISSING');
    }

    // Refresh token
    const tokenResponse = await fetch(config.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return failConnection(`Token refresh failed: ${errorText}`, 'OAUTH_REFRESH_FAILED');
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    const newCredentialsJson = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || credentials.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || credentials.scope,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : credentials.expires_at,
    });

    await secretStore.put({
      id: connection.credentialSecretId,
      organizationId: connection.organizationId,
      purpose: 'connection_credentials',
      plaintext: Buffer.from(newCredentialsJson),
    });

    // Update connection
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : connection.expiresAt;

    await db
      .update(connections)
      .set({
        expiresAt,
        connectedAt: new Date(),
      })
      .where(eq(connections.id, connection.id));

    await db.insert(outboxEvents).values({
      organizationId: connection.organizationId,
      eventType: 'connection.refreshed',
      payload: {
        externalUserId: connection.externalUserId,
        serviceId: connection.serviceId,
        connectionId: connection.id,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

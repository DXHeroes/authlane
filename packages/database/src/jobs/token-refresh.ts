/**
 * Token refresh job processor
 * Handles automatic OAuth token refresh using BullMQ
 */

import { decrypt, encrypt, getEncryptionKey } from '@authlane/crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { connections, services } from '../schema/index.js';

export interface TokenRefreshData {
  connectionId: string;
  tenantId: string;
  serviceId: string;
}

/**
 * Refreshes an OAuth token for a connection
 */
export async function refreshToken(
  db: Database,
  data: TokenRefreshData
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

    if (connection.status !== 'connected') {
      return { success: false, error: 'Connection is not connected' };
    }

    if (!connection.credentialsEnc) {
      return { success: false, error: 'No credentials found' };
    }

    // Get service configuration
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, data.serviceId))
      .limit(1);

    if (!service) {
      return { success: false, error: 'Service not found' };
    }

    const config = service.config as {
      token_url?: string;
    };

    if (!config.token_url) {
      return { success: false, error: 'Service missing token URL' };
    }

    // Decrypt credentials
    const encryptionKey = getEncryptionKey();
    const credentialsJson = decrypt(connection.credentialsEnc, encryptionKey);
    const credentials = JSON.parse(credentialsJson) as {
      access_token: string;
      refresh_token?: string;
      expires_at?: string;
      scope?: string;
    };

    if (!credentials.refresh_token) {
      return { success: false, error: 'No refresh token available' };
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
      return { success: false, error: `Token refresh failed: ${errorText}` };
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    // Encrypt new credentials
    const newCredentialsJson = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || credentials.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || credentials.scope,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : credentials.expires_at,
    });

    const credentialsEnc = encrypt(newCredentialsJson, encryptionKey);

    // Update connection
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : connection.expiresAt;

    await db
      .update(connections)
      .set({
        credentialsEnc,
        expiresAt,
        connectedAt: new Date(),
      })
      .where(eq(connections.id, connection.id));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

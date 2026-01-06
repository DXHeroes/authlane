/**
 * Credential Injector
 * Loads and decrypts user/org credentials for tool execution
 */

import { decrypt, getEncryptionKey } from '@authlane/crypto';
import type { Database } from '@authlane/database';
import { and, connections, eq } from '@authlane/database';
import { Errors, type OAuth2Credentials, type Result } from '@authlane/shared';

export interface CredentialContext {
  credentials: OAuth2Credentials;
  connection: {
    id: string;
    scope: 'user' | 'organization';
    userId: string | null;
    organizationId: string | null;
    serviceId: string;
    status: string;
  };
}

/**
 * Loads and decrypts credentials for a user and service
 *
 * @param userId - User ID
 * @param serviceId - Service ID (e.g., 'github')
 * @param db - Database instance
 * @returns Decrypted credentials and connection metadata
 */
export async function getCredentials(
  userId: string,
  serviceId: string,
  db: Database
): Promise<Result<CredentialContext>> {
  try {
    // Find connection for user and service
    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.userId, userId), eq(connections.serviceId, serviceId)))
      .limit(1);

    if (!connection) {
      return {
        data: null,
        error: Errors.notFound('Connection', `${userId}/${serviceId}`),
      };
    }

    // Check connection status
    if (connection.status !== 'connected') {
      return {
        data: null,
        error: Errors.connectionNotConnected(
          `Connection status is '${connection.status}'. Expected 'connected'.`
        ),
      };
    }

    // Check if credentials exist
    if (!connection.credentialsEnc) {
      return {
        data: null,
        error: Errors.connectionError('No credentials found for connection'),
      };
    }

    // Check expiration
    if (connection.expiresAt && new Date(connection.expiresAt) < new Date()) {
      return {
        data: null,
        error: Errors.connectionExpired(serviceId),
      };
    }

    // Decrypt credentials
    const encryptionKey = getEncryptionKey();
    let credentials: OAuth2Credentials;

    try {
      const decrypted = decrypt(connection.credentialsEnc, encryptionKey);
      credentials = JSON.parse(decrypted) as OAuth2Credentials;
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return {
        data: null,
        error: Errors.encryptionError('Failed to decrypt credentials'),
      };
    }

    // Return credentials with connection context
    return {
      data: {
        credentials,
        connection: {
          id: connection.id,
          scope: connection.scope,
          userId: connection.userId,
          organizationId: connection.organizationId,
          serviceId: connection.serviceId,
          status: connection.status,
        },
      },
      error: null,
    };
  } catch (error) {
    console.error('Failed to get credentials:', error);
    return {
      data: null,
      error: Errors.internalError('Failed to retrieve credentials'),
    };
  }
}

/**
 * Loads and decrypts credentials for an organization and service
 *
 * @param organizationId - Organization ID
 * @param serviceId - Service ID (e.g., 'github')
 * @param db - Database instance
 * @returns Decrypted credentials and connection metadata
 */
export async function getOrganizationCredentials(
  organizationId: string,
  serviceId: string,
  db: Database
): Promise<Result<CredentialContext>> {
  try {
    // Find connection for organization and service
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(eq(connections.organizationId, organizationId), eq(connections.serviceId, serviceId))
      )
      .limit(1);

    if (!connection) {
      return {
        data: null,
        error: Errors.notFound('Connection', `${organizationId}/${serviceId}`),
      };
    }

    // Check connection status
    if (connection.status !== 'connected') {
      return {
        data: null,
        error: Errors.connectionNotConnected(
          `Connection status is '${connection.status}'. Expected 'connected'.`
        ),
      };
    }

    // Check if credentials exist
    if (!connection.credentialsEnc) {
      return {
        data: null,
        error: Errors.connectionError('No credentials found for connection'),
      };
    }

    // Check expiration
    if (connection.expiresAt && new Date(connection.expiresAt) < new Date()) {
      return {
        data: null,
        error: Errors.connectionExpired(serviceId),
      };
    }

    // Decrypt credentials
    const encryptionKey = getEncryptionKey();
    let credentials: OAuth2Credentials;

    try {
      const decrypted = decrypt(connection.credentialsEnc, encryptionKey);
      credentials = JSON.parse(decrypted) as OAuth2Credentials;
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return {
        data: null,
        error: Errors.encryptionError('Failed to decrypt credentials'),
      };
    }

    // Return credentials with connection context
    return {
      data: {
        credentials,
        connection: {
          id: connection.id,
          scope: connection.scope,
          userId: connection.userId,
          organizationId: connection.organizationId,
          serviceId: connection.serviceId,
          status: connection.status,
        },
      },
      error: null,
    };
  } catch (error) {
    console.error('Failed to get organization credentials:', error);
    return {
      data: null,
      error: Errors.internalError('Failed to retrieve credentials'),
    };
  }
}

/**
 * TODO: Implement token refresh logic
 * This would check if access_token is expired and use refresh_token to get new one
 *
 * @param credentials - OAuth2 credentials
 * @param serviceId - Service ID
 * @returns Refreshed credentials
 */
export async function refreshTokenIfNeeded(
  _credentials: OAuth2Credentials,
  _serviceId: string
): Promise<Result<OAuth2Credentials>> {
  // TODO: Implement token refresh
  // 1. Check if access_token is expired (compare expires_at with current time)
  // 2. If expired, use refresh_token to get new access_token
  // 3. Update credentials in database
  // 4. Return new credentials

  return {
    data: null,
    error: Errors.internalError('Token refresh not yet implemented'),
  };
}

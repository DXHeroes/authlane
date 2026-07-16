import type { ConnectionStatus } from './types.js';

export interface ConnectionSnapshot {
  status: Exclude<ConnectionStatus, 'disconnected'>;
  hasCredentials: boolean;
  expiresAt: string | Date | null;
}

export function getEffectiveConnectionStatus(
  connection: ConnectionSnapshot | null,
  now: Date = new Date()
): ConnectionStatus {
  if (!connection) {
    return 'disconnected';
  }

  if (connection.status !== 'connected') {
    return connection.status;
  }

  if (!connection.hasCredentials) {
    return 'error';
  }

  if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }

  return 'connected';
}

export function isConnectionAvailable(
  connection: ConnectionSnapshot | null,
  now: Date = new Date()
): boolean {
  return getEffectiveConnectionStatus(connection, now) === 'connected';
}

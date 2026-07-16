import { describe, expect, it } from 'vitest';
import {
  type ConnectionSnapshot,
  getEffectiveConnectionStatus,
  isConnectionAvailable,
} from '../src/capabilities.js';

const NOW = new Date('2026-07-16T10:00:00.000Z');

function snapshot(overrides: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot {
  return {
    status: 'connected',
    hasCredentials: true,
    expiresAt: null,
    ...overrides,
  };
}

describe('capability connection status', () => {
  it('reports a missing connection as disconnected', () => {
    expect(getEffectiveConnectionStatus(null, NOW)).toBe('disconnected');
  });

  it('reports a connected credential as available', () => {
    const connection = snapshot();

    expect(getEffectiveConnectionStatus(connection, NOW)).toBe('connected');
    expect(isConnectionAvailable(connection, NOW)).toBe(true);
  });

  it('expires a cached connection at its absolute expiration time', () => {
    const connection = snapshot({ expiresAt: '2026-07-16T10:00:00.000Z' });

    expect(getEffectiveConnectionStatus(connection, NOW)).toBe('expired');
    expect(isConnectionAvailable(connection, NOW)).toBe(false);
  });

  it('does not expose a connected row without credentials', () => {
    const connection = snapshot({ hasCredentials: false });

    expect(getEffectiveConnectionStatus(connection, NOW)).toBe('error');
    expect(isConnectionAvailable(connection, NOW)).toBe(false);
  });

  it.each(['pending', 'expired', 'error'] as const)('preserves stored %s status', (status) => {
    expect(getEffectiveConnectionStatus(snapshot({ status }), NOW)).toBe(status);
  });
});

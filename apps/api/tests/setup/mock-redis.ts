/**
 * Mock Redis for testing
 * Simple in-memory implementation for testing BullMQ jobs
 */

import { vi } from 'vitest';

/**
 * Create a mock Redis client for testing
 */
export function createMockRedis() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) || null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    keys: vi.fn(async (pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(store.keys()).filter((key) => regex.test(key));
    }),
    flushall: vi.fn(async () => {
      store.clear();
      return 'OK';
    }),
    disconnect: vi.fn(async () => undefined),
    duplicate: vi.fn(() => createMockRedis()),
  };
}

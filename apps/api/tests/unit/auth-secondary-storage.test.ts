import { parseKeyring } from '@authlane/crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createEncryptedRedisSecondaryStorage,
  shouldStoreAuthSessionsInDatabase,
} from '../../src/lib/auth-secondary-storage.js';

describe('Better Auth session persistence', () => {
  it('keeps bearer-equivalent session tokens out of PostgreSQL when encrypted Redis is present', () => {
    expect(shouldStoreAuthSessionsInDatabase(undefined)).toBe(true);
    expect(shouldStoreAuthSessionsInDatabase({} as never)).toBe(false);
  });
});

describe('Better Auth Redis secondary storage', () => {
  it('encrypts values, preserves TTL, and decrypts on read', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      getdel: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
      eval: vi.fn(async () => 1),
    };
    const storage = createEncryptedRedisSecondaryStorage(
      redis,
      parseKeyring(`redis-1:${'a'.repeat(64)}`)
    );

    await storage.set('session:token', '{"userId":"user_1"}', 300);

    const [storedKey] = values.keys();
    const stored = storedKey ? values.get(storedKey) : undefined;
    expect(storedKey).toMatch(/^authlane:better-auth:redis-1:[A-Za-z0-9_-]{43}$/);
    expect(storedKey).not.toContain('session:token');
    expect(stored).toBeDefined();
    expect(stored).not.toContain('user_1');
    expect(redis.set).toHaveBeenCalledWith(storedKey, expect.any(String), 'EX', 300);
    expect(await storage.get('session:token')).toBe('{"userId":"user_1"}');
  });

  it('deletes the namespaced value and fails closed on tampering', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      getdel: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
      eval: vi.fn(async () => 1),
    };
    const storage = createEncryptedRedisSecondaryStorage(
      redis,
      parseKeyring(`redis-1:${'a'.repeat(64)}`)
    );
    await storage.set('verification:1', 'secret');
    const [redisKey] = values.keys();
    if (!redisKey) throw new Error('Expected opaque Redis key');
    expect(redisKey).not.toContain('verification:1');
    const sealed = values.get(redisKey);
    if (!sealed) throw new Error('Expected encrypted test value');
    values.set(redisKey, `${sealed.slice(0, -1)}A`);

    await expect(storage.get('verification:1')).rejects.toThrow();
    await storage.delete('verification:1');
    expect(redis.del).toHaveBeenCalledWith(redisKey);
  });

  it('atomically consumes encrypted one-time values', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      getdel: vi.fn(async (key: string) => {
        const value = values.get(key) ?? null;
        values.delete(key);
        return value;
      }),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
      eval: vi.fn(async () => 1),
    };
    const storage = createEncryptedRedisSecondaryStorage(
      redis,
      parseKeyring(`redis-1:${'a'.repeat(64)}`)
    );

    await storage.set('verification:single-use', 'secret', 60);
    expect(await storage.getAndDelete('verification:single-use')).toBe('secret');
    expect(await storage.getAndDelete('verification:single-use')).toBeNull();
    expect(redis.getdel).toHaveBeenCalledWith(
      expect.not.stringContaining('verification:single-use')
    );
  });

  it('uses one Redis operation to increment fixed-window counters', async () => {
    const redis = {
      get: vi.fn(async () => null),
      getdel: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 0),
      eval: vi.fn(async () => 2),
    };
    const storage = createEncryptedRedisSecondaryStorage(
      redis,
      parseKeyring(`redis-1:${'a'.repeat(64)}`)
    );

    expect(await storage.increment('rate-limit:login', 60)).toBe(2);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      expect.not.stringContaining('rate-limit:login'),
      60
    );
  });
});

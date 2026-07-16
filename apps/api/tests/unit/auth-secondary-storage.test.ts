import { parseKeyring } from '@authlane/crypto';
import { describe, expect, it, vi } from 'vitest';
import { createEncryptedRedisSecondaryStorage } from '../../src/lib/auth-secondary-storage.js';

describe('Better Auth Redis secondary storage', () => {
  it('encrypts values, preserves TTL, and decrypts on read', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
    };
    const storage = createEncryptedRedisSecondaryStorage(
      redis,
      parseKeyring(`redis-1:${'a'.repeat(64)}`)
    );

    await storage.set('session:token', '{"userId":"user_1"}', 300);

    const stored = values.get('authlane:better-auth:session:token');
    expect(stored).toBeDefined();
    expect(stored).not.toContain('user_1');
    expect(redis.set).toHaveBeenCalledWith(
      'authlane:better-auth:session:token',
      expect.any(String),
      'EX',
      300
    );
    expect(await storage.get('session:token')).toBe('{"userId":"user_1"}');
  });

  it('deletes the namespaced value and fails closed on tampering', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
    };
    const storage = createEncryptedRedisSecondaryStorage(
      redis,
      parseKeyring(`redis-1:${'a'.repeat(64)}`)
    );
    await storage.set('verification:1', 'secret');
    const redisKey = 'authlane:better-auth:verification:1';
    const sealed = values.get(redisKey);
    if (!sealed) throw new Error('Expected encrypted test value');
    values.set(redisKey, `${sealed.slice(0, -1)}A`);

    await expect(storage.get('verification:1')).rejects.toThrow();
    await storage.delete('verification:1');
    expect(redis.del).toHaveBeenCalledWith(redisKey);
  });
});

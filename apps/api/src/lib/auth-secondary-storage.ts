import { getRedisKeyring, type Keyring, openRedisValue, sealRedisValue } from '@authlane/crypto';

const KEY_PREFIX = 'authlane:better-auth:';

export interface RedisSecondaryStorageClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface AuthSecondaryStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createEncryptedRedisSecondaryStorage(
  redis: RedisSecondaryStorageClient,
  keyring: Keyring = getRedisKeyring()
): AuthSecondaryStorage {
  const namespacedKey = (key: string) => `${KEY_PREFIX}${key}`;

  return {
    async get(key) {
      const storageKey = namespacedKey(key);
      const sealed = await redis.get(storageKey);
      return sealed === null ? null : openRedisValue(keyring, storageKey, sealed);
    },
    async set(key, value, ttl) {
      const storageKey = namespacedKey(key);
      const sealed = sealRedisValue(keyring, storageKey, value);
      if (ttl !== undefined && ttl > 0) {
        await redis.set(storageKey, sealed, 'EX', Math.ceil(ttl));
      } else {
        await redis.set(storageKey, sealed);
      }
    },
    async delete(key) {
      await redis.del(namespacedKey(key));
    },
  };
}

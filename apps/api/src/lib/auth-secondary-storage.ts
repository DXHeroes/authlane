import { createHmac } from 'node:crypto';
import { getRedisKeyring, type Keyring, openRedisValue, sealRedisValue } from '@authlane/crypto';

const KEY_PREFIX = 'authlane:better-auth:';
const INCREMENT_WITH_FIXED_TTL = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return value
`;

export interface RedisSecondaryStorageClient {
  get(key: string): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  eval(script: string, numberOfKeys: 1, key: string, ttlSeconds: number): Promise<unknown>;
}

export interface AuthSecondaryStorage {
  get(key: string): Promise<unknown>;
  getAndDelete(key: string): Promise<unknown>;
  increment(key: string, ttl: number): Promise<number>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export function shouldStoreAuthSessionsInDatabase(
  secondaryStorage: AuthSecondaryStorage | undefined
): boolean {
  return secondaryStorage === undefined;
}

export function createEncryptedRedisSecondaryStorage(
  redis: RedisSecondaryStorageClient,
  keyring: Keyring = getRedisKeyring()
): AuthSecondaryStorage {
  const namespacedKey = (key: string) => {
    if (!key || key.length > 4096) {
      throw new Error('Secondary storage key must contain between 1 and 4096 characters');
    }
    const keyId = keyring.currentKeyId;
    const keyMaterial = keyring.keys.get(keyId);
    if (!keyMaterial) throw new Error(`Current Redis encryption key is unavailable: ${keyId}`);
    const digest = createHmac('sha256', keyMaterial)
      .update('authlane.better-auth.redis-key.v1\0')
      .update(key, 'utf8')
      .digest('base64url');
    return `${KEY_PREFIX}${keyId}:${digest}`;
  };

  return {
    async get(key) {
      const storageKey = namespacedKey(key);
      const sealed = await redis.get(storageKey);
      return sealed === null ? null : openRedisValue(keyring, storageKey, sealed);
    },
    async getAndDelete(key) {
      const storageKey = namespacedKey(key);
      const sealed = await redis.getdel(storageKey);
      return sealed === null ? null : openRedisValue(keyring, storageKey, sealed);
    },
    async increment(key, ttl) {
      if (!Number.isFinite(ttl) || ttl <= 0) {
        throw new Error('Secondary storage counter TTL must be positive');
      }
      const result = Number(
        await redis.eval(INCREMENT_WITH_FIXED_TTL, 1, namespacedKey(key), Math.ceil(ttl))
      );
      if (!Number.isSafeInteger(result) || result < 1) {
        throw new Error('Secondary storage returned an invalid counter value');
      }
      return result;
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

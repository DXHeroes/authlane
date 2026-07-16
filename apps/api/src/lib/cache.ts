import type Redis from 'ioredis';
import type { PrincipalCache } from '../middleware/auth.js';
import type { ApiPrincipal } from './api-principal.js';

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: this.now() + ttlSeconds * 1_000,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

export class RedisCacheStore implements CacheStore {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.redis.get(key);
    return value === null ? undefined : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export class CachePrincipalStore implements PrincipalCache {
  constructor(private readonly cache: CacheStore) {}

  get(keyHash: string): Promise<ApiPrincipal | null | undefined> {
    return this.cache.get<ApiPrincipal | null>(`control-plane:principal:${keyHash}`);
  }

  set(keyHash: string, principal: ApiPrincipal | null, ttlSeconds: number): Promise<void> {
    return this.cache.set(`control-plane:principal:${keyHash}`, principal, ttlSeconds);
  }
}

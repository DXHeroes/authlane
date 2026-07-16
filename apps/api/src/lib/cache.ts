import type Redis from 'ioredis';

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

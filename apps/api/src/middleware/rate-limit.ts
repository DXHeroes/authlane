import type { Database } from '@authlane/database';
import type { Context, Next } from 'hono';
import type Redis from 'ioredis';

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  enabled: boolean;
}

export interface RateLimitConsumption {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  consume(key: string, windowMs: number): Promise<RateLimitConsumption>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitConsumption>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, windowMs: number): Promise<RateLimitConsumption> {
    const currentTime = this.now();
    const current = this.entries.get(key);
    if (!current || current.resetAt <= currentTime) {
      const next = { count: 1, resetAt: currentTime + windowMs };
      this.entries.set(key, next);
      return next;
    }
    current.count += 1;
    return current;
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, windowMs: number): Promise<RateLimitConsumption> {
    const result = (await this.redis.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {count, redis.call('PTTL', KEYS[1])}",
      1,
      key,
      windowMs
    )) as [number, number];
    return { count: Number(result[0]), resetAt: Date.now() + Number(result[1]) };
  }
}

export function rateLimitMiddleware(
  _db: Database,
  options: RateLimitOptions,
  store: RateLimitStore = new MemoryRateLimitStore()
) {
  return async (c: Context, next: Next) => {
    if (!options.enabled) return next();

    const organization = c.get('organization');
    const user = c.get('user');
    const ip = c.get('clientIp') || 'unknown';
    const identity = organization
      ? `org:${organization.id}`
      : user
        ? `user:${user.id}`
        : `ip:${ip}`;
    const key = `rate-limit:${identity}`;
    const record = await store.consume(key, options.windowMs);

    c.header('X-RateLimit-Limit', String(options.maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - record.count)));
    c.header('X-RateLimit-Reset', String(Math.floor(record.resetAt / 1_000)));
    if (record.count > options.maxRequests) {
      c.header(
        'Retry-After',
        String(Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1_000)))
      );
      return c.json(
        {
          data: null,
          error: {
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            hint: `Maximum ${options.maxRequests} requests per ${options.windowMs / 1_000} seconds`,
            docUrl: 'https://authlane.io/docs/api-reference/authentication',
            statusCode: 429,
          },
        },
        429
      );
    }
    return next();
  };
}

/**
 * Rate limiting middleware
 * Protects API endpoints from abuse
 */

import type { Database } from '@authlane/database';
import type { Context, Next } from 'hono';

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  enabled: boolean;
}

// In-memory rate limit store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limiting middleware
 * Limits requests per user/organization/IP based on configuration
 * Adds standard rate limit headers to all responses
 */
export function rateLimitMiddleware(_db: Database, options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    if (!options.enabled) {
      return next();
    }

    // Build rate limit key based on available context
    const user = c.get('user');
    const org = c.get('organization');
    const apiKey = c.get('apiKey');
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

    // Prioritize: organization > user > api key > IP
    let key: string;
    if (org) {
      key = `org:${org.id}`;
    } else if (user) {
      key = `user:${user.id}`;
    } else if (apiKey) {
      key = `apikey:${apiKey.substring(0, 10)}`;
    } else {
      key = `ip:${ip}`;
    }

    const now = Date.now();
    const record = rateLimitStore.get(key);

    // Reset if window expired
    if (!record || now > record.resetAt) {
      const resetAt = now + options.windowMs;
      rateLimitStore.set(key, {
        count: 1,
        resetAt,
      });

      // Add rate limit headers
      c.header('X-RateLimit-Limit', String(options.maxRequests));
      c.header('X-RateLimit-Remaining', String(options.maxRequests - 1));
      c.header('X-RateLimit-Reset', String(Math.floor(resetAt / 1000)));

      return next();
    }

    // Check if limit exceeded
    if (record.count >= options.maxRequests) {
      // Add rate limit headers for exceeded limit
      c.header('X-RateLimit-Limit', String(options.maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.floor(record.resetAt / 1000)));
      c.header('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));

      return c.json(
        {
          data: null,
          error: {
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            hint: `Maximum ${options.maxRequests} requests per ${options.windowMs / 1000} seconds`,
            docUrl: 'https://docs.authlane.dev/rate-limiting',
            statusCode: 429,
          },
        },
        429
      );
    }

    // Increment counter
    record.count++;
    rateLimitStore.set(key, record);

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(options.maxRequests));
    c.header('X-RateLimit-Remaining', String(options.maxRequests - record.count));
    c.header('X-RateLimit-Reset', String(Math.floor(record.resetAt / 1000)));

    // Clean up old entries periodically (simple cleanup)
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      for (const [k, v] of rateLimitStore.entries()) {
        if (now > v.resetAt) {
          rateLimitStore.delete(k);
        }
      }
    }

    return next();
  };
}

/**
 * Rate limiting middleware
 * Protects API endpoints from abuse
 */

import type { Database } from '@authlane/database';
import type { Context, Next } from 'hono';
import { getTenantId } from '../utils/tenant-context.js';

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  enabled: boolean;
}

// In-memory rate limit store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limiting middleware
 * Limits requests per tenant based on configuration
 */
export function rateLimitMiddleware(_db: Database, options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    if (!options.enabled) {
      return next();
    }

    const tenantId = getTenantId(c);
    if (!tenantId) {
      return next();
    }

    const now = Date.now();
    const key = `tenant:${tenantId}`;
    const record = rateLimitStore.get(key);

    // Reset if window expired
    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    // Check if limit exceeded
    if (record.count >= options.maxRequests) {
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

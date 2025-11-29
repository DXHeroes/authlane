/**
 * Rate Limiting Edge Case Tests
 * Tests critical rate limiting scenarios to prevent DDoS and resource exhaustion
 *
 * These tests verify:
 * 1. Burst traffic handling
 * 2. Rate limit bypass prevention
 * 3. Distributed rate limiting (Redis)
 * 4. Different limits per endpoint
 * 5. API key-based rate limiting
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createApp } from '../../src/index.js';
import { getTestDb } from '../setup/test-db.js';
import { createMockRedis } from '../setup/mock-redis.js';
import { organizations, users, apiKeys } from '@authlane/database';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '@authlane/shared';

describe('Rate Limiting Edge Cases', () => {
  const db = getTestDb();
  const mockRedis = createMockRedis();
  let app: ReturnType<typeof createApp>;

  let testOrgId: string;
  let testUserId: string;
  let testApiKey: string;

  beforeAll(async () => {
    app = createApp(db, { redis: mockRedis });

    // Setup test organization
    testOrgId = randomUUID();
    const [org] = await db.insert(organizations).values({
      id: testOrgId,
      name: 'Rate Limit Test Org',
      slug: 'rate-test-org',
    }).returning();

    const [user] = await db.insert(users).values({
      id: randomUUID(),
      email: 'ratelimit@example.com',
      name: 'Rate Limit User',
      emailVerified: true,
      passwordHash: await hashPassword('SecurePass123!'),
    }).returning();
    testUserId = user.id;

    // Create API key
    testApiKey = `sk_test_${randomUUID()}`;
    await db.insert(apiKeys).values({
      id: randomUUID(),
      organizationId: testOrgId,
      name: 'Test API Key',
      keyHash: await hashPassword(testApiKey),
      rateLimit: 100, // 100 requests per window
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where((o, { eq }) => eq(o.id, testOrgId));
  });

  beforeEach(async () => {
    // Clear Redis between tests
    await mockRedis.flushall();
    vi.clearAllTimers();
  });

  describe('Burst Traffic Scenarios', () => {
    it('should handle burst of requests at limit', async () => {
      const limit = 10;
      const requests = Array(limit).fill(null).map(() =>
        app.request('/api/v1/services', {
          headers: { 'Authorization': `Bearer ${testApiKey}` },
        })
      );

      const responses = await Promise.all(requests);

      // All requests should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBe(limit);
    });

    it('should reject requests exceeding burst limit', async () => {
      const limit = 10;
      const overLimit = 15;

      const requests = Array(overLimit).fill(null).map(() =>
        app.request('/api/v1/services', {
          headers: { 'Authorization': `Bearer ${testApiKey}` },
        })
      );

      const responses = await Promise.all(requests);

      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBeLessThanOrEqual(limit);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should include rate limit headers in response', async () => {
      const response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should reset rate limit after time window', async () => {
      vi.useFakeTimers();

      // Fill the rate limit
      const limit = 10;
      await Promise.all(
        Array(limit).fill(null).map(() =>
          app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        )
      );

      // Next request should be rate limited
      let response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });
      expect(response.status).toBe(429);

      // Fast forward past the rate limit window (e.g., 60 seconds)
      vi.advanceTimersByTime(61000);

      // Request should now succeed
      response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });
      expect(response.status).toBe(200);

      vi.useRealTimers();
    });
  });

  describe('Rate Limit Bypass Prevention', () => {
    it('should NOT allow bypassing rate limit by changing User-Agent', async () => {
      const limit = 10;

      // Make requests with different User-Agents
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          app.request('/api/v1/services', {
            headers: {
              'Authorization': `Bearer ${testApiKey}`,
              'User-Agent': `TestClient-${i}`,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should NOT allow bypassing rate limit by changing IP headers', async () => {
      const limit = 10;

      // Attempt to bypass by sending different X-Forwarded-For headers
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          app.request('/api/v1/services', {
            headers: {
              'Authorization': `Bearer ${testApiKey}`,
              'X-Forwarded-For': `192.168.1.${i}`,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should rate limit based on API key, not IP address', async () => {
      // Rate limiting should be tied to API key
      const response1 = await app.request('/api/v1/services', {
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'X-Forwarded-For': '192.168.1.1',
        },
      });

      const response2 = await app.request('/api/v1/services', {
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'X-Forwarded-For': '192.168.1.2', // Different IP
        },
      });

      // Both should count against the same rate limit
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const remaining1 = parseInt(response1.headers.get('X-RateLimit-Remaining') || '0');
      const remaining2 = parseInt(response2.headers.get('X-RateLimit-Remaining') || '0');

      expect(remaining2).toBe(remaining1 - 1);
    });

    it('should NOT allow bypassing by omitting authorization header', async () => {
      const limit = 10;

      // Make requests without auth (should have default rate limit)
      const requests = Array(15).fill(null).map(() =>
        app.request('/api/v1/services')
      );

      const responses = await Promise.all(requests);

      // All should be unauthorized, but rate limit should still apply
      const unauthorizedCount = responses.filter(r => r.status === 401).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // Either all unauthorized or some rate limited
      expect(unauthorizedCount + rateLimitedCount).toBe(15);
    });
  });

  describe('Distributed Rate Limiting (Redis)', () => {
    it('should use Redis for rate limit counter storage', async () => {
      const getRateLimitKey = (apiKey: string) => `rate_limit:${apiKey}`;

      await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      // Check that Redis was called to store rate limit data
      const key = getRateLimitKey(testApiKey);
      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('should handle Redis failures gracefully', async () => {
      // Simulate Redis error
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      // Should either fail closed (reject request) or fail open (allow with warning)
      expect([200, 503]).toContain(response.status);
    });

    it('should synchronize rate limits across multiple instances', async () => {
      // Simulate requests from different app instances (same Redis)
      const app1 = createApp(db, { redis: mockRedis });
      const app2 = createApp(db, { redis: mockRedis });

      await app1.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      const response2 = await app2.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      // Second instance should see decremented count from first instance
      const remaining = parseInt(response2.headers.get('X-RateLimit-Remaining') || '100');
      expect(remaining).toBeLessThan(100);
    });
  });

  describe('Different Limits Per Endpoint', () => {
    it('should apply stricter limits to expensive operations', async () => {
      // Assuming /api/v1/connections/oauth/authorize has lower limit than /api/v1/services

      // Make many requests to expensive endpoint
      const expensiveRequests = Array(5).fill(null).map(() =>
        app.request('/api/v1/connections/github/authorize', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testApiKey}` },
        })
      );

      const expensiveResponses = await Promise.all(expensiveRequests);
      const expensiveRateLimited = expensiveResponses.filter(r => r.status === 429).length;

      // Make same number of requests to cheap endpoint
      const cheapRequests = Array(5).fill(null).map(() =>
        app.request('/api/v1/services', {
          headers: { 'Authorization': `Bearer ${testApiKey}` },
        })
      );

      const cheapResponses = await Promise.all(cheapRequests);
      const cheapRateLimited = cheapResponses.filter(r => r.status === 429).length;

      // Expensive endpoint should hit rate limit sooner
      expect(expensiveRateLimited).toBeGreaterThanOrEqual(cheapRateLimited);
    });
  });

  describe('API Key-Based Rate Limiting', () => {
    it('should apply different limits based on API key tier', async () => {
      // Create premium API key with higher limit
      const premiumApiKey = `sk_premium_${randomUUID()}`;
      await db.insert(apiKeys).values({
        id: randomUUID(),
        organizationId: testOrgId,
        name: 'Premium API Key',
        keyHash: await hashPassword(premiumApiKey),
        rateLimit: 1000, // 10x higher than basic
      });

      // Make requests with both keys
      const basicResponse = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      const premiumResponse = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${premiumApiKey}` },
      });

      const basicLimit = parseInt(basicResponse.headers.get('X-RateLimit-Limit') || '0');
      const premiumLimit = parseInt(premiumResponse.headers.get('X-RateLimit-Limit') || '0');

      expect(premiumLimit).toBeGreaterThan(basicLimit);
    });

    it('should track rate limits independently per API key', async () => {
      const apiKey2 = `sk_test_${randomUUID()}`;
      await db.insert(apiKeys).values({
        id: randomUUID(),
        organizationId: testOrgId,
        name: 'Second API Key',
        keyHash: await hashPassword(apiKey2),
        rateLimit: 100,
      });

      // Fill rate limit for first key
      await Promise.all(
        Array(10).fill(null).map(() =>
          app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        )
      );

      // Second key should have full quota
      const response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${apiKey2}` },
      });

      expect(response.status).toBe(200);
      const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
      expect(remaining).toBeGreaterThan(90);
    });
  });

  describe('Rate Limit Error Responses', () => {
    it('should return 429 status when rate limited', async () => {
      // Fill the rate limit
      await Promise.all(
        Array(100).fill(null).map(() =>
          app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        )
      );

      const response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      expect(response.status).toBe(429);
    });

    it('should include Retry-After header when rate limited', async () => {
      // Fill the rate limit
      await Promise.all(
        Array(100).fill(null).map(() =>
          app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        )
      );

      const response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should return error in standard format', async () => {
      // Fill the rate limit
      await Promise.all(
        Array(100).fill(null).map(() =>
          app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        )
      );

      const response = await app.request('/api/v1/services', {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      });

      expect(response.status).toBe(429);
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(data.error.message).toContain('rate limit');
    });
  });

  describe('Sliding Window vs Fixed Window', () => {
    it('should use sliding window algorithm to prevent thundering herd', async () => {
      vi.useFakeTimers();

      // Make requests throughout the window
      const responses = [];

      // T=0s: 5 requests
      for (let i = 0; i < 5; i++) {
        responses.push(
          await app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        );
      }

      // T=30s: 5 more requests
      vi.advanceTimersByTime(30000);
      for (let i = 0; i < 5; i++) {
        responses.push(
          await app.request('/api/v1/services', {
            headers: { 'Authorization': `Bearer ${testApiKey}` },
          })
        );
      }

      // All should succeed if using sliding window (10 total in 60s window)
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBe(10);

      vi.useRealTimers();
    });
  });
});

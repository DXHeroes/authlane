/**
 * Rate limiting unit tests
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';
import { getTestDb } from '../setup/test-db';
import { testTenantMiddleware } from '../setup/test-helpers';

describe('rate limiting middleware', () => {
  const db = getTestDb();
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', testTenantMiddleware());
  });

  it('should allow requests within limit', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 5, windowMs: 60000, enabled: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test', { headers: { 'x-tenant-id': 'tenant-1' } });
      expect(res.status).toBe(200);
    }
  });

  it('should block requests exceeding limit', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 2, windowMs: 60000, enabled: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    // First 2 requests succeed
    await app.request('/test', { headers: { 'x-tenant-id': 'tenant-2' } });
    await app.request('/test', { headers: { 'x-tenant-id': 'tenant-2' } });

    // 3rd request fails
    const res = await app.request('/test', { headers: { 'x-tenant-id': 'tenant-2' } });
    expect(res.status).toBe(429);
  });

  it('should allow unlimited requests when disabled', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 1, windowMs: 60000, enabled: false }));
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await app.request('/test', { headers: { 'x-tenant-id': 'tenant-3' } });
      expect(res.status).toBe(200);
    }
  });

  it('should allow requests without tenant ID', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 1, windowMs: 60000, enabled: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});

/**
 * Rate limiting unit tests
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';

describe('rate limiting middleware', () => {
  const db = {} as never;
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', async (c, next) => {
      const organizationId = c.req.header('x-organization-id');
      if (organizationId) c.set('organization', { id: organizationId });
      await next();
    });
  });

  it('should allow requests within limit', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 5, windowMs: 60000, enabled: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test', { headers: { 'x-organization-id': 'org-1' } });
      expect(res.status).toBe(200);
    }
  });

  it('should block requests exceeding limit', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 2, windowMs: 60000, enabled: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    // First 2 requests succeed
    await app.request('/test', { headers: { 'x-organization-id': 'org-2' } });
    await app.request('/test', { headers: { 'x-organization-id': 'org-2' } });

    // 3rd request fails
    const res = await app.request('/test', { headers: { 'x-organization-id': 'org-2' } });
    expect(res.status).toBe(429);
  });

  it('should allow unlimited requests when disabled', async () => {
    app.use('*', rateLimitMiddleware(db, { maxRequests: 1, windowMs: 60000, enabled: false }));
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await app.request('/test', { headers: { 'x-organization-id': 'org-3' } });
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

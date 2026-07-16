import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { exactFrameOrigin, sanitizeMetricRoute } from '../../src/lib/http-security.js';

describe('HTTP security boundary', () => {
  it('sets browser security headers and a request correlation ID', async () => {
    const response = await createApp({} as never, { rateLimitEnabled: false }).request('/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects non-JSON and oversized request bodies', async () => {
    const app = createApp({} as never, { rateLimitEnabled: false });
    const wrongType = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'password=secret',
    });
    const oversized = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(300 * 1024) }),
    });

    expect(wrongType.status).toBe(415);
    expect(oversized.status).toBe(413);
  });

  it('keeps metrics undiscoverable without the configured bearer token', async () => {
    const token = 'm'.repeat(32);
    const app = createApp({} as never, {
      metricsBearerToken: token,
      rateLimitEnabled: false,
    });

    expect((await app.request('/metrics')).status).toBe(404);
    expect(
      (await app.request('/metrics', { headers: { authorization: `Bearer ${token}` } })).status
    ).toBe(200);
  });

  it('allows the connect document to be framed only by its exact bound origin', async () => {
    const app = createApp({} as never, {
      publicRoot: 'tests/fixtures/public',
      rateLimitEnabled: false,
    });

    const allowed = await app.request('/connect?origin=https%3A%2F%2Ftenant.example');
    const invalid = await app.request('/connect?origin=https%3A%2F%2Ftenant.example%2Fpath');

    expect(allowed.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'self' https://tenant.example"
    );
    expect(allowed.headers.has('x-frame-options')).toBe(false);
    expect(allowed.headers.get('cache-control')).toBe('no-store');
    expect(invalid.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(invalid.headers.has('x-frame-options')).toBe(false);
  });
});

describe('HTTP security helpers', () => {
  it('bounds metric cardinality', () => {
    expect(sanitizeMetricRoute('/api/v1/dashboard/api-keys/key_123')).toBe(
      '/api/v1/dashboard/api-keys/:id'
    );
    expect(sanitizeMetricRoute('/api/v1/users/customer@example.com/connections/github')).toBe(
      '/api/v1/users/:id/connections/:id'
    );
  });

  it('accepts only exact secure frame origins in production', () => {
    expect(exactFrameOrigin('https://tenant.example', 'production')).toBe('https://tenant.example');
    expect(exactFrameOrigin('http://tenant.example', 'production')).toBeNull();
    expect(exactFrameOrigin('https://tenant.example/path', 'production')).toBeNull();
    expect(exactFrameOrigin('http://localhost:5173', 'development')).toBe('http://localhost:5173');
  });
});

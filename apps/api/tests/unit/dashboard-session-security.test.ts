import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { dashboardSessionSecurity } from '../../src/middleware/dashboard-session-security.js';

function appFor(options: {
  authMode?: 'magic-link' | 'email-password';
  twoFactorEnabled: boolean;
  sessionCreatedAt: Date;
  now?: Date;
}) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('principal', {
      kind: 'session',
      organizationId: 'org_1',
      apiKeyId: null,
      scopes: [],
    });
    c.set('user', {
      id: 'user_1',
      twoFactorEnabled: options.twoFactorEnabled,
    });
    c.set('session', {
      id: 'session_1',
      userId: 'user_1',
      createdAt: options.sessionCreatedAt,
    });
    await next();
  });
  app.use(
    '*',
    dashboardSessionSecurity({
      authMode: options.authMode ?? 'email-password',
      trustedOrigins: ['https://app.authlane.test'],
      now: () => options.now ?? new Date('2026-07-16T10:00:00.000Z'),
      stepUpMaxAgeSeconds: 600,
    })
  );
  app.get('/resource', (c) => c.json({ ok: true }));
  app.post('/resource', (c) => c.json({ ok: true }));
  return app;
}

describe('dashboard session mutation security', () => {
  it('rejects cross-origin and origin-less session mutations', async () => {
    const app = appFor({
      twoFactorEnabled: true,
      sessionCreatedAt: new Date('2026-07-16T09:55:00.000Z'),
    });

    for (const headers of [{ Origin: 'https://attacker.test' }, {} as Record<string, string>]) {
      const response = await app.request('/resource', { method: 'POST', headers });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'CSRF_FAILED' });
    }
  });

  it('requires MFA enrollment before a dashboard mutation', async () => {
    const response = await appFor({
      twoFactorEnabled: false,
      sessionCreatedAt: new Date('2026-07-16T09:55:00.000Z'),
    }).request('/resource', {
      method: 'POST',
      headers: { Origin: 'https://app.authlane.test' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_ENROLLMENT_REQUIRED' });
  });

  it('requires a freshly authenticated session for a dashboard mutation', async () => {
    const response = await appFor({
      twoFactorEnabled: true,
      sessionCreatedAt: new Date('2026-07-16T09:00:00.000Z'),
    }).request('/resource', {
      method: 'POST',
      headers: { Origin: 'https://app.authlane.test' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });

  it('allows fresh MFA sessions and does not gate reads', async () => {
    const app = appFor({
      twoFactorEnabled: true,
      sessionCreatedAt: new Date('2026-07-16T09:55:00.000Z'),
    });
    const mutation = await app.request('/resource', {
      method: 'POST',
      headers: { Origin: 'https://app.authlane.test', 'Sec-Fetch-Site': 'same-origin' },
    });
    const read = await app.request('/resource');

    expect(mutation.status).toBe(200);
    expect(read.status).toBe(200);
  });

  it('uses a fresh magic-link session as step-up without requiring TOTP', async () => {
    const response = await appFor({
      authMode: 'magic-link',
      twoFactorEnabled: false,
      sessionCreatedAt: new Date('2026-07-16T09:55:00.000Z'),
    }).request('/resource', {
      method: 'POST',
      headers: { Origin: 'https://app.authlane.test', 'Sec-Fetch-Site': 'same-origin' },
    });

    expect(response.status).toBe(200);
  });

  it('still rejects a stale magic-link session', async () => {
    const response = await appFor({
      authMode: 'magic-link',
      twoFactorEnabled: false,
      sessionCreatedAt: new Date('2026-07-16T09:00:00.000Z'),
    }).request('/resource', {
      method: 'POST',
      headers: { Origin: 'https://app.authlane.test' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });
});

/**
 * The rate limits on Authlane's authorization-server endpoints.
 *
 * The `/api/v1` limiter never sees `/api/auth/*`, so these endpoints are covered only by
 * better-auth's own limiter and the custom rules `createAuth` passes it. This suite pins the wiring
 * rather than the constants: better-auth's default is 60 a minute, so a dropped
 * `...oidcProviderRateLimitRules` spread would let every request below through.
 *
 * It lives in its own file because better-auth's in-memory limiter is shared across auth instances
 * within a module registry, and exhausting a bucket here would strand every other suite behind a
 * 429. No database is needed: the limiter answers before the endpoint ever reaches one.
 */

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { oidcProviderRateLimitRules } from '../../src/lib/oidc-provider-config.js';

const ORIGIN = 'http://localhost:3000';

async function statusesFor(path: string, attempts: number): Promise<number[]> {
  const app = createApp({} as never, { rateLimitEnabled: false });
  const statuses: number[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await app.request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ grant_type: 'authorization_code' }),
    });
    statuses.push(response.status);
  }
  return statuses;
}

describe('authorization-server rate limits', () => {
  it('declares the rules the OAuth endpoints need', () => {
    expect(oidcProviderRateLimitRules).toEqual({
      '/oauth2/token': { window: 60, max: 10 },
      '/oauth2/authorize': { window: 60, max: 30 },
    });
  });

  it('caps the token endpoint at ten a minute', async () => {
    const statuses = await statusesFor('/api/auth/oauth2/token', 11);

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});

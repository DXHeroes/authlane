// @vitest-environment node

import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDemoProvider, isDemoProviderEnabled } from '../../server/demo-provider.js';

const clientId = 'demo-client';
const clientSecret = 'demo-secret-with-at-least-thirty-two-bytes';
const redirectUri = 'http://localhost:3000/api/v1/oauth/authlane-demo/callback';
const providerOrigin = 'http://localhost:5175';

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function authorize(app: ReturnType<typeof createDemoProvider>, verifier: string) {
  const state = randomBytes(24).toString('base64url');
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'demo:read',
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  const page = await app.request(`/demo-provider/authorize?${query}`);
  expect(page.status).toBe(200);
  expect(page.headers.get('content-security-policy')).toContain(
    `form-action ${providerOrigin} ${new URL(redirectUri).origin}`
  );
  const consentCookie = page.headers.get('set-cookie')?.split(';')[0];
  expect(consentCookie).toMatch(/^authlane_demo_consent=/);
  const requestId = (await page.text()).match(/name="request_id" value="([^"]+)"/)?.[1];
  expect(requestId).toBeTruthy();
  if (!consentCookie || !requestId) throw new Error('Authorization page omitted consent state');

  const approval = await app.request('/demo-provider/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: consentCookie,
      Origin: 'null',
    },
    body: new URLSearchParams({ request_id: requestId, decision: 'approve' }),
  });
  expect(approval.status).toBe(302);
  const location = approval.headers.get('location');
  if (!location) throw new Error('Authorization response omitted callback location');
  const callback = new URL(location);
  expect(callback.origin + callback.pathname).toBe(redirectUri);
  expect(callback.searchParams.get('state')).toBe(state);
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('Authorization response omitted code');
  return code;
}

function provider() {
  return createDemoProvider({
    clientId,
    clientSecret,
    redirectUri,
    providerOrigin,
    signingSecret: randomBytes(32),
    accessTokenTtlSeconds: 305,
  });
}

describe('local OAuth demo provider', () => {
  it('cannot be enabled in production', () => {
    expect(isDemoProviderEnabled({ AUTHLANE_DEMO_MODE: 'true', NODE_ENV: 'production' })).toBe(
      false
    );
    expect(isDemoProviderEnabled({ AUTHLANE_DEMO_MODE: 'true', NODE_ENV: 'development' })).toBe(
      true
    );
  });

  it('is pinned to the deterministic localhost origins', () => {
    const common = {
      clientId,
      clientSecret,
      signingSecret: randomBytes(32),
    };

    expect(() =>
      createDemoProvider({
        ...common,
        providerOrigin: 'http://127.0.0.1:5175',
        redirectUri,
      })
    ).toThrow('http://localhost:5175');
    expect(() =>
      createDemoProvider({
        ...common,
        providerOrigin,
        redirectUri: 'http://localhost:3000/api/v1/oauth/authlane-demo/callback/extra',
      })
    ).toThrow('Authlane demo callback');
  });

  it('rejects weak client authentication and unsafe access-token TTLs', () => {
    expect(() =>
      createDemoProvider({
        clientId,
        clientSecret: 'too-short',
        redirectUri,
        providerOrigin,
        signingSecret: randomBytes(32),
      })
    ).toThrow('client secret');
    expect(() =>
      createDemoProvider({
        clientId,
        clientSecret,
        redirectUri,
        providerOrigin,
        signingSecret: randomBytes(32),
        accessTokenTtlSeconds: 86_400,
      })
    ).toThrow('access-token TTL');
  });

  it('requires an exact callback and PKCE S256', async () => {
    const app = provider();
    const base = {
      client_id: clientId,
      response_type: 'code',
      state: 'state-1234567890123456',
      scope: 'demo:read',
      code_challenge: pkceChallenge('verifier-with-at-least-43-characters-123456789'),
      code_challenge_method: 'S256',
    };

    const wrongCallback = await app.request(
      `/demo-provider/authorize?${new URLSearchParams({ ...base, redirect_uri: `${redirectUri}/evil` })}`
    );
    expect(wrongCallback.status).toBe(400);

    const weakPkce = await app.request(
      `/demo-provider/authorize?${new URLSearchParams({ ...base, redirect_uri: redirectUri, code_challenge_method: 'plain' })}`
    );
    expect(weakPkce.status).toBe(400);
  });

  it('uses one-shot authorization codes and rotating refresh tokens', async () => {
    const app = provider();
    const verifier = 'verifier-with-at-least-43-characters-123456789';
    const code = await authorize(app, verifier);
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    });

    const tokenResponse = await app.request('/demo-provider/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json();
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 305 });

    const replay = await app.request('/demo-provider/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    expect(replay.status).toBe(400);

    const resources = await app.request('/demo-provider/resources', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(resources.status).toBe(200);
    expect(await resources.json()).toMatchObject({ generation: 1 });

    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
    });
    const refreshed = await app.request('/demo-provider/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: refreshBody,
    });
    expect(refreshed.status).toBe(200);
    const nextTokens = await refreshed.json();
    expect(nextTokens.refresh_token).not.toBe(tokens.refresh_token);

    const refreshReplay = await app.request('/demo-provider/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: refreshBody,
    });
    expect(refreshReplay.status).toBe(400);
  });

  it('rejects cross-origin consent submissions', async () => {
    const app = provider();
    const response = await app.request('/demo-provider/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://attacker.example',
      },
      body: new URLSearchParams({ request_id: 'unknown', decision: 'approve' }),
    });
    expect(response.status).toBe(403);
  });

  it('requires the one-time consent cookie even for the exact provider origin', async () => {
    const app = provider();
    const response = await app.request('/demo-provider/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: providerOrigin,
      },
      body: new URLSearchParams({ request_id: 'unknown', decision: 'approve' }),
    });
    expect(response.status).toBe(403);
  });
});

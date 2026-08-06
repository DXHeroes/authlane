/**
 * The OAuth client registry, driven against Postgres.
 *
 * Two things here cannot be proved without a real database. The first is tenant isolation:
 * `oauth_application` carries no row level security policy, so the only thing standing between two
 * workspaces is the `organization_id` predicate on every statement in the router, and a fake db
 * that ignores `where` would pass a test that the real one fails. The second is the client secret
 * envelope — a client is only genuinely registered if better-auth can decrypt its secret at the
 * token endpoint, which the last suite exercises end to end.
 *
 * Needs DATABASE_URL (or TEST_DATABASE_URL) pointing at a migrated Authlane database.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { decryptOAuthClientSecret } from '@authlane/crypto';
import {
  createDatabaseClient,
  type Database,
  eq,
  member,
  oauthApplication,
  organization,
  SMARTSTAFF_DEV_OAUTH_CLIENT,
  seedSmartStaffDevOAuthClient,
  user as userTable,
} from '@authlane/database';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import type { ApiPrincipal } from '../../src/lib/api-principal.js';
import { MemoryCacheStore } from '../../src/lib/cache.js';
import { createApiRouter } from '../../src/routes/index.js';
import { createOAuthClientsRouter } from '../../src/routes/oauth-clients.js';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery-staple';
const REDIRECT_URI = 'https://smartstaff.test/api/integrations/authlane/callback';

interface ClientPayload {
  id: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  clientSecret?: string;
}

let db: Database;
let organizationA: string;
let organizationB: string;
let userId: string;
let plainMemberId: string;
let userCookie: string;

/**
 * The dashboard router with the context `authMiddleware` would have established.
 *
 * The acting user defaults to the owner of both workspaces; the role gate reads their membership
 * out of the database, so passing `plainMemberId` exercises a real `member` row with role `member`
 * rather than a stubbed claim.
 */
function dashboardFor(organizationId: string, actingUserId?: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('organization', { id: organizationId } as never);
    c.set('user', { id: actingUserId ?? userId } as never);
    await next();
  });
  app.route('/', createOAuthClientsRouter(db));
  return app;
}

/**
 * A registration attempt. A refusal is answered with the bare Authlane error object, the shape the
 * rest of the dashboard surface uses, so the payload is typed loosely enough to hold either.
 */
async function register(
  organizationId: string,
  body: unknown
): Promise<{
  status: number;
  payload: { data?: ClientPayload | null; code?: string; hint?: string };
}> {
  const response = await dashboardFor(organizationId).request('/oauth-clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: (await response.json()) as { data?: ClientPayload | null; code?: string },
  };
}

async function registerOk(organizationId: string, name: string, redirectUris = [REDIRECT_URI]) {
  const { status, payload } = await register(organizationId, { name, redirectUris });
  expect(status).toBe(201);
  return payload.data as ClientPayload;
}

async function storedSecret(clientRowId: string): Promise<string | null> {
  const [row] = await db
    .select({ clientSecret: oauthApplication.clientSecret })
    .from(oauthApplication)
    .where(eq(oauthApplication.id, clientRowId));
  return row?.clientSecret ?? null;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

beforeAll(async () => {
  db = createDatabaseClient(process.env.DATABASE_URL as string);
  try {
    await db.select({ id: organization.id }).from(organization).limit(1);
  } catch (error) {
    throw new Error(
      'The OAuth clients suite needs a migrated Authlane database. Start one and point ' +
        'DATABASE_URL (or TEST_DATABASE_URL) at it, then run ' +
        '`pnpm --filter @authlane/database exec tsx src/migrate.ts`. ' +
        `Connection failed: ${(error as Error).message}`
    );
  }

  organizationA = `org_${randomUUID()}`;
  organizationB = `org_${randomUUID()}`;
  await db.insert(organization).values([
    { id: organizationA, name: 'Workspace A', slug: `workspace-a-${randomUUID().slice(0, 8)}` },
    { id: organizationB, name: 'Workspace B', slug: `workspace-b-${randomUUID().slice(0, 8)}` },
  ]);

  // One sign-up for the whole file: better-auth's in-memory limiter is keyed on an IP that
  // `app.request` cannot vary, so the auth endpoints are a shared budget.
  const email = `registrar-${randomUUID()}@authlane.test`;
  const signUp = await createApp(db, {
    authMode: 'email-password',
    signUpEnabled: true,
    rateLimitEnabled: false,
  }).request(`${ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name: 'Registrar' }),
  });
  if (signUp.status !== 200) {
    throw new Error(`Sign-up failed (${signUp.status}): ${await signUp.text()}`);
  }
  userCookie = signUp.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .find((cookie) => cookie.startsWith('authlane.session_token=')) as string;
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email));
  userId = (row as { id: string }).id;

  // A second account with no session: the role gate reads `member`, so an ordinary member only
  // needs a row, not a sign-in — and the auth endpoints are a shared budget.
  plainMemberId = `user_${randomUUID()}`;
  await db.insert(userTable).values({
    id: plainMemberId,
    name: 'Plain Member',
    email: `plain-${randomUUID()}@authlane.test`,
    emailVerified: true,
    updatedAt: new Date(),
  });

  await db.insert(member).values([
    { id: `mem_${randomUUID()}`, organizationId: organizationA, userId, role: 'owner' },
    // The registrar administers workspace B too, so the cross-tenant tests fail on isolation
    // rather than on a role they were never given.
    { id: `mem_${randomUUID()}`, organizationId: organizationB, userId, role: 'owner' },
    {
      id: `mem_${randomUUID()}`,
      organizationId: organizationA,
      userId: plainMemberId,
      role: 'member',
    },
  ]);
}, 60_000);

afterAll(async () => {
  if (!db) return;
  for (const id of [organizationA, organizationB].filter(Boolean)) {
    // oauth_application, member and the rest cascade with the organization.
    await db.delete(organization).where(eq(organization.id, id));
  }
  for (const id of [userId, plainMemberId].filter(Boolean)) {
    await db.delete(userTable).where(eq(userTable.id, id));
  }
});

describe('registering a client', () => {
  it('returns the secret once and stores it sealed', async () => {
    const { status, payload } = await register(organizationA, {
      name: 'SmartStaff',
      redirectUris: [REDIRECT_URI],
    });

    expect(status).toBe(201);
    const client = payload.data as ClientPayload;
    expect(client.clientSecret).toBeTruthy();
    expect(client.clientId).toHaveLength(32);
    expect(client.redirectUris).toEqual([REDIRECT_URI]);
    expect(client.disabled).toBe(false);

    const stored = await storedSecret(client.id);
    expect(stored).toMatch(/^authlane\.oidc\.v1\./);
    expect(stored).not.toBe(client.clientSecret);
    expect(stored).not.toContain(client.clientSecret as string);
    expect(await decryptOAuthClientSecret(stored as string)).toBe(client.clientSecret);
  });

  it('keeps the one response that carries the secret out of any cache', async () => {
    const response = await dashboardFor(organizationA).request('/oauth-clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cacheable?', redirectUris: [REDIRECT_URI] }),
    });

    expect(response.headers.get('cache-control')).toBe('no-store, private');
  });

  it('gives every client its own id and secret', async () => {
    const first = await registerOk(organizationA, 'First');
    const second = await registerOk(organizationA, 'Second');

    expect(first.clientId).not.toBe(second.clientId);
    expect(first.clientSecret).not.toBe(second.clientSecret);
  });

  it('records the registering user without tying the client to them', async () => {
    const client = await registerOk(organizationA, 'Owned by the workspace');

    const [row] = await db
      .select({ userId: oauthApplication.userId, organizationId: oauthApplication.organizationId })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, client.id));

    expect(row?.userId).toBe(userId);
    expect(row?.organizationId).toBe(organizationA);
  });

  it('refuses a redirect URI that is not https outside localhost', async () => {
    const { status, payload } = await register(organizationA, {
      name: 'Plaintext',
      redirectUris: ['http://smartstaff.test/callback'],
    });

    expect(status).toBe(400);
    expect(payload.code).toBe('VALIDATION_ERROR');
    expect(payload.hint).toContain('https');
  });

  it('refuses fragments, wildcards, duplicates and an empty list', async () => {
    for (const redirectUris of [
      ['https://smartstaff.test/cb#token'],
      ['https://*.smartstaff.test/cb'],
      ['https://smartstaff.test/cb', 'https://smartstaff.test/cb'],
      [],
      'https://smartstaff.test/cb',
    ]) {
      const { status } = await register(organizationA, { name: 'Refused', redirectUris });
      expect(status, JSON.stringify(redirectUris)).toBe(400);
    }
  });

  it('refuses a URI carrying a comma, which the column would split in two', async () => {
    const { status } = await register(organizationA, {
      name: 'Smuggled',
      redirectUris: ['https://smartstaff.test/cb,https://attacker.test/cb'],
    });

    expect(status).toBe(400);
    const [row] = await db
      .select({ id: oauthApplication.id })
      .from(oauthApplication)
      .where(eq(oauthApplication.name, 'Smuggled'));
    expect(row).toBeUndefined();
  });

  it('refuses a body that is not JSON', async () => {
    const response = await dashboardFor(organizationA).request('/oauth-clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });

    expect(response.status).toBe(400);
  });

  it('refuses every route without an organization in context', async () => {
    const app = new Hono();
    app.route('/', createOAuthClientsRouter(db));

    for (const [method, path] of [
      ['GET', '/oauth-clients'],
      ['POST', '/oauth-clients'],
      ['PATCH', '/oauth-clients/whatever'],
      ['DELETE', '/oauth-clients/whatever'],
    ] as const) {
      const response = await app.request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe('listing clients', () => {
  it('never returns a secret, in any spelling', async () => {
    const created = await registerOk(organizationA, 'Listed');

    const response = await dashboardFor(organizationA).request('/oauth-clients');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(created.clientId);
    expect(body).not.toContain(created.clientSecret as string);
    expect(body).not.toContain('authlane.oidc.v1.');
    expect(body).not.toContain('clientSecret');
  });

  it('returns the redirect URIs as an array', async () => {
    const second = 'https://smartstaff.test/other/callback';
    const created = await registerOk(organizationA, 'Two callbacks', [REDIRECT_URI, second]);

    const response = await dashboardFor(organizationA).request('/oauth-clients');
    const { data } = (await response.json()) as { data: ClientPayload[] };
    const listed = data.find((client) => client.id === created.id);

    expect(listed?.redirectUris).toEqual([REDIRECT_URI, second]);
  });

  it('shows only the active workspace', async () => {
    const mine = await registerOk(organizationA, 'Mine');
    const theirs = await registerOk(organizationB, 'Theirs');

    const { data } = (await (
      await dashboardFor(organizationA).request('/oauth-clients')
    ).json()) as { data: ClientPayload[] };
    const ids = data.map((client) => client.id);

    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });
});

describe('the role gate', () => {
  it('lets an ordinary member read the list', async () => {
    const created = await registerOk(organizationA, 'Readable by a member');

    const response = await dashboardFor(organizationA, plainMemberId).request('/oauth-clients');
    const { data } = (await response.json()) as { data: ClientPayload[] };

    expect(response.status).toBe(200);
    expect(data.map((client) => client.id)).toContain(created.id);
  });

  it('refuses an ordinary member every mutation', async () => {
    const created = await registerOk(organizationA, 'Members may not touch this');
    const app = dashboardFor(organizationA, plainMemberId);

    const create = await app.request('/oauth-clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'From a member', redirectUris: [REDIRECT_URI] }),
    });
    const patch = await app.request(`/oauth-clients/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });
    const remove = await app.request(`/oauth-clients/${created.id}`, { method: 'DELETE' });

    expect(create.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
    expect(((await create.json()) as { code: string }).code).toBe('INSUFFICIENT_SCOPE');

    // A 403 in front of a statement that still ran would be no gate at all.
    const [row] = await db
      .select({ disabled: oauthApplication.disabled })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, created.id));
    expect(row?.disabled).toBe(false);
    const [smuggled] = await db
      .select({ id: oauthApplication.id })
      .from(oauthApplication)
      .where(eq(oauthApplication.name, 'From a member'));
    expect(smuggled).toBeUndefined();
  });

  it('refuses a user who belongs to no workspace at all', async () => {
    const outsider = dashboardFor(organizationB, plainMemberId);

    const response = await outsider.request('/oauth-clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'From an outsider', redirectUris: [REDIRECT_URI] }),
    });

    expect(response.status).toBe(403);
  });
});

describe('cross-tenant access', () => {
  it('answers 404 rather than 403, so an id is never confirmed across workspaces', async () => {
    const theirs = await registerOk(organizationB, 'Theirs to keep');

    const patch = await dashboardFor(organizationA).request(`/oauth-clients/${theirs.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });
    const remove = await dashboardFor(organizationA).request(`/oauth-clients/${theirs.id}`, {
      method: 'DELETE',
    });

    expect(patch.status).toBe(404);
    expect(remove.status).toBe(404);

    // The row is what matters: a 404 in front of a statement that still ran would be worse than
    // a 403 in front of one that did not.
    const [row] = await db
      .select({ disabled: oauthApplication.disabled, name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, theirs.id));
    expect(row).toBeDefined();
    expect(row?.disabled).toBe(false);
    expect(row?.name).toBe('Theirs to keep');
  });

  it('refuses an API key principal at the dashboard boundary', async () => {
    const principal: ApiPrincipal = {
      kind: 'api_key',
      organizationId: organizationA,
      apiKeyId: 'key_1',
      scopes: ['catalog:read'],
    };
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('principal', principal);
      c.set('organization', { id: principal.organizationId } as never);
      c.set('user', null);
      c.set('session', null);
      c.set('apiKey', null);
      await next();
    });
    app.route('/api/v1', createApiRouter(db, new MemoryCacheStore()));

    const list = await app.request('/api/v1/dashboard/oauth-clients');
    const create = await app.request('/api/v1/dashboard/oauth-clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'From a key', redirectUris: [REDIRECT_URI] }),
    });

    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
  });
});

describe('updating and removing a client', () => {
  it('replaces the redirect URIs and disables the client', async () => {
    const created = await registerOk(organizationA, 'Updatable');
    const replacement = 'https://smartstaff.test/new/callback';

    const response = await dashboardFor(organizationA).request(`/oauth-clients/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirectUris: [replacement], disabled: true }),
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: ClientPayload };
    expect(data.redirectUris).toEqual([replacement]);
    expect(data.disabled).toBe(true);
    expect(data).not.toHaveProperty('clientSecret');

    const [row] = await db
      .select({ redirectUrls: oauthApplication.redirectUrls })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, created.id));
    expect(row?.redirectUrls).toBe(replacement);
  });

  it('refuses an update that would register an unusable callback', async () => {
    const created = await registerOk(organizationA, 'Guarded update');

    const response = await dashboardFor(organizationA).request(`/oauth-clients/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirectUris: ['https://smartstaff.test/cb#'] }),
    });

    expect(response.status).toBe(400);
    const [row] = await db
      .select({ redirectUrls: oauthApplication.redirectUrls })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, created.id));
    expect(row?.redirectUrls).toBe(REDIRECT_URI);
  });

  it('404s an update to a client that never existed', async () => {
    const response = await dashboardFor(organizationA).request('/oauth-clients/oauth_client_none', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(response.status).toBe(404);
  });

  it('deletes a client of the active workspace', async () => {
    const created = await registerOk(organizationA, 'Deletable');

    const response = await dashboardFor(organizationA).request(`/oauth-clients/${created.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const [row] = await db
      .select({ id: oauthApplication.id })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, created.id));
    expect(row).toBeUndefined();
  });
});

describe('a registered client at the token endpoint', () => {
  it('completes an authorization code exchange with the secret it was issued', async () => {
    const client = await registerOk(organizationA, 'Pairing client');
    const { verifier, challenge } = pkce();
    const app = createApp(db, {
      authMode: 'email-password',
      signUpEnabled: true,
      rateLimitEnabled: false,
    });

    const authorize = await app.request(
      `${ORIGIN}/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'openid profile email',
        state: 'pairing-state',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()}`,
      { headers: { cookie: userCookie } }
    );

    expect(authorize.status).toBe(302);
    const location = new URL(authorize.headers.get('location') ?? '', ORIGIN);
    expect(location.pathname).toBe('/oauth/consent');

    const consent = await app.request(`${ORIGIN}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: userCookie },
      body: JSON.stringify({
        accept: true,
        consent_code: location.searchParams.get('consent_code'),
      }),
    });
    expect(consent.status).toBe(200);
    const { redirectURI } = (await consent.json()) as { redirectURI: string };
    const code = new URL(redirectURI).searchParams.get('code') as string;

    const token = await app.request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code_verifier: verifier,
      }),
    });

    expect(token.status).toBe(200);
    const tokens = (await token.json()) as { access_token: string };
    expect(tokens.access_token).toBeTruthy();

    // And the workspace the client belongs to is the claim SmartStaff pairs against.
    const userinfo = await app.request(`${ORIGIN}/api/auth/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const claims = (await userinfo.json()) as { workspace?: { id: string } };
    expect(claims.workspace?.id).toBe(organizationA);
  });

  it('still honours an authorization code minted before a redirect URI was removed', async () => {
    // Documents the gap, it does not endorse it. better-auth's token endpoint compares the
    // request's redirect_uri against the one stored on the code (index.mjs: `value.redirectURI !==
    // redirect_uri`) and never re-reads the client's current list, so a code already in flight
    // survives the URI being withdrawn until it expires. Only `disabled` is re-read per request.
    // Closing this would take deliberate revocation on PATCH; nothing here does that yet.
    const client = await registerOk(organizationA, 'Retargeted client', [
      REDIRECT_URI,
      'https://smartstaff.test/second/callback',
    ]);
    const { verifier, challenge } = pkce();
    const app = createApp(db, { authMode: 'email-password', rateLimitEnabled: false });

    const authorize = await app.request(
      `${ORIGIN}/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'openid',
        state: 'in-flight',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()}`,
      { headers: { cookie: userCookie } }
    );
    const consentCode = new URL(authorize.headers.get('location') ?? '', ORIGIN).searchParams.get(
      'consent_code'
    );
    const consent = await app.request(`${ORIGIN}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: userCookie },
      body: JSON.stringify({ accept: true, consent_code: consentCode }),
    });
    const { redirectURI } = (await consent.json()) as { redirectURI: string };
    const code = new URL(redirectURI).searchParams.get('code') as string;

    // The workspace withdraws the callback the code in flight was issued for.
    const patch = await dashboardFor(organizationA).request(`/oauth-clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirectUris: ['https://smartstaff.test/second/callback'] }),
    });
    expect(patch.status).toBe(200);

    const token = await app.request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code_verifier: verifier,
      }),
    });

    expect(token.status).toBe(200);

    // A fresh authorization for the withdrawn URI is refused, so the exposure is bounded by the
    // ten-minute code lifetime rather than open-ended.
    const reauthorize = await app.request(
      `${ORIGIN}/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'openid',
        state: 'after-removal',
        code_challenge: pkce().challenge,
        code_challenge_method: 'S256',
      }).toString()}`,
      { headers: { cookie: userCookie } }
    );
    expect(reauthorize.headers.get('location') ?? '').not.toContain('code=');
  });

  it('refuses a client the dashboard disabled', async () => {
    const client = await registerOk(organizationA, 'Retired client');
    await dashboardFor(organizationA).request(`/oauth-clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });
    const { challenge } = pkce();

    const authorize = await createApp(db, {
      authMode: 'email-password',
      rateLimitEnabled: false,
    }).request(
      `${ORIGIN}/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'openid',
        state: 'pairing-state',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()}`,
      { headers: { cookie: userCookie } }
    );

    const location = authorize.headers.get('location') ?? '';
    expect(location).not.toContain('/oauth/consent');
    expect(location).toContain('client_disabled');
  });
});

/**
 * These exercise the real seed, so they write and then remove the one fixed
 * `oauth_client_smartstaff_dev` row. Against a database where a developer had seeded that client
 * for their own workspace, running this suite takes it away — point the tests at the throwaway test
 * database, not the one behind `pnpm dev`.
 */
describe('the local development seed', () => {
  it('is idempotent, and leaves one usable client behind', async () => {
    await seedSmartStaffDevOAuthClient(db, organizationA);
    await seedSmartStaffDevOAuthClient(db, organizationA);

    const rows = await db
      .select({
        id: oauthApplication.id,
        clientId: oauthApplication.clientId,
        clientSecret: oauthApplication.clientSecret,
        redirectUrls: oauthApplication.redirectUrls,
        disabled: oauthApplication.disabled,
        organizationId: oauthApplication.organizationId,
      })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, SMARTSTAFF_DEV_OAUTH_CLIENT.clientId));

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.id).toBe(SMARTSTAFF_DEV_OAUTH_CLIENT.id);
    expect(row?.organizationId).toBe(organizationA);
    expect(row?.disabled).toBe(false);
    expect(row?.redirectUrls).toBe('http://localhost:3000/api/integrations/authlane/callback');
    expect(await decryptOAuthClientSecret(row?.clientSecret as string)).toBe(
      SMARTSTAFF_DEV_OAUTH_CLIENT.clientSecret
    );
  });

  it('registers a redirect URI the router would also accept', async () => {
    const created = await registerOk(organizationA, 'Same rules', [
      SMARTSTAFF_DEV_OAUTH_CLIENT.redirectUri,
    ]);

    expect(created.redirectUris).toEqual([SMARTSTAFF_DEV_OAUTH_CLIENT.redirectUri]);
  });

  it('refuses to write a fixed credential into a production database', async () => {
    const environment = process.env.NODE_ENV;
    await db
      .delete(oauthApplication)
      .where(eq(oauthApplication.id, SMARTSTAFF_DEV_OAUTH_CLIENT.id));
    process.env.NODE_ENV = 'production';
    try {
      expect(await seedSmartStaffDevOAuthClient(db, organizationA)).toBe('skipped-production');
    } finally {
      process.env.NODE_ENV = environment;
    }

    const rows = await db
      .select({ id: oauthApplication.id })
      .from(oauthApplication)
      .where(eq(oauthApplication.id, SMARTSTAFF_DEV_OAUTH_CLIENT.id));
    expect(rows).toHaveLength(0);
  });
});

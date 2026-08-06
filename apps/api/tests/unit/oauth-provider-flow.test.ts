/**
 * The OAuth 2.1 authorization-server surface, driven end to end against Postgres.
 *
 * better-auth's oidc-provider plugin keeps authorization codes, consents and tokens in the
 * database and reads clients back through the Drizzle adapter, so nothing short of a real database
 * proves the flow. The suite therefore needs DATABASE_URL (or TEST_DATABASE_URL) to point at a
 * migrated Authlane database.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { encryptOAuthClientSecret } from '@authlane/crypto';
import {
  createDatabaseClient,
  type Database,
  eq,
  member,
  oauthApplication,
  organization,
  user as userTable,
  verification,
} from '@authlane/database';
import { jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';

const ORIGIN = 'http://localhost:3000';
const REDIRECT_URI = 'https://smartstaff.test/api/authlane/callback';
const OTHER_REDIRECT_URI = 'https://smartstaff.test/other/callback';
const CLIENT_SECRET = 'smartstaff-client-secret-value';
const PASSWORD = 'correct-horse-battery-staple';

let db: Database;
let organizationId: string;
let memberUser: { id: string; cookie: string };
let outsiderUser: { id: string; cookie: string };
let memberEmail: string;
let outsiderEmail: string;
let clientId: string;
let disabledClientId: string;

function app() {
  // A fresh instance per test: better-auth's in-memory rate limiter lives on the auth instance and
  // /oauth2/token only allows ten calls a minute.
  return createApp(db, {
    authMode: 'email-password',
    signUpEnabled: true,
    rateLimitEnabled: false,
  });
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function sessionCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();
  const token = cookies
    .map((cookie) => cookie.split(';')[0] ?? '')
    .find((cookie) => cookie.startsWith('authlane.session_token='));
  if (!token) throw new Error(`No session cookie in response: ${cookies.join(' | ')}`);
  return token;
}

async function signUp(email: string): Promise<{ id: string; cookie: string }> {
  const response = await app().request(`${ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name: 'Test Person' }),
  });
  if (response.status !== 200) {
    throw new Error(`Sign-up failed (${response.status}): ${await response.text()}`);
  }
  const cookie = sessionCookie(response);
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email));
  if (!row) throw new Error(`User ${email} was not created`);
  return { id: row.id, cookie };
}

function authorizeUrl(
  overrides: Record<string, string | undefined> = {},
  challenge?: string
): string {
  const params: Record<string, string | undefined> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    state: 'state-value-with spaces&ampersand',
    code_challenge: challenge,
    code_challenge_method: challenge ? 'S256' : undefined,
    ...overrides,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  return `${ORIGIN}/api/auth/oauth2/authorize?${query.toString()}`;
}

/**
 * Runs authorize (and consent, when it is still required) and returns the authorization code.
 *
 * The plugin records a consent row the first time a user accepts, and every later authorize for the
 * same user, client and scopes goes straight back to the redirect URI with a code.
 */
async function authorizationCode(challenge: string, cookie: string): Promise<string> {
  const instance = app();
  const authorizeResponse = await instance.request(authorizeUrl({}, challenge), {
    headers: { cookie },
  });
  expect(authorizeResponse.status).toBe(302);
  const location = new URL(authorizeResponse.headers.get('location') ?? '', ORIGIN);

  if (location.pathname !== '/oauth/consent') {
    const code = location.searchParams.get('code');
    if (!code) throw new Error(`No code on authorize redirect: ${location.toString()}`);
    return code;
  }

  const consentCode = location.searchParams.get('consent_code');
  expect(consentCode).toBeTruthy();
  const consentResponse = await instance.request(`${ORIGIN}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify({ accept: true, consent_code: consentCode }),
  });
  expect(consentResponse.status).toBe(200);
  const { redirectURI } = (await consentResponse.json()) as { redirectURI: string };
  const code = new URL(redirectURI).searchParams.get('code');
  if (!code) throw new Error(`No code on consent redirect: ${redirectURI}`);
  return code;
}

beforeAll(async () => {
  db = createDatabaseClient(process.env.DATABASE_URL as string);
  try {
    await db.select({ id: organization.id }).from(organization).limit(1);
  } catch (error) {
    throw new Error(
      'The OAuth provider flow suite needs a migrated Authlane database. Start one and point ' +
        'DATABASE_URL (or TEST_DATABASE_URL) at it, then run ' +
        '`pnpm --filter @authlane/database exec tsx src/migrate.ts`. ' +
        `Connection failed: ${(error as Error).message}`
    );
  }

  organizationId = `org_${randomUUID()}`;
  await db.insert(organization).values({
    id: organizationId,
    name: 'Pairing Workspace',
    slug: `pairing-${randomUUID().slice(0, 8)}`,
  });

  memberEmail = `member-${randomUUID()}@authlane.test`;
  outsiderEmail = `outsider-${randomUUID()}@authlane.test`;
  memberUser = await signUp(memberEmail);
  outsiderUser = await signUp(outsiderEmail);

  await db.insert(member).values({
    id: `mem_${randomUUID()}`,
    organizationId,
    userId: memberUser.id,
    role: 'owner',
  });

  clientId = `client_${randomUUID()}`;
  disabledClientId = `client_${randomUUID()}`;
  const encryptedSecret = await encryptOAuthClientSecret(CLIENT_SECRET);
  await db.insert(oauthApplication).values([
    {
      id: `app_${randomUUID()}`,
      name: 'SmartStaff',
      clientId,
      clientSecret: encryptedSecret,
      redirectUrls: `${REDIRECT_URI},${OTHER_REDIRECT_URI}`,
      type: 'web',
      organizationId,
    },
    {
      id: `app_${randomUUID()}`,
      name: 'Retired SmartStaff',
      clientId: disabledClientId,
      clientSecret: encryptedSecret,
      redirectUrls: REDIRECT_URI,
      type: 'web',
      disabled: true,
      organizationId,
    },
  ]);
}, 60_000);

afterAll(async () => {
  if (!db) return;
  await db.delete(oauthApplication).where(eq(oauthApplication.organizationId, organizationId));
  await db.delete(member).where(eq(member.organizationId, organizationId));
  await db.delete(organization).where(eq(organization.id, organizationId));
  for (const id of [memberUser?.id, outsiderUser?.id].filter(Boolean) as string[]) {
    await db.delete(userTable).where(eq(userTable.id, id));
  }
  // The pool is left to its idle timeout: createDatabaseClient hands back a Proxy that binds every
  // function it returns, and a bound `$client` has lost `end`.
});

describe('client secret storage', () => {
  it('seals the secret so the stored value never contains the plaintext', async () => {
    const [row] = await db
      .select({ clientSecret: oauthApplication.clientSecret })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, clientId));

    expect(row?.clientSecret).toBeTruthy();
    expect(row?.clientSecret).not.toContain(CLIENT_SECRET);
    expect(row?.clientSecret).toMatch(/^authlane\.oidc\.v1\./);
  });
});

describe('dynamic client registration', () => {
  it('is closed even to a signed-in user', async () => {
    const response = await app().request(`${ORIGIN}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: memberUser.cookie },
      body: JSON.stringify({
        client_name: 'Self registered',
        redirect_uris: ['https://attacker.test/callback'],
      }),
    });

    expect(response.status).toBe(404);
    const [row] = await db
      .select({ id: oauthApplication.id })
      .from(oauthApplication)
      .where(eq(oauthApplication.name, 'Self registered'));
    expect(row).toBeUndefined();
  });
});

describe('authorize membership gate', () => {
  it('redirects a signed-in non-member to the registered redirect URI with access_denied', async () => {
    const { challenge } = pkce();
    const response = await app().request(authorizeUrl({}, challenge), {
      headers: { cookie: outsiderUser.cookie },
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('error_description')).toBe(
      'User is not a member of this AuthLane workspace'
    );
    expect(location.searchParams.get('state')).toBe('state-value-with spaces&ampersand');
  });

  it('never redirects to an unregistered redirect URI', async () => {
    const { challenge } = pkce();
    const response = await app().request(
      authorizeUrl({ redirect_uri: 'https://attacker.test/steal' }, challenge),
      { headers: { cookie: outsiderUser.cookie } }
    );

    expect(response.status).not.toBe(302);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).not.toContain('attacker.test/steal?error');
  });

  it('leaves the login redirect to the plugin when there is no session', async () => {
    const { challenge } = pkce();
    const response = await app().request(authorizeUrl({}, challenge));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '', ORIGIN);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('client_id')).toBe(clientId);
    expect(location.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(location.searchParams.get('state')).toBe('state-value-with spaces&ampersand');
  });

  it('refuses offline_access before the user reaches the login page', async () => {
    const { challenge } = pkce();
    const response = await app().request(
      authorizeUrl({ scope: 'openid profile offline_access' }, challenge)
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_scope');
    expect(location.searchParams.get('error_description')).toBe('offline_access is not available');
    expect(location.searchParams.get('state')).toBe('state-value-with spaces&ampersand');
  });

  it('refuses offline_access to a member too', async () => {
    const { challenge } = pkce();
    const response = await app().request(
      authorizeUrl({ scope: 'openid offline_access' }, challenge),
      { headers: { cookie: memberUser.cookie } }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('error=invalid_scope');
  });

  it('matches whole scope tokens, not substrings', async () => {
    const { challenge } = pkce();
    const response = await app().request(
      authorizeUrl({ scope: 'openid offline_access_extended' }, challenge),
      { headers: { cookie: memberUser.cookie } }
    );

    // The plugin rejects the unknown scope with its own wording; what matters is that the gate let
    // the request reach it instead of matching `offline_access` inside a longer token.
    const location = new URL(response.headers.get('location') ?? '', ORIGIN);
    expect(location.searchParams.get('error_description')).not.toBe(
      'offline_access is not available'
    );
  });

  it('rejects a repeated scope parameter cleanly instead of failing inside the plugin', async () => {
    const { challenge } = pkce();
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state: 'st',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    query.append('scope', 'openid');
    query.append('scope', 'offline_access');

    const response = await app().request(
      `${ORIGIN}/api/auth/oauth2/authorize?${query.toString()}`,
      { headers: { cookie: memberUser.cookie } }
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('error_description')).toBe(
      'scope must be provided exactly once'
    );
  });

  it('never redirects an offline_access refusal to an unregistered URI', async () => {
    const { challenge } = pkce();
    const response = await app().request(
      authorizeUrl(
        { redirect_uri: 'https://attacker.test/steal', scope: 'openid offline_access' },
        challenge
      )
    );

    // The plugin's own login redirect carries the original query, attacker URI and all. The point
    // is that the browser is never sent TO that host.
    const location = new URL(response.headers.get('location') ?? '', ORIGIN);
    expect(location.origin).toBe(ORIGIN);
    expect(location.searchParams.get('error')).toBeNull();
  });

  it('lets a member through to the consent page', async () => {
    const { challenge } = pkce();
    const response = await app().request(authorizeUrl({}, challenge), {
      headers: { cookie: memberUser.cookie },
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '', ORIGIN);
    expect(location.pathname).toBe('/oauth/consent');
    expect(location.searchParams.get('client_id')).toBe(clientId);
    expect(location.searchParams.get('scope')).toBe('openid profile email');
  });
});

/**
 * Budget note: `/sign-in/email` is capped at five a minute, and better-auth's in-memory limiter is
 * shared by every auth instance in this module registry and keyed by an IP that `app.request` cannot
 * vary. Five sign-ins is therefore the whole file's allowance; a sixth would 429. Fold assertions
 * into an existing sign-in rather than adding one.
 */
describe('authorization resumed by signing in', () => {
  /** The plugin's un-redeemed authorization codes for one client and user. */
  async function pendingAuthorizations(client: string, userId: string): Promise<string[]> {
    const rows = await db.select({ value: verification.value }).from(verification);
    return rows
      .filter((row) => {
        try {
          const parsed = JSON.parse(row.value) as { clientId?: unknown; userId?: unknown };
          return parsed.clientId === client && parsed.userId === userId;
        } catch {
          return false;
        }
      })
      .map((row) => row.value);
  }

  /** Starts an authorization with no session and returns the plugin's pending-authorization cookie. */
  async function pendingAuthorizationCookie(instance: ReturnType<typeof app>): Promise<string> {
    const { challenge } = pkce();
    const response = await instance.request(authorizeUrl({}, challenge));
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0] ?? '')
      .find((value) => value.startsWith('oidc_login_prompt='));
    if (!cookie) throw new Error('The plugin did not park the pending authorization in a cookie');
    return cookie;
  }

  it('denies a non-member whose sign-in resumes the authorization, leaving nothing redeemable', async () => {
    const instance = app();
    const pending = await pendingAuthorizationCookie(instance);

    const response = await instance.request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: pending },
      body: JSON.stringify({ email: outsiderEmail, password: PASSWORD }),
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('state-value-with spaces&ampersand');
    // The denial must not cost the user the session they just established.
    expect(response.headers.getSetCookie().join(' ')).toContain('session_token=');

    // By the time the guard runs, the plugin has already minted a code and handed it over in
    // `oidc_consent_prompt`. A denial that redirects but lets that cookie through is no denial at
    // all: /oauth2/consent redeems the cookie behind nothing but a session.
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '');
    const consentCookies = cookies.filter((cookie) => cookie.startsWith('oidc_consent_prompt='));
    // Every one of them, not merely one: an expiry appended alongside the plugin's live cookie
    // would leave the live value in the jar.
    expect(consentCookies.length).toBeGreaterThan(0);
    expect(consentCookies.every((cookie) => cookie === 'oidc_consent_prompt=')).toBe(true);

    const jar = cookies.filter((cookie) => !cookie.endsWith('=')).join('; ');
    const consent = await instance.request(`${ORIGIN}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: jar },
      body: JSON.stringify({ accept: true }),
    });
    expect(consent.status).not.toBe(200);
    expect(await consent.text()).not.toContain('redirectURI');

    // Nor may the code linger in the verification table for the rest of its ten minutes. Asserted
    // by naming this user's authorizations rather than counting rows: the suites share one database
    // and vitest runs their files in parallel, so a table-wide count is not this test's to make.
    expect(await pendingAuthorizations(clientId, outsiderUser.id)).toHaveLength(0);
  });

  it('denies a non-member in the JSON shape a browser fetch receives', async () => {
    const instance = app();
    const pending = await pendingAuthorizationCookie(instance);

    const response = await instance.request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        cookie: pending,
        'sec-fetch-mode': 'cors',
      },
      body: JSON.stringify({ email: outsiderEmail, password: PASSWORD }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { redirect: boolean; url: string };
    expect(body.redirect).toBe(true);
    expect(body.url).toContain('error=access_denied');
  });

  it('resumes normally for a member', async () => {
    const instance = app();
    const pending = await pendingAuthorizationCookie(instance);

    const response = await instance.request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: pending },
      body: JSON.stringify({ email: memberEmail, password: PASSWORD }),
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '', ORIGIN);
    expect(location.searchParams.get('error')).toBeNull();
    expect([`/oauth/consent`, new URL(REDIRECT_URI).pathname]).toContain(location.pathname);
  });

  it('refuses offline_access carried in the pending-authorization cookie', async () => {
    // The direct gate now rejects offline_access before the plugin ever parks a prompt cookie, so a
    // legitimately signed one cannot carry the scope. The cookie is therefore hand-built: the guard
    // re-validates every field against the database and never reads the signature, and this pins
    // that the refusal holds on the resumed path too.
    const pending = `oidc_login_prompt=${encodeURIComponent(
      JSON.stringify({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'openid offline_access',
        state: 'resumed-state',
      })
    )}.unsigned`;

    const response = await app().request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: pending },
      body: JSON.stringify({ email: memberEmail, password: PASSWORD }),
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_scope');
    expect(location.searchParams.get('state')).toBe('resumed-state');
  });

  it('gives a non-member nothing on the consent endpoint without a prior authorization', async () => {
    const response = await app().request(`${ORIGIN}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: outsiderUser.cookie },
      body: JSON.stringify({ accept: true }),
    });

    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain('redirectURI');
  });

  it('leaves an ordinary sign-in alone when no authorization is pending', async () => {
    const response = await app().request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email: outsiderEmail, password: PASSWORD }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('authorization code flow', () => {
  it('exchanges a form-encoded token request and returns the workspace claim from userinfo', async () => {
    const { verifier, challenge } = pkce();
    const code = await authorizationCode(challenge, memberUser.cookie);
    const instance = app();

    const tokenResponse = await instance.request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: CLIENT_SECRET,
        code_verifier: verifier,
      }).toString(),
    });

    expect(tokenResponse.status).toBe(200);
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      token_type: string;
      scope: string;
      id_token?: string;
      refresh_token?: string;
    };
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.scope).toBe('openid profile email');
    expect(tokens.access_token).toBeTruthy();
    // Pairing is one-shot. The plugin only discloses a refresh token for `offline_access`, which the
    // gate refuses, so no client can ever hold one.
    expect(tokens.refresh_token).toBeUndefined();

    const userinfoResponse = await instance.request(`${ORIGIN}/api/auth/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });

    expect(userinfoResponse.status).toBe(200);
    const claims = (await userinfoResponse.json()) as Record<string, unknown>;
    expect(claims.sub).toBe(memberUser.id);
    expect(claims.workspace).toEqual({
      id: organizationId,
      slug: expect.stringMatching(/^pairing-/),
      role: 'owner',
    });
  });

  it('carries the workspace claim in an id_token signed with the sealed secret', async () => {
    const { verifier, challenge } = pkce();
    const code = await authorizationCode(challenge, memberUser.cookie);

    const response = await app().request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: CLIENT_SECRET,
        code_verifier: verifier,
      }),
    });
    const { id_token: idToken } = (await response.json()) as { id_token: string };
    const [, payload] = idToken.split('.');
    const claims = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8'));

    expect(claims.aud).toBe(clientId);
    expect(claims.workspace).toEqual({
      id: organizationId,
      slug: expect.stringMatching(/^pairing-/),
      role: 'owner',
    });

    // The plugin HS256-signs the id_token with whatever sits in `oauth_application.client_secret`,
    // which for Authlane is the sealed envelope rather than the secret the client holds. A consumer
    // therefore cannot verify this signature and has to treat `/oauth2/userinfo` as the contract.
    const [row] = await db
      .select({ clientSecret: oauthApplication.clientSecret })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, clientId));
    await expect(jwtVerify(idToken, new TextEncoder().encode(CLIENT_SECRET))).rejects.toThrow();
    await expect(
      jwtVerify(idToken, new TextEncoder().encode(row?.clientSecret as string))
    ).resolves.toBeDefined();
  });

  it('accepts a JSON token request, the encoding SmartStaff sends', async () => {
    const { verifier, challenge } = pkce();
    const code = await authorizationCode(challenge, memberUser.cookie);

    const response = await app().request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: CLIENT_SECRET,
        code_verifier: verifier,
      }),
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { access_token: string }).access_token).toBeTruthy();
  });
});

describe('token endpoint rejections', () => {
  it('rejects a token request without a code verifier', async () => {
    const { challenge } = pkce();
    const code = await authorizationCode(challenge, memberUser.cookie);

    const response = await app().request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: CLIENT_SECRET,
      }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a wrong client secret', async () => {
    const { verifier, challenge } = pkce();
    const code = await authorizationCode(challenge, memberUser.cookie);

    const response = await app().request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: 'not-the-client-secret',
        code_verifier: verifier,
      }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects a replayed authorization code', async () => {
    const { verifier, challenge } = pkce();
    const code = await authorizationCode(challenge, memberUser.cookie);
    const instance = app();
    const body = JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: CLIENT_SECRET,
      code_verifier: verifier,
    });
    const headers = { 'content-type': 'application/json', origin: ORIGIN };

    const first = await instance.request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers,
      body,
    });
    const second = await instance.request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers,
      body,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });

  it('refuses to authorize a disabled client', async () => {
    const { challenge } = pkce();
    const response = await app().request(authorizeUrl({ client_id: disabledClientId }, challenge), {
      headers: { cookie: memberUser.cookie },
    });

    const location = response.headers.get('location') ?? '';
    expect(location).not.toContain('/oauth/consent');
    expect(location).toContain('client_disabled');
  });
});

/**
 * What the resume guard is allowed to delete, and what it must not leave behind.
 *
 * Denying a resumed authorization means revoking the code the plugin already minted. That makes the
 * guard the one place in the request path that deletes from `verification` — the table that also
 * holds password-reset, magic-link and email-verification tokens — so the two properties pinned here
 * are that it deletes everything it should and nothing it should not.
 *
 * Separate from the main flow suite because `/sign-in/email` allows five requests a minute and
 * better-auth's in-memory limiter is shared across every auth instance in a module registry. Its own
 * file, its own allowance.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createDatabaseClient,
  type Database,
  eq,
  member,
  oauthApplication,
  oauthConsent,
  organization,
  user as userTable,
  verification,
} from '@authlane/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { guardResumedOAuthAuthorize } from '../../src/lib/oauth-authorize-gate.js';
import { encryptOAuthClientSecret } from '../../src/lib/oidc-provider-config.js';

const ORIGIN = 'http://localhost:3000';
const REDIRECT_URI = 'https://smartstaff.test/api/authlane/callback';
const PASSWORD = 'correct-horse-battery-staple';

let db: Database;
let organizationId: string;
let clientId: string;
let outsider: { id: string; email: string };
/** Consented while a member, then removed from the workspace. */
let formerMember: { id: string; email: string; cookie: string };

function app() {
  return createApp(db, {
    authMode: 'email-password',
    signUpEnabled: true,
    rateLimitEnabled: false,
  });
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function authorizeUrl(challenge: string): string {
  return `${ORIGIN}/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    state: 'revocation-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()}`;
}

async function signUp(email: string): Promise<{ id: string; email: string; cookie: string }> {
  const response = await app().request(`${ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name: 'Revocation Person' }),
  });
  if (response.status !== 200) {
    throw new Error(`Sign-up failed (${response.status}): ${await response.text()}`);
  }
  const cookie = (
    response.headers.getSetCookie().find((value) => value.startsWith('authlane.session_token=')) ??
    ''
  ).split(';')[0] as string;
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email));
  if (!row) throw new Error(`User ${email} was not created`);
  return { id: row.id, email, cookie };
}

/** Starts an authorization with no session and returns the parked pending-authorization cookie. */
async function pendingAuthorizationCookie(instance: ReturnType<typeof app>): Promise<string> {
  const response = await instance.request(authorizeUrl(pkce().challenge));
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0] ?? '')
    .find((value) => value.startsWith('oidc_login_prompt='));
  if (!cookie) throw new Error('The plugin did not park the pending authorization in a cookie');
  return cookie;
}

/**
 * The plugin's un-redeemed authorization codes for one user of this client.
 *
 * Named rather than counted: the suites share one database and vitest runs their files in parallel,
 * so a table-wide count would be measuring the other suites too.
 */
async function pendingAuthorizations(userId: string): Promise<string[]> {
  const rows = await db.select({ value: verification.value }).from(verification);
  return rows
    .filter((row) => {
      try {
        const parsed = JSON.parse(row.value) as { clientId?: unknown; userId?: unknown };
        return parsed.clientId === clientId && parsed.userId === userId;
      } catch {
        return false;
      }
    })
    .map((row) => row.value);
}

beforeAll(async () => {
  db = createDatabaseClient(process.env.DATABASE_URL as string);

  organizationId = `org_${randomUUID()}`;
  await db.insert(organization).values({
    id: organizationId,
    name: 'Revocation Workspace',
    slug: `revocation-${randomUUID().slice(0, 8)}`,
  });

  clientId = `client_${randomUUID()}`;
  await db.insert(oauthApplication).values({
    id: `app_${randomUUID()}`,
    name: 'SmartStaff',
    clientId,
    clientSecret: await encryptOAuthClientSecret('revocation-client-secret'),
    redirectUrls: REDIRECT_URI,
    type: 'web',
    organizationId,
  });

  outsider = await signUp(`outsider-${randomUUID()}@authlane.test`);
  formerMember = await signUp(`former-${randomUUID()}@authlane.test`);

  // The former member consents while still in the workspace, so later authorizations skip the
  // consent screen and take the plugin's already-consented ending.
  const membershipId = `mem_${randomUUID()}`;
  await db.insert(member).values({
    id: membershipId,
    organizationId,
    userId: formerMember.id,
    role: 'member',
  });
  const instance = app();
  const consentRedirect = await instance.request(authorizeUrl(pkce().challenge), {
    headers: { cookie: formerMember.cookie },
  });
  const consentCode = new URL(
    consentRedirect.headers.get('location') ?? '',
    ORIGIN
  ).searchParams.get('consent_code');
  await instance.request(`${ORIGIN}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: formerMember.cookie },
    body: JSON.stringify({ accept: true, consent_code: consentCode }),
  });
  await db.delete(member).where(eq(member.id, membershipId));

  // Consenting mints a code that nobody redeems. Clear it so the orphan assertion below starts from
  // zero and measures only what the guard did.
  for (const value of await pendingAuthorizations(formerMember.id)) {
    await db.delete(verification).where(eq(verification.value, value));
  }
}, 60_000);

afterAll(async () => {
  if (!db) return;
  await db.delete(oauthConsent).where(eq(oauthConsent.clientId, clientId));
  await db.delete(oauthApplication).where(eq(oauthApplication.organizationId, organizationId));
  await db.delete(member).where(eq(member.organizationId, organizationId));
  await db.delete(organization).where(eq(organization.id, organizationId));
  for (const id of [outsider?.id, formerMember?.id].filter(Boolean) as string[]) {
    await db.delete(userTable).where(eq(userTable.id, id));
  }
});

describe('resume denial revocation', () => {
  it('does not delete a verification row it was pointed at through callbackURL', async () => {
    // `POST /sign-in/email` echoes callbackURL into the Location, so the response the guard reads is
    // partly attacker-written. A password-reset token standing in for anything else in the table.
    const decoyIdentifier = randomBytes(16).toString('hex');
    await db.insert(verification).values({
      id: `ver_${randomUUID()}`,
      identifier: decoyIdentifier,
      value: 'someone-elses-password-reset-token',
      expiresAt: new Date(Date.now() + 600_000),
    });

    // A forged prompt cookie: unsigned, so the plugin will not resume, but the guard still runs and
    // still reaches the response the attacker shaped.
    const forged = `oidc_login_prompt=${encodeURIComponent(
      JSON.stringify({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'openid',
        state: 'forged',
      })
    )}.unsigned`;

    const response = await app().request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: forged },
      body: JSON.stringify({
        email: outsider.email,
        password: PASSWORD,
        callbackURL: `/stolen?code=${decoyIdentifier}`,
      }),
    });

    expect(response.headers.get('location') ?? '').toContain('error=access_denied');

    const [survivor] = await db
      .select({ id: verification.id })
      .from(verification)
      .where(eq(verification.identifier, decoyIdentifier));
    expect(survivor).toBeDefined();

    await db.delete(verification).where(eq(verification.identifier, decoyIdentifier));
  });

  it('does not delete a row named by a URL that does point at the redirect URI', async () => {
    // The sharper version of the same trick, where the URL check cannot help because the code sits
    // on the redirect URI the denial already validated. better-auth answers 403 to an absolute
    // callbackURL on an untrusted origin, so this cannot be delivered over HTTP today and the guard
    // is called directly: what is pinned is that the stored authorization, not the response shape,
    // decides what may be deleted.
    const decoyIdentifier = randomBytes(16).toString('hex');
    await db.insert(verification).values({
      id: `ver_${randomUUID()}`,
      identifier: decoyIdentifier,
      value: JSON.stringify({ clientId, userId: 'a-different-user', scope: ['openid'] }),
      expiresAt: new Date(Date.now() + 600_000),
    });

    const request = new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        cookie: `oidc_login_prompt=${encodeURIComponent(
          JSON.stringify({ client_id: clientId, redirect_uri: REDIRECT_URI, scope: 'openid' })
        )}.unsigned`,
      },
    });
    const response = new Response(null, {
      status: 302,
      headers: {
        location: `${REDIRECT_URI}?code=${decoyIdentifier}`,
        'set-cookie': 'authlane.session_token=stub-token; Path=/',
      },
    });
    const auth = { api: { getSession: async () => ({ session: { userId: outsider.id } }) } };

    const guarded = await guardResumedOAuthAuthorize(db, auth, request, response);
    expect(guarded.headers.get('location')).toContain('error=access_denied');

    const [survivor] = await db
      .select({ id: verification.id })
      .from(verification)
      .where(eq(verification.identifier, decoyIdentifier));
    expect(survivor).toBeDefined();

    await db.delete(verification).where(eq(verification.identifier, decoyIdentifier));
  });

  it('ignores a code on a URL that is not the redirect URI, even when it would pass the ownership check', async () => {
    // The narrowing layer on its own. This row names the very client and user being denied, so the
    // ownership check would let it through; only the URL check keeps a code the plugin never put
    // there out of the delete.
    const decoyIdentifier = randomBytes(16).toString('hex');
    await db.insert(verification).values({
      id: `ver_${randomUUID()}`,
      identifier: decoyIdentifier,
      value: JSON.stringify({ clientId, userId: outsider.id, scope: ['openid'] }),
      expiresAt: new Date(Date.now() + 600_000),
    });

    const request = new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        cookie: `oidc_login_prompt=${encodeURIComponent(
          JSON.stringify({ client_id: clientId, redirect_uri: REDIRECT_URI, scope: 'openid' })
        )}.unsigned`,
      },
    });
    const response = new Response(null, {
      status: 302,
      headers: {
        location: `/somewhere-else?code=${decoyIdentifier}`,
        'set-cookie': 'authlane.session_token=stub-token; Path=/',
      },
    });
    const auth = { api: { getSession: async () => ({ session: { userId: outsider.id } }) } };

    await guardResumedOAuthAuthorize(db, auth, request, response);

    const [survivor] = await db
      .select({ id: verification.id })
      .from(verification)
      .where(eq(verification.identifier, decoyIdentifier));
    expect(survivor).toBeDefined();

    await db.delete(verification).where(eq(verification.identifier, decoyIdentifier));
  });

  it('revokes the code from the already-consented ending answered to a browser fetch', async () => {
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
      body: JSON.stringify({ email: formerMember.email, password: PASSWORD }),
    });

    // No consent screen for this user and no Location: the code would have come back in the body.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { redirect: boolean; url: string };
    expect(body.url).toContain('error=access_denied');
    expect(body.url).not.toContain('code=');

    expect(await pendingAuthorizations(formerMember.id)).toHaveLength(0);
  });
});

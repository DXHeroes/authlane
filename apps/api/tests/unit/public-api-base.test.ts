import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { oauthCallbackUrl, publicApiBase } from '../../src/lib/public-api-base.js';
import { createDashboardRouter } from '../../src/routes/dashboard.js';
import { createOAuthRouter } from '../../src/routes/oauth.js';

describe('publicApiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the configured public origin over the one the request arrived on', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.authlane.io');

    expect(publicApiBase('http://10.0.0.4:3000/api/v1/connect/mcp-1/authorize')).toBe(
      'https://app.authlane.io'
    );
  });

  it('falls back to the request origin when nothing is configured', () => {
    vi.stubEnv('BETTER_AUTH_URL', '');

    expect(publicApiBase('http://localhost:3000/api/v1/connect/mcp-1/authorize')).toBe(
      'http://localhost:3000'
    );
  });
});

describe('oauthCallbackUrl', () => {
  it('builds the callback route for a built-in service and a tenant server alike', () => {
    // Both callbacks are the same route, which is why the dashboard can show one string for each.
    expect(oauthCallbackUrl('https://app.authlane.io', 'github')).toBe(
      'https://app.authlane.io/api/v1/oauth/github/callback'
    );
    expect(oauthCallbackUrl('https://app.authlane.io', 'mcp-1')).toBe(
      'https://app.authlane.io/api/v1/oauth/mcp-1/callback'
    );
  });
});

/**
 * The redirect URI is agreed with the provider once and checked on every authorization. Four
 * places produce it — the authorize redirect, the token exchange, dynamic client registration, and
 * the value each dashboard page shows a tenant to paste into their own application — and if any of
 * them drifts, the provider rejects the redirect and nothing in Authlane's logs says why.
 */
describe('every redirect URI comes from the same origin', () => {
  const read = (path: string) => readFileSync(join(import.meta.dirname, '../../src', path), 'utf8');

  it('registers a dynamic client with the origin the authorize step will send', () => {
    // APP_URL is the dashboard, a different origin from the API in development. A client
    // registered against it names a callback the token exchange never uses.
    expect(read('routes/mcp-servers.ts')).toContain('apiBaseUrl: publicApiBase(requestUrl)');
    expect(read('routes/mcp-servers.ts')).not.toContain('process.env.APP_URL');
  });

  it('builds the callback path in exactly one place', () => {
    // The path template appears once in the whole runtime; everything else calls that function.
    const sources = [
      'lib/public-api-base.ts',
      'lib/mcp-client-registration.ts',
      'routes/oauth.ts',
      'routes/dashboard.ts',
      'routes/mcp-servers.ts',
    ];
    const occurrences = sources
      .map((path) => read(path).split('/api/v1/oauth/${').length - 1)
      .reduce((total, count) => total + count, 0);

    expect(occurrences).toBe(1);
    expect(read('lib/public-api-base.ts')).toContain('export function oauthCallbackUrl');
  });

  it('keeps the origin itself in one place', () => {
    // A second copy is how the two drifted apart before.
    expect(read('routes/oauth.ts')).not.toContain('function publicApiBase');
    expect(read('routes/mcp-servers.ts')).not.toContain('function publicApiBase');
  });
});

/**
 * The runtime half of the same guarantee, for a built-in service.
 *
 * The service page showed the authorization URL and the scopes but never the callback the owner
 * has to register with the provider, so setting up an OAuth application meant guessing a URI that
 * had to match exactly. Now the page is told, and this pins that string to the one the authorize
 * step actually sends.
 */
describe('the redirect URI the dashboard shows for a built-in service', () => {
  function thenable(rows: unknown[]) {
    const query: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
      query[method] = () => query;
    }
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are PromiseLike.
    query.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
    return query;
  }

  function db(selectResults: unknown[][]) {
    const remaining = [...selectResults];
    const self: Record<string, unknown> = {
      select: () => thenable(remaining.shift() ?? []),
      insert: () => {
        const query: Record<string, unknown> = {};
        for (const method of ['values', 'onConflictDoUpdate']) query[method] = () => query;
        query.returning = async () => [{ id: 'connection_1' }];
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are PromiseLike.
        query.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
        return query;
      },
      transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation(self),
    };
    return self as never;
  }

  const secretStore = { put: vi.fn(async () => 'sec_1'), read: vi.fn(), rewrap: vi.fn() } as never;

  async function dashboardRedirectUri(): Promise<string> {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('organization', { id: 'org_1' } as never);
      await next();
    });
    app.route('/', createDashboardRouter(db([[]]), undefined, secretStore));

    const response = await app.request('http://localhost/organization/services/github');
    const body = (await response.json()) as { data: { redirectUri: string } };
    return body.data.redirectUri;
  }

  async function authorizeRedirectUri(): Promise<string | null> {
    const app = new Hono();
    app.route(
      '/api/v1',
      createOAuthRouter(
        db([
          [
            {
              id: 'session_1',
              organizationId: 'org_1',
              externalUserId: 'user_1',
              tokenHash: 'unused',
              allowedServices: ['github'],
              allowedOrigin: 'https://saas.example',
              expiresAt: new Date(Date.now() + 60_000),
              destructiveActionExpiresAt: null,
              createdAt: new Date(),
              revokedAt: null,
            },
          ],
          [
            {
              id: 'github',
              authType: 'oauth2',
              enabled: true,
              config: { authorization_url: 'https://github.com/login/oauth/authorize' },
            },
          ],
          [
            {
              enabled: true,
              toolAccessPolicy: 'read_only',
              oauthClientId: 'client-123',
              oauthClientSecretId: null,
              customScopes: null,
            },
          ],
        ]),
        secretStore
      )
    );

    const response = await app.request('http://localhost/api/v1/connect/github/authorize', {
      method: 'POST',
      headers: {
        authorization: 'ConnectSession acs_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentOrigin: 'https://saas.example' }),
    });
    const body = (await response.json()) as { data: { authorizationUrl: string } };
    return new URL(body.data.authorizationUrl).searchParams.get('redirect_uri');
  }

  it('is the one the authorize step sends to the provider', async () => {
    vi.stubEnv('BETTER_AUTH_URL', '');

    const [shown, sent] = await Promise.all([dashboardRedirectUri(), authorizeRedirectUri()]);

    expect(shown).toBe('http://localhost/api/v1/oauth/github/callback');
    expect(sent).toBe(shown);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The refresh job used to send `client_id`/`client_secret` only when the tenant
 * had brought its own OAuth application, while authorize and callback both fall
 * back to the platform application. A tenant on the platform app therefore sent
 * a `refresh_token` grant with no client credentials at all; providers answer
 * 400, which is not retryable, so the connection died permanently with
 * OAUTH_REFRESH_REJECTED about an hour after the user connected it.
 */

const fetchOAuthToken = vi.fn();

vi.mock('@authlane/shared', async () => {
  const actual = await vi.importActual<typeof import('@authlane/shared')>('@authlane/shared');
  return { ...actual, fetchOAuthToken };
});

const { refreshToken } = await import('../src/jobs/token-refresh.js');
const { connections, organizationServices, services } = await import('../src/schema/index.js');

const DATA = {
  connectionId: 'conn_1',
  serviceId: 'google-calendar',
  organizationId: 'org_1',
};

/**
 * Minimal drizzle stand-in: `update(...)` leases the connection row, and the
 * two `select()` chains are told apart by the table handed to `from()`.
 */
function databaseFor(organizationService: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([
    {
      id: DATA.connectionId,
      organizationId: DATA.organizationId,
      serviceId: DATA.serviceId,
      credentialSecretId: 'sec_credentials',
      expiresAt: new Date('2026-08-03T15:00:00.000Z'),
    },
  ]);
  const update = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
  }));

  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(
          table === services
            ? [
                {
                  id: DATA.serviceId,
                  config: { token_url: 'https://oauth2.googleapis.com/token' },
                },
              ]
            : table === organizationServices
              ? [organizationService]
              : []
        ),
      })),
    })),
  }));

  return {
    update,
    select,
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{}]) })) })),
        })),
        insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
      })
    ),
    // Only referenced through the schema imports above.
    _tables: { connections },
  } as never;
}

const secretStore = {
  read: vi.fn(async () =>
    Buffer.from(JSON.stringify({ access_token: 'at', refresh_token: 'rt' }), 'utf8')
  ),
  put: vi.fn(async () => 'sec_new'),
  delete: vi.fn(async () => undefined),
} as never;

function tokenResponse() {
  return {
    response: new Response('{}', { status: 200 }),
    body: { access_token: 'new-at', expires_in: 3600 },
  };
}

describe('refreshToken client credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET;
  });

  it('falls back to the platform application when the tenant has none', async () => {
    process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_ID = 'platform-id';
    process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET = 'platform-secret';
    fetchOAuthToken.mockResolvedValue(tokenResponse());

    await refreshToken(
      databaseFor({ oauthClientId: null, oauthClientSecretId: null, enabled: true }),
      DATA,
      secretStore
    );

    expect(fetchOAuthToken).toHaveBeenCalledOnce();
    const [, , body, options] = fetchOAuthToken.mock.calls[0];
    expect(body.get('client_id')).toBe('platform-id');
    expect(body.get('client_secret')).toBe('platform-secret');
    expect(options).toMatchObject({ clientId: 'platform-id', clientSecret: 'platform-secret' });
  });

  it('prefers the tenant application over the platform one', async () => {
    process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_ID = 'platform-id';
    process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET = 'platform-secret';
    fetchOAuthToken.mockResolvedValue(tokenResponse());

    await refreshToken(
      databaseFor({ oauthClientId: 'tenant-id', oauthClientSecretId: 'sec_1', enabled: true }),
      DATA,
      secretStore
    );

    const [, , body] = fetchOAuthToken.mock.calls[0];
    expect(body.get('client_id')).toBe('tenant-id');
    // The tenant's own secret, read from the secret store — never the platform's.
    expect(body.get('client_secret')).not.toBe('platform-secret');
  });

  it('never pairs a tenant client_id with the platform secret', async () => {
    process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_ID = 'platform-id';
    process.env.AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET = 'platform-secret';
    fetchOAuthToken.mockResolvedValue(tokenResponse());

    // A tenant application whose secret is missing is a broken configuration.
    // Sending the platform secret with it would authenticate as neither.
    await refreshToken(
      databaseFor({ oauthClientId: 'tenant-id', oauthClientSecretId: null, enabled: true }),
      DATA,
      secretStore
    );

    const [, , body] = fetchOAuthToken.mock.calls[0];
    expect(body.get('client_id')).toBe('tenant-id');
    expect(body.get('client_secret')).toBeNull();
  });
});

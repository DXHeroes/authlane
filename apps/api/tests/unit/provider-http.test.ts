import { describe, expect, it, vi } from 'vitest';
import { fetchOAuthToken, validateOAuthEndpoint } from '../../src/lib/provider-http.js';

describe('OAuth provider HTTP policy', () => {
  it('allows only the pinned HTTPS endpoint for a known provider', () => {
    expect(
      validateOAuthEndpoint('github', 'token', 'https://github.com/login/oauth/access_token')
    ).toBe('https://github.com/login/oauth/access_token');
    expect(() =>
      validateOAuthEndpoint('github', 'token', 'http://github.com/login/oauth/access_token')
    ).toThrow(/not allowlisted/);
    expect(() => validateOAuthEndpoint('github', 'token', 'https://127.0.0.1/token')).toThrow(
      /not allowlisted/
    );
    expect(() =>
      validateOAuthEndpoint('github', 'token', 'https://github.com.evil.test/token')
    ).toThrow(/not allowlisted/);
  });

  it('disables redirects and rejects oversized token responses', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 'a'.repeat(70_000) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    await expect(
      fetchOAuthToken(
        'github',
        'https://github.com/login/oauth/access_token',
        new URLSearchParams({ code: 'code' }),
        { fetchImpl }
      )
    ).rejects.toThrow(/too large/);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST', redirect: 'error' })
    );
  });

  it('uses JSON and HTTP Basic for Notion without leaking client credentials into the body', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ access_token: 'notion-token', token_type: 'bearer' })
    );

    await fetchOAuthToken(
      'notion',
      'https://api.notion.com/v1/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'code',
        redirect_uri: 'https://app.example.com/callback',
        client_id: 'client-id',
        client_secret: 'client-secret',
      }),
      { fetchImpl, clientId: 'client-id', clientSecret: 'client-secret' }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.notion.com/v1/oauth/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: 'code',
          redirect_uri: 'https://app.example.com/callback',
        }),
      })
    );
  });

  it('uses HTTP Basic with a form body for Pipedrive', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ access_token: 'pipedrive-token', token_type: 'bearer' })
    );

    await fetchOAuthToken(
      'pipedrive',
      'https://oauth.pipedrive.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'code',
        client_id: 'client-id',
        client_secret: 'client-secret',
      }),
      { fetchImpl, clientId: 'client-id', clientSecret: 'client-secret' }
    );

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      })
    );
    expect(String(init?.body)).not.toContain('client_id');
    expect(String(init?.body)).not.toContain('client_secret');
  });
});

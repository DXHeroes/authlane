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
        fetchImpl
      )
    ).rejects.toThrow(/too large/);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST', redirect: 'error' })
    );
  });
});

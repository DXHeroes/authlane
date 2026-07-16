// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createExampleApi } from '../../server/app.js';

describe('example SaaS BFF', () => {
  it('uses a credential lease server-side and never returns it to the browser', async () => {
    const providerFetch = vi.fn().mockResolvedValue(
      Response.json([
        {
          id: 1,
          name: 'authlane',
          full_name: 'example/authlane',
          description: null,
          html_url: 'https://github.com/example/authlane',
          stargazers_count: 1,
          language: 'TypeScript',
          private: false,
          ignored_secret_field: 'do-not-forward',
        },
      ])
    );
    const authlane = {
      connections: { list: vi.fn() },
      services: { list: vi.fn() },
      connectSessions: { create: vi.fn() },
      credentialLeases: {
        create: vi.fn().mockResolvedValue({
          data: {
            type: 'oauth2',
            leaseId: 'lease_1',
            accessToken: 'provider-access-token',
            tokenType: 'Bearer',
            scopes: ['repo'],
            expiresAt: '2026-06-01T01:00:00.000Z',
          },
          error: null,
        }),
      },
    };
    const app = createExampleApi({
      authlane,
      externalUserId: 'demo_user_123',
      browserOrigin: 'http://localhost:5174',
      providerFetch,
    });

    const response = await app.request('/api/example/github/repositories', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5174' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(JSON.stringify(body)).not.toContain('provider-access-token');
    expect(JSON.stringify(body)).not.toContain('ignored_secret_field');
    expect(providerFetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?per_page=10&sort=updated',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer provider-access-token' }),
      })
    );
  });

  it('rejects cross-origin POST requests before issuing a lease', async () => {
    const createLease = vi.fn();
    const app = createExampleApi({
      authlane: {
        connections: { list: vi.fn() },
        services: { list: vi.fn() },
        connectSessions: { create: vi.fn() },
        credentialLeases: { create: createLease },
      },
      externalUserId: 'demo_user_123',
      browserOrigin: 'http://localhost:5174',
      providerFetch: vi.fn(),
    });

    const response = await app.request('/api/example/github/repositories', {
      method: 'POST',
      headers: { Origin: 'https://attacker.test' },
    });

    expect(response.status).toBe(403);
    expect(createLease).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createIntegrationAdapter } from '../src/integration-adapter.js';

describe('local integration adapter', () => {
  it('executes provider traffic locally with access-only credential material', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const adapter = createIntegrationAdapter('github', {
      github_list_repos: {
        definition: {
          name: 'github_list_repos',
          description: 'Lists repos',
          inputSchema: { type: 'object', properties: {} },
        },
        handler,
      },
    });

    const result = await adapter.execute(
      'github_list_repos',
      {},
      {
        type: 'oauth2',
        accessToken: 'access',
        tokenType: 'Bearer',
        scopes: ['repo'],
        expiresAt: null,
      }
    );

    expect(result).toEqual({ data: { ok: true }, error: null });
    expect(handler).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ access_token: 'access', token_type: 'Bearer', scope: 'repo' })
    );
    expect(handler.mock.calls[0]?.[1]).not.toHaveProperty('refresh_token');
  });

  it('returns a typed error for unknown tools instead of throwing', async () => {
    const adapter = createIntegrationAdapter('github', {});
    expect(
      await adapter.execute(
        'github_missing',
        {},
        {
          type: 'oauth2',
          accessToken: 'access',
          tokenType: 'Bearer',
          scopes: [],
          expiresAt: null,
        }
      )
    ).toEqual({
      data: null,
      error: expect.objectContaining({ code: 'TOOL_NOT_FOUND' }),
    });
  });
});

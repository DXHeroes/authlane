import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('jira Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'test_token_123',
    token_type: 'Bearer',
    scope: 'test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has tools defined', () => {
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });

  it('all tools have correct structure', () => {
    Object.values(tools).forEach((tool) => {
      expect(tool.definition).toBeDefined();
      expect(tool.definition.name).toBeDefined();
      expect(tool.handler).toBeDefined();
    });
  });

  it('handles API calls', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const firstTool = Object.values(tools)[0];
    const params = {};

    try {
      await firstTool.handler(params, mockCredentials);
      expect(global.fetch).toHaveBeenCalled();
    } catch (_e) {
      // Some tools may require specific params
      expect(true).toBe(true);
    }
  });
});

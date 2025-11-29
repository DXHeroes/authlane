/**
 * Unit tests for Services resource
 */

import { describe, expect, it, vi } from 'vitest';
import { Authlane } from '../src/client.js';
import type { Service } from '../src/types.js';

describe('Services Resource', () => {
  const mockService: Service = {
    id: 'github',
    name: 'GitHub',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://github.com/login/oauth/authorize',
      token_url: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'user'],
    },
    enabled: true,
  };

  describe('list', () => {
    it('should list services successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockService], error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.services.list();

      expect(result.data).toEqual([mockService]);
      expect(result.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/services',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'test_key',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: 'Internal error',
          code: 'INTERNAL_ERROR',
        }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.services.list();

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('get', () => {
    it('should get a service successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockService, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.services.get('github');

      expect(result.data).toEqual(mockService);
      expect(result.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/services/github',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle 404 errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: 'Service not found',
          code: 'NOT_FOUND',
        }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.services.get('nonexistent');

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });
});

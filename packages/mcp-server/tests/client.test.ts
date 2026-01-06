/**
 * Tests for Authlane client wrapper
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthlaneClient } from '../src/client.js';

describe('Authlane Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAuthlaneClient', () => {
    it('should create a client with default base URL', () => {
      const client = createAuthlaneClient({ apiKey: 'test_key' });
      expect(client).toBeDefined();
      expect(client.tools).toBeDefined();
    });

    it('should create a client with custom base URL', () => {
      const client = createAuthlaneClient({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
      });
      expect(client).toBeDefined();
    });
  });

  describe('tools.list', () => {
    it('should fetch tools successfully', async () => {
      const mockResponse = {
        data: {
          tools: [
            {
              name: 'github_create_issue',
              description: 'Creates a new issue in a GitHub repository',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          ],
        },
        error: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const client = createAuthlaneClient({ apiKey: 'test_key' });
      const result = await client.tools.list({ userId: 'test_user' });

      expect(result.data).toEqual(mockResponse.data);
      expect(result.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.authlane.com/api/v1/users/test_user/tools?format=mcp',
        {
          method: 'GET',
          headers: {
            'x-api-key': 'test_key',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should handle API errors', async () => {
      const mockError = {
        error: {
          message: 'Invalid API key',
          code: 'INVALID_API_KEY',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => mockError,
      });

      const client = createAuthlaneClient({ apiKey: 'invalid_key' });
      const result = await client.tools.list({ userId: 'test_user' });

      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError.error);
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = createAuthlaneClient({ apiKey: 'test_key' });
      const result = await client.tools.list({ userId: 'test_user' });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toBe('Network error');
    });

    it('should support OpenAI format', async () => {
      const mockResponse = {
        data: {
          functions: [
            {
              name: 'github_create_issue',
              description: 'Creates a new issue',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          ],
        },
        error: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const client = createAuthlaneClient({ apiKey: 'test_key' });
      const result = await client.tools.list({ userId: 'test_user', format: 'openai' });

      expect(result.data).toEqual(mockResponse.data);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.authlane.com/api/v1/users/test_user/tools?format=openai',
        expect.any(Object)
      );
    });
  });
});

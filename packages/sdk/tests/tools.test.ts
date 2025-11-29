/**
 * Unit tests for Tools resource
 */

import { describe, expect, it, vi } from 'vitest';
import { Authlane } from '../src/client.js';

describe('Tools Resource', () => {
  describe('list', () => {
    it('should list tools in MCP format successfully', async () => {
      const mockTools = {
        tools: [
          {
            name: 'github_create_issue',
            description: 'Create a new GitHub issue',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['title'],
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockTools, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.tools.list({
        userId: 'user_123',
        format: 'mcp',
      });

      expect(result.data).toEqual(mockTools);
      expect(result.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/users/user_123/tools?format=mcp',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should list tools in OpenAI format successfully', async () => {
      const mockFunctions = {
        functions: [
          {
            name: 'github_create_issue',
            description: 'Create a new GitHub issue',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['title'],
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockFunctions, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.tools.list({
        userId: 'user_123',
        format: 'openai',
      });

      expect(result.data).toEqual(mockFunctions);
      expect(result.error).toBeNull();
    });

    it('should default to MCP format when not specified', async () => {
      const mockTools = {
        tools: [],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockTools, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      await client.tools.list({
        userId: 'user_123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/users/user_123/tools?format=mcp',
        expect.anything()
      );
    });

    it('should return empty tools when user has no connections', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tools: [] }, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.tools.list({
        userId: 'user_with_no_connections',
      });

      expect(result.data).toEqual({ tools: [] });
      expect(result.error).toBeNull();
    });

    it('should handle API errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: 'User not found',
          code: 'NOT_FOUND',
        }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.tools.list({
        userId: 'nonexistent_user',
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });
});

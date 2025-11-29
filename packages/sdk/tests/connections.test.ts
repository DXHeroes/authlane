/**
 * Unit tests for Connections resource
 */

import { describe, expect, it, vi } from 'vitest';
import { Authlane } from '../src/client.js';
import type { Connection } from '../src/types.js';

describe('Connections Resource', () => {
  const mockConnection: Connection = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    tenantId: '123e4567-e89b-12d3-a456-426614174001',
    externalUserId: 'user_123',
    serviceId: 'github',
    status: 'connected',
    metadata: {},
    connectedAt: '2025-01-01T00:00:00Z',
    expiresAt: null,
    createdAt: '2025-01-01T00:00:00Z',
  };

  describe('list', () => {
    it('should list connections successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockConnection], error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.list({ userId: 'user_123' });

      expect(result.data).toEqual([mockConnection]);
      expect(result.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/users/user_123/connections',
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
          message: 'Unauthorized',
          code: 'UNAUTHORIZED',
        }),
      });

      const client = new Authlane({
        apiKey: 'invalid_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.list({ userId: 'user_123' });

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.list({ userId: 'user_123' });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('get', () => {
    it('should get a connection successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockConnection, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.get({
        userId: 'user_123',
        serviceId: 'github',
      });

      expect(result.data).toEqual(mockConnection);
      expect(result.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/users/user_123/connections/github',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle 404 errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: 'Connection not found',
          code: 'NOT_FOUND',
        }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.get({
        userId: 'user_123',
        serviceId: 'nonexistent',
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('getCredentials', () => {
    it('should get credentials successfully', async () => {
      const mockCredentials = {
        access_token: 'gho_123456',
        refresh_token: 'ghr_789012',
        expires_at: '2025-12-31T23:59:59Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockCredentials, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.getCredentials({
        userId: 'user_123',
        serviceId: 'github',
      });

      expect(result.data).toEqual(mockCredentials);
      expect(result.error).toBeNull();
    });
  });

  describe('health', () => {
    it('should check connection health successfully', async () => {
      const mockHealth = {
        status: 'healthy' as const,
        connection_status: 'connected' as const,
        last_verified: '2025-01-01T00:00:00Z',
        expires_at: null,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockHealth, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.health({
        userId: 'user_123',
        serviceId: 'github',
      });

      expect(result.data).toEqual(mockHealth);
      expect(result.error).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a connection successfully', async () => {
      const mockResponse = {
        message: 'Connection deleted successfully',
        service: 'github',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockResponse, error: null }),
      });

      const client = new Authlane({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as any,
      });

      const result = await client.connections.delete({
        userId: 'user_123',
        serviceId: 'github',
      });

      expect(result.data).toEqual(mockResponse);
      expect(result.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/users/user_123/connections/github',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });
});

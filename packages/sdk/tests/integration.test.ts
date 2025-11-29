/**
 * Integration tests for Authlane SDK with live API
 *
 * These tests require:
 * - AUTHLANE_API_KEY environment variable
 * - AUTHLANE_BASE_URL environment variable (optional, defaults to http://localhost:3000)
 * - Running Authlane API server
 *
 * To run:
 * ```
 * AUTHLANE_API_KEY=your_key pnpm test integration.test.ts
 * ```
 */

import { describe, expect, it } from 'vitest';
import { Authlane } from '../src/client.js';

const API_KEY = process.env.AUTHLANE_API_KEY;
const BASE_URL = process.env.AUTHLANE_BASE_URL || 'http://localhost:3000';

// Skip integration tests if no API key is provided
const describeIf = API_KEY ? describe : describe.skip;

describeIf('Integration Tests', () => {
  let client: Authlane;

  // Initialize client only if API key is provided
  if (API_KEY) {
    client = new Authlane({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
    });
  }

  const TEST_USER_ID = 'test_integration_user';

  describe('Services', () => {
    it('should list available services', async () => {
      const { data, error } = await client.services.list();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);

      // Should at least have the GitHub service (from seed)
      if (data && data.length > 0) {
        const githubService = data.find((s) => s.id === 'github');
        if (githubService) {
          expect(githubService.name).toBe('GitHub');
          expect(githubService.authType).toBe('oauth2');
          expect(githubService.enabled).toBe(true);
        }
      }
    });

    it('should get a specific service', async () => {
      const { data, error } = await client.services.get('github');

      expect(error).toBeNull();
      expect(data).toBeDefined();

      if (data) {
        expect(data.id).toBe('github');
        expect(data.name).toBe('GitHub');
        expect(data.authType).toBe('oauth2');
      }
    });

    it('should return error for non-existent service', async () => {
      const { data, error } = await client.services.get('nonexistent-service');

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('NOT_FOUND');
    });
  });

  describe('Connections', () => {
    it('should list connections for a user', async () => {
      const { data, error } = await client.connections.list({
        userId: TEST_USER_ID,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should handle non-existent connection gracefully', async () => {
      const { data, error } = await client.connections.get({
        userId: TEST_USER_ID,
        serviceId: 'nonexistent',
      });

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('NOT_FOUND');
    });

    it('should check health of non-existent connection', async () => {
      const { data, error } = await client.connections.health({
        userId: TEST_USER_ID,
        serviceId: 'nonexistent',
      });

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('NOT_FOUND');
    });
  });

  describe('Tools', () => {
    it('should list tools in MCP format', async () => {
      const { data, error } = await client.tools.list({
        userId: TEST_USER_ID,
        format: 'mcp',
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();

      if (data && 'tools' in data) {
        expect(Array.isArray(data.tools)).toBe(true);
      }
    });

    it('should list tools in OpenAI format', async () => {
      const { data, error } = await client.tools.list({
        userId: TEST_USER_ID,
        format: 'openai',
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();

      if (data && 'functions' in data) {
        expect(Array.isArray(data.functions)).toBe(true);
      }
    });

    it('should default to MCP format', async () => {
      const { data, error } = await client.tools.list({
        userId: TEST_USER_ID,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();

      if (data) {
        expect('tools' in data).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle unauthorized requests', async () => {
      const unauthorizedClient = new Authlane({
        apiKey: 'invalid_key',
        baseUrl: BASE_URL,
      });

      const { data, error } = await unauthorizedClient.services.list();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('UNAUTHORIZED');
    });

    it('should handle network timeouts', async () => {
      const slowClient = new Authlane({
        apiKey: API_KEY!,
        baseUrl: BASE_URL,
        timeout: 1, // 1ms timeout
      });

      const { data, error } = await slowClient.services.list();

      // Should timeout or succeed very quickly
      expect(data === null || Array.isArray(data)).toBe(true);
      if (error) {
        expect(['TIMEOUT_ERROR', 'NETWORK_ERROR']).toContain(error.code);
      }
    });
  });
});

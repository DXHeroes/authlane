/**
 * Tests for tool executor
 */

import { describe, it, expect } from 'vitest';
import { executeTool } from '../src/tool-executor.js';
import { createAuthlaneClient } from '../src/client.js';

describe('Tool Executor', () => {
  describe('executeTool', () => {
    it('should parse tool name correctly', async () => {
      const client = createAuthlaneClient({ apiKey: 'test_key' });

      const result = await executeTool(client, {
        userId: 'test_user',
        toolName: 'github_create_issue',
        arguments: {
          owner: 'test',
          repo: 'test-repo',
          title: 'Test issue',
        },
      });

      expect(result.error).toBeNull();
      expect(result.data?.data).toBeDefined();
    });

    it('should handle invalid tool names', async () => {
      const client = createAuthlaneClient({ apiKey: 'test_key' });

      const result = await executeTool(client, {
        userId: 'test_user',
        toolName: 'invalid',
        arguments: {},
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('INVALID_TOOL_NAME');
    });

    it('should extract service ID from tool name', async () => {
      const client = createAuthlaneClient({ apiKey: 'test_key' });

      const testCases = [
        { toolName: 'github_create_issue', expectedService: 'github' },
        { toolName: 'slack_send_message', expectedService: 'slack' },
        { toolName: 'linear_list_issues', expectedService: 'linear' },
      ];

      for (const { toolName, expectedService } of testCases) {
        const result = await executeTool(client, {
          userId: 'test_user',
          toolName,
          arguments: {},
        });

        expect(result.error).toBeNull();
        expect((result.data?.data as any).service).toBe(expectedService);
      }
    });

    it('should pass arguments through', async () => {
      const client = createAuthlaneClient({ apiKey: 'test_key' });

      const args = {
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Test Issue',
        body: 'Test body',
      };

      const result = await executeTool(client, {
        userId: 'test_user',
        toolName: 'github_create_issue',
        arguments: args,
      });

      expect(result.error).toBeNull();
      expect((result.data?.data as any).arguments).toEqual(args);
    });
  });
});

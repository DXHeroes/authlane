import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Slack Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'xoxb-test-token-123',
    token_type: 'Bearer',
    scope: 'chat:write channels:read',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('slack_send_message', () => {
    it('has correct tool definition', () => {
      const tool = tools.slack_send_message;
      expect(tool.definition.name).toBe('slack_send_message');
      expect(tool.definition.description).toContain('Sends a message');
      expect(tool.definition.inputSchema.required).toEqual(['channel', 'text']);
    });

    it('sends a message successfully', async () => {
      const mockResponse = { ok: true, ts: '1234567890.123456', channel: 'C123456' };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.slack_send_message.handler(
        {
          channel: '#general',
          text: 'Hello, world!',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer xoxb-test-token-123',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('sends message with blocks', async () => {
      const mockBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Test' } }];
      const mockResponse = { ok: true, ts: '1234567890.123456' };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await tools.slack_send_message.handler(
        {
          channel: '#general',
          text: 'Fallback text',
          blocks: mockBlocks,
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.blocks).toEqual(mockBlocks);
    });

    it('sends message in thread', async () => {
      const mockResponse = { ok: true, ts: '1234567890.123456' };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await tools.slack_send_message.handler(
        {
          channel: '#general',
          text: 'Thread reply',
          thread_ts: '1234567890.000000',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.thread_ts).toBe('1234567890.000000');
    });

    it('handles Slack API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false, error: 'channel_not_found' }),
      } as Response);

      await expect(
        tools.slack_send_message.handler({ channel: '#invalid', text: 'Test' }, mockCredentials)
      ).rejects.toThrow('Slack API error: channel_not_found');
    });
  });

  describe('slack_list_channels', () => {
    it('has correct tool definition', () => {
      const tool = tools.slack_list_channels;
      expect(tool.definition.name).toBe('slack_list_channels');
      expect(tool.definition.description).toContain('Lists all channels');
      expect(tool.definition.inputSchema.required).toEqual([]);
    });

    it('lists channels with default parameters', async () => {
      const mockResponse = {
        ok: true,
        channels: [
          { id: 'C123', name: 'general' },
          { id: 'C456', name: 'random' },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.slack_list_channels.handler({}, mockCredentials);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('conversations.list'),
        expect.any(Object)
      );
    });

    it('respects custom parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channels: [] }),
      } as Response);

      await tools.slack_list_channels.handler(
        {
          types: 'private_channel',
          exclude_archived: false,
          limit: 50,
        },
        mockCredentials
      );

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('types=private_channel');
      expect(callUrl).toContain('exclude_archived=false');
      expect(callUrl).toContain('limit=50');
    });

    it('limits maximum to 1000', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channels: [] }),
      } as Response);

      await tools.slack_list_channels.handler({ limit: 2000 }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('limit=1000');
    });
  });

  describe('slack_create_channel', () => {
    it('has correct tool definition', () => {
      const tool = tools.slack_create_channel;
      expect(tool.definition.name).toBe('slack_create_channel');
      expect(tool.definition.description).toContain('Creates a new channel');
      expect(tool.definition.inputSchema.required).toEqual(['name']);
    });

    it('creates a public channel', async () => {
      const mockResponse = { ok: true, channel: { id: 'C789', name: 'new-channel' } };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.slack_create_channel.handler(
        { name: 'new-channel' },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
    });

    it('creates a private channel when specified', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: {} }),
      } as Response);

      await tools.slack_create_channel.handler(
        { name: 'private-channel', is_private: true },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.is_private).toBe(true);
    });
  });

  describe('slack_post_file', () => {
    it('has correct tool definition', () => {
      const tool = tools.slack_post_file;
      expect(tool.definition.name).toBe('slack_post_file');
      expect(tool.definition.description).toContain('file');
      expect(tool.definition.inputSchema.required).toContain('channels');
    });

    it('posts a file successfully', async () => {
      const mockResponse = { ok: true, file: { id: 'F123', name: 'test.txt' } };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.slack_post_file.handler(
        {
          channels: 'C123',
          content: 'File content',
          filename: 'test.txt',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
    });

    it('includes optional parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, file: {} }),
      } as Response);

      await tools.slack_post_file.handler(
        {
          channels: 'C123',
          content: 'Content',
          filename: 'file.txt',
          title: 'My File',
          initial_comment: 'Check this out',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.title).toBe('My File');
      expect(callBody.initial_comment).toBe('Check this out');
    });
  });

  describe('slack_list_users', () => {
    it('has correct tool definition', () => {
      const tool = tools.slack_list_users;
      expect(tool.definition.name).toBe('slack_list_users');
      expect(tool.definition.description).toContain('Lists all users');
      expect(tool.definition.inputSchema.required).toEqual([]);
    });

    it('lists users successfully', async () => {
      const mockResponse = {
        ok: true,
        members: [
          { id: 'U123', name: 'alice' },
          { id: 'U456', name: 'bob' },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.slack_list_users.handler({}, mockCredentials);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('users.list'),
        expect.any(Object)
      );
    });

    it('respects limit parameter', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, members: [] }),
      } as Response);

      await tools.slack_list_users.handler({ limit: 50 }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('limit=50');
    });
  });

  describe('slack_set_status', () => {
    it('has correct tool definition', () => {
      const tool = tools.slack_set_status;
      expect(tool.definition.name).toBe('slack_set_status');
      expect(tool.definition.description).toContain('status');
      expect(tool.definition.inputSchema.required).toContain('status_text');
    });

    it('sets user status successfully', async () => {
      const mockResponse = { ok: true };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.slack_set_status.handler(
        {
          status_text: 'In a meeting',
          status_emoji: ':calendar:',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
    });

    it('includes expiration time when provided', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      await tools.slack_set_status.handler(
        {
          status_text: 'On vacation',
          status_emoji: ':palm_tree:',
          status_expiration: 1234567890,
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.profile.status_expiration).toBe(1234567890);
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        tools.slack_send_message.handler({ channel: '#test', text: 'Test' }, mockCredentials)
      ).rejects.toThrow('Network failure');
    });

    it('handles Slack API errors without error message', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      } as Response);

      await expect(
        tools.slack_send_message.handler({ channel: '#test', text: 'Test' }, mockCredentials)
      ).rejects.toThrow('Slack API error: Unknown error');
    });
  });

  describe('Authentication', () => {
    it('includes OAuth token in all requests', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      const testCases = [
        () => tools.slack_send_message.handler({ channel: '#test', text: 'Hi' }, mockCredentials),
        () => tools.slack_list_channels.handler({}, mockCredentials),
        () => tools.slack_list_users.handler({}, mockCredentials),
      ];

      for (const testCase of testCases) {
        await testCase();
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer xoxb-test-token-123',
            }),
          })
        );
        vi.clearAllMocks();
      }
    });
  });
});

import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Discord Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'discord_oauth_token_123',
    token_type: 'Bearer',
    scope: 'identify guilds messages.read',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('discord_send_message', () => {
    it('has correct tool definition', () => {
      const tool = tools.discord_send_message;
      expect(tool.definition.name).toBe('discord_send_message');
      expect(tool.definition.description).toContain('Sends a message');
      expect(tool.definition.inputSchema.required).toEqual(['channel_id', 'content']);
    });

    it('sends a message successfully', async () => {
      const mockResponse = {
        id: '123456789',
        channel_id: 'channel_123',
        content: 'Hello Discord!',
        timestamp: '2025-01-01T00:00:00.000000+00:00',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.discord_send_message.handler(
        {
          channel_id: 'channel_123',
          content: 'Hello Discord!',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/channels/channel_123/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer discord_oauth_token_123',
            'Content-Type': 'application/json',
          }),
        })
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.content).toBe('Hello Discord!');
    });

    it('sends message with embeds', async () => {
      const mockEmbeds = [
        {
          title: 'Test Embed',
          description: 'This is an embed',
          color: 0x00ff00,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123', content: 'Test' }),
      } as Response);

      await tools.discord_send_message.handler(
        {
          channel_id: 'channel_123',
          content: 'Message with embed',
          embeds: mockEmbeds,
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.embeds).toEqual(mockEmbeds);
    });

    it('handles Discord API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Missing Permissions' }),
      } as Response);

      await expect(
        tools.discord_send_message.handler(
          { channel_id: 'channel_123', content: 'Test' },
          mockCredentials
        )
      ).rejects.toThrow('Discord API error: Missing Permissions');
    });
  });

  describe('discord_list_channels', () => {
    it('has correct tool definition', () => {
      const tool = tools.discord_list_channels;
      expect(tool.definition.name).toBe('discord_list_channels');
      expect(tool.definition.description).toContain('Lists channels');
      expect(tool.definition.inputSchema.required).toEqual(['guild_id']);
    });

    it('lists guild channels successfully', async () => {
      const mockChannels = [
        { id: 'channel_1', name: 'general', type: 0 },
        { id: 'channel_2', name: 'random', type: 0 },
        { id: 'channel_3', name: 'voice', type: 2 },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockChannels,
      } as Response);

      const result = await tools.discord_list_channels.handler(
        { guild_id: 'guild_123' },
        mockCredentials
      );

      expect(result).toEqual(mockChannels);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/guilds/guild_123/channels',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer discord_oauth_token_123',
          }),
        })
      );
    });

    it('handles guild not found error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'Unknown Guild' }),
      } as Response);

      await expect(
        tools.discord_list_channels.handler({ guild_id: 'invalid_guild' }, mockCredentials)
      ).rejects.toThrow('Discord API error: Unknown Guild');
    });
  });

  describe('discord_create_channel', () => {
    it('has correct tool definition', () => {
      const tool = tools.discord_create_channel;
      expect(tool.definition.name).toBe('discord_create_channel');
      expect(tool.definition.description).toContain('Creates a new channel');
      expect(tool.definition.inputSchema.required).toEqual(['guild_id', 'name']);
    });

    it('creates a text channel successfully', async () => {
      const mockResponse = {
        id: 'channel_new',
        name: 'new-channel',
        type: 0,
        guild_id: 'guild_123',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.discord_create_channel.handler(
        {
          guild_id: 'guild_123',
          name: 'new-channel',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/guilds/guild_123/channels',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.name).toBe('new-channel');
      expect(callBody.type).toBe(0);
    });

    it('creates voice channel with topic', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'channel_voice', type: 2 }),
      } as Response);

      await tools.discord_create_channel.handler(
        {
          guild_id: 'guild_123',
          name: 'voice-chat',
          type: 2,
          topic: 'Voice channel topic',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.name).toBe('voice-chat');
      expect(callBody.type).toBe(2);
      expect(callBody.topic).toBe('Voice channel topic');
    });

    it('defaults to text channel type', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'channel_new' }),
      } as Response);

      await tools.discord_create_channel.handler(
        {
          guild_id: 'guild_123',
          name: 'default-channel',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.type).toBe(0);
    });

    it('handles permission errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Missing Permissions' }),
      } as Response);

      await expect(
        tools.discord_create_channel.handler(
          { guild_id: 'guild_123', name: 'test' },
          mockCredentials
        )
      ).rejects.toThrow('Discord API error: Missing Permissions');
    });
  });

  describe('discord_send_dm', () => {
    it('has correct tool definition', () => {
      const tool = tools.discord_send_dm;
      expect(tool.definition.name).toBe('discord_send_dm');
      expect(tool.definition.description).toContain('Sends a direct message');
      expect(tool.definition.inputSchema.required).toEqual(['user_id', 'content']);
    });

    it('sends DM successfully by creating channel first', async () => {
      const mockDmChannel = {
        id: 'dm_channel_123',
        type: 1,
      };

      const mockMessage = {
        id: 'msg_123',
        content: 'Hello DM!',
        channel_id: 'dm_channel_123',
      };

      // First call: create DM channel
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDmChannel,
      } as Response);

      // Second call: send message
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage,
      } as Response);

      const result = await tools.discord_send_dm.handler(
        {
          user_id: 'user_456',
          content: 'Hello DM!',
        },
        mockCredentials
      );

      expect(result).toEqual(mockMessage);

      // Verify DM channel creation
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://discord.com/api/v10/users/@me/channels',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const dmChannelBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(dmChannelBody.recipient_id).toBe('user_456');

      // Verify message sending
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://discord.com/api/v10/channels/dm_channel_123/messages',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const messageBody = JSON.parse((global.fetch as any).mock.calls[1][1].body);
      expect(messageBody.content).toBe('Hello DM!');
    });

    it('handles DM channel creation error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Cannot send messages to this user' }),
      } as Response);

      await expect(
        tools.discord_send_dm.handler({ user_id: 'blocked_user', content: 'Test' }, mockCredentials)
      ).rejects.toThrow('Discord API error: Cannot send messages to this user');
    });

    it('handles message send error after channel creation', async () => {
      // First call succeeds (DM channel creation)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dm_channel_123' }),
      } as Response);

      // Second call fails (message sending)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Cannot send empty message' }),
      } as Response);

      await expect(
        tools.discord_send_dm.handler({ user_id: 'user_123', content: '' }, mockCredentials)
      ).rejects.toThrow('Discord API error: Cannot send empty message');
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        tools.discord_send_message.handler(
          { channel_id: 'ch_123', content: 'Test' },
          mockCredentials
        )
      ).rejects.toThrow('Network failure');
    });

    it('handles malformed error responses', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      await expect(
        tools.discord_send_message.handler(
          { channel_id: 'ch_123', content: 'Test' },
          mockCredentials
        )
      ).rejects.toThrow('Discord API error: Internal Server Error');
    });

    it('handles API errors without message field', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid token' }),
      } as Response);

      await expect(
        tools.discord_send_message.handler(
          { channel_id: 'ch_123', content: 'Test' },
          mockCredentials
        )
      ).rejects.toThrow('Discord API error: Unauthorized');
    });
  });

  describe('Authentication', () => {
    it('includes OAuth token in all requests', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'test' }),
      } as Response);

      const testCases = [
        () =>
          tools.discord_send_message.handler(
            { channel_id: 'ch_1', content: 'Hi' },
            mockCredentials
          ),
        () => tools.discord_list_channels.handler({ guild_id: 'g_1' }, mockCredentials),
        () =>
          tools.discord_create_channel.handler({ guild_id: 'g_1', name: 'test' }, mockCredentials),
      ];

      for (const testCase of testCases) {
        await testCase();
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer discord_oauth_token_123',
            }),
          })
        );
        vi.clearAllMocks();
      }
    });

    it('uses correct content type for Discord API', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'test' }),
      } as Response);

      await tools.discord_send_message.handler(
        { channel_id: 'ch_1', content: 'Test' },
        mockCredentials
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});

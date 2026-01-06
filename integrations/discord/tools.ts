/**
 * Discord Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials } from '@authlane/shared';
import type { ToolHandler } from '../../apps/api/src/lib/tool-executor.js';

/**
 * Make Discord API request with OAuth token
 */
async function discordRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Discord API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Discord Tools
 */
export const tools: Record<string, ToolHandler> = {
  discord_send_message: {
    definition: {
      name: 'discord_send_message',
      description: 'Sends a message to a Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: {
            type: 'string',
            description: 'Discord channel ID to send the message to',
          },
          content: {
            type: 'string',
            description: 'Message text content (supports Discord markdown)',
          },
          embeds: {
            type: 'array',
            items: { type: 'object' },
            description: 'Optional embeds for rich message formatting',
          },
        },
        required: ['channel_id', 'content'],
      },
    },
    handler: async (params, credentials) => {
      const { channel_id, content, embeds } = params as {
        channel_id: string;
        content: string;
        embeds?: unknown[];
      };

      const body: Record<string, unknown> = {
        content,
      };

      if (embeds) body.embeds = embeds;

      return discordRequest(`channels/${channel_id}/messages`, credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  discord_list_channels: {
    definition: {
      name: 'discord_list_channels',
      description: 'Lists channels in a Discord guild (server)',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: {
            type: 'string',
            description: 'Discord guild (server) ID',
          },
        },
        required: ['guild_id'],
      },
    },
    handler: async (params, credentials) => {
      const { guild_id } = params as {
        guild_id: string;
      };

      return discordRequest(`guilds/${guild_id}/channels`, credentials);
    },
  },

  discord_create_channel: {
    definition: {
      name: 'discord_create_channel',
      description: 'Creates a new channel in a Discord guild',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: {
            type: 'string',
            description: 'Discord guild (server) ID',
          },
          name: {
            type: 'string',
            description: 'Channel name (1-100 characters)',
          },
          type: {
            type: 'number',
            description: 'Channel type (0=text, 2=voice, 4=category)',
          },
          topic: {
            type: 'string',
            description: 'Channel topic (0-1024 characters)',
          },
        },
        required: ['guild_id', 'name'],
      },
    },
    handler: async (params, credentials) => {
      const {
        guild_id,
        name,
        type = 0,
        topic,
      } = params as {
        guild_id: string;
        name: string;
        type?: number;
        topic?: string;
      };

      const body: Record<string, unknown> = {
        name,
        type,
      };

      if (topic) body.topic = topic;

      return discordRequest(`guilds/${guild_id}/channels`, credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  discord_send_dm: {
    definition: {
      name: 'discord_send_dm',
      description: 'Sends a direct message to a Discord user',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'Discord user ID to send DM to',
          },
          content: {
            type: 'string',
            description: 'Message text content',
          },
        },
        required: ['user_id', 'content'],
      },
    },
    handler: async (params, credentials) => {
      const { user_id, content } = params as {
        user_id: string;
        content: string;
      };

      // First, create a DM channel with the user
      const dmChannel = (await discordRequest('users/@me/channels', credentials, {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: user_id,
        }),
      })) as { id: string };

      // Then send the message to that channel
      return discordRequest(`channels/${dmChannel.id}/messages`, credentials, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    },
  },
};

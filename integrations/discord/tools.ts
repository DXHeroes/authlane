/**
 * Discord integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface DiscordTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const discordTools: DiscordTool[] = [
  {
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
          description: 'Message text content (supports Discord markdown formatting)',
        },
        embeds: {
          type: 'array',
          items: { type: 'object' },
          description: 'Optional embeds for rich message formatting',
        },
        tts: {
          type: 'boolean',
          description: 'Send as text-to-speech message (default: false)',
          default: false,
        },
        allowed_mentions: {
          type: 'object',
          description: 'Controls which mentions are allowed in the message',
          properties: {
            parse: {
              type: 'array',
              items: { type: 'string', enum: ['roles', 'users', 'everyone'] },
              description: 'Array of allowed mention types',
            },
            roles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of role IDs to mention',
            },
            users: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of user IDs to mention',
            },
            replied_user: {
              type: 'boolean',
              description: 'Whether to mention the author of the message being replied to',
            },
          },
        },
        message_reference: {
          type: 'object',
          description: 'Reference to another message (for replies)',
          properties: {
            message_id: {
              type: 'string',
              description: 'ID of the message to reply to',
            },
            channel_id: {
              type: 'string',
              description: 'ID of the channel containing the message',
            },
            guild_id: {
              type: 'string',
              description: 'ID of the guild containing the message',
            },
            fail_if_not_exists: {
              type: 'boolean',
              description: 'Fail if the referenced message does not exist (default: true)',
              default: true,
            },
          },
        },
        components: {
          type: 'array',
          items: { type: 'object' },
          description: 'Message components like buttons and select menus',
        },
        sticker_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of stickers to send with the message (max 3)',
        },
        flags: {
          type: 'number',
          description: 'Message flags (e.g., SUPPRESS_EMBEDS, EPHEMERAL)',
        },
      },
      required: ['channel_id', 'content'],
    },
  },
  {
    name: 'discord_list_channels',
    description: 'Lists all channels in a Discord guild (server)',
    inputSchema: {
      type: 'object',
      properties: {
        guild_id: {
          type: 'string',
          description: 'Discord guild (server) ID to list channels from',
        },
        type: {
          type: 'number',
          description: 'Filter by channel type (0: GUILD_TEXT, 2: GUILD_VOICE, 4: GUILD_CATEGORY, etc.)',
        },
      },
      required: ['guild_id'],
    },
  },
  {
    name: 'discord_get_channel',
    description: 'Gets information about a specific Discord channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Discord channel ID to get information about',
        },
      },
      required: ['channel_id'],
    },
  },
  {
    name: 'discord_get_guild',
    description: 'Gets information about a Discord guild (server)',
    inputSchema: {
      type: 'object',
      properties: {
        guild_id: {
          type: 'string',
          description: 'Discord guild (server) ID to get information about',
        },
        with_counts: {
          type: 'boolean',
          description: 'Include approximate member and presence counts (default: false)',
          default: false,
        },
      },
      required: ['guild_id'],
    },
  },
  {
    name: 'discord_list_guild_members',
    description: 'Lists members in a Discord guild (server)',
    inputSchema: {
      type: 'object',
      properties: {
        guild_id: {
          type: 'string',
          description: 'Discord guild (server) ID to list members from',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of members to return (1-1000, default: 1)',
          default: 1,
          minimum: 1,
          maximum: 1000,
        },
        after: {
          type: 'string',
          description: 'User ID to get members after (for pagination)',
        },
      },
      required: ['guild_id'],
    },
  },
  {
    name: 'discord_get_user',
    description: 'Gets information about a Discord user',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'Discord user ID to get information about',
        },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'discord_edit_message',
    description: 'Edits a previously sent Discord message',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Discord channel ID containing the message',
        },
        message_id: {
          type: 'string',
          description: 'Discord message ID to edit',
        },
        content: {
          type: 'string',
          description: 'New message text content',
        },
        embeds: {
          type: 'array',
          items: { type: 'object' },
          description: 'New embeds for the message',
        },
        flags: {
          type: 'number',
          description: 'Message flags (e.g., SUPPRESS_EMBEDS)',
        },
        allowed_mentions: {
          type: 'object',
          description: 'Controls which mentions are allowed in the message',
        },
        components: {
          type: 'array',
          items: { type: 'object' },
          description: 'Message components like buttons and select menus',
        },
      },
      required: ['channel_id', 'message_id'],
    },
  },
  {
    name: 'discord_delete_message',
    description: 'Deletes a Discord message',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Discord channel ID containing the message',
        },
        message_id: {
          type: 'string',
          description: 'Discord message ID to delete',
        },
        reason: {
          type: 'string',
          description: 'Reason for deleting the message (shown in audit log)',
        },
      },
      required: ['channel_id', 'message_id'],
    },
  },
  {
    name: 'discord_add_reaction',
    description: 'Adds an emoji reaction to a Discord message',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Discord channel ID containing the message',
        },
        message_id: {
          type: 'string',
          description: 'Discord message ID to react to',
        },
        emoji: {
          type: 'string',
          description: 'Emoji to react with (unicode emoji or custom emoji format "name:id")',
        },
      },
      required: ['channel_id', 'message_id', 'emoji'],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: DiscordTool[] } {
  return { tools: discordTools };
}

/**
 * Converts tools to OpenAI function calling format
 */
export function getToolsOpenAI(): {
  functions: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
} {
  return {
    functions: discordTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  };
}

/**
 * Gets tools in the specified format
 */
export function getTools(format: ToolFormat) {
  return format === 'mcp' ? getToolsMCP() : getToolsOpenAI();
}

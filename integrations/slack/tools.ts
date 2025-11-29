/**
 * Slack integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface SlackTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const slackTools: SlackTool[] = [
  {
    name: 'slack_send_message',
    description: 'Sends a message to a Slack channel or direct message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID, name (e.g., "#general"), or user ID to send message to',
        },
        text: {
          type: 'string',
          description: 'Message text content (supports Slack markdown formatting)',
        },
        blocks: {
          type: 'array',
          items: { type: 'object' },
          description: 'Optional Block Kit blocks for rich message formatting',
        },
        thread_ts: {
          type: 'string',
          description: 'Timestamp of parent message to reply in thread',
        },
        reply_broadcast: {
          type: 'boolean',
          description: 'Also send to channel when replying to thread (default: false)',
          default: false,
        },
        unfurl_links: {
          type: 'boolean',
          description: 'Enable unfurling of text-based content (default: true)',
          default: true,
        },
        unfurl_media: {
          type: 'boolean',
          description: 'Enable unfurling of media content (default: true)',
          default: true,
        },
        mrkdwn: {
          type: 'boolean',
          description: 'Enable markdown parsing (default: true)',
          default: true,
        },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'slack_list_channels',
    description: 'Lists all channels in the Slack workspace',
    inputSchema: {
      type: 'object',
      properties: {
        types: {
          type: 'string',
          description: 'Comma-separated list of channel types (public_channel, private_channel, mpim, im)',
          default: 'public_channel',
        },
        exclude_archived: {
          type: 'boolean',
          description: 'Exclude archived channels (default: true)',
          default: true,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of channels to return (default: 100, max: 1000)',
          default: 100,
          maximum: 1000,
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor for next page of results',
        },
        team_id: {
          type: 'string',
          description: 'Filter channels by workspace/team ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'slack_create_channel',
    description: 'Creates a new channel in the Slack workspace',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Channel name (lowercase, no spaces, max 80 chars, can contain dashes/underscores)',
        },
        is_private: {
          type: 'boolean',
          description: 'Create a private channel (default: false)',
          default: false,
        },
        team_id: {
          type: 'string',
          description: 'Workspace/team ID (required for Enterprise Grid)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'slack_get_channel_info',
    description: 'Gets information about a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID to get information about',
        },
        include_locale: {
          type: 'boolean',
          description: 'Include locale information (default: false)',
          default: false,
        },
      },
      required: ['channel'],
    },
  },
  {
    name: 'slack_invite_users',
    description: 'Invites users to a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID to invite users to',
        },
        users: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of user IDs to invite',
        },
      },
      required: ['channel', 'users'],
    },
  },
  {
    name: 'slack_get_user_info',
    description: 'Gets information about a Slack user',
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to get information about',
        },
        include_locale: {
          type: 'boolean',
          description: 'Include locale information (default: false)',
          default: false,
        },
      },
      required: ['user'],
    },
  },
  {
    name: 'slack_list_users',
    description: 'Lists all users in the Slack workspace',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of users to return (default: 100, max: 1000)',
          default: 100,
          maximum: 1000,
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor for next page of results',
        },
        include_locale: {
          type: 'boolean',
          description: 'Include locale information (default: false)',
          default: false,
        },
        team_id: {
          type: 'string',
          description: 'Filter users by workspace/team ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'slack_get_message_permalink',
    description: 'Gets a permanent link to a message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID containing the message',
        },
        message_ts: {
          type: 'string',
          description: 'Timestamp of the message',
        },
      },
      required: ['channel', 'message_ts'],
    },
  },
  {
    name: 'slack_update_message',
    description: 'Updates an existing message in Slack',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID containing the message',
        },
        ts: {
          type: 'string',
          description: 'Timestamp of the message to update',
        },
        text: {
          type: 'string',
          description: 'New message text',
        },
        blocks: {
          type: 'array',
          items: { type: 'object' },
          description: 'Optional Block Kit blocks for rich message formatting',
        },
      },
      required: ['channel', 'ts', 'text'],
    },
  },
  {
    name: 'slack_delete_message',
    description: 'Deletes a message from Slack',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID containing the message',
        },
        ts: {
          type: 'string',
          description: 'Timestamp of the message to delete',
        },
      },
      required: ['channel', 'ts'],
    },
  },
  {
    name: 'slack_add_reaction',
    description: 'Adds an emoji reaction to a message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID containing the message',
        },
        timestamp: {
          type: 'string',
          description: 'Timestamp of the message to react to',
        },
        name: {
          type: 'string',
          description: 'Emoji name without colons (e.g., "thumbsup", "eyes")',
        },
      },
      required: ['channel', 'timestamp', 'name'],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: SlackTool[] } {
  return { tools: slackTools };
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
    functions: slackTools.map((tool) => ({
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

/**
 * Slack Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Slack API request with OAuth token
 */
async function slackRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://slack.com/api/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const result = (await response.json()) as { ok: boolean; error?: string };

  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
  }

  return result;
}

/**
 * Slack Tools
 */
export const tools: Record<string, ToolHandler> = {
  slack_send_message: {
    definition: {
      name: 'slack_send_message',
      description: 'Sends a message to a Slack channel or direct message',
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Channel ID or name (e.g., "#general") to send message to',
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
        },
        required: ['channel', 'text'],
      },
    },
    handler: async (params, credentials) => {
      const { channel, text, blocks, thread_ts } = params as {
        channel: string;
        text: string;
        blocks?: unknown[];
        thread_ts?: string;
      };

      const body: Record<string, unknown> = {
        channel,
        text,
      };

      if (blocks) body.blocks = blocks;
      if (thread_ts) body.thread_ts = thread_ts;

      return slackRequest('chat.postMessage', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  slack_list_channels: {
    definition: {
      name: 'slack_list_channels',
      description: 'Lists all channels in the Slack workspace',
      inputSchema: {
        type: 'object',
        properties: {
          types: {
            type: 'string',
            description: 'Comma-separated list of channel types (public_channel, private_channel)',
          },
          exclude_archived: {
            type: 'boolean',
            description: 'Exclude archived channels',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of channels to return (max 1000)',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        types = 'public_channel',
        exclude_archived = true,
        limit = 100,
      } = params as {
        types?: string;
        exclude_archived?: boolean;
        limit?: number;
      };

      const queryParams = new URLSearchParams({
        types,
        exclude_archived: String(exclude_archived),
        limit: String(Math.min(limit, 1000)),
      });

      return slackRequest(`conversations.list?${queryParams}`, credentials);
    },
  },

  slack_create_channel: {
    definition: {
      name: 'slack_create_channel',
      description: 'Creates a new channel in the Slack workspace',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Channel name (lowercase, no spaces, max 80 chars)',
          },
          is_private: {
            type: 'boolean',
            description: 'Create a private channel',
          },
        },
        required: ['name'],
      },
    },
    handler: async (params, credentials) => {
      const { name, is_private = false } = params as {
        name: string;
        is_private?: boolean;
      };

      return slackRequest('conversations.create', credentials, {
        method: 'POST',
        body: JSON.stringify({
          name,
          is_private,
        }),
      });
    },
  },

  slack_list_users: {
    definition: {
      name: 'slack_list_users',
      description: 'Lists all users in the Slack workspace',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of users to return (max 1000)',
          },
          cursor: {
            type: 'string',
            description: 'Pagination cursor for next page of results',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { limit = 100, cursor } = params as {
        limit?: number;
        cursor?: string;
      };

      const queryParams = new URLSearchParams({
        limit: String(Math.min(limit, 1000)),
      });

      if (cursor) {
        queryParams.append('cursor', cursor);
      }

      return slackRequest(`users.list?${queryParams}`, credentials);
    },
  },

  slack_set_status: {
    definition: {
      name: 'slack_set_status',
      description: 'Sets the status of the authenticated user',
      inputSchema: {
        type: 'object',
        properties: {
          status_text: {
            type: 'string',
            description: 'Status text (max 100 chars)',
          },
          status_emoji: {
            type: 'string',
            description: 'Status emoji (e.g., ":calendar:", ":house:")',
          },
          status_expiration: {
            type: 'number',
            description: 'Unix timestamp when status expires (0 for no expiration)',
          },
        },
        required: ['status_text'],
      },
    },
    handler: async (params, credentials) => {
      const {
        status_text,
        status_emoji,
        status_expiration = 0,
      } = params as {
        status_text: string;
        status_emoji?: string;
        status_expiration?: number;
      };

      const profile: Record<string, unknown> = {
        status_text,
        status_expiration,
      };

      if (status_emoji) {
        profile.status_emoji = status_emoji;
      }

      return slackRequest('users.profile.set', credentials, {
        method: 'POST',
        body: JSON.stringify({ profile }),
      });
    },
  },
};

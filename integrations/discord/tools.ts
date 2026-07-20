/**
 * Discord OAuth user tools.
 *
 * Discord bot-only guild, channel, and message endpoints require the application's bot token.
 * Authlane connections contain per-user OAuth credentials, so this adapter intentionally exposes
 * only endpoints that Discord supports with an OAuth2 user bearer token.
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

async function discordRequest(
  endpoint: string,
  credentials: OAuth2Credentials
): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
    };
    throw new Error(`Discord API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

export const tools: Record<string, ToolHandler> = {
  discord_get_current_user: {
    definition: {
      name: 'discord_get_current_user',
      description: 'Returns the Discord profile of the connected OAuth user',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    handler: (_params, credentials) => discordRequest('users/@me', credentials),
  },

  discord_list_guilds: {
    definition: {
      name: 'discord_list_guilds',
      description: 'Lists guilds that the connected Discord user belongs to',
      inputSchema: {
        type: 'object',
        properties: {
          before: {
            type: 'string',
            description: 'Return guilds before this guild ID',
          },
          after: {
            type: 'string',
            description: 'Return guilds after this guild ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum guilds to return (1-200)',
            minimum: 1,
            maximum: 200,
          },
          with_counts: {
            type: 'boolean',
            description: 'Include approximate member and presence counts',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { before, after, limit = 100, with_counts = false } = params as {
        before?: string;
        after?: string;
        limit?: number;
        with_counts?: boolean;
      };
      const query = new URLSearchParams({
        limit: String(Math.max(1, Math.min(limit, 200))),
        with_counts: String(with_counts),
      });
      if (before) query.set('before', before);
      if (after) query.set('after', after);
      return discordRequest(`users/@me/guilds?${query}`, credentials);
    },
  },

  discord_get_current_user_guild_member: {
    definition: {
      name: 'discord_get_current_user_guild_member',
      description: 'Returns the connected user member record in a Discord guild',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: {
            type: 'string',
            description: 'Discord guild ID',
          },
        },
        required: ['guild_id'],
      },
    },
    handler: async (params, credentials) => {
      const { guild_id } = params as { guild_id: string };
      return discordRequest(`users/@me/guilds/${encodeURIComponent(guild_id)}/member`, credentials);
    },
  },

  discord_list_connections: {
    definition: {
      name: 'discord_list_connections',
      description: 'Lists external accounts connected to the Discord OAuth user',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    handler: (_params, credentials) => discordRequest('users/@me/connections', credentials),
  },
};

/**
 * Notion Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Notion API request with OAuth token
 */
async function notionRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Notion Tools
 */
export const tools: Record<string, ToolHandler> = {
  notion_create_page: {
    definition: {
      name: 'notion_create_page',
      description: 'Creates a new page in a Notion database or as a child of another page',
      inputSchema: {
        type: 'object',
        properties: {
          parent: {
            type: 'object',
            description: 'Parent database or page where the new page will be created',
            properties: {
              database_id: {
                type: 'string',
                description: 'ID of the parent database (use this OR page_id)',
              },
              page_id: {
                type: 'string',
                description: 'ID of the parent page (use this OR database_id)',
              },
            },
          },
          properties: {
            type: 'object',
            description: 'Page properties (structure varies by database schema)',
            additionalProperties: true,
          },
          children: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of block objects for page content',
          },
          icon: {
            type: 'object',
            description: 'Page icon (emoji or external URL)',
            properties: {
              type: {
                type: 'string',
                enum: ['emoji', 'external'],
              },
              emoji: {
                type: 'string',
                description: 'Emoji character (when type is emoji)',
              },
              external: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
                description: 'External URL (when type is external)',
              },
            },
          },
          cover: {
            type: 'object',
            description: 'Page cover image',
            properties: {
              type: {
                type: 'string',
                enum: ['external'],
              },
              external: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['parent'],
      },
    },
    handler: async (params, credentials) => {
      const { parent, properties, children, icon, cover } = params as {
        parent: { database_id?: string; page_id?: string };
        properties?: Record<string, unknown>;
        children?: unknown[];
        icon?: unknown;
        cover?: unknown;
      };

      const body: Record<string, unknown> = { parent };
      if (properties) body.properties = properties;
      if (children) body.children = children;
      if (icon) body.icon = icon;
      if (cover) body.cover = cover;

      return notionRequest('/pages', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  notion_query_database: {
    definition: {
      name: 'notion_query_database',
      description: 'Queries a Notion database with optional filters and sorting',
      inputSchema: {
        type: 'object',
        properties: {
          database_id: {
            type: 'string',
            description: 'ID of the database to query',
          },
          filter: {
            type: 'object',
            description:
              'Filter conditions (supports property filters, compound filters with AND/OR)',
            additionalProperties: true,
          },
          sorts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                property: {
                  type: 'string',
                  description: 'Property name to sort by',
                },
                direction: {
                  type: 'string',
                  enum: ['ascending', 'descending'],
                  description: 'Sort direction',
                },
                timestamp: {
                  type: 'string',
                  enum: ['created_time', 'last_edited_time'],
                  description: 'Timestamp to sort by (alternative to property)',
                },
              },
            },
            description: 'Array of sort objects',
          },
          start_cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
          page_size: {
            type: 'number',
            description: 'Number of results to return (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
          filter_properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of property IDs to return (returns all if not specified)',
          },
        },
        required: ['database_id'],
      },
    },
    handler: async (params, credentials) => {
      const { database_id, filter, sorts, start_cursor, page_size, filter_properties } = params as {
        database_id: string;
        filter?: unknown;
        sorts?: unknown[];
        start_cursor?: string;
        page_size?: number;
        filter_properties?: string[];
      };

      const body: Record<string, unknown> = {};
      if (filter) body.filter = filter;
      if (sorts) body.sorts = sorts;
      if (start_cursor) body.start_cursor = start_cursor;
      if (page_size) body.page_size = page_size;
      if (filter_properties) body.filter_properties = filter_properties;

      return notionRequest(`/databases/${database_id}/query`, credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  notion_update_page: {
    definition: {
      name: 'notion_update_page',
      description: 'Updates properties of an existing Notion page',
      inputSchema: {
        type: 'object',
        properties: {
          page_id: {
            type: 'string',
            description: 'ID of the page to update',
          },
          properties: {
            type: 'object',
            description: 'Page properties to update (only specified properties will be changed)',
            additionalProperties: true,
          },
          archived: {
            type: 'boolean',
            description: 'Whether to archive (delete) the page',
          },
          icon: {
            type: 'object',
            description: 'Page icon (emoji or external URL)',
            properties: {
              type: {
                type: 'string',
                enum: ['emoji', 'external'],
              },
              emoji: {
                type: 'string',
                description: 'Emoji character (when type is emoji)',
              },
              external: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
                description: 'External URL (when type is external)',
              },
            },
          },
          cover: {
            type: 'object',
            description: 'Page cover image',
            properties: {
              type: {
                type: 'string',
                enum: ['external'],
              },
              external: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['page_id'],
      },
    },
    handler: async (params, credentials) => {
      const { page_id, properties, archived, icon, cover } = params as {
        page_id: string;
        properties?: Record<string, unknown>;
        archived?: boolean;
        icon?: unknown;
        cover?: unknown;
      };

      const body: Record<string, unknown> = {};
      if (properties) body.properties = properties;
      if (archived !== undefined) body.archived = archived;
      if (icon) body.icon = icon;
      if (cover) body.cover = cover;

      return notionRequest(`/pages/${page_id}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
  },

  notion_get_page: {
    definition: {
      name: 'notion_get_page',
      description: 'Retrieves a page from Notion by ID',
      inputSchema: {
        type: 'object',
        properties: {
          page_id: {
            type: 'string',
            description: 'ID of the page to retrieve',
          },
          filter_properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of property IDs to return (returns all if not specified)',
          },
        },
        required: ['page_id'],
      },
    },
    handler: async (params, credentials) => {
      const { page_id, filter_properties } = params as {
        page_id: string;
        filter_properties?: string[];
      };

      const queryParams = filter_properties
        ? `?filter_properties=${encodeURIComponent(filter_properties.join(','))}`
        : '';

      return notionRequest(`/pages/${page_id}${queryParams}`, credentials);
    },
  },

  notion_get_database: {
    definition: {
      name: 'notion_get_database',
      description: 'Retrieves database information including schema',
      inputSchema: {
        type: 'object',
        properties: {
          database_id: {
            type: 'string',
            description: 'ID of the database to retrieve',
          },
        },
        required: ['database_id'],
      },
    },
    handler: async (params, credentials) => {
      const { database_id } = params as { database_id: string };
      return notionRequest(`/databases/${database_id}`, credentials);
    },
  },

  notion_list_databases: {
    definition: {
      name: 'notion_list_databases',
      description: 'Lists all databases that the integration has access to',
      inputSchema: {
        type: 'object',
        properties: {
          start_cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
          page_size: {
            type: 'number',
            description: 'Number of results to return (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { start_cursor, page_size } = params as {
        start_cursor?: string;
        page_size?: number;
      };

      const body: Record<string, unknown> = { filter: { property: 'object', value: 'database' } };
      if (start_cursor) body.start_cursor = start_cursor;
      if (page_size) body.page_size = page_size;

      return notionRequest('/search', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  notion_search: {
    definition: {
      name: 'notion_search',
      description: 'Searches all pages and databases that the integration has access to',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text to search for (searches title property)',
          },
          filter: {
            type: 'object',
            description: 'Filter by object type',
            properties: {
              value: {
                type: 'string',
                enum: ['page', 'database'],
                description: 'Type of object to filter by',
              },
              property: {
                type: 'string',
                enum: ['object'],
                description: 'Property to filter (always "object")',
                default: 'object',
              },
            },
          },
          sort: {
            type: 'object',
            description: 'Sort results',
            properties: {
              direction: {
                type: 'string',
                enum: ['ascending', 'descending'],
                description: 'Sort direction',
              },
              timestamp: {
                type: 'string',
                enum: ['last_edited_time'],
                description: 'Timestamp to sort by',
              },
            },
          },
          start_cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
          page_size: {
            type: 'number',
            description: 'Number of results to return (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { query, filter, sort, start_cursor, page_size } = params as {
        query?: string;
        filter?: unknown;
        sort?: unknown;
        start_cursor?: string;
        page_size?: number;
      };

      const body: Record<string, unknown> = {};
      if (query) body.query = query;
      if (filter) body.filter = filter;
      if (sort) body.sort = sort;
      if (start_cursor) body.start_cursor = start_cursor;
      if (page_size) body.page_size = page_size;

      return notionRequest('/search', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  notion_append_block_children: {
    definition: {
      name: 'notion_append_block_children',
      description: 'Appends new block children to a page or block',
      inputSchema: {
        type: 'object',
        properties: {
          block_id: {
            type: 'string',
            description: 'ID of the block or page to append children to',
          },
          children: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of block objects to append',
          },
          after: {
            type: 'string',
            description: 'ID of block to insert after (optional)',
          },
        },
        required: ['block_id', 'children'],
      },
    },
    handler: async (params, credentials) => {
      const { block_id, children, after } = params as {
        block_id: string;
        children: unknown[];
        after?: string;
      };

      const body: Record<string, unknown> = { children };
      if (after) body.after = after;

      return notionRequest(`/blocks/${block_id}/children`, credentials, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
  },

  notion_get_block: {
    definition: {
      name: 'notion_get_block',
      description: 'Retrieves a block by ID',
      inputSchema: {
        type: 'object',
        properties: {
          block_id: {
            type: 'string',
            description: 'ID of the block to retrieve',
          },
        },
        required: ['block_id'],
      },
    },
    handler: async (params, credentials) => {
      const { block_id } = params as { block_id: string };
      return notionRequest(`/blocks/${block_id}`, credentials);
    },
  },

  notion_get_block_children: {
    definition: {
      name: 'notion_get_block_children',
      description: 'Retrieves children blocks of a page or block',
      inputSchema: {
        type: 'object',
        properties: {
          block_id: {
            type: 'string',
            description: 'ID of the parent block or page',
          },
          start_cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
          page_size: {
            type: 'number',
            description: 'Number of results to return (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
        },
        required: ['block_id'],
      },
    },
    handler: async (params, credentials) => {
      const { block_id, start_cursor, page_size } = params as {
        block_id: string;
        start_cursor?: string;
        page_size?: number;
      };

      const queryParams: string[] = [];
      if (start_cursor) queryParams.push(`start_cursor=${encodeURIComponent(start_cursor)}`);
      if (page_size) queryParams.push(`page_size=${page_size}`);

      const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      return notionRequest(`/blocks/${block_id}/children${query}`, credentials);
    },
  },

  notion_update_block: {
    definition: {
      name: 'notion_update_block',
      description: 'Updates a block by ID',
      inputSchema: {
        type: 'object',
        properties: {
          block_id: {
            type: 'string',
            description: 'ID of the block to update',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to archive (delete) the block',
          },
          content: {
            type: 'object',
            description: 'Updated block content (structure varies by block type)',
            additionalProperties: true,
          },
        },
        required: ['block_id'],
      },
    },
    handler: async (params, credentials) => {
      const { block_id, archived, content } = params as {
        block_id: string;
        archived?: boolean;
        content?: Record<string, unknown>;
      };

      const body: Record<string, unknown> = {};
      if (archived !== undefined) body.archived = archived;
      if (content) Object.assign(body, content);

      return notionRequest(`/blocks/${block_id}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
  },

  notion_delete_block: {
    definition: {
      name: 'notion_delete_block',
      description: 'Deletes (archives) a block by ID',
      inputSchema: {
        type: 'object',
        properties: {
          block_id: {
            type: 'string',
            description: 'ID of the block to delete',
          },
        },
        required: ['block_id'],
      },
    },
    handler: async (params, credentials) => {
      const { block_id } = params as { block_id: string };

      return notionRequest(`/blocks/${block_id}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      });
    },
  },

  notion_get_user: {
    definition: {
      name: 'notion_get_user',
      description: 'Retrieves a user by ID',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'ID of the user to retrieve',
          },
        },
        required: ['user_id'],
      },
    },
    handler: async (params, credentials) => {
      const { user_id } = params as { user_id: string };
      return notionRequest(`/users/${user_id}`, credentials);
    },
  },

  notion_list_users: {
    definition: {
      name: 'notion_list_users',
      description: 'Lists all users in the workspace',
      inputSchema: {
        type: 'object',
        properties: {
          start_cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
          page_size: {
            type: 'number',
            description: 'Number of results to return (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { start_cursor, page_size } = params as {
        start_cursor?: string;
        page_size?: number;
      };

      const queryParams: string[] = [];
      if (start_cursor) queryParams.push(`start_cursor=${encodeURIComponent(start_cursor)}`);
      if (page_size) queryParams.push(`page_size=${page_size}`);

      const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      return notionRequest(`/users${query}`, credentials);
    },
  },

  notion_get_bot_user: {
    definition: {
      name: 'notion_get_bot_user',
      description: 'Retrieves the bot user associated with the integration',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    handler: async (_params, credentials) => {
      return notionRequest('/users/me', credentials);
    },
  },
};

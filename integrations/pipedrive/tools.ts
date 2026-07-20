/**
 * Pipedrive Integration Tools
 * Executable tool handlers with credential injection
 */

import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import {
  createProviderMcpOnlyTools,
  type OAuth2Credentials,
  type ToolHandler,
} from '@authlane/shared';

/**
 * Make Pipedrive API request with OAuth token
 */
async function pipedriveRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const apiBaseUrl = credentials.metadata?.api_base_url;
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    throw new Error('Pipedrive API domain is missing from the credential lease');
  }
  const response = await fetch(`${apiBaseUrl}/v1/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`Pipedrive API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Pipedrive Tools
 */
export const tools: Record<string, ToolHandler> = {
  pipedrive_create_deal: {
    definition: {
      name: 'pipedrive_create_deal',
      description: 'Creates a new deal in Pipedrive CRM',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Deal title (required)',
          },
          value: {
            type: 'number',
            description: 'Deal value in the account currency',
          },
          currency: {
            type: 'string',
            description:
              'Currency code (3-letter ISO code, e.g., USD, EUR, GBP). Defaults to account default currency.',
          },
          user_id: {
            type: 'number',
            description: 'ID of the user who will own the deal. Defaults to the authorized user.',
          },
          person_id: {
            type: 'number',
            description: 'ID of the person this deal is associated with',
          },
          org_id: {
            type: 'number',
            description: 'ID of the organization this deal is associated with',
          },
          pipeline_id: {
            type: 'number',
            description: 'ID of the pipeline. Defaults to the default pipeline.',
          },
          stage_id: {
            type: 'number',
            description:
              'ID of the stage in the pipeline. Defaults to first stage of the pipeline.',
          },
          status: {
            type: 'string',
            description: 'Deal status',
            enum: ['open', 'won', 'lost', 'deleted'],
            default: 'open',
          },
          expected_close_date: {
            type: 'string',
            description: 'Expected close date in YYYY-MM-DD format',
          },
          probability: {
            type: 'number',
            description: 'Deal success probability percentage (0-100)',
            minimum: 0,
            maximum: 100,
          },
          lost_reason: {
            type: 'string',
            description: 'Reason for losing the deal (only used when status is "lost")',
          },
          visible_to: {
            type: 'string',
            description: 'Visibility of the deal',
            enum: ['1', '3', '5', '7'],
            default: '3',
          },
          add_time: {
            type: 'string',
            description:
              'Optional creation date & time in UTC format (YYYY-MM-DD HH:MM:SS). Defaults to current time.',
          },
        },
        required: ['title'],
      },
    },
    handler: async (params, credentials) => {
      return pipedriveRequest('deals', credentials, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  },

  pipedrive_list_deals: {
    definition: {
      name: 'pipedrive_list_deals',
      description: 'Lists deals from Pipedrive CRM with optional filtering and pagination',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          start: {
            type: 'number',
            description: 'Pagination start (offset)',
            default: 0,
          },
          limit: {
            type: 'number',
            description: 'Number of deals to return per page (max 500)',
            default: 100,
            maximum: 500,
          },
          user_id: {
            type: 'number',
            description: 'Filter by user ID (deal owner)',
          },
          filter_id: {
            type: 'number',
            description: 'ID of the filter to use',
          },
          stage_id: {
            type: 'number',
            description: 'Filter by pipeline stage ID',
          },
          status: {
            type: 'string',
            description: 'Filter by deal status',
            enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
            default: 'all_not_deleted',
          },
          sort: {
            type: 'string',
            description: 'Field name to sort by (e.g., title, value, update_time)',
          },
          owned_by_you: {
            type: 'boolean',
            description: 'Filter deals owned by the authorized user',
            default: false,
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        start = 0,
        limit = 100,
        user_id,
        filter_id,
        stage_id,
        status = 'all_not_deleted',
        sort,
        owned_by_you = false,
      } = params as {
        start?: number;
        limit?: number;
        user_id?: number;
        filter_id?: number;
        stage_id?: number;
        status?: string;
        sort?: string;
        owned_by_you?: boolean;
      };

      const queryParams = new URLSearchParams();
      queryParams.append('start', start.toString());
      queryParams.append('limit', limit.toString());
      queryParams.append('status', status);
      if (user_id) queryParams.append('user_id', user_id.toString());
      if (filter_id) queryParams.append('filter_id', filter_id.toString());
      if (stage_id) queryParams.append('stage_id', stage_id.toString());
      if (sort) queryParams.append('sort', sort);
      if (owned_by_you) queryParams.append('owned_by_you', '1');

      const queryString = queryParams.toString();
      return pipedriveRequest(`deals?${queryString}`, credentials);
    },
  },

  pipedrive_get_deal: {
    definition: {
      name: 'pipedrive_get_deal',
      description: 'Retrieves a specific deal by ID from Pipedrive CRM',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'number',
            description: 'The unique ID of the deal',
          },
        },
        required: ['deal_id'],
      },
    },
    handler: async (params, credentials) => {
      const { deal_id } = params as { deal_id: number };
      return pipedriveRequest(`deals/${deal_id}`, credentials);
    },
  },

  pipedrive_update_deal: {
    definition: {
      name: 'pipedrive_update_deal',
      description: 'Updates an existing deal in Pipedrive CRM',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'number',
            description: 'The unique ID of the deal to update',
          },
          title: {
            type: 'string',
            description: 'Deal title',
          },
          value: {
            type: 'number',
            description: 'Deal value',
          },
          currency: {
            type: 'string',
            description: 'Currency code (3-letter ISO)',
          },
          user_id: {
            type: 'number',
            description: 'ID of the user who owns the deal',
          },
          person_id: {
            type: 'number',
            description: 'ID of the person associated with the deal',
          },
          org_id: {
            type: 'number',
            description: 'ID of the organization associated with the deal',
          },
          pipeline_id: {
            type: 'number',
            description: 'ID of the pipeline',
          },
          stage_id: {
            type: 'number',
            description: 'ID of the stage in the pipeline',
          },
          status: {
            type: 'string',
            description: 'Deal status',
            enum: ['open', 'won', 'lost', 'deleted'],
          },
          expected_close_date: {
            type: 'string',
            description: 'Expected close date in YYYY-MM-DD format',
          },
          probability: {
            type: 'number',
            description: 'Deal success probability percentage (0-100)',
            minimum: 0,
            maximum: 100,
          },
          lost_reason: {
            type: 'string',
            description: 'Reason for losing the deal',
          },
          visible_to: {
            type: 'string',
            description: 'Visibility of the deal',
            enum: ['1', '3', '5', '7'],
          },
        },
        required: ['deal_id'],
      },
    },
    handler: async (params, credentials) => {
      const { deal_id, ...updateData } = params as {
        deal_id: number;
        [key: string]: unknown;
      };

      return pipedriveRequest(`deals/${deal_id}`, credentials, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
    },
  },

  pipedrive_add_contact: {
    definition: {
      name: 'pipedrive_add_contact',
      description: 'Creates a new person (contact) in Pipedrive CRM',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Person name (required)',
          },
          owner_id: {
            type: 'number',
            description: 'ID of the user who will own the person. Defaults to the authorized user.',
          },
          org_id: {
            type: 'number',
            description: 'ID of the organization this person is associated with',
          },
          email: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                  description: 'Email address',
                },
                primary: {
                  type: 'boolean',
                  description: 'Whether this is the primary email',
                  default: true,
                },
                label: {
                  type: 'string',
                  description: 'Email label (e.g., work, home, other)',
                },
              },
              required: ['value'],
            },
            description: 'Array of email addresses',
          },
          phone: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                  description: 'Phone number',
                },
                primary: {
                  type: 'boolean',
                  description: 'Whether this is the primary phone',
                  default: true,
                },
                label: {
                  type: 'string',
                  description: 'Phone label (e.g., work, mobile, home, other)',
                },
              },
              required: ['value'],
            },
            description: 'Array of phone numbers',
          },
          visible_to: {
            type: 'string',
            description:
              'Visibility of the person. 1 = Owner & followers (private), 3 = Entire company (shared)',
            enum: ['1', '3'],
            default: '3',
          },
          add_time: {
            type: 'string',
            description:
              'Optional creation date & time in UTC format (YYYY-MM-DD HH:MM:SS). Defaults to current time.',
          },
        },
        required: ['name'],
      },
    },
    handler: async (params, credentials) => {
      return pipedriveRequest('persons', credentials, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  },

  pipedrive_list_contacts: {
    definition: {
      name: 'pipedrive_list_contacts',
      description:
        'Lists persons (contacts) from Pipedrive CRM with optional filtering and pagination',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          start: {
            type: 'number',
            description: 'Pagination start (offset)',
            default: 0,
          },
          limit: {
            type: 'number',
            description: 'Number of persons to return per page (max 500)',
            default: 100,
            maximum: 500,
          },
          user_id: {
            type: 'number',
            description: 'Filter by user ID (person owner)',
          },
          filter_id: {
            type: 'number',
            description: 'ID of the filter to use',
          },
          first_char: {
            type: 'string',
            description: 'Filter persons by first character of name',
          },
          sort: {
            type: 'string',
            description: 'Field name to sort by',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        start = 0,
        limit = 100,
        user_id,
        filter_id,
        first_char,
        sort,
      } = params as {
        start?: number;
        limit?: number;
        user_id?: number;
        filter_id?: number;
        first_char?: string;
        sort?: string;
      };

      const queryParams = new URLSearchParams();
      queryParams.append('start', start.toString());
      queryParams.append('limit', limit.toString());
      if (user_id) queryParams.append('user_id', user_id.toString());
      if (filter_id) queryParams.append('filter_id', filter_id.toString());
      if (first_char) queryParams.append('first_char', first_char);
      if (sort) queryParams.append('sort', sort);

      const queryString = queryParams.toString();
      return pipedriveRequest(`persons?${queryString}`, credentials);
    },
  },

  pipedrive_get_contact: {
    definition: {
      name: 'pipedrive_get_contact',
      description: 'Retrieves a specific person (contact) by ID from Pipedrive CRM',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          person_id: {
            type: 'number',
            description: 'The unique ID of the person',
          },
        },
        required: ['person_id'],
      },
    },
    handler: async (params, credentials) => {
      const { person_id } = params as { person_id: number };
      return pipedriveRequest(`persons/${person_id}`, credentials);
    },
  },

  pipedrive_update_contact: {
    definition: {
      name: 'pipedrive_update_contact',
      description: 'Updates an existing person (contact) in Pipedrive CRM',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          person_id: {
            type: 'number',
            description: 'The unique ID of the person to update',
          },
          name: {
            type: 'string',
            description: 'Person name',
          },
          owner_id: {
            type: 'number',
            description: 'ID of the user who owns the person',
          },
          org_id: {
            type: 'number',
            description: 'ID of the organization this person is associated with',
          },
          email: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string' },
                primary: { type: 'boolean' },
                label: { type: 'string' },
              },
            },
            description: 'Array of email addresses',
          },
          phone: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string' },
                primary: { type: 'boolean' },
                label: { type: 'string' },
              },
            },
            description: 'Array of phone numbers',
          },
          visible_to: {
            type: 'string',
            description: 'Visibility of the person',
            enum: ['1', '3'],
          },
        },
        required: ['person_id'],
      },
    },
    handler: async (params, credentials) => {
      const { person_id, ...updateData } = params as {
        person_id: number;
        [key: string]: unknown;
      };

      return pipedriveRequest(`persons/${person_id}`, credentials, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
    },
  },

  pipedrive_search: {
    definition: {
      name: 'pipedrive_search',
      description:
        'Searches across deals, persons, organizations, products, and files in Pipedrive',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: 'Search term (minimum 2 characters)',
          },
          item_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['deal', 'person', 'organization', 'product', 'file'],
            },
            description: 'Types of items to search for. If not specified, all types are searched.',
          },
          fields: {
            type: 'string',
            description:
              'Fields to search from (e.g., custom_fields, notes). Defaults to standard fields.',
            enum: ['custom_fields', 'notes'],
          },
          exact_match: {
            type: 'boolean',
            description: 'Whether to search for exact matches only',
            default: false,
          },
          start: {
            type: 'number',
            description: 'Pagination start',
            default: 0,
          },
          limit: {
            type: 'number',
            description: 'Number of results to return (max 500)',
            default: 100,
            maximum: 500,
          },
        },
        required: ['term'],
      },
    },
    handler: async (params, credentials) => {
      const {
        term,
        item_types,
        fields,
        exact_match = false,
        start = 0,
        limit = 100,
      } = params as {
        term: string;
        item_types?: string[];
        fields?: string;
        exact_match?: boolean;
        start?: number;
        limit?: number;
      };

      const queryParams = new URLSearchParams();
      queryParams.append('term', term);
      queryParams.append('exact_match', exact_match ? '1' : '0');
      queryParams.append('start', start.toString());
      queryParams.append('limit', limit.toString());
      if (item_types) queryParams.append('item_types', item_types.join(','));
      if (fields) queryParams.append('fields', fields);

      const queryString = queryParams.toString();
      return pipedriveRequest(`itemSearch?${queryString}`, credentials);
    },
  },
};

// Keep the backwards-compatible direct API handlers above and fill the rest of
// Pipedrive's hosted MCP inventory with provider-only handlers. Provider data
// still flows directly between the SaaS runtime and Pipedrive.
for (const [name, tool] of Object.entries(
  createProviderMcpOnlyTools(publicToolDefinitionsByService.pipedrive)
)) {
  tools[name] ??= tool;
}

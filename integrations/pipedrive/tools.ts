/**
 * Pipedrive integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface PipedriveTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const pipedriveTools: PipedriveTool[] = [
  {
    name: 'pipedrive_create_deal',
    description: 'Creates a new deal in Pipedrive CRM',
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
          description: 'Currency code (3-letter ISO code, e.g., USD, EUR, GBP). Defaults to account default currency.',
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
          description: 'ID of the stage in the pipeline. Defaults to first stage of the pipeline.',
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
          description: 'Optional creation date & time in UTC format (YYYY-MM-DD HH:MM:SS). Defaults to current time.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'pipedrive_list_deals',
    description: 'Lists deals from Pipedrive CRM with optional filtering and pagination',
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
  {
    name: 'pipedrive_get_deal',
    description: 'Retrieves a specific deal by ID from Pipedrive CRM',
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
  {
    name: 'pipedrive_update_deal',
    description: 'Updates an existing deal in Pipedrive CRM',
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
  {
    name: 'pipedrive_add_contact',
    description: 'Creates a new person (contact) in Pipedrive CRM',
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
          description: 'Visibility of the person. 1 = Owner & followers (private), 3 = Entire company (shared)',
          enum: ['1', '3'],
          default: '3',
        },
        add_time: {
          type: 'string',
          description: 'Optional creation date & time in UTC format (YYYY-MM-DD HH:MM:SS). Defaults to current time.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'pipedrive_list_contacts',
    description: 'Lists persons (contacts) from Pipedrive CRM with optional filtering and pagination',
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
  {
    name: 'pipedrive_get_contact',
    description: 'Retrieves a specific person (contact) by ID from Pipedrive CRM',
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
  {
    name: 'pipedrive_update_contact',
    description: 'Updates an existing person (contact) in Pipedrive CRM',
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
  {
    name: 'pipedrive_search',
    description: 'Searches across deals, persons, organizations, products, and files in Pipedrive',
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
          description: 'Fields to search from (e.g., custom_fields, notes). Defaults to standard fields.',
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
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: PipedriveTool[] } {
  return { tools: pipedriveTools };
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
    functions: pipedriveTools.map((tool) => ({
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

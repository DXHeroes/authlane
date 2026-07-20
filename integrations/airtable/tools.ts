/**
 * Airtable Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Airtable API request with OAuth token
 */
async function airtableRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://api.airtable.com/v0/${endpoint}`, {
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
    throw new Error(`Airtable API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Airtable Tools
 */
export const tools: Record<string, ToolHandler> = {
  airtable_list_records: {
    definition: {
      name: 'airtable_list_records',
      description: 'Lists records from an Airtable table with optional filtering and sorting',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name to list records from',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of field names to return (returns all fields if not specified)',
          },
          filter_by_formula: {
            type: 'string',
            description: 'Airtable formula to filter records (e.g., "{Status} = \'Done\'")',
          },
          max_records: {
            type: 'number',
            description: 'Maximum number of records to return (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
          page_size: {
            type: 'number',
            description: 'Number of records to return per page (default: 100, max: 100)',
            default: 100,
            maximum: 100,
          },
          sort: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  description: 'Field name to sort by',
                },
                direction: {
                  type: 'string',
                  enum: ['asc', 'desc'],
                  description: 'Sort direction',
                },
              },
            },
            description: 'Array of sort objects',
          },
          view: {
            type: 'string',
            description: 'Name or ID of a view to use for filtering/sorting',
          },
          cell_format: {
            type: 'string',
            enum: ['json', 'string'],
            description: 'How to format cell values (default: json)',
            default: 'json',
          },
          time_zone: {
            type: 'string',
            description: 'Timezone for date fields (e.g., "America/New_York")',
          },
          user_locale: {
            type: 'string',
            description: 'Locale for formatting (e.g., "en-us")',
          },
          offset: {
            type: 'string',
            description: 'Pagination offset from previous response',
          },
        },
        required: ['base_id', 'table_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        base_id,
        table_id,
        fields,
        filter_by_formula,
        max_records,
        page_size,
        sort,
        view,
        cell_format,
        time_zone,
        user_locale,
        offset,
      } = params as {
        base_id: string;
        table_id: string;
        fields?: string[];
        filter_by_formula?: string;
        max_records?: number;
        page_size?: number;
        sort?: Array<{ field: string; direction: string }>;
        view?: string;
        cell_format?: string;
        time_zone?: string;
        user_locale?: string;
        offset?: string;
      };

      const queryParams = new URLSearchParams();
      if (fields) {
        fields.forEach((field) => {
          queryParams.append('fields[]', field);
        });
      }
      if (filter_by_formula) queryParams.append('filterByFormula', filter_by_formula);
      if (max_records) queryParams.append('maxRecords', max_records.toString());
      if (page_size) queryParams.append('pageSize', page_size.toString());
      if (sort) {
        sort.forEach((s, index) => {
          queryParams.append(`sort[${index}][field]`, s.field);
          queryParams.append(`sort[${index}][direction]`, s.direction);
        });
      }
      if (view) queryParams.append('view', view);
      if (cell_format) queryParams.append('cellFormat', cell_format);
      if (time_zone) queryParams.append('timeZone', time_zone);
      if (user_locale) queryParams.append('userLocale', user_locale);
      if (offset) queryParams.append('offset', offset);

      const queryString = queryParams.toString();
      const endpoint = queryString
        ? `${base_id}/${encodeURIComponent(table_id)}?${queryString}`
        : `${base_id}/${encodeURIComponent(table_id)}`;

      return airtableRequest(endpoint, credentials);
    },
  },

  airtable_create_record: {
    definition: {
      name: 'airtable_create_record',
      description: 'Creates a new record in an Airtable table',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name to create record in',
          },
          fields: {
            type: 'object',
            description: 'Object containing field names and their values',
            additionalProperties: true,
          },
          typecast: {
            type: 'boolean',
            description: 'Automatically convert values to correct field types (default: false)',
            default: false,
          },
        },
        required: ['base_id', 'table_id', 'fields'],
      },
    },
    handler: async (params, credentials) => {
      const {
        base_id,
        table_id,
        fields,
        typecast = false,
      } = params as {
        base_id: string;
        table_id: string;
        fields: Record<string, unknown>;
        typecast?: boolean;
      };

      const queryParams = typecast ? '?typecast=true' : '';

      return airtableRequest(
        `${base_id}/${encodeURIComponent(table_id)}${queryParams}`,
        credentials,
        {
          method: 'POST',
          body: JSON.stringify({ fields }),
        }
      );
    },
  },

  airtable_update_record: {
    definition: {
      name: 'airtable_update_record',
      description: 'Updates an existing record in an Airtable table',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name containing the record',
          },
          record_id: {
            type: 'string',
            description: 'ID of the record to update (starts with "rec")',
          },
          fields: {
            type: 'object',
            description: 'Object containing field names and their updated values',
            additionalProperties: true,
          },
          typecast: {
            type: 'boolean',
            description: 'Automatically convert values to correct field types (default: false)',
            default: false,
          },
          replace: {
            type: 'boolean',
            description:
              'If true, replaces all fields (unspecified fields cleared). If false, merges (default: false)',
            default: false,
          },
        },
        required: ['base_id', 'table_id', 'record_id', 'fields'],
      },
    },
    handler: async (params, credentials) => {
      const {
        base_id,
        table_id,
        record_id,
        fields,
        typecast = false,
        replace = false,
      } = params as {
        base_id: string;
        table_id: string;
        record_id: string;
        fields: Record<string, unknown>;
        typecast?: boolean;
        replace?: boolean;
      };

      const queryParams = typecast ? '?typecast=true' : '';
      const method = replace ? 'PUT' : 'PATCH';

      return airtableRequest(
        `${base_id}/${encodeURIComponent(table_id)}/${record_id}${queryParams}`,
        credentials,
        {
          method,
          body: JSON.stringify({ fields }),
        }
      );
    },
  },

  airtable_get_record: {
    definition: {
      name: 'airtable_get_record',
      description: 'Retrieves a single record by ID from an Airtable table',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name containing the record',
          },
          record_id: {
            type: 'string',
            description: 'ID of the record to retrieve (starts with "rec")',
          },
          cell_format: {
            type: 'string',
            enum: ['json', 'string'],
            description: 'How to format cell values (default: json)',
            default: 'json',
          },
          time_zone: {
            type: 'string',
            description: 'Timezone for date fields (e.g., "America/New_York")',
          },
          user_locale: {
            type: 'string',
            description: 'Locale for formatting (e.g., "en-us")',
          },
        },
        required: ['base_id', 'table_id', 'record_id'],
      },
    },
    handler: async (params, credentials) => {
      const { base_id, table_id, record_id, cell_format, time_zone, user_locale } = params as {
        base_id: string;
        table_id: string;
        record_id: string;
        cell_format?: string;
        time_zone?: string;
        user_locale?: string;
      };

      const queryParams = new URLSearchParams();
      if (cell_format) queryParams.append('cellFormat', cell_format);
      if (time_zone) queryParams.append('timeZone', time_zone);
      if (user_locale) queryParams.append('userLocale', user_locale);

      const queryString = queryParams.toString();
      const endpoint = queryString
        ? `${base_id}/${encodeURIComponent(table_id)}/${record_id}?${queryString}`
        : `${base_id}/${encodeURIComponent(table_id)}/${record_id}`;

      return airtableRequest(endpoint, credentials);
    },
  },

  airtable_delete_record: {
    definition: {
      name: 'airtable_delete_record',
      description: 'Deletes a record from an Airtable table',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name containing the record',
          },
          record_id: {
            type: 'string',
            description: 'ID of the record to delete (starts with "rec")',
          },
        },
        required: ['base_id', 'table_id', 'record_id'],
      },
    },
    handler: async (params, credentials) => {
      const { base_id, table_id, record_id } = params as {
        base_id: string;
        table_id: string;
        record_id: string;
      };

      return airtableRequest(
        `${base_id}/${encodeURIComponent(table_id)}/${record_id}`,
        credentials,
        {
          method: 'DELETE',
        }
      );
    },
  },

  airtable_create_records_batch: {
    definition: {
      name: 'airtable_create_records_batch',
      description: 'Creates multiple records in an Airtable table (up to 10 at once)',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name to create records in',
          },
          records: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fields: {
                  type: 'object',
                  description: 'Object containing field names and their values',
                  additionalProperties: true,
                },
              },
              required: ['fields'],
            },
            description: 'Array of record objects to create (max 10)',
            maxItems: 10,
          },
          typecast: {
            type: 'boolean',
            description: 'Automatically convert values to correct field types (default: false)',
            default: false,
          },
        },
        required: ['base_id', 'table_id', 'records'],
      },
    },
    handler: async (params, credentials) => {
      const {
        base_id,
        table_id,
        records,
        typecast = false,
      } = params as {
        base_id: string;
        table_id: string;
        records: Array<{ fields: Record<string, unknown> }>;
        typecast?: boolean;
      };

      const queryParams = typecast ? '?typecast=true' : '';

      return airtableRequest(
        `${base_id}/${encodeURIComponent(table_id)}${queryParams}`,
        credentials,
        {
          method: 'POST',
          body: JSON.stringify({ records }),
        }
      );
    },
  },

  airtable_update_records_batch: {
    definition: {
      name: 'airtable_update_records_batch',
      description: 'Updates multiple records in an Airtable table (up to 10 at once)',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name containing the records',
          },
          records: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'ID of the record to update (starts with "rec")',
                },
                fields: {
                  type: 'object',
                  description: 'Object containing field names and their updated values',
                  additionalProperties: true,
                },
              },
              required: ['id', 'fields'],
            },
            description: 'Array of record objects to update (max 10)',
            maxItems: 10,
          },
          typecast: {
            type: 'boolean',
            description: 'Automatically convert values to correct field types (default: false)',
            default: false,
          },
          replace: {
            type: 'boolean',
            description:
              'If true, replaces all fields (unspecified fields cleared). If false, merges (default: false)',
            default: false,
          },
        },
        required: ['base_id', 'table_id', 'records'],
      },
    },
    handler: async (params, credentials) => {
      const {
        base_id,
        table_id,
        records,
        typecast = false,
        replace = false,
      } = params as {
        base_id: string;
        table_id: string;
        records: Array<{ id: string; fields: Record<string, unknown> }>;
        typecast?: boolean;
        replace?: boolean;
      };

      const queryParams = typecast ? '?typecast=true' : '';
      const method = replace ? 'PUT' : 'PATCH';

      return airtableRequest(
        `${base_id}/${encodeURIComponent(table_id)}${queryParams}`,
        credentials,
        {
          method,
          body: JSON.stringify({ records }),
        }
      );
    },
  },

  airtable_delete_records_batch: {
    definition: {
      name: 'airtable_delete_records_batch',
      description: 'Deletes multiple records from an Airtable table (up to 10 at once)',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name containing the records',
          },
          record_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of record IDs to delete (max 10)',
            maxItems: 10,
          },
        },
        required: ['base_id', 'table_id', 'record_ids'],
      },
    },
    handler: async (params, credentials) => {
      const { base_id, table_id, record_ids } = params as {
        base_id: string;
        table_id: string;
        record_ids: string[];
      };

      const queryParams = record_ids.map((id) => `records[]=${id}`).join('&');

      return airtableRequest(
        `${base_id}/${encodeURIComponent(table_id)}?${queryParams}`,
        credentials,
        {
          method: 'DELETE',
        }
      );
    },
  },

  airtable_list_bases: {
    definition: {
      name: 'airtable_list_bases',
      description: 'Lists all bases (workspaces) accessible by the user',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          offset: {
            type: 'string',
            description: 'Pagination offset from previous response',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { offset } = params as { offset?: string };

      const queryParams = offset ? `?offset=${offset}` : '';

      return airtableRequest(`meta/bases${queryParams}`, credentials);
    },
  },

  airtable_get_base_schema: {
    definition: {
      name: 'airtable_get_base_schema',
      description:
        'Retrieves the schema (structure) of an Airtable base including all tables and fields',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
        },
        required: ['base_id'],
      },
    },
    handler: async (params, credentials) => {
      const { base_id } = params as { base_id: string };

      return airtableRequest(`meta/bases/${base_id}/tables`, credentials);
    },
  },

  airtable_get_table_schema: {
    definition: {
      name: 'airtable_get_table_schema',
      description: 'Retrieves the schema (structure) of a specific table including all fields',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'ID of the Airtable base (starts with "app")',
          },
          table_id: {
            type: 'string',
            description: 'Table ID or name to get schema for',
          },
        },
        required: ['base_id', 'table_id'],
      },
    },
    handler: async (params, credentials) => {
      const { base_id, table_id } = params as {
        base_id: string;
        table_id: string;
      };

      return airtableRequest(
        `meta/bases/${base_id}/tables/${encodeURIComponent(table_id)}`,
        credentials
      );
    },
  },
};

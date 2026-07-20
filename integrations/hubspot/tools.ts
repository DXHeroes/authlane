/** HubSpot read tools backed by the official remote MCP server at runtime. */

import type { JsonSchema, OAuth2Credentials, ToolHandler } from '@authlane/shared';

async function hubspotRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://api.hubapi.com/${endpoint}`, {
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
    };
    throw new Error(`HubSpot API error: ${error.message || response.statusText}`);
  }
  return response.json();
}

const listInputSchema: JsonSchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'number',
      description: 'Maximum records to return (default: 10, max: 100)',
      default: 10,
      maximum: 100,
    },
    after: {
      type: 'string',
      description: 'Pagination cursor from the previous response',
    },
    properties: {
      type: 'array',
      items: { type: 'string' },
      description: 'Property names to include in the response',
    },
    archived: {
      type: 'boolean',
      description: 'Whether to include archived records',
      default: false,
    },
    filterGroups: {
      type: 'array',
      items: { type: 'object' },
      description: 'HubSpot CRM search filter groups',
    },
    sorts: {
      type: 'array',
      items: { type: 'object' },
      description: 'HubSpot CRM search sort expressions',
    },
  },
  required: [],
};

async function listObjects(
  objectType: 'contacts' | 'deals',
  params: Record<string, unknown>,
  credentials: OAuth2Credentials
): Promise<unknown> {
  const { limit = 10, after, properties, archived = false, filterGroups, sorts } = params;
  const body: Record<string, unknown> = { limit, archived };
  if (after) body.after = after;
  if (properties) body.properties = properties;
  if (filterGroups) body.filterGroups = filterGroups;
  if (sorts) body.sorts = sorts;
  return hubspotRequest(`crm/v3/objects/${objectType}/search`, credentials, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function getObject(
  objectType: 'contacts' | 'deals',
  objectId: string,
  properties: unknown,
  archived: boolean,
  credentials: OAuth2Credentials
): Promise<unknown> {
  const query = new URLSearchParams({ archived: String(archived) });
  if (Array.isArray(properties)) query.set('properties', properties.join(','));
  return hubspotRequest(
    `crm/v3/objects/${objectType}/${encodeURIComponent(objectId)}?${query}`,
    credentials
  );
}

export const tools: Record<string, ToolHandler> = {
  hubspot_list_contacts: {
    definition: {
      name: 'hubspot_list_contacts',
      description: 'Lists contacts from HubSpot CRM with optional filtering and pagination',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: listInputSchema,
    },
    handler: (params, credentials) => listObjects('contacts', params, credentials),
  },
  hubspot_list_deals: {
    definition: {
      name: 'hubspot_list_deals',
      description: 'Lists deals from HubSpot CRM with optional filtering and pagination',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: listInputSchema,
    },
    handler: (params, credentials) => listObjects('deals', params, credentials),
  },
  hubspot_get_contact: {
    definition: {
      name: 'hubspot_get_contact',
      description: 'Retrieves a specific contact by ID from HubSpot CRM',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'The unique ID of the contact' },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Property names to include in the response',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to include an archived contact',
            default: false,
          },
        },
        required: ['contactId'],
      },
    },
    handler: (params, credentials) => {
      const {
        contactId,
        properties,
        archived = false,
      } = params as {
        contactId: string;
        properties?: string[];
        archived?: boolean;
      };
      return getObject('contacts', contactId, properties, archived, credentials);
    },
  },
  hubspot_get_deal: {
    definition: {
      name: 'hubspot_get_deal',
      description: 'Retrieves a specific deal by ID from HubSpot CRM',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          dealId: { type: 'string', description: 'The unique ID of the deal' },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Property names to include in the response',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to include an archived deal',
            default: false,
          },
        },
        required: ['dealId'],
      },
    },
    handler: (params, credentials) => {
      const {
        dealId,
        properties,
        archived = false,
      } = params as {
        dealId: string;
        properties?: string[];
        archived?: boolean;
      };
      return getObject('deals', dealId, properties, archived, credentials);
    },
  },
};

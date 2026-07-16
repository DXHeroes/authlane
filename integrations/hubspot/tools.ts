/**
 * HubSpot Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make HubSpot API request with OAuth token
 */
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
      errorMessages?: string[];
    };
    throw new Error(`HubSpot API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * HubSpot Tools
 */
export const tools: Record<string, ToolHandler> = {
  hubspot_create_contact: {
    definition: {
      name: 'hubspot_create_contact',
      description: 'Creates a new contact in HubSpot CRM',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Contact email address (required for contact creation)',
          },
          firstname: {
            type: 'string',
            description: 'Contact first name',
          },
          lastname: {
            type: 'string',
            description: 'Contact last name',
          },
          phone: {
            type: 'string',
            description: 'Contact phone number',
          },
          company: {
            type: 'string',
            description: 'Company name',
          },
          website: {
            type: 'string',
            description: 'Contact website URL',
          },
          jobtitle: {
            type: 'string',
            description: 'Job title',
          },
          lifecyclestage: {
            type: 'string',
            description: 'Lifecycle stage (e.g., lead, customer, opportunity)',
            enum: [
              'subscriber',
              'lead',
              'marketingqualifiedlead',
              'salesqualifiedlead',
              'opportunity',
              'customer',
              'evangelist',
              'other',
            ],
          },
          hs_lead_status: {
            type: 'string',
            description: 'Lead status',
          },
          city: {
            type: 'string',
            description: 'City',
          },
          state: {
            type: 'string',
            description: 'State/region',
          },
          country: {
            type: 'string',
            description: 'Country',
          },
          zip: {
            type: 'string',
            description: 'Postal code',
          },
          customProperties: {
            type: 'object',
            description: 'Additional custom properties as key-value pairs',
            additionalProperties: true,
          },
        },
        required: ['email'],
      },
    },
    handler: async (params, credentials) => {
      const { customProperties, ...standardProps } = params as Record<string, unknown>;

      const properties = {
        ...standardProps,
        ...((customProperties as Record<string, unknown>) || {}),
      };

      return hubspotRequest('crm/v3/objects/contacts', credentials, {
        method: 'POST',
        body: JSON.stringify({ properties }),
      });
    },
  },

  hubspot_list_contacts: {
    definition: {
      name: 'hubspot_list_contacts',
      description: 'Lists contacts from HubSpot CRM with optional filtering and pagination',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of contacts to return (default: 10, max: 100)',
            default: 10,
            maximum: 100,
          },
          after: {
            type: 'string',
            description: 'Pagination cursor from previous response to fetch next page',
          },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of property names to include in response (e.g., ["firstname", "lastname", "email"])',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to include archived contacts (default: false)',
            default: false,
          },
          filterGroups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      propertyName: {
                        type: 'string',
                        description: 'Name of the property to filter by',
                      },
                      operator: {
                        type: 'string',
                        description: 'Filter operator (EQ, NEQ, LT, LTE, GT, GTE, CONTAINS, etc.)',
                        enum: [
                          'EQ',
                          'NEQ',
                          'LT',
                          'LTE',
                          'GT',
                          'GTE',
                          'CONTAINS',
                          'NOT_CONTAINS',
                          'IN',
                          'NOT_IN',
                          'HAS_PROPERTY',
                          'NOT_HAS_PROPERTY',
                        ],
                      },
                      value: {
                        type: 'string',
                        description: 'Value to filter by',
                      },
                    },
                    required: ['propertyName', 'operator'],
                  },
                },
              },
            },
            description:
              'Filter groups for advanced filtering (filters within a group are AND, groups are OR)',
          },
          sorts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                propertyName: {
                  type: 'string',
                  description: 'Property name to sort by',
                },
                direction: {
                  type: 'string',
                  enum: ['ASCENDING', 'DESCENDING'],
                  description: 'Sort direction',
                },
              },
              required: ['propertyName', 'direction'],
            },
            description: 'Sort criteria for results',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        limit = 10,
        after,
        properties,
        archived = false,
        filterGroups,
        sorts,
      } = params as {
        limit?: number;
        after?: string;
        properties?: string[];
        archived?: boolean;
        filterGroups?: unknown[];
        sorts?: unknown[];
      };

      const body: Record<string, unknown> = {
        limit,
        archived,
      };

      if (after) body.after = after;
      if (properties) body.properties = properties;
      if (filterGroups) body.filterGroups = filterGroups;
      if (sorts) body.sorts = sorts;

      return hubspotRequest('crm/v3/objects/contacts/search', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  hubspot_create_deal: {
    definition: {
      name: 'hubspot_create_deal',
      description: 'Creates a new deal in HubSpot CRM',
      inputSchema: {
        type: 'object',
        properties: {
          dealname: {
            type: 'string',
            description: 'Name of the deal',
          },
          amount: {
            type: 'number',
            description: 'Deal amount in the account currency',
          },
          dealstage: {
            type: 'string',
            description: 'Deal stage ID (must match a stage in your pipeline)',
          },
          pipeline: {
            type: 'string',
            description: 'Pipeline ID (default pipeline used if not specified)',
          },
          closedate: {
            type: 'string',
            description:
              'Expected close date in ISO 8601 format (YYYY-MM-DD or timestamp in milliseconds)',
          },
          dealtype: {
            type: 'string',
            description: 'Type of deal',
            enum: ['newbusiness', 'existingbusiness', 'renewalbusiness'],
          },
          hubspot_owner_id: {
            type: 'string',
            description: 'ID of the deal owner (HubSpot user ID)',
          },
          description: {
            type: 'string',
            description: 'Deal description',
          },
          hs_priority: {
            type: 'string',
            description: 'Deal priority',
            enum: ['low', 'medium', 'high'],
          },
          hs_forecast_probability: {
            type: 'number',
            description: 'Forecast probability (0-100)',
            minimum: 0,
            maximum: 100,
          },
          associations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                to: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      description: 'ID of the object to associate with',
                    },
                  },
                  required: ['id'],
                },
                types: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      associationCategory: {
                        type: 'string',
                        description: 'Association category (e.g., HUBSPOT_DEFINED)',
                      },
                      associationTypeId: {
                        type: 'number',
                        description: 'Association type ID (e.g., 3 for deal to contact)',
                      },
                    },
                  },
                },
              },
            },
            description: 'Associations to other CRM objects (contacts, companies, etc.)',
          },
          customProperties: {
            type: 'object',
            description: 'Additional custom properties as key-value pairs',
            additionalProperties: true,
          },
        },
        required: ['dealname'],
      },
    },
    handler: async (params, credentials) => {
      const { customProperties, associations, ...standardProps } = params as Record<
        string,
        unknown
      >;

      const properties = {
        ...standardProps,
        ...((customProperties as Record<string, unknown>) || {}),
      };

      const body: Record<string, unknown> = { properties };
      if (associations) body.associations = associations;

      return hubspotRequest('crm/v3/objects/deals', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  hubspot_list_deals: {
    definition: {
      name: 'hubspot_list_deals',
      description: 'Lists deals from HubSpot CRM with optional filtering and pagination',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of deals to return (default: 10, max: 100)',
            default: 10,
            maximum: 100,
          },
          after: {
            type: 'string',
            description: 'Pagination cursor from previous response to fetch next page',
          },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of property names to include in response (e.g., ["dealname", "amount", "dealstage"])',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to include archived deals (default: false)',
            default: false,
          },
          filterGroups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      propertyName: {
                        type: 'string',
                        description: 'Name of the property to filter by',
                      },
                      operator: {
                        type: 'string',
                        description: 'Filter operator',
                        enum: [
                          'EQ',
                          'NEQ',
                          'LT',
                          'LTE',
                          'GT',
                          'GTE',
                          'CONTAINS',
                          'NOT_CONTAINS',
                          'IN',
                          'NOT_IN',
                          'HAS_PROPERTY',
                          'NOT_HAS_PROPERTY',
                        ],
                      },
                      value: {
                        type: 'string',
                        description: 'Value to filter by',
                      },
                    },
                    required: ['propertyName', 'operator'],
                  },
                },
              },
            },
            description: 'Filter groups for advanced filtering',
          },
          sorts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                propertyName: {
                  type: 'string',
                  description: 'Property name to sort by',
                },
                direction: {
                  type: 'string',
                  enum: ['ASCENDING', 'DESCENDING'],
                  description: 'Sort direction',
                },
              },
              required: ['propertyName', 'direction'],
            },
            description: 'Sort criteria for results',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        limit = 10,
        after,
        properties,
        archived = false,
        filterGroups,
        sorts,
      } = params as {
        limit?: number;
        after?: string;
        properties?: string[];
        archived?: boolean;
        filterGroups?: unknown[];
        sorts?: unknown[];
      };

      const body: Record<string, unknown> = {
        limit,
        archived,
      };

      if (after) body.after = after;
      if (properties) body.properties = properties;
      if (filterGroups) body.filterGroups = filterGroups;
      if (sorts) body.sorts = sorts;

      return hubspotRequest('crm/v3/objects/deals/search', credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  hubspot_get_contact: {
    definition: {
      name: 'hubspot_get_contact',
      description: 'Retrieves a specific contact by ID from HubSpot CRM',
      inputSchema: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: 'The unique ID of the contact',
          },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of property names to include in response',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to include archived contact (default: false)',
            default: false,
          },
        },
        required: ['contactId'],
      },
    },
    handler: async (params, credentials) => {
      const {
        contactId,
        properties,
        archived = false,
      } = params as {
        contactId: string;
        properties?: string[];
        archived?: boolean;
      };

      const queryParams = new URLSearchParams();
      if (properties) queryParams.append('properties', properties.join(','));
      queryParams.append('archived', archived.toString());

      const queryString = queryParams.toString();
      return hubspotRequest(`crm/v3/objects/contacts/${contactId}?${queryString}`, credentials);
    },
  },

  hubspot_get_deal: {
    definition: {
      name: 'hubspot_get_deal',
      description: 'Retrieves a specific deal by ID from HubSpot CRM',
      inputSchema: {
        type: 'object',
        properties: {
          dealId: {
            type: 'string',
            description: 'The unique ID of the deal',
          },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of property names to include in response',
          },
          archived: {
            type: 'boolean',
            description: 'Whether to include archived deal (default: false)',
            default: false,
          },
        },
        required: ['dealId'],
      },
    },
    handler: async (params, credentials) => {
      const {
        dealId,
        properties,
        archived = false,
      } = params as {
        dealId: string;
        properties?: string[];
        archived?: boolean;
      };

      const queryParams = new URLSearchParams();
      if (properties) queryParams.append('properties', properties.join(','));
      queryParams.append('archived', archived.toString());

      const queryString = queryParams.toString();
      return hubspotRequest(`crm/v3/objects/deals/${dealId}?${queryString}`, credentials);
    },
  },

  hubspot_update_contact: {
    definition: {
      name: 'hubspot_update_contact',
      description: 'Updates an existing contact in HubSpot CRM',
      inputSchema: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: 'The unique ID of the contact to update',
          },
          properties: {
            type: 'object',
            description: 'Contact properties to update (same as create_contact)',
            additionalProperties: true,
          },
        },
        required: ['contactId', 'properties'],
      },
    },
    handler: async (params, credentials) => {
      const { contactId, properties } = params as {
        contactId: string;
        properties: Record<string, unknown>;
      };

      return hubspotRequest(`crm/v3/objects/contacts/${contactId}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
    },
  },

  hubspot_update_deal: {
    definition: {
      name: 'hubspot_update_deal',
      description: 'Updates an existing deal in HubSpot CRM',
      inputSchema: {
        type: 'object',
        properties: {
          dealId: {
            type: 'string',
            description: 'The unique ID of the deal to update',
          },
          properties: {
            type: 'object',
            description: 'Deal properties to update (same as create_deal)',
            additionalProperties: true,
          },
        },
        required: ['dealId', 'properties'],
      },
    },
    handler: async (params, credentials) => {
      const { dealId, properties } = params as {
        dealId: string;
        properties: Record<string, unknown>;
      };

      return hubspotRequest(`crm/v3/objects/deals/${dealId}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
    },
  },
};

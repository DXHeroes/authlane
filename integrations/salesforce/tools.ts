/**
 * Salesforce Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Salesforce API request with OAuth token
 * Note: Salesforce uses instance URL from credentials metadata
 */
async function salesforceRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const instanceUrl = credentials.metadata?.api_base_url;
  if (typeof instanceUrl !== 'string' || instanceUrl.length === 0) {
    throw new Error('Salesforce instance URL is missing from the credential lease');
  }
  const apiVersion = 'v58.0';

  const response = await fetch(`${instanceUrl}/services/data/${apiVersion}/${endpoint}`, {
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
    throw new Error(`Salesforce API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Salesforce Tools
 */
export const tools: Record<string, ToolHandler> = {
  salesforce_create_contact: {
    definition: {
      name: 'salesforce_create_contact',
      description: 'Creates a new contact in Salesforce CRM',
      inputSchema: {
        type: 'object',
        properties: {
          LastName: {
            type: 'string',
            description: 'Contact last name (required)',
          },
          FirstName: {
            type: 'string',
            description: 'Contact first name',
          },
          Email: {
            type: 'string',
            description: 'Contact email address',
          },
          Phone: {
            type: 'string',
            description: 'Contact phone number',
          },
          MobilePhone: {
            type: 'string',
            description: 'Contact mobile phone number',
          },
          Title: {
            type: 'string',
            description: 'Job title',
          },
          Department: {
            type: 'string',
            description: 'Department',
          },
          AccountId: {
            type: 'string',
            description: 'ID of the Account this contact is associated with',
          },
          MailingStreet: {
            type: 'string',
            description: 'Mailing street address',
          },
          MailingCity: {
            type: 'string',
            description: 'Mailing city',
          },
          MailingState: {
            type: 'string',
            description: 'Mailing state/province',
          },
          MailingPostalCode: {
            type: 'string',
            description: 'Mailing postal code',
          },
          MailingCountry: {
            type: 'string',
            description: 'Mailing country',
          },
          OtherStreet: {
            type: 'string',
            description: 'Other street address',
          },
          OtherCity: {
            type: 'string',
            description: 'Other city',
          },
          OtherState: {
            type: 'string',
            description: 'Other state/province',
          },
          OtherPostalCode: {
            type: 'string',
            description: 'Other postal code',
          },
          OtherCountry: {
            type: 'string',
            description: 'Other country',
          },
          LeadSource: {
            type: 'string',
            description: 'Lead source (e.g., Web, Phone Inquiry, Partner Referral)',
          },
          Description: {
            type: 'string',
            description: 'Contact description',
          },
          OwnerId: {
            type: 'string',
            description: 'ID of the User who owns this contact',
          },
          Birthdate: {
            type: 'string',
            description: 'Contact birthdate in YYYY-MM-DD format',
          },
          ReportsToId: {
            type: 'string',
            description: 'ID of the contact this contact reports to',
          },
          customFields: {
            type: 'object',
            description:
              'Additional custom fields as key-value pairs (use API field names with __c suffix)',
            additionalProperties: true,
          },
        },
        required: ['LastName'],
      },
    },
    handler: async (params, credentials) => {
      const { customFields, ...standardFields } = params as Record<string, unknown>;

      const allFields = { ...standardFields, ...((customFields as Record<string, unknown>) || {}) };

      return salesforceRequest('sobjects/Contact', credentials, {
        method: 'POST',
        body: JSON.stringify(allFields),
      });
    },
  },

  salesforce_query: {
    definition: {
      name: 'salesforce_query',
      description:
        'Executes a SOQL (Salesforce Object Query Language) query to retrieve data from Salesforce. SOQL syntax is similar to SQL but designed for Salesforce objects.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'SOQL query string (e.g., "SELECT Id, Name, Email FROM Contact WHERE LastName = \'Smith\' LIMIT 10"). Important: Use standard Salesforce object and field names (Contact, Account, Opportunity, etc.)',
          },
          includeDeleted: {
            type: 'boolean',
            description: 'Whether to include deleted records (uses queryAll instead of query)',
            default: false,
          },
        },
        required: ['query'],
      },
    },
    handler: async (params, credentials) => {
      const { query, includeDeleted = false } = params as {
        query: string;
        includeDeleted?: boolean;
      };

      const endpoint = includeDeleted ? 'queryAll' : 'query';
      const encodedQuery = encodeURIComponent(query);

      return salesforceRequest(`${endpoint}?q=${encodedQuery}`, credentials);
    },
  },

  salesforce_update_opportunity: {
    definition: {
      name: 'salesforce_update_opportunity',
      description: 'Updates an existing opportunity in Salesforce CRM',
      inputSchema: {
        type: 'object',
        properties: {
          opportunityId: {
            type: 'string',
            description: 'The unique ID of the opportunity to update (18-character Salesforce ID)',
          },
          Name: {
            type: 'string',
            description: 'Opportunity name',
          },
          Amount: {
            type: 'number',
            description: 'Opportunity amount in the account currency',
          },
          StageName: {
            type: 'string',
            description:
              'Sales stage name (e.g., Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)',
          },
          CloseDate: {
            type: 'string',
            description: 'Expected close date in YYYY-MM-DD format',
          },
          Probability: {
            type: 'number',
            description: 'Probability of closing (0-100)',
            minimum: 0,
            maximum: 100,
          },
          Type: {
            type: 'string',
            description:
              'Opportunity type (e.g., New Customer, Existing Customer - Upgrade, Existing Customer - Replacement, Existing Customer - Downgrade)',
          },
          NextStep: {
            type: 'string',
            description: 'Description of next task in closing opportunity',
          },
          LeadSource: {
            type: 'string',
            description:
              'Lead source (e.g., Web, Phone Inquiry, Partner Referral, Purchased List, Other)',
          },
          Description: {
            type: 'string',
            description: 'Opportunity description',
          },
          AccountId: {
            type: 'string',
            description: 'ID of the Account associated with this opportunity',
          },
          OwnerId: {
            type: 'string',
            description: 'ID of the User who owns this opportunity',
          },
          Pricebook2Id: {
            type: 'string',
            description: 'ID of the price book associated with this opportunity',
          },
          CampaignId: {
            type: 'string',
            description: 'ID of the campaign that generated this opportunity',
          },
          ForecastCategoryName: {
            type: 'string',
            description: 'Forecast category (e.g., Pipeline, Best Case, Commit, Omitted, Closed)',
            enum: ['Pipeline', 'Best Case', 'Commit', 'Omitted', 'Closed'],
          },
          IsClosed: {
            type: 'boolean',
            description: 'Whether the opportunity is closed',
          },
          IsWon: {
            type: 'boolean',
            description: 'Whether the opportunity is won',
          },
          customFields: {
            type: 'object',
            description:
              'Additional custom fields as key-value pairs (use API field names with __c suffix)',
            additionalProperties: true,
          },
        },
        required: ['opportunityId'],
      },
    },
    handler: async (params, credentials) => {
      const { opportunityId, customFields, ...standardFields } = params as {
        opportunityId: string;
        customFields?: Record<string, unknown>;
        [key: string]: unknown;
      };

      const allFields = { ...standardFields, ...(customFields || {}) };

      return salesforceRequest(`sobjects/Opportunity/${opportunityId}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify(allFields),
      });
    },
  },

  salesforce_create_opportunity: {
    definition: {
      name: 'salesforce_create_opportunity',
      description: 'Creates a new opportunity in Salesforce CRM',
      inputSchema: {
        type: 'object',
        properties: {
          Name: {
            type: 'string',
            description: 'Opportunity name (required)',
          },
          StageName: {
            type: 'string',
            description: 'Sales stage name (required)',
          },
          CloseDate: {
            type: 'string',
            description: 'Expected close date in YYYY-MM-DD format (required)',
          },
          Amount: {
            type: 'number',
            description: 'Opportunity amount in the account currency',
          },
          Probability: {
            type: 'number',
            description: 'Probability of closing (0-100)',
            minimum: 0,
            maximum: 100,
          },
          Type: {
            type: 'string',
            description: 'Opportunity type',
          },
          NextStep: {
            type: 'string',
            description: 'Description of next task in closing opportunity',
          },
          LeadSource: {
            type: 'string',
            description: 'Lead source',
          },
          Description: {
            type: 'string',
            description: 'Opportunity description',
          },
          AccountId: {
            type: 'string',
            description: 'ID of the Account associated with this opportunity',
          },
          OwnerId: {
            type: 'string',
            description: 'ID of the User who owns this opportunity',
          },
          customFields: {
            type: 'object',
            description:
              'Additional custom fields as key-value pairs (use API field names with __c suffix)',
            additionalProperties: true,
          },
        },
        required: ['Name', 'StageName', 'CloseDate'],
      },
    },
    handler: async (params, credentials) => {
      const { customFields, ...standardFields } = params as Record<string, unknown>;

      const allFields = { ...standardFields, ...((customFields as Record<string, unknown>) || {}) };

      return salesforceRequest('sobjects/Opportunity', credentials, {
        method: 'POST',
        body: JSON.stringify(allFields),
      });
    },
  },

  salesforce_get_object: {
    definition: {
      name: 'salesforce_get_object',
      description: 'Retrieves a specific Salesforce object by ID',
      inputSchema: {
        type: 'object',
        properties: {
          objectType: {
            type: 'string',
            description: 'Salesforce object type (e.g., Contact, Account, Opportunity, Lead)',
          },
          objectId: {
            type: 'string',
            description: 'The unique ID of the object to retrieve',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of field names to include in response',
          },
        },
        required: ['objectType', 'objectId'],
      },
    },
    handler: async (params, credentials) => {
      const { objectType, objectId, fields } = params as {
        objectType: string;
        objectId: string;
        fields?: string[];
      };

      let endpoint = `sobjects/${objectType}/${objectId}`;

      if (fields && fields.length > 0) {
        const fieldsParam = fields.join(',');
        endpoint += `?fields=${fieldsParam}`;
      }

      return salesforceRequest(endpoint, credentials);
    },
  },
};

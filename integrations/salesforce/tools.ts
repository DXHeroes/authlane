/**
 * Salesforce integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 * Includes SOQL query support for flexible data access
 */

import type { ToolFormat } from '@authlane/shared';

export interface SalesforceTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const salesforceTools: SalesforceTool[] = [
  {
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
          description: 'Additional custom fields as key-value pairs (use API field names with __c suffix)',
          additionalProperties: true,
        },
      },
      required: ['LastName'],
    },
  },
  {
    name: 'salesforce_query',
    description: 'Executes a SOQL (Salesforce Object Query Language) query to retrieve data from Salesforce. SOQL syntax is similar to SQL but designed for Salesforce objects.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SOQL query string (e.g., "SELECT Id, Name, Email FROM Contact WHERE LastName = \'Smith\' LIMIT 10"). Important: Use standard Salesforce object and field names (Contact, Account, Opportunity, etc.)',
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
  {
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
          description: 'Sales stage name (e.g., Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)',
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
          description: 'Opportunity type (e.g., New Customer, Existing Customer - Upgrade, Existing Customer - Replacement, Existing Customer - Downgrade)',
        },
        NextStep: {
          type: 'string',
          description: 'Description of next task in closing opportunity',
        },
        LeadSource: {
          type: 'string',
          description: 'Lead source (e.g., Web, Phone Inquiry, Partner Referral, Purchased List, Other)',
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
          description: 'Additional custom fields as key-value pairs (use API field names with __c suffix)',
          additionalProperties: true,
        },
      },
      required: ['opportunityId'],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: SalesforceTool[] } {
  return { tools: salesforceTools };
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
    functions: salesforceTools.map((tool) => ({
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

/**
 * Stripe integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 * READ-ONLY tools for secure payment data access
 */

import type { ToolFormat } from '@authlane/shared';

export interface StripeTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const stripeTools: StripeTool[] = [
  {
    name: 'stripe_list_customers',
    description: 'Lists customers in your Stripe account with pagination support',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of customers to return (default: 10, max: 100)',
          default: 10,
          maximum: 100,
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination - customer ID to start after',
        },
        ending_before: {
          type: 'string',
          description: 'Cursor for pagination - customer ID to end before',
        },
        email: {
          type: 'string',
          description: 'Filter customers by email address',
        },
        created: {
          type: 'object',
          description: 'Filter by creation date (use gt, gte, lt, lte operators with Unix timestamps)',
        },
      },
      required: [],
    },
  },
  {
    name: 'stripe_get_customer',
    description: 'Retrieves details of a specific customer',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: 'The Stripe customer ID (starts with "cus_")',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'stripe_get_payment',
    description: 'Retrieves details of a specific payment intent',
    inputSchema: {
      type: 'object',
      properties: {
        payment_intent_id: {
          type: 'string',
          description: 'The Stripe payment intent ID (starts with "pi_")',
        },
      },
      required: ['payment_intent_id'],
    },
  },
  {
    name: 'stripe_list_payments',
    description: 'Lists payment intents with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of payment intents to return (default: 10, max: 100)',
          default: 10,
          maximum: 100,
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination - payment intent ID to start after',
        },
        ending_before: {
          type: 'string',
          description: 'Cursor for pagination - payment intent ID to end before',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID',
        },
        created: {
          type: 'object',
          description: 'Filter by creation date (use gt, gte, lt, lte operators with Unix timestamps)',
        },
      },
      required: [],
    },
  },
  {
    name: 'stripe_list_invoices',
    description: 'Lists invoices with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of invoices to return (default: 10, max: 100)',
          default: 10,
          maximum: 100,
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination - invoice ID to start after',
        },
        ending_before: {
          type: 'string',
          description: 'Cursor for pagination - invoice ID to end before',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID',
        },
        status: {
          type: 'string',
          description: 'Filter by invoice status (draft, open, paid, uncollectible, void)',
          enum: ['draft', 'open', 'paid', 'uncollectible', 'void'],
        },
        subscription: {
          type: 'string',
          description: 'Filter by subscription ID',
        },
        created: {
          type: 'object',
          description: 'Filter by creation date (use gt, gte, lt, lte operators with Unix timestamps)',
        },
      },
      required: [],
    },
  },
  {
    name: 'stripe_get_invoice',
    description: 'Retrieves details of a specific invoice',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: {
          type: 'string',
          description: 'The Stripe invoice ID (starts with "in_")',
        },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'stripe_list_subscriptions',
    description: 'Lists subscriptions with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of subscriptions to return (default: 10, max: 100)',
          default: 10,
          maximum: 100,
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination - subscription ID to start after',
        },
        ending_before: {
          type: 'string',
          description: 'Cursor for pagination - subscription ID to end before',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID',
        },
        price: {
          type: 'string',
          description: 'Filter by price ID',
        },
        status: {
          type: 'string',
          description: 'Filter by subscription status (active, past_due, unpaid, canceled, incomplete, incomplete_expired, trialing)',
          enum: ['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trialing'],
        },
        created: {
          type: 'object',
          description: 'Filter by creation date (use gt, gte, lt, lte operators with Unix timestamps)',
        },
      },
      required: [],
    },
  },
  {
    name: 'stripe_get_subscription',
    description: 'Retrieves details of a specific subscription',
    inputSchema: {
      type: 'object',
      properties: {
        subscription_id: {
          type: 'string',
          description: 'The Stripe subscription ID (starts with "sub_")',
        },
      },
      required: ['subscription_id'],
    },
  },
  {
    name: 'stripe_list_charges',
    description: 'Lists charges with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of charges to return (default: 10, max: 100)',
          default: 10,
          maximum: 100,
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination - charge ID to start after',
        },
        ending_before: {
          type: 'string',
          description: 'Cursor for pagination - charge ID to end before',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID',
        },
        payment_intent: {
          type: 'string',
          description: 'Filter by payment intent ID',
        },
        created: {
          type: 'object',
          description: 'Filter by creation date (use gt, gte, lt, lte operators with Unix timestamps)',
        },
      },
      required: [],
    },
  },
  {
    name: 'stripe_get_charge',
    description: 'Retrieves details of a specific charge',
    inputSchema: {
      type: 'object',
      properties: {
        charge_id: {
          type: 'string',
          description: 'The Stripe charge ID (starts with "ch_")',
        },
      },
      required: ['charge_id'],
    },
  },
  {
    name: 'stripe_get_balance',
    description: 'Retrieves the current balance of your Stripe account',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'stripe_list_balance_transactions',
    description: 'Lists balance transactions with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of transactions to return (default: 10, max: 100)',
          default: 10,
          maximum: 100,
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination - transaction ID to start after',
        },
        ending_before: {
          type: 'string',
          description: 'Cursor for pagination - transaction ID to end before',
        },
        type: {
          type: 'string',
          description: 'Filter by transaction type (e.g., charge, refund, adjustment, etc.)',
        },
        payout: {
          type: 'string',
          description: 'Filter by payout ID',
        },
        created: {
          type: 'object',
          description: 'Filter by creation date (use gt, gte, lt, lte operators with Unix timestamps)',
        },
      },
      required: [],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: StripeTool[] } {
  return { tools: stripeTools };
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
    functions: stripeTools.map((tool) => ({
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

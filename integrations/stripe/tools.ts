/**
 * Stripe Integration Tools
 * Executable tool handlers with credential injection
 * READ-ONLY tools for secure payment data access
 */

import type { OAuth2Credentials } from '@authlane/shared';
import type { ToolHandler } from '../../apps/api/src/lib/tool-executor.js';

/**
 * Make Stripe API request with OAuth token
 * Stripe uses REST API with Bearer token authentication
 */
async function stripeRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Stripe API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Stripe Tools (READ-ONLY for security)
 */
export const tools: Record<string, ToolHandler> = {
  stripe_list_customers: {
    definition: {
      name: 'stripe_list_customers',
      description: 'Lists customers in your Stripe account with pagination support',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of customers to return (max 100)',
          },
          starting_after: {
            type: 'string',
            description: 'Cursor for pagination - customer ID to start after',
          },
          email: {
            type: 'string',
            description: 'Filter customers by email address',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        limit = 10,
        starting_after,
        email,
      } = params as {
        limit?: number;
        starting_after?: string;
        email?: string;
      };

      const queryParams = new URLSearchParams({
        limit: String(Math.min(limit, 100)),
      });

      if (starting_after) queryParams.append('starting_after', starting_after);
      if (email) queryParams.append('email', email);

      return stripeRequest(`customers?${queryParams}`, credentials);
    },
  },

  stripe_get_customer: {
    definition: {
      name: 'stripe_get_customer',
      description: 'Retrieves details of a specific customer',
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The Stripe customer ID',
          },
        },
        required: ['customer_id'],
      },
    },
    handler: async (params, credentials) => {
      const { customer_id } = params as {
        customer_id: string;
      };

      return stripeRequest(`customers/${customer_id}`, credentials);
    },
  },

  stripe_list_charges: {
    definition: {
      name: 'stripe_list_charges',
      description: 'Lists charges (payments) in your Stripe account',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of charges to return (max 100)',
          },
          starting_after: {
            type: 'string',
            description: 'Cursor for pagination - charge ID to start after',
          },
          customer: {
            type: 'string',
            description: 'Filter by customer ID',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        limit = 10,
        starting_after,
        customer,
      } = params as {
        limit?: number;
        starting_after?: string;
        customer?: string;
      };

      const queryParams = new URLSearchParams({
        limit: String(Math.min(limit, 100)),
      });

      if (starting_after) queryParams.append('starting_after', starting_after);
      if (customer) queryParams.append('customer', customer);

      return stripeRequest(`charges?${queryParams}`, credentials);
    },
  },

  stripe_get_charge: {
    definition: {
      name: 'stripe_get_charge',
      description: 'Retrieves details of a specific charge (payment)',
      inputSchema: {
        type: 'object',
        properties: {
          charge_id: {
            type: 'string',
            description: 'The Stripe charge ID',
          },
        },
        required: ['charge_id'],
      },
    },
    handler: async (params, credentials) => {
      const { charge_id } = params as {
        charge_id: string;
      };

      return stripeRequest(`charges/${charge_id}`, credentials);
    },
  },
};

/**
 * Sentry Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials } from '@authlane/shared';
import type { ToolHandler } from '../../apps/api/src/lib/tool-executor.js';

/**
 * Make Sentry API request with OAuth token
 */
async function sentryRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://sentry.io/api/0/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Sentry API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Sentry Tools
 */
export const tools: Record<string, ToolHandler> = {
  sentry_list_issues: {
    definition: {
      name: 'sentry_list_issues',
      description: 'Lists issues from Sentry with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          organizationSlug: {
            type: 'string',
            description: 'Organization slug (e.g., "my-organization")',
          },
          projectSlug: {
            type: 'string',
            description: 'Project slug to filter issues (optional)',
          },
          query: {
            type: 'string',
            description:
              'Search query using Sentry query syntax (e.g., "is:unresolved", "level:error")',
          },
          status: {
            type: 'string',
            description: 'Filter by issue status',
            enum: ['resolved', 'unresolved', 'ignored', 'reprocessing'],
          },
          statsPeriod: {
            type: 'string',
            description: 'Time period for issue statistics (e.g., "14d", "24h", "30d")',
            default: '14d',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of issues to return (default: 25, max: 100)',
            default: 25,
            maximum: 100,
          },
          cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
          sortBy: {
            type: 'string',
            description: 'Sort order for issues',
            enum: ['date', 'new', 'priority', 'freq', 'user'],
            default: 'date',
          },
        },
        required: ['organizationSlug'],
      },
    },
    handler: async (params, credentials) => {
      const {
        organizationSlug,
        projectSlug,
        query,
        status,
        statsPeriod = '14d',
        limit = 25,
        cursor,
        sortBy = 'date',
      } = params as {
        organizationSlug: string;
        projectSlug?: string;
        query?: string;
        status?: string;
        statsPeriod?: string;
        limit?: number;
        cursor?: string;
        sortBy?: string;
      };

      const endpoint = projectSlug
        ? `projects/${organizationSlug}/${projectSlug}/issues/`
        : `organizations/${organizationSlug}/issues/`;

      const queryParams = new URLSearchParams();
      if (query) queryParams.append('query', query);
      if (status) queryParams.append('query', `is:${status}`);
      queryParams.append('statsPeriod', statsPeriod);
      queryParams.append('limit', limit.toString());
      if (cursor) queryParams.append('cursor', cursor);
      queryParams.append('sort', sortBy);

      const queryString = queryParams.toString();
      return sentryRequest(`${endpoint}?${queryString}`, credentials);
    },
  },

  sentry_resolve_issue: {
    definition: {
      name: 'sentry_resolve_issue',
      description: 'Resolves or updates the status of a Sentry issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Sentry issue ID',
          },
          status: {
            type: 'string',
            description: 'New status for the issue',
            enum: ['resolved', 'unresolved', 'ignored'],
          },
          statusDetails: {
            type: 'object',
            description: 'Additional details for the status change',
            properties: {
              inNextRelease: {
                type: 'boolean',
                description: 'Mark as resolved in next release',
              },
              inRelease: {
                type: 'string',
                description: 'Version number to mark as resolved in',
              },
              inCommit: {
                type: 'string',
                description: 'Commit hash that resolves this issue',
              },
              ignoreDuration: {
                type: 'number',
                description: 'Minutes to ignore the issue',
              },
              ignoreCount: {
                type: 'number',
                description: 'Number of events before unignoring',
              },
              ignoreUserCount: {
                type: 'number',
                description: 'Number of users affected before unignoring',
              },
              ignoreWindow: {
                type: 'number',
                description: 'Time window in minutes for ignore conditions',
              },
            },
          },
          assignedTo: {
            type: 'string',
            description: 'User ID or team slug to assign the issue to',
          },
        },
        required: ['issueId', 'status'],
      },
    },
    handler: async (params, credentials) => {
      const { issueId, status, statusDetails, assignedTo } = params as {
        issueId: string;
        status: string;
        statusDetails?: Record<string, unknown>;
        assignedTo?: string;
      };

      const body: Record<string, unknown> = { status };
      if (statusDetails) body.statusDetails = statusDetails;
      if (assignedTo) body.assignedTo = assignedTo;

      return sentryRequest(`issues/${issueId}/`, credentials, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },
  },

  sentry_get_issue: {
    definition: {
      name: 'sentry_get_issue',
      description: 'Gets detailed information about a specific Sentry issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Sentry issue ID',
          },
        },
        required: ['issueId'],
      },
    },
    handler: async (params, credentials) => {
      const { issueId } = params as { issueId: string };
      return sentryRequest(`issues/${issueId}/`, credentials);
    },
  },

  sentry_list_events: {
    definition: {
      name: 'sentry_list_events',
      description: 'Lists events for a specific issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Sentry issue ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of events to return (default: 25, max: 100)',
            default: 25,
            maximum: 100,
          },
          cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response',
          },
        },
        required: ['issueId'],
      },
    },
    handler: async (params, credentials) => {
      const {
        issueId,
        limit = 25,
        cursor,
      } = params as {
        issueId: string;
        limit?: number;
        cursor?: string;
      };

      const queryParams = new URLSearchParams();
      queryParams.append('limit', limit.toString());
      if (cursor) queryParams.append('cursor', cursor);

      const queryString = queryParams.toString();
      return sentryRequest(`issues/${issueId}/events/?${queryString}`, credentials);
    },
  },

  sentry_add_comment: {
    definition: {
      name: 'sentry_add_comment',
      description: 'Adds a comment to a Sentry issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Sentry issue ID',
          },
          comment: {
            type: 'string',
            description: 'Comment text to add to the issue',
          },
        },
        required: ['issueId', 'comment'],
      },
    },
    handler: async (params, credentials) => {
      const { issueId, comment } = params as {
        issueId: string;
        comment: string;
      };

      return sentryRequest(`issues/${issueId}/comments/`, credentials, {
        method: 'POST',
        body: JSON.stringify({ text: comment }),
      });
    },
  },
};

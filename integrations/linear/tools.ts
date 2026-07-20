/**
 * Linear Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Linear API request with OAuth token
 * Linear uses GraphQL API
 */
async function linearRequest(
  query: string,
  credentials: OAuth2Credentials,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = (await response.json()) as { data?: unknown; errors?: Array<{ message: string }> };

  const firstError = result.errors?.[0];
  if (firstError) {
    throw new Error(`Linear API error: ${firstError.message}`);
  }

  return result.data;
}

/**
 * Linear Tools
 */
export const tools: Record<string, ToolHandler> = {
  linear_create_issue: {
    definition: {
      name: 'linear_create_issue',
      description: 'Creates a new issue in Linear',
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
            description: 'Issue title',
          },
          description: {
            type: 'string',
            description: 'Issue description (markdown supported)',
          },
          teamId: {
            type: 'string',
            description: 'Team ID to create issue in',
          },
          priority: {
            type: 'number',
            description:
              'Priority level (0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low)',
          },
          assigneeId: {
            type: 'string',
            description: 'User ID to assign the issue to',
          },
          labelIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of label IDs to apply',
          },
        },
        required: ['title', 'teamId'],
      },
    },
    handler: async (params, credentials) => {
      const { title, description, teamId, priority, assigneeId, labelIds } = params as {
        title: string;
        description?: string;
        teamId: string;
        priority?: number;
        assigneeId?: string;
        labelIds?: string[];
      };

      const query = `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
            }
          }
        }
      `;

      const input: Record<string, unknown> = {
        title,
        teamId,
      };

      if (description) input.description = description;
      if (priority !== undefined) input.priority = priority;
      if (assigneeId) input.assigneeId = assigneeId;
      if (labelIds) input.labelIds = labelIds;

      return linearRequest(query, credentials, { input });
    },
  },

  linear_list_issues: {
    definition: {
      name: 'linear_list_issues',
      description: 'Lists issues in Linear with optional filters',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          teamId: {
            type: 'string',
            description: 'Filter by team ID',
          },
          assigneeId: {
            type: 'string',
            description: 'Filter by assignee user ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of issues to return (max 250)',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        teamId,
        assigneeId,
        limit = 50,
      } = params as {
        teamId?: string;
        assigneeId?: string;
        limit?: number;
      };

      // Build filter
      const filters: string[] = [];
      if (teamId) filters.push(`team: { id: { eq: "${teamId}" } }`);
      if (assigneeId) filters.push(`assignee: { id: { eq: "${assigneeId}" } }`);

      const filterString = filters.length > 0 ? `filter: { ${filters.join(', ')} }` : '';

      const query = `
        query Issues {
          issues(${filterString}, first: ${Math.min(limit, 250)}) {
            nodes {
              id
              identifier
              title
              description
              priority
              state {
                name
                type
              }
              assignee {
                id
                name
                email
              }
              team {
                id
                name
              }
              url
              createdAt
              updatedAt
            }
          }
        }
      `;

      return linearRequest(query, credentials);
    },
  },

  linear_update_issue: {
    definition: {
      name: 'linear_update_issue',
      description: 'Updates an existing issue in Linear',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          issueId: {
            type: 'string',
            description: 'Issue ID to update',
          },
          title: {
            type: 'string',
            description: 'New title',
          },
          description: {
            type: 'string',
            description: 'New description',
          },
          priority: {
            type: 'number',
            description: 'New priority level (0-4)',
          },
          assigneeId: {
            type: 'string',
            description: 'New assignee user ID',
          },
          stateId: {
            type: 'string',
            description: 'New workflow state ID',
          },
        },
        required: ['issueId'],
      },
    },
    handler: async (params, credentials) => {
      const { issueId, title, description, priority, assigneeId, stateId } = params as {
        issueId: string;
        title?: string;
        description?: string;
        priority?: number;
        assigneeId?: string;
        stateId?: string;
      };

      const query = `
        mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              url
            }
          }
        }
      `;

      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (description) input.description = description;
      if (priority !== undefined) input.priority = priority;
      if (assigneeId) input.assigneeId = assigneeId;
      if (stateId) input.stateId = stateId;

      return linearRequest(query, credentials, { id: issueId, input });
    },
  },

  linear_list_projects: {
    definition: {
      name: 'linear_list_projects',
      description: 'Lists projects in Linear',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          teamId: {
            type: 'string',
            description: 'Filter by team ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of projects to return (max 250)',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const { teamId, limit = 50 } = params as {
        teamId?: string;
        limit?: number;
      };

      const filterString = teamId ? `filter: { team: { id: { eq: "${teamId}" } } }` : '';

      const query = `
        query Projects {
          projects(${filterString}, first: ${Math.min(limit, 250)}) {
            nodes {
              id
              name
              description
              state
              priority
              progress
              targetDate
              lead {
                id
                name
              }
              teams {
                nodes {
                  id
                  name
                }
              }
              url
              createdAt
              updatedAt
            }
          }
        }
      `;

      return linearRequest(query, credentials);
    },
  },

  linear_create_project: {
    definition: {
      name: 'linear_create_project',
      description: 'Creates a new project in Linear',
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
            description: 'Project name',
          },
          description: {
            type: 'string',
            description: 'Project description',
          },
          teamIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of team IDs to associate with the project',
          },
          leadId: {
            type: 'string',
            description: 'User ID of project lead',
          },
          targetDate: {
            type: 'string',
            description: 'Target completion date (ISO 8601 format)',
          },
        },
        required: ['name', 'teamIds'],
      },
    },
    handler: async (params, credentials) => {
      const { name, description, teamIds, leadId, targetDate } = params as {
        name: string;
        description?: string;
        teamIds: string[];
        leadId?: string;
        targetDate?: string;
      };

      const query = `
        mutation ProjectCreate($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project {
              id
              name
              url
            }
          }
        }
      `;

      const input: Record<string, unknown> = {
        name,
        teamIds,
      };

      if (description) input.description = description;
      if (leadId) input.leadId = leadId;
      if (targetDate) input.targetDate = targetDate;

      return linearRequest(query, credentials, { input });
    },
  },
};

/**
 * Jira Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Get Jira cloud ID from access token
 * This is required for Jira API calls
 */
async function getCloudId(credentials: OAuth2Credentials): Promise<string> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get Jira cloud ID');
  }

  const resources = (await response.json()) as Array<{ id: string; url: string; name: string }>;

  const firstResource = resources[0];
  if (!firstResource) {
    throw new Error('No accessible Jira resources found');
  }

  // Return the first cloud ID (most common use case)
  return firstResource.id;
}

/**
 * Make Jira API request with OAuth token
 */
async function jiraRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  // Get cloud ID first
  const cloudId = await getCloudId(credentials);

  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(
      `Jira API error: ${error.errorMessages?.join(', ') || error.message || response.statusText}`
    );
  }

  // Some endpoints return 204 No Content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

/**
 * Jira Tools
 */
export const tools: Record<string, ToolHandler> = {
  jira_create_issue: {
    definition: {
      name: 'jira_create_issue',
      description: 'Creates a new issue in a Jira project',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: {
            type: 'string',
            description: 'Project key where the issue will be created (e.g., "PROJ")',
          },
          summary: {
            type: 'string',
            description: 'Issue summary/title',
          },
          description: {
            type: 'string',
            description: 'Issue description (supports Jira markdown/ADF format)',
          },
          issueType: {
            type: 'string',
            description: 'Issue type (e.g., "Bug", "Task", "Story", "Epic")',
          },
          priority: {
            type: 'string',
            description: 'Issue priority (e.g., "Highest", "High", "Medium", "Low", "Lowest")',
          },
          assigneeAccountId: {
            type: 'string',
            description: 'Account ID of the assignee',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of labels to apply to the issue',
          },
          components: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of component names or IDs',
          },
          dueDate: {
            type: 'string',
            description: 'Due date in YYYY-MM-DD format',
          },
        },
        required: ['projectKey', 'summary', 'issueType'],
      },
    },
    handler: async (params, credentials) => {
      const {
        projectKey,
        summary,
        description,
        issueType,
        priority,
        assigneeAccountId,
        labels,
        components,
        dueDate,
      } = params as {
        projectKey: string;
        summary: string;
        description?: string;
        issueType: string;
        priority?: string;
        assigneeAccountId?: string;
        labels?: string[];
        components?: string[];
        dueDate?: string;
      };

      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      };

      if (description) {
        // Convert plain text to Atlassian Document Format (ADF)
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        };
      }

      if (priority) fields.priority = { name: priority };
      if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
      if (labels) fields.labels = labels;
      if (components) fields.components = components.map((c) => ({ name: c }));
      if (dueDate) fields.duedate = dueDate;

      return jiraRequest('/issue', credentials, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });
    },
  },

  jira_list_issues: {
    definition: {
      name: 'jira_list_issues',
      description: 'Lists issues from Jira using JQL (Jira Query Language)',
      inputSchema: {
        type: 'object',
        properties: {
          jql: {
            type: 'string',
            description: 'JQL query string (e.g., "project = PROJ AND status = Open")',
          },
          projectKey: {
            type: 'string',
            description: 'Filter issues by project key (alternative to JQL)',
          },
          assigneeAccountId: {
            type: 'string',
            description: 'Filter by assignee account ID (alternative to JQL)',
          },
          status: {
            type: 'string',
            description: 'Filter by status name (e.g., "To Do", "In Progress", "Done")',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of issues to return (default: 50, max: 100)',
            default: 50,
            maximum: 100,
          },
          startAt: {
            type: 'number',
            description: 'Index of the first issue to return (for pagination)',
            default: 0,
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of field names to include in response',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        jql,
        projectKey,
        assigneeAccountId,
        status,
        maxResults = 50,
        startAt = 0,
        fields,
      } = params as {
        jql?: string;
        projectKey?: string;
        assigneeAccountId?: string;
        status?: string;
        maxResults?: number;
        startAt?: number;
        fields?: string[];
      };

      // Build JQL query if not provided
      let finalJql = jql || '';

      if (!jql) {
        const conditions: string[] = [];
        if (projectKey) conditions.push(`project = ${projectKey}`);
        if (assigneeAccountId) conditions.push(`assignee = ${assigneeAccountId}`);
        if (status) conditions.push(`status = "${status}"`);

        finalJql = conditions.join(' AND ');
      }

      const queryParams: string[] = [`maxResults=${maxResults}`, `startAt=${startAt}`];

      if (finalJql) queryParams.push(`jql=${encodeURIComponent(finalJql)}`);
      if (fields) queryParams.push(`fields=${fields.join(',')}`);

      return jiraRequest(`/search?${queryParams.join('&')}`, credentials);
    },
  },

  jira_transition_issue: {
    definition: {
      name: 'jira_transition_issue',
      description: 'Transitions a Jira issue to a different status/state',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'Issue key (e.g., "PROJ-123")',
          },
          transitionId: {
            type: 'string',
            description:
              'Transition ID to execute (use jira_get_transitions to get available transitions)',
          },
          transitionName: {
            type: 'string',
            description:
              'Transition name (alternative to transitionId, e.g., "Start Progress", "Done")',
          },
          comment: {
            type: 'string',
            description: 'Optional comment to add when transitioning',
          },
          assigneeAccountId: {
            type: 'string',
            description: 'Optionally reassign the issue during transition',
          },
          resolution: {
            type: 'string',
            description: 'Resolution when closing issue (e.g., "Done", "Won\'t Do", "Duplicate")',
          },
        },
        required: ['issueKey'],
      },
    },
    handler: async (params, credentials) => {
      const { issueKey, transitionId, transitionName, comment, assigneeAccountId, resolution } =
        params as {
          issueKey: string;
          transitionId?: string;
          transitionName?: string;
          comment?: string;
          assigneeAccountId?: string;
          resolution?: string;
        };

      // If transitionName provided instead of transitionId, fetch transitions to find ID
      let finalTransitionId = transitionId;

      if (!transitionId && transitionName) {
        const transitions = (await jiraRequest(`/issue/${issueKey}/transitions`, credentials)) as {
          transitions: Array<{ id: string; name: string }>;
        };

        const transition = transitions.transitions.find(
          (t) => t.name.toLowerCase() === transitionName.toLowerCase()
        );

        if (!transition) {
          throw new Error(`Transition "${transitionName}" not found for issue ${issueKey}`);
        }

        finalTransitionId = transition.id;
      }

      if (!finalTransitionId) {
        throw new Error('Either transitionId or transitionName must be provided');
      }

      const body: Record<string, unknown> = {
        transition: { id: finalTransitionId },
      };

      const fields: Record<string, unknown> = {};
      if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
      if (resolution) fields.resolution = { name: resolution };

      if (Object.keys(fields).length > 0) {
        body.fields = fields;
      }

      if (comment) {
        body.update = {
          comment: [
            {
              add: {
                body: {
                  type: 'doc',
                  version: 1,
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: comment }],
                    },
                  ],
                },
              },
            },
          ],
        };
      }

      return jiraRequest(`/issue/${issueKey}/transitions`, credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  jira_get_transitions: {
    definition: {
      name: 'jira_get_transitions',
      description: 'Gets available transitions for a Jira issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'Issue key (e.g., "PROJ-123")',
          },
        },
        required: ['issueKey'],
      },
    },
    handler: async (params, credentials) => {
      const { issueKey } = params as { issueKey: string };
      return jiraRequest(`/issue/${issueKey}/transitions`, credentials);
    },
  },

  jira_update_issue: {
    definition: {
      name: 'jira_update_issue',
      description: 'Updates an existing Jira issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'Issue key (e.g., "PROJ-123")',
          },
          summary: {
            type: 'string',
            description: 'New issue summary',
          },
          description: {
            type: 'string',
            description: 'New issue description',
          },
          priority: {
            type: 'string',
            description: 'New priority',
          },
          assigneeAccountId: {
            type: 'string',
            description: 'New assignee account ID (set to null to unassign)',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'New array of labels',
          },
          dueDate: {
            type: 'string',
            description: 'New due date in YYYY-MM-DD format',
          },
        },
        required: ['issueKey'],
      },
    },
    handler: async (params, credentials) => {
      const { issueKey, summary, description, priority, assigneeAccountId, labels, dueDate } =
        params as {
          issueKey: string;
          summary?: string;
          description?: string;
          priority?: string;
          assigneeAccountId?: string;
          labels?: string[];
          dueDate?: string;
        };

      const fields: Record<string, unknown> = {};

      if (summary) fields.summary = summary;

      if (description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        };
      }

      if (priority) fields.priority = { name: priority };
      if (assigneeAccountId)
        fields.assignee = assigneeAccountId === 'null' ? null : { accountId: assigneeAccountId };
      if (labels) fields.labels = labels;
      if (dueDate) fields.duedate = dueDate;

      return jiraRequest(`/issue/${issueKey}`, credentials, {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      });
    },
  },

  jira_add_comment: {
    definition: {
      name: 'jira_add_comment',
      description: 'Adds a comment to a Jira issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'Issue key (e.g., "PROJ-123")',
          },
          comment: {
            type: 'string',
            description: 'Comment text (supports Jira markdown/ADF format)',
          },
        },
        required: ['issueKey', 'comment'],
      },
    },
    handler: async (params, credentials) => {
      const { issueKey, comment } = params as {
        issueKey: string;
        comment: string;
      };

      const body = {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: comment }],
            },
          ],
        },
      };

      return jiraRequest(`/issue/${issueKey}/comment`, credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },
};

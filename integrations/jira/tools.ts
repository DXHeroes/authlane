/**
 * Jira integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface JiraTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const jiraTools: JiraTool[] = [
  {
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
  {
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
  {
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
          description: 'Transition ID to execute (use jira_get_transitions to get available transitions)',
        },
        transitionName: {
          type: 'string',
          description: 'Transition name (alternative to transitionId, e.g., "Start Progress", "Done")',
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
  {
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
  {
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
  {
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
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: JiraTool[] } {
  return { tools: jiraTools };
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
    functions: jiraTools.map((tool) => ({
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

/**
 * Linear integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface LinearTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const linearTools: LinearTool[] = [
  {
    name: 'linear_create_issue',
    description: 'Creates a new issue in a Linear team',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Team ID where the issue will be created',
        },
        title: {
          type: 'string',
          description: 'Issue title',
        },
        description: {
          type: 'string',
          description: 'Issue description (supports markdown)',
        },
        priority: {
          type: 'number',
          description: 'Issue priority (0-4, where 0 is no priority and 4 is urgent)',
          minimum: 0,
          maximum: 4,
        },
        stateId: {
          type: 'string',
          description: 'State ID for the issue (e.g., backlog, todo, in progress)',
        },
        assigneeId: {
          type: 'string',
          description: 'User ID to assign the issue to',
        },
        labelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs to apply to the issue',
        },
      },
      required: ['teamId', 'title'],
    },
  },
  {
    name: 'linear_list_issues',
    description: 'Lists issues from Linear workspace with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Filter issues by team ID',
        },
        assigneeId: {
          type: 'string',
          description: 'Filter issues by assignee ID',
        },
        state: {
          type: 'string',
          description: 'Filter by state name (e.g., "Todo", "In Progress", "Done")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 50)',
          default: 50,
        },
        includeArchived: {
          type: 'boolean',
          description: 'Include archived issues in results',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'linear_update_issue',
    description: 'Updates an existing Linear issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: {
          type: 'string',
          description: 'Issue ID to update',
        },
        title: {
          type: 'string',
          description: 'New issue title',
        },
        description: {
          type: 'string',
          description: 'New issue description',
        },
        priority: {
          type: 'number',
          description: 'New priority (0-4)',
          minimum: 0,
          maximum: 4,
        },
        stateId: {
          type: 'string',
          description: 'New state ID',
        },
        assigneeId: {
          type: 'string',
          description: 'New assignee ID (set to null to unassign)',
        },
        labelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'New array of label IDs',
        },
      },
      required: ['issueId'],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: LinearTool[] } {
  return { tools: linearTools };
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
    functions: linearTools.map((tool) => ({
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

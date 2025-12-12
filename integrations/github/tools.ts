/**
 * GitHub integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface GitHubTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const githubTools: GitHubTool[] = [
  {
    name: 'github_create_issue',
    description: 'Creates a new issue in a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Repository owner (username or organization)',
        },
        repo: {
          type: 'string',
          description: 'Repository name',
        },
        title: {
          type: 'string',
          description: 'Issue title',
        },
        body: {
          type: 'string',
          description: 'Issue body (markdown supported)',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply to the issue',
        },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  {
    name: 'github_list_issues',
    description: 'Lists issues in a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Repository owner',
        },
        repo: {
          type: 'string',
          description: 'Repository name',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Issue state filter',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of issues to return',
        },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_create_pull_request',
    description: 'Creates a new pull request in a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Repository owner',
        },
        repo: {
          type: 'string',
          description: 'Repository name',
        },
        title: {
          type: 'string',
          description: 'Pull request title',
        },
        body: {
          type: 'string',
          description: 'Pull request body',
        },
        head: {
          type: 'string',
          description: 'Branch to merge from',
        },
        base: {
          type: 'string',
          description: 'Branch to merge into',
        },
      },
      required: ['owner', 'repo', 'title', 'head', 'base'],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: GitHubTool[] } {
  return { tools: githubTools };
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
    functions: githubTools.map((tool) => ({
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








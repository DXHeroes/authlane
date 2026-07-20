/**
 * GitHub Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make GitHub API request with OAuth token
 */
async function githubRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`GitHub API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * GitHub Tools
 */
export const tools: Record<string, ToolHandler> = {
  github_create_issue: {
    definition: {
      name: 'github_create_issue',
      description: 'Creates a new issue in a GitHub repository',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
    handler: async (params, credentials) => {
      const { owner, repo, title, body, labels } = params as {
        owner: string;
        repo: string;
        title: string;
        body?: string;
        labels?: string[];
      };

      return githubRequest(`/repos/${owner}/${repo}/issues`, credentials, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels }),
      });
    },
  },

  github_list_issues: {
    definition: {
      name: 'github_list_issues',
      description: 'Lists issues in a GitHub repository',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
            description: 'Maximum number of issues to return (max 100)',
          },
        },
        required: ['owner', 'repo'],
      },
    },
    handler: async (params, credentials) => {
      const {
        owner,
        repo,
        state = 'open',
        limit = 30,
      } = params as {
        owner: string;
        repo: string;
        state?: 'open' | 'closed' | 'all';
        limit?: number;
      };

      const per_page = Math.min(limit, 100);
      return githubRequest(
        `/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}`,
        credentials
      );
    },
  },

  github_create_pull_request: {
    definition: {
      name: 'github_create_pull_request',
      description: 'Creates a new pull request in a GitHub repository',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
          draft: {
            type: 'boolean',
            description: 'Create as draft PR',
          },
        },
        required: ['owner', 'repo', 'title', 'head', 'base'],
      },
    },
    handler: async (params, credentials) => {
      const {
        owner,
        repo,
        title,
        body,
        head,
        base,
        draft = false,
      } = params as {
        owner: string;
        repo: string;
        title: string;
        body?: string;
        head: string;
        base: string;
        draft?: boolean;
      };

      return githubRequest(`/repos/${owner}/${repo}/pulls`, credentials, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, head, base, draft }),
      });
    },
  },

  github_list_repos: {
    definition: {
      name: 'github_list_repos',
      description: 'List repositories for the authenticated user or an organization',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['all', 'owner', 'public', 'private', 'member'],
            description: 'Type of repositories to list',
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'pushed', 'full_name'],
            description: 'Sort repositories by',
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of repos to return (max 100)',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        type = 'owner',
        sort = 'updated',
        direction = 'desc',
        limit = 30,
      } = params as {
        type?: 'all' | 'owner' | 'public' | 'private' | 'member';
        sort?: 'created' | 'updated' | 'pushed' | 'full_name';
        direction?: 'asc' | 'desc';
        limit?: number;
      };

      const per_page = Math.min(limit, 100);
      return githubRequest(
        `/user/repos?type=${type}&sort=${sort}&direction=${direction}&per_page=${per_page}`,
        credentials
      );
    },
  },

  github_get_file: {
    definition: {
      name: 'github_get_file',
      description: 'Get the contents of a file from a GitHub repository',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
          path: {
            type: 'string',
            description: 'File path in the repository',
          },
          ref: {
            type: 'string',
            description: 'Branch, tag, or commit SHA (defaults to default branch)',
          },
        },
        required: ['owner', 'repo', 'path'],
      },
    },
    handler: async (params, credentials) => {
      const { owner, repo, path, ref } = params as {
        owner: string;
        repo: string;
        path: string;
        ref?: string;
      };

      const refParam = ref ? `?ref=${ref}` : '';
      const result = (await githubRequest(
        `/repos/${owner}/${repo}/contents/${path}${refParam}`,
        credentials
      )) as { content?: string; encoding?: string; type: string };

      // Decode base64 content
      if (result.content && result.encoding === 'base64') {
        const decoded = Buffer.from(result.content, 'base64').toString('utf-8');
        return { ...result, decodedContent: decoded };
      }

      return result;
    },
  },

  github_create_file: {
    definition: {
      name: 'github_create_file',
      description: 'Create or update a file in a GitHub repository',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
          path: {
            type: 'string',
            description: 'File path in the repository',
          },
          message: {
            type: 'string',
            description: 'Commit message',
          },
          content: {
            type: 'string',
            description: 'File content (will be base64 encoded)',
          },
          branch: {
            type: 'string',
            description: 'Branch to commit to (defaults to default branch)',
          },
          sha: {
            type: 'string',
            description: 'SHA of file being replaced (required for updates)',
          },
        },
        required: ['owner', 'repo', 'path', 'message', 'content'],
      },
    },
    handler: async (params, credentials) => {
      const { owner, repo, path, message, content, branch, sha } = params as {
        owner: string;
        repo: string;
        path: string;
        message: string;
        content: string;
        branch?: string;
        sha?: string;
      };

      // Encode content to base64
      const encodedContent = Buffer.from(content).toString('base64');

      const body: Record<string, unknown> = {
        message,
        content: encodedContent,
      };

      if (branch) body.branch = branch;
      if (sha) body.sha = sha;

      return githubRequest(`/repos/${owner}/${repo}/contents/${path}`, credentials, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  },

  github_search_code: {
    definition: {
      name: 'github_search_code',
      description: 'Search for code across GitHub repositories',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (supports GitHub code search syntax)',
          },
          sort: {
            type: 'string',
            enum: ['indexed'],
            description: 'Sort results by indexed time',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort order',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (max 100)',
          },
        },
        required: ['query'],
      },
    },
    handler: async (params, credentials) => {
      const {
        query,
        sort,
        order = 'desc',
        limit = 30,
      } = params as {
        query: string;
        sort?: 'indexed';
        order?: 'asc' | 'desc';
        limit?: number;
      };

      const per_page = Math.min(limit, 100);
      const sortParam = sort ? `&sort=${sort}` : '';
      const encodedQuery = encodeURIComponent(query);

      return githubRequest(
        `/search/code?q=${encodedQuery}${sortParam}&order=${order}&per_page=${per_page}`,
        credentials
      );
    },
  },

  github_list_pull_requests: {
    definition: {
      name: 'github_list_pull_requests',
      description: 'List pull requests in a GitHub repository',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
            description: 'PR state filter',
          },
          head: {
            type: 'string',
            description: 'Filter by head branch (user:ref-name)',
          },
          base: {
            type: 'string',
            description: 'Filter by base branch',
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'popularity', 'long-running'],
            description: 'Sort PRs by',
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of PRs to return (max 100)',
          },
        },
        required: ['owner', 'repo'],
      },
    },
    handler: async (params, credentials) => {
      const {
        owner,
        repo,
        state = 'open',
        head,
        base,
        sort = 'created',
        direction = 'desc',
        limit = 30,
      } = params as {
        owner: string;
        repo: string;
        state?: 'open' | 'closed' | 'all';
        head?: string;
        base?: string;
        sort?: 'created' | 'updated' | 'popularity' | 'long-running';
        direction?: 'asc' | 'desc';
        limit?: number;
      };

      const per_page = Math.min(limit, 100);
      const headParam = head ? `&head=${head}` : '';
      const baseParam = base ? `&base=${base}` : '';

      return githubRequest(
        `/repos/${owner}/${repo}/pulls?state=${state}&sort=${sort}&direction=${direction}${headParam}${baseParam}&per_page=${per_page}`,
        credentials
      );
    },
  },
};

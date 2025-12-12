# Creating Integrations

Step-by-step guide to creating new Authlane integrations.

## Prerequisites

- Authlane development environment set up
- OAuth credentials from the service you're integrating
- Understanding of the service's API

## Step 1: Create Integration Directory

```bash
# Copy template
cp -r integrations/_template integrations/newservice

# Or create manually
mkdir -p integrations/newservice
```

## Step 2: Configure OAuth

Create `config.yaml` with the OAuth configuration:

```yaml
# integrations/newservice/config.yaml
id: newservice
name: New Service
description: Connect to New Service for task management
authType: oauth2

oauth:
  # OAuth endpoints
  authorization_url: https://newservice.com/oauth2/authorize
  token_url: https://newservice.com/oauth2/token

  # Scopes to request
  scopes:
    - read:user
    - read:tasks
    - write:tasks

  # Optional OAuth settings
  scope_separator: " "           # Space-separated scopes
  response_type: code            # Authorization code flow
  pkce: true                     # Enable PKCE (recommended)

metadata:
  icon: https://newservice.com/icon.svg
  color: "#4285f4"
  description: Task management and collaboration
  documentation_url: https://docs.newservice.com/api
  category: productivity
```

### OAuth Configuration Reference

| Field | Required | Description |
|-------|----------|-------------|
| `authorization_url` | Yes | OAuth authorize endpoint |
| `token_url` | Yes | Token exchange endpoint |
| `scopes` | Yes | Required OAuth scopes |
| `scope_separator` | No | Scope delimiter (default: space) |
| `response_type` | No | OAuth response type (default: code) |
| `pkce` | No | Enable PKCE (default: true) |
| `token_auth_method` | No | `body` or `header` (default: body) |

## Step 3: Define Types

Create TypeScript types for API responses:

```typescript
// integrations/newservice/types.ts

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
}

// API Response types
export interface ListTasksResponse {
  tasks: Task[];
  nextCursor?: string;
}

export interface CreateTaskParams {
  title: string;
  description?: string;
  projectId: string;
  assigneeId?: string;
}
```

## Step 4: Implement Tools

Create tool implementations:

```typescript
// integrations/newservice/tools.ts
import { defineTool, type Credentials, type ToolContext } from '@authlane/integrations';
import type { Task, ListTasksResponse, CreateTaskParams } from './types';

const BASE_URL = 'https://api.newservice.com/v1';

// Helper for API requests
async function apiRequest<T>(
  path: string,
  credentials: Credentials,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

// Tool definitions
export const tools = [
  // List tasks
  defineTool({
    name: 'newservice_list_tasks',
    description: 'List tasks from New Service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter by project ID',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in_progress', 'done'],
          description: 'Filter by status',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum tasks to return',
        },
      },
    },
    handler: async (params, credentials) => {
      const query = new URLSearchParams();
      if (params.projectId) query.set('project', params.projectId);
      if (params.status) query.set('status', params.status);
      if (params.limit) query.set('limit', String(params.limit));

      return apiRequest<ListTasksResponse>(
        `/tasks?${query}`,
        credentials
      );
    },
  }),

  // Create task
  defineTool({
    name: 'newservice_create_task',
    description: 'Create a new task in New Service',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title',
        },
        description: {
          type: 'string',
          description: 'Task description (markdown supported)',
        },
        projectId: {
          type: 'string',
          description: 'Project to add task to',
        },
        assigneeId: {
          type: 'string',
          description: 'User ID to assign',
        },
      },
      required: ['title', 'projectId'],
    },
    handler: async (params: CreateTaskParams, credentials) => {
      return apiRequest<Task>('/tasks', credentials, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  }),

  // Update task status
  defineTool({
    name: 'newservice_update_task',
    description: 'Update a task in New Service',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'Task ID to update',
        },
        title: { type: 'string' },
        description: { type: 'string' },
        status: {
          type: 'string',
          enum: ['todo', 'in_progress', 'done'],
        },
        assigneeId: { type: 'string' },
      },
      required: ['taskId'],
    },
    handler: async (params, credentials) => {
      const { taskId, ...updates } = params;
      return apiRequest<Task>(`/tasks/${taskId}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
  }),

  // List projects
  defineTool({
    name: 'newservice_list_projects',
    description: 'List projects from New Service',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (params, credentials) => {
      return apiRequest<{ projects: Project[] }>('/projects', credentials);
    },
  }),
];
```

## Step 5: Create Index File

```typescript
// integrations/newservice/index.ts
import config from './config.yaml';
import { tools } from './tools';

export { config, tools };
export * from './types';
```

## Step 6: Register Integration

Add the integration to the registry:

```typescript
// integrations/index.ts
import * as github from './github';
import * as slack from './slack';
import * as newservice from './newservice';  // Add this

export const integrations = {
  github,
  slack,
  newservice,  // Add this
};
```

## Step 7: Test the Integration

### Unit Tests

```typescript
// integrations/newservice/tools.test.ts
import { tools } from './tools';

describe('newservice tools', () => {
  const mockCredentials = {
    access_token: 'test_token',
    token_type: 'bearer',
  };

  it('should list tasks', async () => {
    const listTasks = tools.find(t => t.name === 'newservice_list_tasks');

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tasks: [] }),
    });

    const result = await listTasks.handler({}, mockCredentials);
    expect(result.tasks).toEqual([]);
  });
});
```

### Integration Tests

```bash
# Start development server
pnpm dev

# Test OAuth flow manually
open http://localhost:3000/oauth/newservice

# Test tool execution
curl -X POST http://localhost:3000/api/v1/users/test/tools/newservice_list_tasks/execute \
  -H "Authorization: Bearer ak_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Step 8: Add Documentation

Create service documentation:

```markdown
<!-- integrations/newservice/README.md -->
# New Service Integration

Connect Authlane to New Service for task management.

## Setup

1. Create OAuth app at https://newservice.com/settings/developers
2. Set redirect URI to: `https://your-authlane.com/api/v1/oauth/callback`
3. Add credentials to organization settings

## Available Tools

- `newservice_list_tasks` - List tasks
- `newservice_create_task` - Create a task
- `newservice_update_task` - Update a task
- `newservice_list_projects` - List projects

## Required Scopes

- `read:tasks` - Read task data
- `write:tasks` - Create/update tasks
- `read:user` - Read user information
```

## Best Practices

### Error Handling

```typescript
handler: async (params, credentials) => {
  try {
    return await apiRequest('/endpoint', credentials);
  } catch (error) {
    // Return structured error
    return {
      error: true,
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
    };
  }
}
```

### Rate Limiting

```typescript
// Implement rate limiting awareness
const response = await fetch(url, options);

if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
}
```

### Pagination

```typescript
defineTool({
  name: 'newservice_list_all',
  inputSchema: {
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
    },
  },
  handler: async (params, credentials) => {
    const response = await apiRequest(`/items?cursor=${params.cursor || ''}`);
    return {
      items: response.items,
      nextCursor: response.nextCursor,
      hasMore: !!response.nextCursor,
    };
  },
});
```

### Security

- Never log access tokens
- Validate all input parameters
- Use HTTPS only
- Handle credential expiration gracefully

## Checklist

- [ ] `config.yaml` configured correctly
- [ ] Types defined for all API responses
- [ ] All tools implemented with proper schemas
- [ ] Error handling added
- [ ] Unit tests written
- [ ] Integration tested manually
- [ ] Documentation added
- [ ] Registered in integrations index


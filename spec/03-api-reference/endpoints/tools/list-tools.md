# List Tools

Retrieve tool definitions for a user's connected services.

## Endpoint

```
GET /api/v1/users/:userId/tools
```

## Authentication

- **API Key**: Required
- **Session**: Allowed

## Parameters

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | External user ID |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | string | No | Output format: "mcp" (default) or "openai" |
| `serviceId` | string | No | Filter to specific service |

## Response

### MCP Format (default)

```json
{
  "data": {
    "tools": [
      {
        "name": "github_create_issue",
        "description": "Creates a new issue in a GitHub repository",
        "inputSchema": {
          "type": "object",
          "properties": {
            "owner": {
              "type": "string",
              "description": "Repository owner"
            },
            "repo": {
              "type": "string",
              "description": "Repository name"
            },
            "title": {
              "type": "string",
              "description": "Issue title"
            },
            "body": {
              "type": "string",
              "description": "Issue body (markdown)"
            },
            "labels": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Labels to apply"
            }
          },
          "required": ["owner", "repo", "title"]
        }
      },
      {
        "name": "github_list_repos",
        "description": "List repositories for the authenticated user",
        "inputSchema": {
          "type": "object",
          "properties": {
            "visibility": {
              "type": "string",
              "enum": ["all", "public", "private"],
              "description": "Filter by visibility"
            },
            "sort": {
              "type": "string",
              "enum": ["created", "updated", "pushed", "full_name"],
              "description": "Sort order"
            }
          }
        }
      }
    ]
  },
  "error": null
}
```

### OpenAI Format

```json
{
  "data": {
    "functions": [
      {
        "name": "github_create_issue",
        "description": "Creates a new issue in a GitHub repository",
        "parameters": {
          "type": "object",
          "properties": {
            "owner": {
              "type": "string",
              "description": "Repository owner"
            },
            "repo": {
              "type": "string",
              "description": "Repository name"
            },
            "title": {
              "type": "string",
              "description": "Issue title"
            },
            "body": {
              "type": "string",
              "description": "Issue body (markdown)"
            }
          },
          "required": ["owner", "repo", "title"]
        }
      }
    ]
  },
  "error": null
}
```

## Examples

### cURL

```bash
# Get MCP format tools
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/tools"

# Get OpenAI format
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/tools?format=openai"

# Filter to specific service
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/tools?serviceId=github"
```

### TypeScript SDK

```typescript
// MCP format (default)
const { data, error } = await authlane.tools.list({
  userId: 'user_456',
});

// OpenAI format
const { data, error } = await authlane.tools.list({
  userId: 'user_456',
  format: 'openai',
});
```

### Using with Claude (MCP)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Get user's available tools
const { data } = await authlane.tools.list({
  userId: currentUser.id,
  format: 'mcp',
});

// Use with Claude
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools: data.tools,  // Pass Authlane tools
  messages: [
    { role: 'user', content: 'Create an issue on my repo...' }
  ],
});
```

### Using with OpenAI

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

// Get user's available tools
const { data } = await authlane.tools.list({
  userId: currentUser.id,
  format: 'openai',
});

// Use with GPT
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Create an issue on my repo...' }
  ],
  functions: data.functions,  // Pass Authlane functions
});
```

## Tool Format Comparison

### MCP Format

Used by Claude Desktop, MCP servers, and Anthropic SDK:

```json
{
  "name": "tool_name",
  "description": "What the tool does",
  "inputSchema": {
    "type": "object",
    "properties": { ... },
    "required": [ ... ]
  }
}
```

### OpenAI Format

Used by OpenAI GPT models and compatible APIs:

```json
{
  "name": "tool_name",
  "description": "What the tool does",
  "parameters": {
    "type": "object",
    "properties": { ... },
    "required": [ ... ]
  }
}
```

## Available Tools by Service

### GitHub

- `github_create_issue` - Create an issue
- `github_list_issues` - List issues
- `github_create_pull_request` - Create a PR
- `github_list_repos` - List repositories
- `github_get_file` - Get file contents
- `github_create_file` - Create/update file

### Slack

- `slack_send_message` - Send a message
- `slack_list_channels` - List channels
- `slack_list_users` - List users

*(See integration documentation for full tool lists)*

## Notes

- Only tools for connected services are returned
- Tools require active (non-expired) connections
- Tool definitions are loaded from the integrations directory
- Custom tools can be defined per organization (Enterprise)

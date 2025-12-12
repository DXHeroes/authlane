# GitHub Integration

Connect Authlane to GitHub for repository, issue, and pull request management.

## Overview

| Property | Value |
|----------|-------|
| Service ID | `github` |
| Auth Type | OAuth 2.0 |
| PKCE | Required |
| Tools | 8 |

## Setup

### 1. Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Your app name
   - **Homepage URL**: Your app URL
   - **Authorization callback URL**: `https://your-authlane.com/api/v1/oauth/callback`

### 2. Configure in Authlane

Add your GitHub OAuth credentials in the dashboard:

1. Go to Dashboard → Services → GitHub
2. Enter Client ID and Client Secret
3. Save configuration

### 3. Or Use Environment Variables

```bash
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxx
```

## OAuth Configuration

```yaml
id: github
name: GitHub
authType: oauth2

oauth:
  authorization_url: https://github.com/login/oauth/authorize
  token_url: https://github.com/login/oauth/access_token
  scopes:
    - repo
    - user
    - read:org

metadata:
  icon: https://github.githubassets.com/favicons/favicon.svg
  color: "#24292e"
  description: Repositories, issues, pull requests
  documentation_url: https://docs.github.com/en/rest
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `repo` | Full access to repositories |
| `user` | Read user profile data |
| `read:org` | Read organization data |
| `admin:repo_hook` | Manage webhooks |
| `write:repo_hook` | Create webhooks |
| `delete_repo` | Delete repositories |

## Available Tools

### github_list_repos

List repositories for the authenticated user.

```json
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
        "description": "Sort field"
      },
      "direction": {
        "type": "string",
        "enum": ["asc", "desc"]
      },
      "per_page": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    }
  }
}
```

**Example:**
```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'github_list_repos',
  parameters: {
    visibility: 'public',
    sort: 'updated',
    per_page: 10,
  },
});
```

### github_create_issue

Create a new issue in a repository.

```json
{
  "name": "github_create_issue",
  "description": "Create a new issue in a GitHub repository",
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
        "description": "Issue body (markdown supported)"
      },
      "labels": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Labels to apply"
      },
      "assignees": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Usernames to assign"
      },
      "milestone": {
        "type": "integer",
        "description": "Milestone number"
      }
    },
    "required": ["owner", "repo", "title"]
  }
}
```

**Example:**
```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'github_create_issue',
  parameters: {
    owner: 'acme',
    repo: 'my-project',
    title: 'Bug: Login button not working',
    body: '## Description\n\nThe login button...',
    labels: ['bug', 'high-priority'],
    assignees: ['johndoe'],
  },
});
```

### github_list_issues

List issues in a repository.

```json
{
  "name": "github_list_issues",
  "description": "List issues in a GitHub repository",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "state": {
        "type": "string",
        "enum": ["open", "closed", "all"]
      },
      "labels": {
        "type": "string",
        "description": "Comma-separated labels"
      },
      "assignee": { "type": "string" },
      "sort": {
        "type": "string",
        "enum": ["created", "updated", "comments"]
      },
      "per_page": { "type": "integer" }
    },
    "required": ["owner", "repo"]
  }
}
```

### github_create_pull_request

Create a pull request.

```json
{
  "name": "github_create_pull_request",
  "description": "Create a pull request",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "title": { "type": "string" },
      "body": { "type": "string" },
      "head": {
        "type": "string",
        "description": "Branch containing changes"
      },
      "base": {
        "type": "string",
        "description": "Branch to merge into"
      },
      "draft": {
        "type": "boolean",
        "description": "Create as draft PR"
      }
    },
    "required": ["owner", "repo", "title", "head", "base"]
  }
}
```

### github_get_file

Get file contents from a repository.

```json
{
  "name": "github_get_file",
  "description": "Get file contents from a GitHub repository",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "path": {
        "type": "string",
        "description": "File path in repository"
      },
      "ref": {
        "type": "string",
        "description": "Branch, tag, or commit SHA"
      }
    },
    "required": ["owner", "repo", "path"]
  }
}
```

### github_create_file

Create or update a file in a repository.

```json
{
  "name": "github_create_file",
  "description": "Create or update a file",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "path": { "type": "string" },
      "content": {
        "type": "string",
        "description": "File content"
      },
      "message": {
        "type": "string",
        "description": "Commit message"
      },
      "branch": { "type": "string" },
      "sha": {
        "type": "string",
        "description": "SHA of file being replaced (for updates)"
      }
    },
    "required": ["owner", "repo", "path", "content", "message"]
  }
}
```

### github_search_code

Search code across repositories.

```json
{
  "name": "github_search_code",
  "description": "Search code in GitHub repositories",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      },
      "repo": {
        "type": "string",
        "description": "Limit to repository (owner/repo)"
      },
      "language": { "type": "string" },
      "per_page": { "type": "integer" }
    },
    "required": ["query"]
  }
}
```

### github_list_pull_requests

List pull requests in a repository.

```json
{
  "name": "github_list_pull_requests",
  "description": "List pull requests",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "state": {
        "type": "string",
        "enum": ["open", "closed", "all"]
      },
      "head": { "type": "string" },
      "base": { "type": "string" },
      "sort": {
        "type": "string",
        "enum": ["created", "updated", "popularity", "long-running"]
      }
    },
    "required": ["owner", "repo"]
  }
}
```

## Rate Limits

GitHub API rate limits:

| Type | Limit |
|------|-------|
| Authenticated | 5,000 requests/hour |
| Search API | 30 requests/minute |

Authlane handles rate limit errors and returns them in the response.

## Error Handling

Common errors:

| Code | Description |
|------|-------------|
| 401 | Bad credentials (token expired) |
| 403 | Rate limited or forbidden |
| 404 | Resource not found |
| 422 | Validation failed |

## Use Cases

### AI Assistant Creating Issues

```
User: Create an issue for the login bug in my repo

Claude: I'll create that issue for you.
[Uses github_create_issue]

Done! Created issue #42 "Login bug" in acme/my-project.
https://github.com/acme/my-project/issues/42
```

### Automated Code Review

```typescript
// Get PR files
const { data: pr } = await authlane.tools.execute({
  tool: 'github_list_pull_requests',
  parameters: { owner, repo, state: 'open' },
});

// Get changed files
for (const pull of pr) {
  const { data: files } = await authlane.tools.execute({
    tool: 'github_get_file',
    parameters: { owner, repo, path: 'src/index.ts', ref: pull.head.sha },
  });
  // Analyze with AI...
}
```


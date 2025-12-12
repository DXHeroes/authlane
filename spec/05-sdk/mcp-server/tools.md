# MCP Server Available Tools

List of tools available through the Authlane MCP Server.

## Overview

The MCP Server exposes tools based on the user's connected services. Only tools for services with active connections are available.

## Tool Naming Convention

Tools follow the pattern: `{service}_{action}`

Examples:
- `github_create_issue`
- `slack_send_message`
- `linear_list_issues`

## GitHub Tools

Available when user has connected GitHub.

### github_list_repos

List repositories accessible to the user.

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
      }
    }
  }
}
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
        "description": "Issue body (markdown)"
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
      }
    },
    "required": ["owner", "repo", "title"]
  }
}
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
      }
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
  "description": "Create a pull request in a GitHub repository",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "title": { "type": "string" },
      "body": { "type": "string" },
      "head": {
        "type": "string",
        "description": "Branch with changes"
      },
      "base": {
        "type": "string",
        "description": "Branch to merge into"
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
        "description": "Branch, tag, or commit"
      }
    },
    "required": ["owner", "repo", "path"]
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
      }
    },
    "required": ["query"]
  }
}
```

---

## Slack Tools

Available when user has connected Slack.

### slack_send_message

Send a message to a channel.

```json
{
  "name": "slack_send_message",
  "description": "Send a message to a Slack channel",
  "inputSchema": {
    "type": "object",
    "properties": {
      "channel": {
        "type": "string",
        "description": "Channel ID or name"
      },
      "text": {
        "type": "string",
        "description": "Message text"
      },
      "thread_ts": {
        "type": "string",
        "description": "Thread timestamp (for replies)"
      }
    },
    "required": ["channel", "text"]
  }
}
```

### slack_list_channels

List channels in workspace.

```json
{
  "name": "slack_list_channels",
  "description": "List Slack channels",
  "inputSchema": {
    "type": "object",
    "properties": {
      "types": {
        "type": "string",
        "description": "Channel types: public_channel, private_channel"
      },
      "limit": { "type": "integer" }
    }
  }
}
```

### slack_list_users

List users in workspace.

```json
{
  "name": "slack_list_users",
  "description": "List Slack workspace users",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": { "type": "integer" }
    }
  }
}
```

---

## Linear Tools

Available when user has connected Linear.

### linear_create_issue

Create a Linear issue.

```json
{
  "name": "linear_create_issue",
  "description": "Create a new Linear issue",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "description": { "type": "string" },
      "teamId": { "type": "string" },
      "priority": {
        "type": "integer",
        "minimum": 0,
        "maximum": 4
      },
      "labelIds": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["title", "teamId"]
  }
}
```

### linear_list_issues

List Linear issues.

```json
{
  "name": "linear_list_issues",
  "description": "List Linear issues",
  "inputSchema": {
    "type": "object",
    "properties": {
      "teamId": { "type": "string" },
      "state": {
        "type": "string",
        "description": "Filter by state"
      },
      "first": {
        "type": "integer",
        "description": "Number of issues"
      }
    }
  }
}
```

### linear_update_issue

Update a Linear issue.

```json
{
  "name": "linear_update_issue",
  "description": "Update a Linear issue",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueId": { "type": "string" },
      "title": { "type": "string" },
      "description": { "type": "string" },
      "stateId": { "type": "string" },
      "priority": { "type": "integer" }
    },
    "required": ["issueId"]
  }
}
```

---

## Google Tools

Available when user has connected Google.

### google_list_calendar_events

List calendar events.

```json
{
  "name": "google_list_calendar_events",
  "description": "List Google Calendar events",
  "inputSchema": {
    "type": "object",
    "properties": {
      "calendarId": {
        "type": "string",
        "default": "primary"
      },
      "timeMin": {
        "type": "string",
        "description": "Start time (ISO 8601)"
      },
      "timeMax": {
        "type": "string",
        "description": "End time (ISO 8601)"
      },
      "maxResults": { "type": "integer" }
    }
  }
}
```

### google_create_calendar_event

Create a calendar event.

```json
{
  "name": "google_create_calendar_event",
  "description": "Create a Google Calendar event",
  "inputSchema": {
    "type": "object",
    "properties": {
      "calendarId": { "type": "string" },
      "summary": { "type": "string" },
      "description": { "type": "string" },
      "start": {
        "type": "object",
        "properties": {
          "dateTime": { "type": "string" },
          "timeZone": { "type": "string" }
        }
      },
      "end": {
        "type": "object",
        "properties": {
          "dateTime": { "type": "string" },
          "timeZone": { "type": "string" }
        }
      },
      "attendees": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": { "email": { "type": "string" } }
        }
      }
    },
    "required": ["summary", "start", "end"]
  }
}
```

---

## Tool Discovery

Claude can discover available tools dynamically:

```
User: What tools do you have access to?

Claude: Based on your connected services, I have access to:

GitHub:
- github_list_repos - List your repositories
- github_create_issue - Create issues
- github_list_issues - List issues
- github_create_pull_request - Create PRs

Slack:
- slack_send_message - Send messages
- slack_list_channels - List channels

Would you like me to help with any of these?
```

## Using Tools

```
User: Create an issue in my acme/project repo about the login bug

Claude: I'll create that issue for you.

[Uses github_create_issue tool with:
  owner: "acme"
  repo: "project"
  title: "Login bug"
]

Done! I've created issue #42: "Login bug" in acme/project.
```

## Adding Custom Tools

Custom tools can be defined in integration configurations. See [Creating Integrations](../../06-integrations/creating-integrations.md).


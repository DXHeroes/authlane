# Integrations Documentation

Guide to Authlane service integrations and how to create custom integrations.

## Contents

- [Integration Structure](./integration-structure.md) - File structure and configuration
- [Creating Integrations](./creating-integrations.md) - How to add new services
- [Tool Definitions](./tool-definitions.md) - MCP and OpenAI tool formats

### Available Services

- [GitHub](./services/github.md)
- [Slack](./services/slack.md)
- [Linear](./services/linear.md)
- [Jira](./services/jira.md)
- [Notion](./services/notion.md)
- [Google Calendar](./services/google-calendar.md)
- [Google Drive](./services/google-drive.md)
- [Gmail](./services/gmail.md)
- [Discord](./services/discord.md)
- [HubSpot](./services/hubspot.md)
- [Salesforce](./services/salesforce.md)
- [Pipedrive](./services/pipedrive.md)
- [Stripe](./services/stripe.md) - OAuth connectivity (not payment processing)
- [Airtable](./services/airtable.md)

## Overview

Authlane integrations are self-contained modules that define how to connect and interact with third-party services. Each integration includes:

1. **Configuration** (`config.yaml`) - OAuth settings, scopes, metadata
2. **Tools** (`tools.ts`) - Actions that can be performed
3. **Types** (`types.ts`) - TypeScript type definitions

## Integration Directory Structure

```
integrations/
├── github/
│   ├── config.yaml      # OAuth configuration
│   ├── tools.ts         # Tool implementations
│   ├── types.ts         # Type definitions
│   └── index.ts         # Exports
├── slack/
│   ├── config.yaml
│   ├── tools.ts
│   ├── types.ts
│   └── index.ts
├── google/
│   └── ...
└── _template/           # Template for new integrations
    └── ...
```

## Quick Start: Adding a New Integration

### 1. Create Directory

```bash
cp -r integrations/_template integrations/newservice
```

### 2. Configure OAuth

```yaml
# integrations/newservice/config.yaml
id: newservice
name: New Service
description: Integration with New Service
authType: oauth2

oauth:
  authorization_url: https://newservice.com/oauth/authorize
  token_url: https://newservice.com/oauth/token
  scopes:
    - read
    - write

metadata:
  icon: https://newservice.com/icon.svg
  color: "#1a73e8"
  documentation_url: https://docs.newservice.com
```

### 3. Define Tools

```typescript
// integrations/newservice/tools.ts
import { defineTool } from '@authlane/integrations';

export const tools = [
  defineTool({
    name: 'newservice_list_items',
    description: 'List items from New Service',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max items to return' },
      },
    },
    handler: async (params, credentials) => {
      const response = await fetch('https://api.newservice.com/items', {
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
        },
      });
      return response.json();
    },
  }),
];
```

### 4. Export

```typescript
// integrations/newservice/index.ts
export { config } from './config';
export { tools } from './tools';
export * from './types';
```

## Available Integrations

| Service | Auth Type | Tools | Status |
|---------|-----------|-------|--------|
| GitHub | OAuth 2.0 | 8 | ✅ Stable |
| Slack | OAuth 2.0 | 5 | ✅ Stable |
| Google | OAuth 2.0 | 6 | ✅ Stable |
| Linear | OAuth 2.0 | 4 | ✅ Stable |
| Notion | OAuth 2.0 | 4 | ✅ Stable |
| Jira | OAuth 2.0 | 4 | 🚧 Beta |
| Discord | OAuth 2.0 | 3 | 🚧 Beta |
| Asana | OAuth 2.0 | 3 | 📋 Planned |

## OAuth Configuration

### Required Fields

```yaml
id: string           # Unique identifier
name: string         # Display name
authType: oauth2     # Authentication type

oauth:
  authorization_url: string  # OAuth authorize endpoint
  token_url: string          # OAuth token endpoint
  scopes: string[]           # Required OAuth scopes
```

### Optional Fields

```yaml
oauth:
  scope_separator: string    # Default: ' ' (space)
  response_type: string      # Default: 'code'
  grant_type: string         # Default: 'authorization_code'
  token_auth_method: string  # 'body' or 'header'

metadata:
  icon: string               # Icon URL
  color: string              # Brand color (hex)
  description: string        # Short description
  documentation_url: string  # API docs URL
  category: string           # Service category
```

## Tool Format

Tools can be exposed in two formats:

### MCP Format (Model Context Protocol)

```json
{
  "name": "github_create_issue",
  "description": "Create a new issue",
  "inputSchema": {
    "type": "object",
    "properties": { ... },
    "required": [ ... ]
  }
}
```

### OpenAI Format

```json
{
  "name": "github_create_issue",
  "description": "Create a new issue",
  "parameters": {
    "type": "object",
    "properties": { ... },
    "required": [ ... ]
  }
}
```

## Next Steps

- [Integration Structure](./integration-structure.md) - Detailed file structure
- [Creating Integrations](./creating-integrations.md) - Step-by-step guide
- [Tool Definitions](./tool-definitions.md) - Tool schema reference

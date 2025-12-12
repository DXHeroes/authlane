# Notion Integration

Connect to Notion for documentation and knowledge management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `notion` |
| **Name** | Notion |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Notion API](https://developers.notion.com/) |

## OAuth Configuration

### Authorization URL
```
https://api.notion.com/v1/oauth/authorize
```

### Token URL
```
https://api.notion.com/v1/oauth/token
```

## Scopes

Notion OAuth doesn't use traditional scopes. Access is controlled by:
- Which pages/databases the user shares with the integration
- The integration's capabilities defined during setup

### Default Scopes

```yaml
- [] # No explicit scopes needed
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'notion',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'notion',
});

// Search pages
const response = await fetch('https://api.notion.com/v1/search', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${creds.access_token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  },
  body: JSON.stringify({
    query: 'Meeting Notes',
    filter: { property: 'object', value: 'page' },
  }),
});
```

## Available Tools

### notion_search
Search pages and databases.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'notion_search',
  parameters: {
    query: 'Project Plan',
    filter: 'page', // 'page' or 'database'
  },
});
```

### notion_create_page
Create a new page.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'notion_create_page',
  parameters: {
    parentId: 'database-id',
    title: 'Meeting Notes - 2025-01-15',
    content: [
      { type: 'paragraph', text: 'Attendees: ...' },
    ],
  },
});
```

### notion_query_database
Query a Notion database.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'notion_query_database',
  parameters: {
    databaseId: 'database-id',
    filter: {
      property: 'Status',
      select: { equals: 'In Progress' },
    },
  },
});
```

## Setup Guide

### 1. Create Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Enter name and select workspace
4. Choose capabilities:
   - Read content
   - Update content
   - Insert content

### 2. Configure OAuth

1. In integration settings, enable "Public integration"
2. Add redirect URI: `https://your-domain.com/api/v1/oauth/callback/notion`
3. Copy OAuth client ID and secret

### 3. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'notion',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## Important Notes

### Page Sharing Required

Users must explicitly share pages/databases with the integration. Access is granted per-page, not workspace-wide.

### Notion-Version Header

All Notion API requests require the `Notion-Version` header:

```typescript
headers: {
  'Notion-Version': '2022-06-28',
}
```

Authlane tools handle this automatically.

### Block-Based Content

Notion uses blocks for content. Common block types:
- `paragraph`
- `heading_1`, `heading_2`, `heading_3`
- `bulleted_list_item`
- `numbered_list_item`
- `code`
- `to_do`

## Links

- [Notion API Documentation](https://developers.notion.com/)
- [API Reference](https://developers.notion.com/reference)
- [Integration Guide](https://developers.notion.com/docs/create-a-notion-integration)


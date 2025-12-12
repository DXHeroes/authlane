# Linear Integration

Connect to Linear for issue tracking and project management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `linear` |
| **Name** | Linear |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Linear API](https://developers.linear.app/) |

## OAuth Configuration

### Authorization URL
```
https://linear.app/oauth/authorize
```

### Token URL
```
https://api.linear.app/oauth/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `read` | Read access to all data |
| `write` | Write access to all data |
| `issues:create` | Create new issues |

### Default Scopes

```yaml
- read
- write
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'linear',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'linear',
});

// Query Linear GraphQL API
const response = await fetch('https://api.linear.app/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${creds.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `
      query {
        issues(first: 10) {
          nodes {
            id
            title
            state { name }
          }
        }
      }
    `,
  }),
});
```

## Available Tools

### linear_create_issue
Create a new issue in Linear.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'linear_create_issue',
  parameters: {
    teamId: 'team-uuid',
    title: 'Bug: Login not working',
    description: 'Users cannot log in...',
    priority: 1,
  },
});
```

### linear_list_issues
List issues with optional filters.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'linear_list_issues',
  parameters: {
    teamId: 'team-uuid',
    state: 'In Progress',
    limit: 25,
  },
});
```

## Setup Guide

### 1. Create Linear OAuth App

1. Go to [linear.app/settings/api](https://linear.app/settings/api)
2. Click "Create new application"
3. Enter application name
4. Add redirect URL: `https://your-domain.com/api/v1/oauth/callback/linear`

### 2. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'linear',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## GraphQL API

Linear uses a GraphQL API. Common queries:

### Get Teams

```graphql
query {
  teams {
    nodes {
      id
      name
      key
    }
  }
}
```

### Get Issue Details

```graphql
query($id: String!) {
  issue(id: $id) {
    id
    title
    description
    state { name }
    assignee { name }
    labels { nodes { name } }
  }
}
```

## Links

- [Linear API Documentation](https://developers.linear.app/)
- [GraphQL Schema](https://developers.linear.app/docs/graphql/schema)
- [OAuth Guide](https://developers.linear.app/docs/oauth/authentication)


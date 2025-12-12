# Jira Integration

Connect to Atlassian Jira for issue tracking and project management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `jira` |
| **Name** | Jira |
| **Auth Type** | OAuth 2.0 (Atlassian) |
| **Documentation** | [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) |

## OAuth Configuration

### Authorization URL
```
https://auth.atlassian.com/authorize
```

### Token URL
```
https://auth.atlassian.com/oauth/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `read:jira-work` | Read Jira project and issue data |
| `write:jira-work` | Create and edit issues |
| `read:jira-user` | Read user information |
| `offline_access` | Get refresh tokens |

### Default Scopes

```yaml
- read:jira-work
- write:jira-work
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'jira',
  scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'jira',
});

// First, get accessible resources (cloud IDs)
const resourcesResponse = await fetch(
  'https://api.atlassian.com/oauth/token/accessible-resources',
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
const resources = await resourcesResponse.json();
const cloudId = resources[0].id;

// Then make API calls using the cloud ID
const issuesResponse = await fetch(
  `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### jira_create_issue
Create a new Jira issue.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'jira_create_issue',
  parameters: {
    projectKey: 'PROJ',
    issueType: 'Bug',
    summary: 'Login page error',
    description: 'Users see error when logging in',
    priority: 'High',
  },
});
```

### jira_search_issues
Search issues using JQL.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'jira_search_issues',
  parameters: {
    jql: 'project = PROJ AND status = "In Progress"',
    maxResults: 50,
  },
});
```

## Setup Guide

### 1. Create Atlassian OAuth App

1. Go to [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/)
2. Click "Create" → "OAuth 2.0 integration"
3. Enter app name
4. Add callback URL: `https://your-domain.com/api/v1/oauth/callback/jira`

### 2. Configure Permissions

1. Navigate to "Permissions"
2. Add required scopes:
   - Jira API: `read:jira-work`, `write:jira-work`

### 3. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'jira',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## Important Notes

### Cloud ID Required

Jira Cloud uses cloud IDs to identify sites. After OAuth, you must:

1. Call `/oauth/token/accessible-resources` to get cloud IDs
2. Use the cloud ID in API requests

Authlane handles this automatically and stores the cloud ID with the connection.

### Multi-Site Access

Users may have access to multiple Jira sites. The connection stores all accessible sites:

```typescript
const { data } = await authlane.connections.get({
  userId: 'user_123',
  serviceId: 'jira',
});

console.log(data.metadata.sites);
// [{ id: 'cloud-id-1', name: 'Site 1' }, ...]
```

## Links

- [Jira REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Atlassian OAuth 2.0](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [JQL Reference](https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/)


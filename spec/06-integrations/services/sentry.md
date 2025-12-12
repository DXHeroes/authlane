# Sentry Integration

Connect to Sentry for error tracking and monitoring.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `sentry` |
| **Name** | Sentry |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Sentry API](https://docs.sentry.io/api/) |

## OAuth Configuration

### Authorization URL
```
https://sentry.io/oauth/authorize/
```

### Token URL
```
https://sentry.io/oauth/token/
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `project:read` | Read project data |
| `project:write` | Modify project settings |
| `event:read` | Read error events |
| `event:write` | Resolve/ignore events |

### Default Scopes

```yaml
- project:read
- event:read
- event:write
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'sentry',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'sentry',
});

// List issues
const response = await fetch(
  'https://sentry.io/api/0/projects/org-slug/project-slug/issues/',
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### sentry_list_issues
List issues in a project.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'sentry_list_issues',
  parameters: {
    organizationSlug: 'my-org',
    projectSlug: 'my-project',
    query: 'is:unresolved',
  },
});
```

### sentry_get_issue
Get issue details.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'sentry_get_issue',
  parameters: {
    issueId: '123456789',
  },
});
```

### sentry_resolve_issue
Resolve an issue.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'sentry_resolve_issue',
  parameters: {
    issueId: '123456789',
    status: 'resolved',
  },
});
```

## Setup Guide

### 1. Create Sentry Integration

1. Go to [sentry.io](https://sentry.io) → Settings
2. Navigate to Organization → Developer Settings
3. Click "Create New Integration"
4. Choose "Internal Integration" for your own use

### 2. Configure OAuth

1. Select "Public Integration" for OAuth
2. Add redirect URL: `https://your-domain.com/api/v1/oauth/callback/sentry`
3. Select required permissions

### 3. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'sentry',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## API Endpoints

### Projects
```
GET /api/0/projects/
GET /api/0/projects/{org}/{project}/
```

### Issues
```
GET /api/0/projects/{org}/{project}/issues/
GET /api/0/issues/{issue_id}/
PUT /api/0/issues/{issue_id}/
```

### Events
```
GET /api/0/issues/{issue_id}/events/
GET /api/0/projects/{org}/{project}/events/
```

## Links

- [Sentry API Documentation](https://docs.sentry.io/api/)
- [OAuth Guide](https://docs.sentry.io/api/guides/create-auth-token/)
- [Integration Platform](https://docs.sentry.io/product/integrations/integration-platform/)


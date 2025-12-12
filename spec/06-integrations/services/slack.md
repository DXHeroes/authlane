# Slack Integration

Connect to Slack for messaging and workspace management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `slack` |
| **Name** | Slack |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Slack API](https://api.slack.com/) |

## OAuth Configuration

### Authorization URL
```
https://slack.com/oauth/v2/authorize
```

### Token URL
```
https://slack.com/api/oauth.v2.access
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `chat:write` | Send messages as the app |
| `channels:read` | View basic channel information |
| `channels:manage` | Manage channels |
| `channels:write` | Create channels |
| `groups:read` | View private channels |
| `groups:write` | Create private channels |
| `im:read` | View direct messages |
| `im:write` | Send direct messages |
| `mpim:read` | View group direct messages |
| `mpim:write` | Send group direct messages |
| `users:read` | View users in workspace |

### Default Scopes

```yaml
- chat:write
- channels:read
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'slack',
  scopes: ['chat:write', 'channels:read', 'users:read'],
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'slack',
});

// Send message
const response = await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${creds.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    channel: 'C1234567890',
    text: 'Hello from Authlane!',
  }),
});
```

## Available Tools

### slack_send_message
Send a message to a Slack channel.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'slack_send_message',
  parameters: {
    channel: 'C1234567890',
    text: 'Hello, team!',
  },
});
```

### slack_list_channels
List channels in the workspace.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'slack_list_channels',
  parameters: {
    limit: 100,
    exclude_archived: true,
  },
});
```

## Setup Guide

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App"
3. Choose "From scratch"
4. Enter app name and select workspace

### 2. Configure OAuth

1. Navigate to "OAuth & Permissions"
2. Add redirect URL: `https://your-domain.com/api/v1/oauth/callback/slack`
3. Add required scopes under "Bot Token Scopes"

### 3. Get Credentials

1. Navigate to "Basic Information"
2. Copy Client ID and Client Secret
3. Add to Authlane:

```typescript
// Via dashboard or API
await authlane.services.configure({
  serviceId: 'slack',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## Common Issues

### "invalid_scope" Error

Ensure all requested scopes are added to your Slack app's Bot Token Scopes.

### "missing_scope" Error

The connected user doesn't have the required scope. Reconnect with additional scopes:

```typescript
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'slack',
  scopes: ['chat:write', 'channels:read', 'channels:manage'],
  force: true, // Force re-authorization
});
```

## Links

- [Slack API Documentation](https://api.slack.com/)
- [OAuth Scopes Reference](https://api.slack.com/scopes)
- [Web API Methods](https://api.slack.com/methods)


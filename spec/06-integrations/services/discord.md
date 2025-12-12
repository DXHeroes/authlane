# Discord Integration

Connect to Discord for messaging and community management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `discord` |
| **Name** | Discord |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Discord Developer Portal](https://discord.com/developers/docs) |

## OAuth Configuration

### Authorization URL
```
https://discord.com/api/oauth2/authorize
```

### Token URL
```
https://discord.com/api/oauth2/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `bot` | Bot functionality |
| `messages.read` | Read message content |
| `messages.write` | Send messages |
| `guilds` | Access server list |
| `guilds.members.read` | Read server member info |

### Default Scopes

```yaml
- bot
- messages.write
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'discord',
  scopes: ['bot', 'messages.write', 'guilds'],
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'discord',
});

// Send message to channel
const response = await fetch(
  `https://discord.com/api/v10/channels/${channelId}/messages`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bot ${creds.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: 'Hello from Authlane!',
    }),
  }
);
```

## Available Tools

### discord_send_message
Send a message to a Discord channel.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'discord_send_message',
  parameters: {
    channelId: '123456789012345678',
    content: 'Hello, Discord!',
  },
});
```

### discord_list_guilds
List servers (guilds) the bot is in.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'discord_list_guilds',
  parameters: {},
});
```

### discord_get_channel
Get channel information.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'discord_get_channel',
  parameters: {
    channelId: '123456789012345678',
  },
});
```

## Setup Guide

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Enter application name

### 2. Create Bot

1. Navigate to "Bot" section
2. Click "Add Bot"
3. Configure bot settings (username, permissions)

### 3. Configure OAuth2

1. Navigate to "OAuth2" section
2. Add redirect: `https://your-domain.com/api/v1/oauth/callback/discord`
3. Select scopes and permissions

### 4. Get Credentials

1. Copy Client ID from "General Information"
2. Copy Client Secret from "OAuth2"
3. (Optional) Copy Bot Token from "Bot" section

### 5. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'discord',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## Important Notes

### Bot vs User Token

Discord uses different auth for bots vs users:
- **Bot Token**: `Authorization: Bot <token>`
- **User Token**: `Authorization: Bearer <token>`

Authlane handles this automatically based on the scopes used.

### Permission Integer

When adding bot to server, you need a permission integer:
```typescript
// Common permissions
const permissions = 2048; // Send Messages
const permissions = 3072; // Send Messages + Embed Links
```

### Rate Limits

Discord has strict rate limits. The API returns:
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Authlane tools implement automatic retry with backoff.

## Links

- [Discord Developer Documentation](https://discord.com/developers/docs)
- [OAuth2 Guide](https://discord.com/developers/docs/topics/oauth2)
- [API Reference](https://discord.com/developers/docs/reference)


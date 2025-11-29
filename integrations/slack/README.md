# Slack Integration

OAuth 2.0 integration for Slack workspaces with comprehensive messaging and channel management capabilities.

## Features

- **Messaging**: Send, update, and delete messages in channels and DMs
- **Channel Management**: List, create, and manage channels
- **User Management**: List and get user information
- **Reactions**: Add emoji reactions to messages
- **Rich Formatting**: Support for Block Kit and markdown

## OAuth Configuration

### Creating a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Enter app name and select a workspace
4. Navigate to **OAuth & Permissions**

### Required OAuth Scopes

**Bot Token Scopes** (minimum required):
- `chat:write` - Send messages
- `channels:read` - View public channels

**Additional recommended scopes**:
- `channels:manage` - Create and manage public channels
- `channels:write` - Manage public channel properties
- `groups:read` - View private channels
- `groups:write` - Manage private channels
- `im:read` - View direct messages
- `im:write` - Send direct messages
- `mpim:read` - View group direct messages
- `mpim:write` - Send group direct messages
- `users:read` - View users in workspace

### Redirect URI Configuration

Add your callback URL in **OAuth & Permissions** → **Redirect URLs**:

```
http://localhost:3000/api/v1/users/{user_id}/connections/slack/callback
```

For production, replace with your production URL.

### Environment Variables

Set the following environment variables:

```bash
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
```

## Available Tools

### Messaging Tools

#### `slack_send_message`
Send a message to a channel or DM.

```typescript
{
  channel: "#general",           // Channel name, ID, or user ID
  text: "Hello, world!",          // Message text (supports markdown)
  blocks: [...],                  // Optional Block Kit blocks
  thread_ts: "1234567890.123456", // Optional: reply in thread
  reply_broadcast: false,         // Also send to channel
  unfurl_links: true,             // Auto-expand links
  unfurl_media: true,             // Auto-expand media
  mrkdwn: true                    // Enable markdown
}
```

#### `slack_update_message`
Update an existing message.

```typescript
{
  channel: "C1234567890",         // Channel ID
  ts: "1234567890.123456",        // Message timestamp
  text: "Updated message",        // New text
  blocks: [...]                   // Optional new blocks
}
```

#### `slack_delete_message`
Delete a message.

```typescript
{
  channel: "C1234567890",         // Channel ID
  ts: "1234567890.123456"         // Message timestamp
}
```

### Channel Tools

#### `slack_list_channels`
List channels in the workspace.

```typescript
{
  types: "public_channel",        // Channel types (comma-separated)
  exclude_archived: true,         // Exclude archived channels
  limit: 100,                     // Max results (default: 100)
  cursor: "..."                   // Pagination cursor
}
```

**Channel types**:
- `public_channel` - Public channels
- `private_channel` - Private channels
- `mpim` - Group DMs
- `im` - Direct messages

#### `slack_create_channel`
Create a new channel.

```typescript
{
  name: "new-channel",            // Channel name (lowercase, no spaces)
  is_private: false,              // Create as private channel
  team_id: "T1234567890"          // Optional: workspace ID
}
```

**Channel naming rules**:
- Lowercase only
- No spaces (use dashes or underscores)
- Max 80 characters
- Can contain: a-z, 0-9, -, _

#### `slack_get_channel_info`
Get information about a channel.

```typescript
{
  channel: "C1234567890",         // Channel ID
  include_locale: false           // Include locale info
}
```

#### `slack_invite_users`
Invite users to a channel.

```typescript
{
  channel: "C1234567890",         // Channel ID
  users: ["U1234567890", "U9876543210"] // Array of user IDs
}
```

### User Tools

#### `slack_list_users`
List users in the workspace.

```typescript
{
  limit: 100,                     // Max results (default: 100)
  cursor: "...",                  // Pagination cursor
  include_locale: false,          // Include locale info
  team_id: "T1234567890"          // Optional: workspace ID
}
```

#### `slack_get_user_info`
Get information about a user.

```typescript
{
  user: "U1234567890",            // User ID
  include_locale: false           // Include locale info
}
```

### Other Tools

#### `slack_add_reaction`
Add an emoji reaction to a message.

```typescript
{
  channel: "C1234567890",         // Channel ID
  timestamp: "1234567890.123456", // Message timestamp
  name: "thumbsup"                // Emoji name (without colons)
}
```

#### `slack_get_message_permalink`
Get a permanent link to a message.

```typescript
{
  channel: "C1234567890",         // Channel ID
  message_ts: "1234567890.123456" // Message timestamp
}
```

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export SLACK_CLIENT_ID=your_client_id
export SLACK_CLIENT_SECRET=your_client_secret

./scripts/test-slack-oauth.sh
```

The test script will:
1. Verify API health
2. Check Slack service configuration
3. Initiate OAuth flow
4. Guide you through authorization
5. Verify credentials storage
6. Test Slack API calls
7. Verify required scopes

## Usage Examples

### Sending a Simple Message

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/slack_send_message \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "#general",
    "text": "Hello from Authlane!"
  }'
```

### Sending a Rich Message with Blocks

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/slack_send_message \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "#general",
    "text": "Fallback text",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Hello* from _Authlane_!"
        }
      }
    ]
  }'
```

### Creating a Channel

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/slack_create_channel \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "authlane-test",
    "is_private": false
  }'
```

### Listing Channels

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/slack_list_channels \
  -H "Authorization: Bearer $API_KEY"
```

## Slack API Documentation

- [Slack API Reference](https://api.slack.com/methods)
- [Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Message Formatting](https://api.slack.com/reference/surfaces/formatting)
- [OAuth Scopes](https://api.slack.com/scopes)

## Troubleshooting

### Missing Scopes Error

If you get a `missing_scope` error:
1. Go to your app's **OAuth & Permissions** page
2. Add the required scope under **Bot Token Scopes**
3. Reinstall the app to your workspace
4. Reconnect in Authlane

### Channel Not Found

- Ensure you're using the channel ID (e.g., `C1234567890`), not the name
- For channel names, prefix with `#` (e.g., `#general`)
- Verify the bot is a member of the channel

### Invalid Authentication

- Check that the access token is valid
- Verify the connection status in Authlane
- Try reconnecting if the token has expired

## Rate Limits

Slack has tiered rate limits:
- **Tier 1**: 1+ requests per minute
- **Tier 2**: 20+ requests per minute
- **Tier 3**: 50+ requests per minute
- **Tier 4**: 100+ requests per minute

See [Slack Rate Limits](https://api.slack.com/docs/rate-limits) for details.

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Regularly rotate your client secret
- Monitor unusual activity in your Slack app dashboard

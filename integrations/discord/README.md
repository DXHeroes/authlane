# Discord Integration

OAuth 2.0 integration for Discord servers with comprehensive messaging and server management capabilities.

## Features

- **Messaging**: Send, edit, and delete messages in channels
- **Channel Management**: List and get channel information
- **Server Management**: Get guild (server) information and member lists
- **User Management**: Get user information
- **Reactions**: Add emoji reactions to messages
- **Rich Formatting**: Support for embeds, components, and markdown

## OAuth Configuration

### Creating a Discord Application

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Enter application name and accept terms
4. Navigate to **OAuth2** → **General**

### Required OAuth Scopes

**Minimum required scopes**:
- `bot` - Add bot to servers
- `messages.write` - Send messages

**Additional recommended scopes**:
- `messages.read` - Read message history
- `guilds` - Access server information
- `guilds.members.read` - Access server member information

### Bot Permissions

When adding the bot to a server, ensure it has the following permissions:
- **Send Messages** (2048)
- **Read Message History** (65536)
- **View Channels** (1024)
- **Add Reactions** (64)
- **Manage Messages** (8192) - Optional: for message editing/deleting

### Redirect URI Configuration

Add your callback URL in **OAuth2** → **Redirects**:

```
http://localhost:3000/api/v1/users/{user_id}/connections/discord/callback
```

For production, replace with your production URL.

### Environment Variables

Set the following environment variables:

```bash
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

## Available Tools

### Messaging Tools

#### `discord_send_message`
Send a message to a Discord channel.

```typescript
{
  channel_id: "123456789012345678",  // Channel ID
  content: "Hello, world!",          // Message text (supports markdown)
  embeds: [...],                     // Optional embeds for rich content
  tts: false,                        // Text-to-speech
  allowed_mentions: {                // Control mentions
    parse: ["users", "roles"],
    users: ["123456789012345678"],
    roles: ["123456789012345678"],
    replied_user: false
  },
  message_reference: {               // Reply to a message
    message_id: "123456789012345678",
    channel_id: "123456789012345678",
    guild_id: "123456789012345678",
    fail_if_not_exists: true
  },
  components: [...],                 // Buttons, select menus, etc.
  sticker_ids: ["123456789012345678"], // Sticker IDs (max 3)
  flags: 0                           // Message flags
}
```

#### `discord_edit_message`
Edit a previously sent message.

```typescript
{
  channel_id: "123456789012345678",  // Channel ID
  message_id: "123456789012345678",  // Message ID to edit
  content: "Updated message",        // New text
  embeds: [...],                     // Optional new embeds
  components: [...],                 // Optional new components
  flags: 0,                          // Message flags
  allowed_mentions: {...}            // Control mentions
}
```

#### `discord_delete_message`
Delete a message.

```typescript
{
  channel_id: "123456789012345678",  // Channel ID
  message_id: "123456789012345678",  // Message ID to delete
  reason: "Spam"                     // Optional audit log reason
}
```

### Channel Tools

#### `discord_list_channels`
List channels in a Discord guild (server).

```typescript
{
  guild_id: "123456789012345678",    // Guild (server) ID
  type: 0                            // Optional: filter by channel type
}
```

**Channel types**:
- `0` - GUILD_TEXT (text channel)
- `2` - GUILD_VOICE (voice channel)
- `4` - GUILD_CATEGORY (category)
- `5` - GUILD_NEWS (announcement channel)
- `10` - GUILD_NEWS_THREAD (announcement thread)
- `11` - GUILD_PUBLIC_THREAD (public thread)
- `12` - GUILD_PRIVATE_THREAD (private thread)
- `13` - GUILD_STAGE_VOICE (stage channel)
- `15` - GUILD_FORUM (forum channel)

#### `discord_get_channel`
Get information about a specific channel.

```typescript
{
  channel_id: "123456789012345678"   // Channel ID
}
```

### Server (Guild) Tools

#### `discord_get_guild`
Get information about a Discord guild (server).

```typescript
{
  guild_id: "123456789012345678",    // Guild (server) ID
  with_counts: false                 // Include member/presence counts
}
```

#### `discord_list_guild_members`
List members in a guild.

```typescript
{
  guild_id: "123456789012345678",    // Guild (server) ID
  limit: 1,                          // Max results (1-1000, default: 1)
  after: "123456789012345678"        // User ID for pagination
}
```

### User Tools

#### `discord_get_user`
Get information about a Discord user.

```typescript
{
  user_id: "123456789012345678"      // User ID
}
```

### Other Tools

#### `discord_add_reaction`
Add an emoji reaction to a message.

```typescript
{
  channel_id: "123456789012345678",  // Channel ID
  message_id: "123456789012345678",  // Message ID
  emoji: "👍"                        // Unicode emoji or "name:id" for custom
}
```

**Custom emoji format**: `emoji_name:emoji_id` (e.g., `custom:123456789012345678`)

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export DISCORD_CLIENT_ID=your_client_id
export DISCORD_CLIENT_SECRET=your_client_secret

./scripts/test-discord-oauth.sh
```

The test script will:
1. Verify API health
2. Check Discord service configuration
3. Initiate OAuth flow
4. Guide you through authorization
5. Verify credentials storage
6. Test Discord API calls
7. Verify required scopes

## Usage Examples

### Sending a Simple Message

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/discord_send_message \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_id": "123456789012345678",
    "content": "Hello from Authlane!"
  }'
```

### Sending a Rich Message with Embeds

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/discord_send_message \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_id": "123456789012345678",
    "content": "Check out this embed!",
    "embeds": [
      {
        "title": "Hello from Authlane",
        "description": "This is a rich embed message",
        "color": 5814783,
        "fields": [
          {
            "name": "Field 1",
            "value": "Value 1",
            "inline": true
          },
          {
            "name": "Field 2",
            "value": "Value 2",
            "inline": true
          }
        ]
      }
    ]
  }'
```

### Listing Channels

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/discord_list_channels \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "guild_id": "123456789012345678"
  }'
```

### Getting User Information

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/discord_get_user \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123456789012345678"
  }'
```

## Discord API Documentation

- [Discord Developer Portal](https://discord.com/developers/docs)
- [Discord API Reference](https://discord.com/developers/docs/reference)
- [Message Formatting](https://discord.com/developers/docs/reference#message-formatting)
- [Embed Object](https://discord.com/developers/docs/resources/channel#embed-object)
- [OAuth2 Scopes](https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes)

## Troubleshooting

### Missing Permissions Error

If you get a `Missing Permissions` error:
1. Go to your server settings → Integrations
2. Find your bot and check its permissions
3. Ensure it has the required permissions in the channel
4. The bot must be able to view the channel to send messages

### Invalid Channel Error

- Ensure you're using the channel ID (e.g., `123456789012345678`)
- You can get channel IDs by enabling Developer Mode in Discord settings
- Right-click on a channel and select "Copy ID"
- Verify the bot has access to the channel

### Invalid Authentication

- Check that the access token is valid
- Verify the connection status in Authlane
- Try reconnecting if the token has expired
- Ensure your bot is still in the server

### Cannot Send Messages to This Channel

- Check if the channel is age-restricted
- Verify the bot has "Send Messages" permission
- Check if the channel is locked or read-only
- Ensure the bot role is positioned correctly in the role hierarchy

## Rate Limits

Discord has global and per-route rate limits:
- **Global**: 50 requests per second
- **Per-route**: Varies by endpoint (typically 5-10 requests per second)
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

See [Discord Rate Limits](https://discord.com/developers/docs/topics/rate-limits) for details.

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Regularly review bot permissions in servers
- Monitor unusual activity in your Discord developer dashboard
- Consider implementing bot verification for large-scale deployments

## Getting Channel and Guild IDs

To use Discord tools, you need channel and guild (server) IDs:

1. Enable Developer Mode:
   - User Settings → Advanced → Enable Developer Mode

2. Get Guild ID:
   - Right-click on server icon → Copy ID

3. Get Channel ID:
   - Right-click on channel → Copy ID

4. Get User ID:
   - Right-click on user → Copy ID

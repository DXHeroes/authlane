# Discord

Connect Discord and use its tools through the Authlane control plane.

## Prerequisites

Create a Discord OAuth2 application with a bot and choose a guild where that bot can access the
channels used by your SaaS. Keep the guild, channel, and user IDs required by the tools available.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/discord/callback` in the Discord application.
Enable Discord for the tenant in Authlane, store the OAuth client ID and encrypted client secret,
and approve the default scopes from `integrations/discord/config.yaml`.

## Scopes

- `bot` installs and authorizes the Discord bot.
- `messages.write` permits the configured message operations.

## Available tools

### Channels

- `discord_list_channels`
- `discord_create_channel`

### Messages

- `discord_send_message`
- `discord_send_dm`

Install `@authlane/integration-discord` in the SaaS runtime. The local adapter uses a fresh
credential lease to call Discord directly; Authlane remains the connection and definition control
plane and never proxies messages or responses.

## Connection lifecycle

Successful consent stores an encrypted OAuth credential and marks the connection `connected`.
Authlane refreshes expiring credentials only when Discord returned usable refresh material. If the
credential expires or Discord rejects it, reconnect the user. A hosted disconnect requires a new
connect session with recent reauthentication and removes the stored connection.

## Troubleshooting

- Verify the bot is present in the target guild before using a guild or channel ID.
- A send failure can mean the bot lacks permission in that channel even when OAuth succeeded.
- `discord_send_dm` needs a Discord user ID; a username is not a substitute.

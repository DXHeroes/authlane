# Slack

Connect Slack and use its tools through the Authlane control plane.

## Prerequisites

Create a Slack app and choose a workspace where it can access the channels and users needed by your
SaaS. Add only the bot or user permissions required for the tools you expose.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/slack/callback` as a Slack redirect URL. Enable
Slack for the tenant in Authlane, store the client ID and encrypted client secret, and approve the
defaults from `integrations/slack/config.yaml`.

## Scopes

- `chat:write` sends channel or direct messages.
- `channels:read` lists public channels visible to the connected app.

The adapter also exports channel creation, file, user, and status tools. The repository's Slack
scope list does not currently declare file-upload or profile-status permissions. Expose each tool
only after the tenant OAuth configuration has been reviewed against that provider operation.

## Available tools

### Messages and files

- `slack_send_message`
- `slack_post_file`

### Channels and users

- `slack_list_channels`
- `slack_create_channel`
- `slack_list_users`

### User status

- `slack_set_status`

Install `@authlane/integration-slack` in the SaaS runtime. A callback gets a fresh credential lease
and calls Slack directly; messages, file content, and Slack responses do not pass through Authlane.

## Connection lifecycle

Slack consent creates an encrypted `connected` connection. Authlane schedules background refresh
only when Slack returns expiry and refresh material. Reconnect a connection that becomes `expired`
or `error` after provider rejection. Disconnect through a new hosted session after recent user
reauthentication.

## Troubleshooting

- Channel listing and posting are limited to channels visible to the connected Slack app.
- Private channels, channel creation, file upload, user listing, and status changes can need scopes
  beyond the two defaults; do not assume the exported tool implies OAuth permission.
- Use channel and user IDs returned by Slack tools when names are ambiguous.

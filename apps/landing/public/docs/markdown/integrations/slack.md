# Slack

Connect Slack and use its tools through the Authlane control plane.

## Prerequisites

Create a Slack app and choose a workspace where it can access the channels and users needed by your
SaaS. Add only the user permissions required for the tools you expose. Use the
[Web API reference](https://docs.slack.dev/reference/methods/),
[MCP app guide](https://docs.slack.dev/ai/slack-mcp-server/developing/), and
[Slack app console](https://api.slack.com/apps).

## Self-hosted setup

1. Create an internal or directory-published Slack app; unlisted external apps cannot use Slack MCP.
2. Enable **Agents → Slack Model Context Protocol (MCP) Server** for the app.
3. Add `https://<your-authlane-host>/api/v1/oauth/slack/callback` under OAuth redirect URLs.
4. Add the user-token scopes below, install the app, and copy its Client ID and Client Secret.

## Configure authentication

Open **Dashboard → Services → Slack → OAuth Configuration**, enter the Client ID and Client Secret,
save, and enable Slack. Authlane uses Slack's confidential user OAuth endpoints and PKCE-compatible
flow so the resulting identity can be used by the official MCP server.

## Scopes

- `chat:write` sends channel or direct messages.
- `channels:read` lists public channels visible to the connected app.
- `channels:write` creates public channels.
- `users:read` lists workspace users.
- `users.profile:write` updates the connected user's status.
- `search:read.public` lets Slack MCP discover public channels.
- `search:read.users` lets Slack MCP discover workspace users.

File upload is not exposed: Slack retired `files.upload`, and Authlane will not advertise a tool
until the adapter implements Slack's current external upload flow.

## Execution path

Prefer Slack's official MCP server at `https://mcp.slack.com/mcp`; follow the
[official Slack MCP documentation](https://docs.slack.dev/ai/slack-mcp-server/). Use the direct Web
API adapter only for deterministic operations that the official server does not expose. The SaaS
runtime—not Authlane—owns the MCP client and provider traffic.

## Available tools

### Messages

- `slack_send_message`

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
- File upload remains unavailable until the external upload flow is implemented end to end.
- Use channel and user IDs returned by Slack tools when names are ambiguous.

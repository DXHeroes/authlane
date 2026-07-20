# Gmail

Connect Gmail and use its tools through the Authlane control plane.

## Prerequisites

Create a Google OAuth client for a project with Gmail access and choose the Google accounts that
may authorize it. The connected account supplies the mailbox used by every Gmail tool. Use the
[Gmail API guides](https://developers.google.com/workspace/gmail/api/guides),
[OAuth consent guide](https://developers.google.com/workspace/guides/configure-oauth-consent), and
[Google Cloud credentials console](https://console.cloud.google.com/apis/credentials).

## Self-hosted setup

1. Create or select a Google Cloud project and enable Gmail API. For MCP-first execution, also join
   the Workspace Developer Preview and enable Gmail MCP API.
2. Configure the OAuth consent screen, audience, test users, and the scopes below.
3. Create a **Web application** OAuth client and register
   `https://<your-authlane-host>/api/v1/oauth/gmail/callback` as an authorized redirect URI.
4. Copy the generated Client ID and Client Secret.

## Configure authentication

Open **Dashboard → Services → Gmail → OAuth Configuration**, enter the Client ID and Client Secret,
save, and enable Gmail. Use an exact HTTPS callback; Google treats a different scheme, host, port,
or path as a redirect mismatch.

## Scopes

- `https://www.googleapis.com/auth/gmail.send` permits sending mail.
- `https://www.googleapis.com/auth/gmail.readonly` permits reading messages, threads, labels, and
  drafts exposed by the adapter.
- `https://www.googleapis.com/auth/gmail.compose` enables `gmail_create_draft`.
- `https://www.googleapis.com/auth/gmail.labels` enables `gmail_create_label`.
- `https://www.googleapis.com/auth/gmail.modify` enables label changes through
  `gmail_modify_email` and moving messages to trash through `gmail_trash_email`.

Permanent deletion is deliberately not exposed: Gmail requires the restricted
`https://mail.google.com/` scope for that operation. Authlane provides `gmail_trash_email` instead,
so the default self-hosted setup does not request full mailbox access.

## Execution path

Prefer Google's official Gmail MCP server at `https://gmailmcp.googleapis.com/mcp/v1`; follow the
[official Gmail MCP guide](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server).
It is currently a Developer Preview, so keep the direct Gmail API adapter as a documented fallback
for unavailable MCP tools and non-preview deployments.

## Available tools

### Read and search mail

- `gmail_read_emails`
- `gmail_search_emails`
- `gmail_get_email`
- `gmail_get_thread`

### Send and draft

- `gmail_send_email`
- `gmail_list_drafts`
- `gmail_create_draft`

### Organize and remove

- `gmail_list_labels`
- `gmail_create_label`
- `gmail_modify_email`
- `gmail_trash_email`

Install `@authlane/integration-gmail` in the SaaS runtime. Each callback gets a fresh Authlane
credential lease and calls Gmail directly from that runtime; message content and Google responses
do not pass through Authlane.

## Connection lifecycle

Successful Google consent produces an encrypted `connected` connection. When Google returns an
expiry and refresh token, Authlane schedules refresh before expiry. Reconnect when refresh is
rejected or the connection becomes `expired` or `error`. Disconnect through a newly minted hosted
session after recent user reauthentication.

## Troubleshooting

- A read or send failure often means the connected Google account is outside the OAuth client's
  allowed users or the requested Gmail scope was not approved.
- Draft, label, and trash failures must be checked against their distinct compose, labels, and
  modify scopes.
- Use Gmail message and thread IDs returned by the read tools; email subjects are not IDs.

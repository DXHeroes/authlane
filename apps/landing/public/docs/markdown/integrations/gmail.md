# Gmail

Connect Gmail and use its tools through the Authlane control plane.

## Prerequisites

Create a Google OAuth client for a project with Gmail access and choose the Google accounts that
may authorize it. The connected account supplies the mailbox used by every Gmail tool.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/gmail/callback` in the Google OAuth client.
Enable Gmail for the tenant in Authlane, store the client ID and encrypted client secret, and
approve the defaults from `integrations/gmail/config.yaml`.

## Scopes

- `https://www.googleapis.com/auth/gmail.send` permits sending mail.
- `https://www.googleapis.com/auth/gmail.readonly` permits reading messages, threads, labels, and
  drafts exposed by the adapter.

The exported adapter also contains mutation tools. If you enable those tools, approve a configured
write-capable Gmail scope such as `https://www.googleapis.com/auth/gmail.modify`; the default
read-only scope alone does not grant mailbox mutations.

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
- `gmail_delete_email`

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
- Label, trash, delete, and other mutation tools need a configured write-capable Gmail scope.
- Use Gmail message and thread IDs returned by the read tools; email subjects are not IDs.

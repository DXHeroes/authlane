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

Configured optional capabilities are separate:

- `https://www.googleapis.com/auth/gmail.compose` enables `gmail_create_draft`.
- `https://www.googleapis.com/auth/gmail.labels` enables `gmail_create_label`.
- `https://www.googleapis.com/auth/gmail.modify` enables label changes through
  `gmail_modify_email` and moving messages to trash through `gmail_trash_email`; it is insufficient
  for immediate permanent deletion.

`gmail_delete_email` performs an immediate permanent deletion. It requires
`https://mail.google.com/` and is unavailable with the current repository config because that scope
is not declared. Do not expose this tool unless the provider configuration and consent model are
deliberately expanded.

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
- Draft, label, and trash failures must be checked against their distinct compose, labels, and
  modify scopes. `https://www.googleapis.com/auth/gmail.modify` is insufficient for
  `gmail_delete_email`.
- Use Gmail message and thread IDs returned by the read tools; email subjects are not IDs.

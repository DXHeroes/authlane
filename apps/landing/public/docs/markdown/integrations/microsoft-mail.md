# Microsoft Mail

Connect Microsoft Mail and use its tools through the Authlane control plane.

## Prerequisites

Use a Microsoft Entra tenant and an account with permission to create an app registration. Review
the official [Microsoft Graph mail API](https://learn.microsoft.com/graph/api/resources/mail-api-overview),
[app registration guide](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app),
and [Entra app registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
Choose **Accounts in any organizational directory** for a multi-tenant SaaS, or the single-tenant
option for an internal installation.

## Self-hosted setup

1. In **Microsoft Entra admin center → App registrations**, create or open a Web application.
2. Under **Authentication**, add the exact Web redirect URI
   `https://<your-authlane-host>/api/v1/oauth/microsoft-mail/callback`. Do not enable implicit grant.
3. Under **API permissions**, add the delegated Microsoft Graph permissions listed below. Use
   read-only or full access to match the service policy you will select in Authlane.
4. Grant administrator consent when required by the tenant's consent policy.
5. Under **Certificates & secrets**, create a client secret and copy its **Value** immediately.
   Authlane needs the value, not the secret ID.

One Entra app can serve all three Microsoft services when every exact Authlane callback URI and
every required delegated Graph permission is registered.

## Configure authentication

Open **Dashboard → Services → Microsoft Mail**, enter the Entra **Application (client) ID** as the
Client ID and the client secret **Value** as the Client Secret, select `read_only` or `full`, then
enable the service. The secret stays encrypted on the Authlane server and must never be sent to a
browser.

## Scopes

Full policy requests these delegated scopes:

- `offline_access`
- `openid`
- `profile`
- `User.Read`
- `Mail.ReadWrite`
- `Mail.Send`

Read-only policy replaces `Mail.ReadWrite` and `Mail.Send` with `Mail.Read`. `offline_access`
allows refresh tokens; `openid`, `profile`, and `User.Read` establish the connected identity.
See the current [Microsoft Graph permissions reference](https://learn.microsoft.com/graph/permissions-reference)
before granting consent.

## Execution path

Microsoft now lists a Mail server in the
[Agent 365 MCP catalog](https://learn.microsoft.com/microsoft-agent-365/developer/tooling), but that
Frontier path is not credential-compatible with a normal delegated Graph token: it requires an
Agent 365 blueprint, a separate MCP audience and per-server permission, plus tenant-admin setup.
Authlane must not send a Graph token to that endpoint. This generally available connection therefore
emits canonical tools whose local adapter calls `https://graph.microsoft.com/v1.0` directly from the
SaaS runtime. Normal mail inputs and responses never pass through Authlane; only the explicit
administrator Sandbox can invoke the same adapter for testing.

## Available tools

- `microsoft_mail_list_messages`
- `microsoft_mail_search_messages`
- `microsoft_mail_get_message`
- `microsoft_mail_list_folders`
- `microsoft_mail_list_attachments`
- `microsoft_mail_get_attachment`
- `microsoft_mail_create_draft`
- `microsoft_mail_update_message`
- `microsoft_mail_send_message`
- `microsoft_mail_send_draft`
- `microsoft_mail_reply_to_message`
- `microsoft_mail_forward_message`
- `microsoft_mail_move_message`
- `microsoft_mail_delete_message`

Read-only policy exposes only list, search, and get tools. Write and destructive tools carry MCP
risk annotations so the SaaS runtime can require approval immediately before execution.

## Connection lifecycle

Authlane encrypts OAuth credentials, refreshes access when possible, and reports the effective
connection state. Upgrading from the former Microsoft connector expires its stored connection once;
reconnect to obtain Microsoft Graph-scoped consent. Changing between read-only and full policy also
requires reconnecting so consent and the issued tool set stay aligned.

## Troubleshooting

- `AADSTS50011` means the redirect URI differs by scheme, host, port, path, or trailing slash.
- Confirm you copied the client secret **Value** before it expired, not its identifier.
- Verify the connected account has an Exchange Online mailbox and consent for the selected scopes.
- If user consent is disabled, ask an Entra administrator to grant tenant-wide consent.

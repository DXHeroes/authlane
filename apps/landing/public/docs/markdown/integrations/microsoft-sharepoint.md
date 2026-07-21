# Microsoft Drive (SharePoint)

Connect Microsoft Drive (SharePoint) and use its tools through the Authlane control plane.

## Prerequisites

Use a Microsoft Entra tenant and an account able to register applications. Review the official
[Microsoft Graph SharePoint resource](https://learn.microsoft.com/graph/api/resources/sharepoint),
[app registration guide](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app),
and [Entra app registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
Choose a multi-tenant account type for a public SaaS and single tenant for an internal deployment.

## Self-hosted setup

1. Create or open a Web app under **Microsoft Entra admin center → App registrations**.
2. Add the exact Web redirect URI
   `https://<your-authlane-host>/api/v1/oauth/microsoft-sharepoint/callback` under **Authentication**.
3. Under **API permissions**, add the delegated Microsoft Graph permissions for the policy below.
4. Grant administrator consent when required. SharePoint permissions are commonly restricted by
   tenant policy even when Microsoft marks user consent as possible.
5. Create a client secret and copy its **Value** immediately; the value is shown only once.

The same Entra app may serve Mail, Calendar, and SharePoint if it contains all three exact callbacks
and their union of delegated Graph permissions.

## Configure authentication

Open **Dashboard → Services → Microsoft Drive (SharePoint)**. Set Client ID to the Entra
**Application (client) ID**, set Client Secret to the new secret **Value**, select `read_only` or
`full`, and enable the service. Authlane encrypts the secret server-side.

## Scopes

Full policy requests:

- `offline_access`
- `openid`
- `profile`
- `User.Read`
- `Files.ReadWrite.All`
- `Sites.ReadWrite.All`

Read-only policy replaces the last two scopes with `Files.Read.All` and `Sites.Read.All`. These are
delegated permissions: tools operate as the connected user and cannot exceed that user's access.
Review the current [Microsoft Graph permissions reference](https://learn.microsoft.com/graph/permissions-reference)
before granting consent.

## Execution path

Microsoft lists OneDrive/SharePoint servers in the
[Agent 365 MCP catalog](https://learn.microsoft.com/microsoft-agent-365/developer/tooling), but those
Frontier endpoints are not credential-compatible with an ordinary delegated Graph connection. They
require an Agent 365 blueprint, separate MCP audience and per-server permission, plus tenant-admin
setup. The local Authlane adapter therefore calls the GA `https://graph.microsoft.com/v1.0` sites,
drives, items, permissions, and sharing APIs directly from the SaaS runtime. Normal file bytes, tool
arguments, and Graph responses never pass through Authlane. Explicit administrator Sandbox runs use
the identical local adapter for testing.

## Available tools

- `microsoft_sharepoint_search_sites`
- `microsoft_sharepoint_get_site`
- `microsoft_sharepoint_list_drives`
- `microsoft_sharepoint_get_drive`
- `microsoft_sharepoint_list_items`
- `microsoft_sharepoint_get_item`
- `microsoft_sharepoint_download_file`
- `microsoft_sharepoint_list_permissions`
- `microsoft_sharepoint_create_folder`
- `microsoft_sharepoint_upload_file`
- `microsoft_sharepoint_update_item`
- `microsoft_sharepoint_move_item`
- `microsoft_sharepoint_copy_item`
- `microsoft_sharepoint_create_sharing_link`
- `microsoft_sharepoint_invite_users`
- `microsoft_sharepoint_delete_item`
- `microsoft_sharepoint_delete_permission`

Read-only policy exposes discovery, metadata, download, and permission-list tools. Write and delete
actions retain MCP risk metadata so the host can require human approval or disable them.

## Connection lifecycle

Authlane encrypts the OAuth credential, refreshes access when possible, and exposes effective
status. The Microsoft Graph migration marks old Microsoft connections expired and removes their
legacy credential so each user must reconnect once. Policy changes also require fresh consent.

## Troubleshooting

- `AADSTS50011` means the exact redirect URI is missing from the Entra Web platform.
- Confirm the user can open the target SharePoint site or drive in Microsoft 365.
- Check that Client ID and client secret **Value** belong to the same non-expired app credential.
- If Graph returns `403`, verify both delegated scopes, tenant admin consent, and the user's own site
  permissions.

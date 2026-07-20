# Google Drive

Connect Google Drive and use its tools through the Authlane control plane.

## Prerequisites

Create a Google OAuth client for a project with Drive access. The connected account must have
access to the files, folders, and shared drives that the SaaS will use. Use the
[Drive API guide](https://developers.google.com/workspace/drive/api/guides/about-sdk),
[OAuth consent guide](https://developers.google.com/workspace/guides/configure-oauth-consent), and
[Google Cloud credentials console](https://console.cloud.google.com/apis/credentials).

## Self-hosted setup

1. Create or select a Google Cloud project and enable Drive API. For MCP-first execution, also join
   the Workspace Developer Preview and enable Drive MCP API.
2. Configure the OAuth consent screen, audience, test users, and the scopes below.
3. Create a **Web application** OAuth client and register
   `https://<your-authlane-host>/api/v1/oauth/google-drive/callback` as an authorized redirect URI.
4. Copy the Client ID and Client Secret.

## Configure authentication

Open **Dashboard → Services → Google Drive → OAuth Configuration**, enter the Client ID and
Client Secret, save, and enable Google Drive. The callback must match the public Authlane URL exactly.

## Scopes

- `https://www.googleapis.com/auth/drive.file` permits access to files the app creates or opens.
- `https://www.googleapis.com/auth/drive.readonly` permits reading files visible to the connected
  account.

The exported adapter includes broader update, delete, and permission tools. Only expose them when
the tenant has approved a configured scope that grants the corresponding Drive operation.

## Execution path

Prefer Google's official Drive MCP server at `https://drivemcp.googleapis.com/mcp/v1`; follow the
[official Drive MCP guide](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server).
It is a Developer Preview, so retain the direct Drive API adapter as the explicit fallback when a
required tool is missing or the preview cannot be enabled.

## Available tools

### Find and read files

- `gdrive_list_files`
- `gdrive_search_files`
- `gdrive_get_file`
- `gdrive_download_file`
- `gdrive_export_file`

### Create and change content

- `gdrive_upload_file`
- `gdrive_create_folder`
- `gdrive_update_file`
- `gdrive_copy_file`
- `gdrive_trash_file`
- `gdrive_delete_file`

### Permissions

- `gdrive_list_permissions`
- `gdrive_share_file`
- `gdrive_remove_permission`

Install `@authlane/integration-google-drive` in the SaaS runtime. Tool callbacks obtain a fresh
lease and call Drive directly from that runtime; file content and provider responses do not pass
through Authlane.

## Connection lifecycle

Google consent creates an encrypted `connected` connection. When the token response includes
expiry and refresh material, Authlane schedules refresh before expiry. Reconnect a connection that
cannot refresh and becomes `expired` or `error`. Disconnect through a new hosted session after
recent user reauthentication.

## Troubleshooting

- Use file and permission IDs returned by Drive tools, not display names.
- A Workspace document must be exported with `gdrive_export_file`; it is not downloaded like a
  binary file.
- Permission changes and permanent delete can require access beyond the two default scopes; verify
  the tenant's approved custom scopes before exposing those tools.

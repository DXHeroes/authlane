# Microsoft Drive (SharePoint)

Connect Microsoft Drive (SharePoint) and use its tools through the Authlane control plane.

## Prerequisites

Confirm Work IQ availability and review the official
[Work IQ MCP overview](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/mcp/overview),
[setup guide](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/mcp/quickstart/foundry),
and [Entra app registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).

## Self-hosted setup

1. Create a multi-tenant Web app in Microsoft Entra ID.
2. Add `https://<your-authlane-host>/api/v1/oauth/microsoft-sharepoint/callback` as a redirect URI.
3. Add delegated `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask` and grant tenant consent.
4. Create a client secret and copy its value immediately.

## Configure authentication

Open **Dashboard → Services → Microsoft Drive (SharePoint)**. Save the Application Client ID and
Client Secret, select the tool policy, and enable the service. Keep the Client Secret server-side.

## Scopes

- `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask` authorizes Work IQ MCP.
- `offline_access` permits refresh tokens.
- `openid` and `profile` identify the connected Microsoft user.

## Execution path

The SaaS runtime prioritizes Microsoft's official MCP endpoint
`https://workiq.svc.cloud.microsoft/mcp`. Authlane accepts only `/me/drive`, `/drives`, `/sites`,
and `/shares` resource families. The runtime calls Microsoft directly; Authlane never proxies files,
tool inputs, or provider responses.

## Available tools

- `microsoft_sharepoint_fetch`
- `microsoft_sharepoint_create_entity`
- `microsoft_sharepoint_update_entity`
- `microsoft_sharepoint_delete_entity`
- `microsoft_sharepoint_do_action`
- `microsoft_sharepoint_call_function`
- `microsoft_sharepoint_get_schema`
- `microsoft_sharepoint_search_paths`

## Connection lifecycle

Authlane stores the credential encrypted, refreshes it when possible, and exposes effective status.
Reconnect after revocation or an `expired`/`error` state. Policy changes intentionally invalidate
old credentials and require fresh consent.

## Troubleshooting

- Verify the user can open the target site or drive in Microsoft 365.
- Check redirect URI, Work IQ availability, delegated permission, and tenant consent.
- A path outside the SharePoint/Drive allowlist is rejected before MCP execution.

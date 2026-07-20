# HubSpot

Connect HubSpot and use its tools through the Authlane control plane.

## Prerequisites

Create a HubSpot MCP Auth App and choose a HubSpot account containing the contacts and deals your
SaaS will use. The installing user must have access to the requested CRM objects. Use the
[API reference](https://developers.hubspot.com/docs/api-reference/overview),
[remote MCP setup guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server),
and the [HubSpot development overview](https://app.hubspot.com/developer/).

## Self-hosted setup

1. In HubSpot, open **Development → MCP Auth Apps → Create MCP auth app**.
2. Add `https://<your-authlane-host>/api/v1/oauth/hubspot/callback` as its Redirect URL.
3. Save the app and copy its Client ID and Client Secret. HubSpot MCP derives available scopes from
   server tools and the installing user's permissions.

## Configure authentication

Open **Dashboard → Services → HubSpot → OAuth Configuration**, enter the Client ID and Client Secret
for the MCP Auth App, save, and enable HubSpot. Authlane uses the PKCE flow required by HubSpot and
stores the secret encrypted.

## Scopes

The repository declares no default OAuth scopes for HubSpot MCP. Do not enter CRM scopes manually:
HubSpot derives available scopes from the MCP server's current tools and the permissions granted by
the installing user.

## Execution path

Prefer HubSpot's official MCP server at `https://mcp.hubspot.com`; follow the
[official remote MCP guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server).
The MCP Auth App token is used only with this endpoint; Authlane does not retry the call against the
direct CRM API because those are different OAuth application models.

## Available tools

### Contacts

- `hubspot_list_contacts`
- `hubspot_get_contact`

### Deals

- `hubspot_list_deals`
- `hubspot_get_deal`

Authlane intentionally exposes the deterministic read subset. HubSpot's `manage_crm_objects` write
tool requires an explicit confirmation contract and its provider schema is still evolving; it is
not advertised as a stable Authlane tool until that confirmation can be represented end to end.

Install `@authlane/integration-hubspot` in the SaaS runtime. A tool invocation receives a fresh
lease and calls HubSpot's official MCP server directly; Authlane handles connection state and
definitions, not CRM inputs or responses.

## Connection lifecycle

After HubSpot consent, Authlane encrypts the credential and marks the connection `connected`. If
the provider returns expiry and refresh material, Authlane refreshes it before expiry. Reconnect
when a permanent refresh failure produces `expired` or `error`. Hosted disconnect requires a fresh
session after recent reauthentication.

## Troubleshooting

- Check whether the connected HubSpot account exposes the target contact or deal ID.
- The installing user's HubSpot permissions determine which MCP tools and objects are available.
- Write tools are intentionally absent; use the read wrappers unless your SaaS implements an
  explicit HubSpot MCP confirmation UX for `manage_crm_objects`.
- Validate property names against the connected account before passing custom contact or deal data.

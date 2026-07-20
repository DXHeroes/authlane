# Salesforce

Connect Salesforce and use its tools through the Authlane control plane.

## Prerequisites

Choose a Salesforce org containing the objects your SaaS will access. The authorizing user needs
object and field permissions for each query or mutation. Use the
[hosted MCP overview](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/overview),
[External Client App guide](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html),
and [Salesforce login](https://login.salesforce.com) to reach Setup.

## Self-hosted setup

1. In Salesforce Setup, create an **External Client App**; Connected Apps cannot authenticate the
   hosted MCP server.
2. Enable OAuth with PKCE and add
   `https://<your-authlane-host>/api/v1/oauth/salesforce/callback` as a callback URL.
3. Add `mcp_api`, `api`, `refresh_token`, and `id`. Under **Security**, enable **Require Secret for
   Web Server Flow**, then generate and securely copy the Consumer Key as Client ID and Consumer
   Secret as Client Secret.
4. Enable and name the hosted MCP server, then assign it to the External Client App.

## Configure authentication

Open **Dashboard → Services → Salesforce → OAuth Configuration**, enter the Client ID and
Client Secret from the same External Client App, save, and enable Salesforce. The `api` scope on
that app makes the same connection eligible for the direct REST fallback, and its token response
must supply the Salesforce instance URL.

## Scopes

- `api` authorizes Salesforce API access.
- `refresh_token` authorizes refresh-token use.
- `id` provides the connected user's identity context.

- `mcp_api` authorizes Salesforce hosted MCP access.

The default set includes both `mcp_api` and `api`: the SaaS runtime tries hosted MCP first and can
use the connection-specific REST instance only when the provider MCP tool is unavailable before a
call begins.

## Execution path

Prefer Salesforce's official hosted MCP endpoint
`https://api.salesforce.com/platform/mcp/v1/platform/sobject-all`; follow the
[official client guide](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/client-connection-overview.html).
Use the direct REST adapter only when the hosted server is not enabled for the org or lacks the
required object operation.

## Available tools

### Query and retrieve

- `salesforce_query`
- `salesforce_get_object`

### Contacts and opportunities

- `salesforce_create_contact`
- `salesforce_create_opportunity`
- `salesforce_update_opportunity`

Install `@authlane/integration-salesforce` in the SaaS runtime. Tool callbacks obtain a fresh lease
and call the connection's Salesforce instance directly; Authlane never proxies SOQL, object data,
or responses.

## Connection lifecycle

Successful consent creates an encrypted `connected` credential. With the configured
`refresh_token` scope and provider refresh material, Authlane refreshes before expiry. Reconnect
after provider rejection or an `expired` or `error` state. Hosted disconnect requires a fresh
connect session with recent user reauthentication.

## Troubleshooting

- Send provider requests to the instance URL returned for the connection, not a fixed login host.
- Validate SOQL and object or field names against the connected org and its API version.
- OAuth `api` access does not override Salesforce object, field, or record-level permissions.

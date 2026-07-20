# Airtable

Connect Airtable and use its tools through the Authlane control plane.

## Prerequisites

Create an Airtable OAuth integration and identify the bases and tables your users will access. The
authorizing Airtable user must already have access to those resources. Keep the official
[API documentation](https://airtable.com/developers/web/api/introduction),
[OAuth guide](https://airtable.com/developers/web/guides/oauth-integrations), and
[OAuth integration console](https://airtable.com/create/oauth) open during setup.

## Self-hosted setup

1. Open the Airtable OAuth integration console and create an integration.
2. Add `https://<your-authlane-host>/api/v1/oauth/airtable/callback` as the redirect URL, replacing
   the placeholder with the public HTTPS host of your Authlane runtime.
3. Select the scopes listed below and add the workspaces or bases users may grant.
4. Save the integration and copy its Client ID and Client Secret.

## Configure authentication

In Authlane, open **Dashboard → Services → Airtable → OAuth Configuration**. Enter the Client ID
and Client Secret, save, and enable Airtable for the organization. Authlane encrypts the secret and
never displays it again. Keep the default scopes below unless your adapter needs an optional scope.

## Scopes

- `data.records:read` reads table records.
- `data.records:write` creates, updates, and deletes records.
- `schema.bases:read` reads the bases, tables, and fields needed by the schema tools.
- `workspacesAndBases:read` lets the official MCP server discover the bases granted to the
  connected user.

## Execution path

Prefer Airtable's official MCP server at `https://mcp.airtable.com/mcp`; the
[official Airtable MCP guide](https://support.airtable.com/v1/docs/using-the-airtable-mcp-server)
confirms that a manually registered OAuth client and bearer token can authenticate it. Authlane
uses MCP for operations whose published tool schema preserves the canonical Authlane contract,
then falls back to the direct Airtable API before a call begins for filters, pagination, record
operations, or other semantics that do not match exactly. Provider traffic always stays in the
SaaS runtime.

## Available tools

### Discover bases and schemas

- `airtable_list_bases`
- `airtable_get_base_schema`
- `airtable_get_table_schema`

### Read and change records

- `airtable_list_records`
- `airtable_get_record`
- `airtable_create_record`
- `airtable_update_record`
- `airtable_delete_record`

### Change records in batches

- `airtable_create_records_batch`
- `airtable_update_records_batch`
- `airtable_delete_records_batch`

Install `@authlane/integration-airtable` in the SaaS runtime. Each invocation requests a fresh
credential lease and the adapter calls Airtable directly; Authlane does not proxy tool inputs or
provider responses.

## Connection lifecycle

After consent, Authlane stores the OAuth credential encrypted and reports `connected`. When the
provider returns expiry and refresh material, Authlane refreshes it before expiry; an unrecoverable
refresh becomes `expired` or `error` and requires reconnect. Disconnect through a new hosted
session after recent reauthentication, then stop offering Airtable tools.

## Troubleshooting

- A base or table not found usually means the authorizing user cannot access it or the supplied
  `app...` base ID or table name is wrong.
- Record writes require `data.records:write`; schema discovery requires `schema.bases:read`.
- Batch create, update, and delete calls accept at most ten records per adapter invocation.

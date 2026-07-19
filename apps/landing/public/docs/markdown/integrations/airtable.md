# Airtable

Connect Airtable and use its tools through the Authlane control plane.

## Prerequisites

Create an Airtable OAuth integration and identify the bases and tables your users will access. The
authorizing Airtable user must already have access to those resources.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/airtable/callback` in the Airtable integration.
Enable Airtable for the tenant in Authlane, store the OAuth client ID and encrypted client secret,
and approve the default scopes below. Authlane uses the authorization and token endpoints declared
in `integrations/airtable/config.yaml`.

## Scopes

- `data.records:read` reads table records.
- `data.records:write` creates, updates, and deletes records.
- `schema.bases:read` reads the bases, tables, and fields needed by the schema tools.

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

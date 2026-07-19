# Salesforce

Connect Salesforce and use its tools through the Authlane control plane.

## Prerequisites

Create a Salesforce connected app and choose an org containing the objects your SaaS will access.
The authorizing user needs object and field permissions for each query or mutation.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/salesforce/callback` in the connected app.
Enable Salesforce for the tenant in Authlane, store the client ID and encrypted client secret, and
approve the defaults from `integrations/salesforce/config.yaml`. The token response supplies the
Salesforce instance URL used for provider calls.

## Scopes

- `api` authorizes Salesforce API access.
- `refresh_token` authorizes refresh-token use.
- `id` provides the connected user's identity context.

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

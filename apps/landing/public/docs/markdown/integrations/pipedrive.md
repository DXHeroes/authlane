# Pipedrive

Connect Pipedrive and use its tools through the Authlane control plane.

## Prerequisites

Create a Pipedrive OAuth app and choose a company account containing the deals and people your SaaS
will use. The connected user must have access to those CRM records.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/pipedrive/callback` in the Pipedrive app. Enable
Pipedrive for the tenant in Authlane, store the client ID and encrypted client secret, and approve
the defaults from `integrations/pipedrive/config.yaml`. The connection's provider response supplies
the company-specific API domain used by the adapter.

## Scopes

- `deals:read` and `deals:write` read and change deals.
- `contacts:read` and `contacts:write` permit contact access configured for the app.
- `persons:read` and `persons:write` read and change Pipedrive people records.

## Available tools

### Deals

- `pipedrive_list_deals`
- `pipedrive_get_deal`
- `pipedrive_create_deal`
- `pipedrive_update_deal`

### Contacts

- `pipedrive_list_contacts`
- `pipedrive_get_contact`
- `pipedrive_add_contact`
- `pipedrive_update_contact`

### Search

- `pipedrive_search`

Install `@authlane/integration-pipedrive` in the SaaS runtime. Each invocation requests a fresh
lease and calls the connection's Pipedrive API domain directly; Authlane does not proxy CRM inputs
or results.

## Connection lifecycle

After consent, Authlane encrypts the Pipedrive credential and reports `connected`. When the token
response includes expiry and refresh material, Authlane schedules refresh before expiry. Reconnect
an `expired` or `error` connection that cannot refresh. Disconnect through a new hosted session
after recent reauthentication.

## Troubleshooting

- Do not hard-code one Pipedrive company host; use the API domain bound to the connection.
- Deal and person tools require record IDs from the connected company account.
- Verify both the relevant read or write scope and the connected user's visibility when a record is
  missing.

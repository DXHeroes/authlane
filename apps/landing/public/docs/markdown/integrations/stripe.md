# Stripe

Connect Stripe and use its tools through the Authlane control plane.

## Prerequisites

Create a Stripe Connect platform and choose the connected accounts whose customers and charges the
SaaS will read. The exported adapter is read-only. Use the
[API reference](https://docs.stripe.com/api),
[Connect OAuth reference](https://docs.stripe.com/connect/oauth-reference), and
[Connect settings](https://dashboard.stripe.com/settings/connect).

## Self-hosted setup

1. Activate Stripe Connect and configure your platform branding and OAuth settings.
2. Add `https://<your-authlane-host>/api/v1/oauth/stripe/callback` as the production redirect URI.
3. Copy the platform Client ID. Use the platform secret key as the confidential Client Secret only
   in the server-side Authlane configuration.
4. Request `read_only`, then connect a Standard account for a smoke test.

## Configure authentication

Open **Dashboard → Services → Stripe → OAuth Configuration**, enter the Client ID and Client Secret,
save, and enable Stripe. Never place the platform secret in browser code.

## Scopes

- `read_only` permits the customer and charge reads exposed by this integration.

## Execution path

Stripe has an official MCP server at `https://mcp.stripe.com`; follow the
[official MCP guide](https://docs.stripe.com/mcp). For connected accounts, Stripe requires a
restricted platform key plus the `Stripe-Account` header, so the current OAuth adapter remains the
safe read-only direct API path. A connected-account OAuth lease alone is not credential-compatible
with Stripe MCP, so Authlane must not forward it to that server.

## Available tools

### Customers

- `stripe_list_customers`
- `stripe_get_customer`

### Charges

- `stripe_list_charges`
- `stripe_get_charge`

Install `@authlane/integration-stripe` in the SaaS runtime. Each tool invocation requests a fresh
lease and calls Stripe directly; Authlane does not proxy customer data, payment data, or Stripe
responses.

## Connection lifecycle

Successful Stripe consent stores the OAuth credential encrypted and reports `connected`. Authlane
refreshes before expiry only when Stripe returns expiry and refresh material. Reconnect after
provider revocation or an `expired` or `error` state. Hosted disconnect requires a fresh connect
session with recent reauthentication.

## Troubleshooting

- Customer and charge IDs must belong to the connected Stripe account.
- An empty list can mean the wrong account was connected or no matching data exists.
- This adapter exports no create, update, refund, or delete tools; `read_only` is the only configured
  default scope.

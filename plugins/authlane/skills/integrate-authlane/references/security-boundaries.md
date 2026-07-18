# Security boundaries

Use this checklist before implementation and during review.

## Workload identities

Create separate server-side Authlane keys instead of one broad application key:

| Workload | Minimum scopes |
| --- | --- |
| Catalog/status BFF | `catalog:read`, `connections:read` |
| Connect-session BFF | `connect-sessions:create` |
| Agent/tool runtime | `connections:read`, `credentials:issue` |

Store keys in the deployment secret store, rotate them independently, redact them from logs, and
scan browser/server bundles. Never place a key in `NEXT_PUBLIC_*`, `VITE_*`, client state, HTML,
analytics, model input, or a mobile binary.

## Browser and BFF

- Authenticate every BFF route from the SaaS session.
- Derive `externalUserId` from that session; reject a client/model-supplied identity.
- Protect mutations with same-origin/CSRF controls and rate limits.
- Select `allowedOrigin` from a static environment allowlist. Never reflect `Origin`, `Referer`, or
  request JSON. Use exact HTTPS origins per environment; do not use wildcards.
- Apply request-body, message-count, message-size, response-size, timeout, and cancellation limits.
- Return only definitions/status or a short-lived `connectUrl` to the browser. Executable callbacks
  remain on the server.

## Connect lifecycle

Treat a connect URL as a short-lived browser credential: do not log, persist, cache, analyze, or
send it to third parties. Expire it quickly.

`allowedServices: []` is not a wildcard. Authlane resolves and stores the concrete intersection of
globally enabled and tenant-enabled services when the session is created. Later additions are not
included. Later-disabled services are hidden and cannot begin authorization.

Disconnect is destructive. After a fresh tenant-authenticated step-up, use the existing
`connect-sessions:create` workload to mint a new connect session and pass `reauthenticatedAt`.
Authlane marks that session for the short destructive-action window; the hosted connect flow uses
the session to disconnect. There is no separate disconnect API-key scope, and a normal connect
session does not grant disconnect authority.

## Local execution

Create tools per request and authenticated user. Do not serialize, memoize, share across tenants, or
place them in a global singleton. Listing catalog/status/definitions must not issue a credential
lease or call a provider.

Each tool invocation requests one fresh, audited, short-lived, access-only lease with `Cache-Control:
no-store`. Never receive, request, log, persist, cache, return, or reuse refresh tokens, ID tokens,
client secrets, tenant keys, or lease material. The adapter calls a static provider origin directly
from the customer's runtime.

## Errors and forbidden architecture

Expose fixed application error codes/messages to browsers and models. Do not forward provider body,
headers, stack traces, request URLs containing secrets, or credential values.

Never add an Authlane provider proxy, gateway, remote tool-execution endpoint, hosted MCP server, or
browser-side executable toolset. A caller-owned local MCP transport is allowed only inside the
customer's authenticated runtime and must remain bound to one `externalUserId`.

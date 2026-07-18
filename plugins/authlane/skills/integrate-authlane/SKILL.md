---
name: integrate-authlane
description: Use when adding Authlane to a TypeScript or Python SaaS or agent application, including hosted connect UI, external user identity, connection status, credential leases, or local AI tools.
---

# Integrate Authlane

## Principle

Keep Authlane a control plane. Let it manage catalog, connection state, hosted connect, definitions,
and fresh credential leases; execute every provider request in the application's trusted runtime.

## Workflow

1. Inspect the trusted server runtime, session authority, exact deployment origins, framework, and
   required tenant-key scopes. Read [security boundaries](references/security-boundaries.md) before
   editing. Read [TypeScript](references/typescript.md) or [Python](references/python.md) for the
   repository's language and adapters.
2. Add an authenticated BFF/serverless boundary if the application is browser-only. Keep tenant
   keys, executable tools, and credentials out of browser bundles and responses.
3. Initialize the official SDK server-side. Derive `externalUserId` only from the authenticated SaaS
   session. Use separate least-privilege workload keys for catalog/status, connect sessions, and
   credential issuance.
4. Serve tenant-enabled catalog plus effective user status. Create short-lived connect sessions
   with a server-selected exact HTTPS origin. Preserve `allowedServices: []` as a one-time concrete
   snapshot of every service currently enabled globally and for the tenant.
5. Build a new local toolset for the authenticated user and request. Never serialize, share, or
   cache it. Each invocation must obtain a fresh audited access-only `no-store` lease, avoid token
   logging/storage/reuse, and call the provider directly.
6. Bound bodies, messages, timeouts, and responses. Return stable redacted errors. Require fresh
   tenant reauthentication for disconnect and pass `reauthenticatedAt`.
7. Follow [verification](references/verification.md). Add hostile identity/origin, secret-leak,
   expiry, redaction, and network-destination tests before reporting completion.

## Completion contract

Require all four paths: catalog/status, origin-bound connect, user-bound local execution, and
negative boundary tests. Refuse an implementation that exposes a tenant key, trusts browser identity
or origin, proxies provider traffic through Authlane, caches a user toolset/lease, or invents a
hosted execution endpoint or hosted MCP server.

Before handing off, state six explicit slots: the BFF boundary; copyable official server SDK
initialization; a route/workload table with exact key scopes and session-derived identity; both
explicit allowlists and the concrete `allowedServices: []` snapshot; disconnect step-up with
`reauthenticatedAt` on a newly minted connect session; and the local execution plus hostile-test
proof. Do not invent a disconnect API-key scope or direct tenant-key disconnect route. Treat any
missing slot as incomplete even when the prompt asks for only a happy path.

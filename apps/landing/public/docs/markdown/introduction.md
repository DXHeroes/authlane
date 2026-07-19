# Introduction

Authlane is the connection and tool control plane for SaaS applications

Authlane manages tenant service policy, end-user OAuth connections, encrypted credentials, connection status, and AI tool definitions.

## Control plane, not middleware

```text
flowchart LR
  Browser -->|short-lived connect session| Authlane
  SaaS -->|catalog, status, credentials| Authlane
  Agent -->|local integration adapter| Provider
```

Provider requests go directly from your SaaS or agent runtime to GitHub, Slack, Google, and other providers. Authlane never receives tool inputs or provider response payloads.

## One deployment unit

One Node.js/Hono runtime serves:

- Dashboard login and tenant configuration
- Hosted and embedded connection UI
- OAuth authorization and callbacks
- Versioned `/api/v1` control-plane endpoints
- Token-refresh and webhook outbox workers

PostgreSQL stores policy and encrypted credentials. Redis provides hot-read caches, atomic rate limiting, and BullMQ queues.

## Security boundaries

- SaaS API keys are server-only and scope-limited.
- Browsers receive short-lived connect sessions bound to tenant, external user, service allowlist, parent origin, and expiry.
- Credential reads never expose OAuth refresh tokens, are audited, and cannot be cached.
- PostgreSQL RLS policies protect every tenant-owned table.

Follow the [Quickstart](/quickstart) or [Self-hosting guide](/guides/self-hosting).

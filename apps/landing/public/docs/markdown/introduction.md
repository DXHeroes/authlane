# Introduction

Use Authlane as the connection and tool control plane for your SaaS application.

Authlane gives a SaaS organization one place to configure services, connect its external users,
encrypt credentials, read effective status, and load AI tool definitions.

## Choose the control-plane boundary

Browsers use a short-lived hosted connect session. SaaS backends use scoped tenant API keys for
catalog, status, definitions, connect sessions, and audited access-only credential leases. AI
framework adapters and provider handlers execute inside the SaaS runtime.

```text
Browser -> Authlane: hosted connection and OAuth
SaaS -> Authlane: catalog, status, definitions, lease
SaaS -> Provider: tool input and provider request
Provider -> SaaS: provider response
```

Provider traffic never passes through Authlane. Authlane has no tool-execution endpoint, hosted MCP
server, or reusable cross-user credential.

## Build the first working path

1. Follow the [Quickstart](/docs/quickstart).
2. Understand [how Authlane works](/docs/concepts/how-authlane-works) and the
   [core concepts](/docs/concepts/core-concepts).
3. Implement [service discovery](/docs/guides/list-services),
   [hosted connect](/docs/guides/connect-user), and
   [user-scoped tools](/docs/guides/user-tools).
4. Choose an [SDK or framework](/docs/sdk/frameworks).
5. Apply [production hardening](/docs/guides/production-hardening).

## Operate one runtime

The production Hono application serves the dashboard, hosted connect UI, OAuth callbacks,
versioned control-plane API, refresh jobs, and webhook outbox. PostgreSQL stores tenant policy and
encrypted records; Redis supports hot reads, distributed rate limiting, and queues.

Self-hosters should continue with [self-hosting](/docs/guides/self-hosting), then complete the
[security operations](/docs/guides/security-operations) launch gate.

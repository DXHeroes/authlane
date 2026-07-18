# Integration verification

Do not report completion until these behaviors are executable tests.

## Product paths

- Catalog returns only tenant-enabled services and issues no lease/provider request.
- Capabilities/status returns effective `connected`, `expired`, or `disconnected` state in the hot
  read and issues no lease/provider request.
- Connect uses the authenticated session identity, a server allowlisted exact HTTPS origin, a short
  expiry, and correct explicit or empty snapshot allowlist semantics.
- A framework callback obtains one fresh lease and the resulting provider request reaches the
  provider host directly, never an Authlane host.

## Hostile boundary cases

- Unauthenticated, cross-site, and over-limit BFF requests fail.
- A body/model-supplied `externalUserId` cannot select another user.
- A reflected, wildcard, HTTP, malformed, or unconfigured origin fails.
- Expired/replayed connect URLs fail and are absent from logs/analytics.
- Disconnect without current step-up evidence fails; accepted requests send `reauthenticatedAt`.
- Toolsets cannot be serialized, shared, or reused across identities/tenants.
- Concurrent invocations obtain independent leases; no lease/cache reuse occurs.
- Refresh/ID tokens and provider bodies never appear in errors, logs, traces, model output, or
  browser responses.

## Static and deployment checks

- Scan browser output/source maps for every tenant-key value and environment variable name.
- Assert deployment secrets exist only in server/serverless workloads with minimal scopes.
- Mock DNS/HTTP and assert execution destinations are static supported provider origins.
- Assert catalog/status/definition reads never contact providers.
- Bound request size, message count/size, provider response size, redirects, timeout, and
  cancellation.
- Exercise every `{ data, error }` branch and expose only stable redacted application errors.

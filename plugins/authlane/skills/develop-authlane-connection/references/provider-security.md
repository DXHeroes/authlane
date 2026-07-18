# Provider security

## Research before code

Use official provider documentation. Record URLs and retrieval date for:

- supported OAuth/OAuth2/API-key flow and whether PKCE applies;
- exact authorization/token URLs, redirect requirements, credential placement, and token type;
- minimal scopes/permissions, consent behavior, refresh/revocation, expiry, and rotation;
- static REST/GraphQL origins, methods, pagination, rate limits, redirects, maximum payloads, and
  provider error envelopes.

If the provider contract is ambiguous, stop and surface the decision. Do not force API keys through
an OAuth adapter or infer refresh support.

## Credential boundary

Authlane stores and refreshes credentials in the control plane. A local executor receives one
fresh, audited, short-lived, user-scoped access-only lease at invocation time. Never expose refresh
tokens, ID tokens, client secrets, tenant keys, or credential values to browsers, model output,
results, logs, traces, query strings unless the official provider contract explicitly requires
query placement, or caches.

Reject unsupported credential types before provider I/O. Keep API-key header/query placement
explicit per provider. Redact provider bodies, headers, stack traces, and secret-bearing URLs into
stable SDK errors.

## Provider HTTP boundary

- Hard-code approved HTTPS origins; reject user-controlled hosts and schemes.
- Add OAuth authorization/token origins to the explicit SSRF allowlist when applicable.
- Encode every path segment and construct query parameters with URL APIs.
- Validate canonical JSON Schema before acquiring a lease.
- Bound collection limits, strings, request/response bytes, pagination, and execution time.
- Disable redirects by default; if official behavior requires one, validate every hop against the
  same allowlist and strip credentials across origins.
- Abort on timeout/cancellation and avoid automatic retries for non-idempotent writes.

Authlane must never proxy tool traffic, host execution, or become a remote MCP server. Catalog,
status, capability, and definition reads must issue no lease and contact no provider.

# Authlane implementation status

This file is a concise status index. The canonical runtime contract is
[OpenAPI](./apps/docs/api-reference/openapi.yaml); security requirements are in
[SECURITY.md](./SECURITY.md) and [Security operations](./docs/security/OPERATIONS.md).

## Implemented foundation

- Hono/TypeScript control plane with PostgreSQL RLS tenant isolation and scoped machine principals.
- Better Auth dashboard sessions with Argon2id passwords, encrypted Redis session storage, strict
  origins, session freshness checks, and mandatory MFA for privileged dashboard actions.
- OAuth PKCE with one-shot hash-only transactions, pinned provider endpoints, refresh serialization,
  exponential backoff, and auditable token lifecycle operations.
- Per-record AES-256-GCM envelope encryption. Random DEKs are wrapped by a versioned deployment KEK;
  lookup and Redis material use independent versioned keys held outside PostgreSQL.
- Provider access material is available only through `POST .../credential-leases` to a scoped server
  principal. OAuth refresh and ID tokens are never returned to a tenant application or browser.
- One production origin for browser surfaces, strict CSP, request size/content-type enforcement,
  trusted-proxy validation, bounded metrics labels, rate limits, and credential-safe logging.
- Least-privileged API, worker, and migration database roles; hardened non-root/read-only container;
  private database and Redis networks.
- CI tests, CodeQL, OSV, dependency review, Gitleaks, Dependabot, and Trivy image scanning.

## Local validation

```bash
pnpm lint:runtime
pnpm type-check
pnpm test
pnpm build
```

Use [QUICKSTART.md](./QUICKSTART.md) for development and [DEPLOYMENT.md](./DEPLOYMENT.md) for a
production deployment. Never copy old examples that use `ENCRYPTION_KEY`, browser API keys, or a GET
credentials endpoint; all three are intentionally unsupported.

# Authlane

Authlane is an open-source control plane for third-party connections in SaaS products and AI agents. It manages tenant policy, OAuth, encrypted credentials, connection status, and tool definitions. It does not proxy provider API traffic.

## Architecture

```text
Browser ── short-lived connect session ──▶ Authlane UI + OAuth
SaaS backend ── scoped API key ─────────▶ catalog / status / credential leases
AI agent ── @authlane/integration-* ────▶ GitHub, Slack, Google, ... directly
```

One Node.js/Hono process serves the dashboard, hosted connect UI, auth endpoints, and `/api/v1`. PostgreSQL is the source of truth; Redis backs hot-read caches, rate limits, and BullMQ token refresh jobs.

Provider requests never pass through Authlane. Your SaaS backend retrieves access-only credential material, then a local integration adapter calls the provider directly.

## Turnkey local demo

The repository includes a self-contained demo with a local OAuth 2.1 provider, PostgreSQL, Redis,
the Authlane runtime, and an Example SaaS BFF. It does not need third-party credentials or network
access after dependencies and container images are installed.

Prerequisites: Node.js 22+, pnpm 10, and Docker with Compose.

```bash
pnpm install --frozen-lockfile
pnpm demo
```

Open <http://localhost:5175> for the Example SaaS and <http://localhost:3000> for the Authlane
dashboard. A fresh admin password and scoped Example SaaS API key are generated on every start and
written only to `.authlane-demo/access.json`. Runtime keys live in `.authlane-demo/runtime.env`.
The directory is mode `0700`; both files are mode `0600`; raw secrets are never printed.

```bash
# Install the browser once, then run the complete deterministic acceptance flow.
pnpm exec playwright install chromium
pnpm demo:test

# Stop processes and containers but retain the encrypted database/audit history.
pnpm demo:down

# Also remove demo volumes and all locally generated demo secrets/artifacts.
pnpm demo:reset
```

`demo:test` proves the iframe OAuth flow with S256 PKCE and state validation, one-shot authorization
codes, rotating refresh tokens, automatic background refresh, BFF-only provider access, encrypted
database records, opaque encrypted Redis session storage, encrypted TOTP data, append-only access
audit, least-privilege database roles, MFA login, and durable API-key revocation. The local provider
is mounted only when `AUTHLANE_DEMO_MODE=true` outside production.

To add an optional real GitHub connection, create an OAuth app with callback
`http://localhost:3000/api/v1/oauth/github/callback`, then pass the credentials only to the process:

```bash
DEMO_GITHUB_CLIENT_ID=... DEMO_GITHUB_CLIENT_SECRET=... pnpm demo
```

The demo requests only `read:user` and `public_repo`. The client secret is envelope-encrypted before
database storage and is not copied into the generated runtime file.

## Quick start

Prerequisites: Docker with Compose.

```bash
cp .env.example .env
# Fill every required value. Generate independent 32-byte keys/passwords:
openssl rand -hex 32
docker compose up --build
```

Production configuration is fail-closed: `APP_URL` and CORS origins must be exact HTTPS origins,
all keyrings must be versioned, and PostgreSQL, Redis, worker, auth, and metrics secrets have no
insecure defaults. The one-shot migrator runs separately from the least-privileged application role.

Only the application port is exposed. PostgreSQL and Redis stay on the internal Compose network. Optional monitoring:

```bash
docker compose --profile monitoring up --build
```

## Development

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d
cp .env.example .env
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts only the API, dashboard, and connect UI. Vite proxies `/api` during development; production uses one same-origin runtime.

## Server-side SDK

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://authlane.example.com',
});

const { data: connectSession } = await authlane.connectSessions.create({
  externalUserId: 'user_123',
  allowedServices: ['github', 'slack'],
  allowedOrigin: 'https://app.example.com',
});

// Send only connectSession.url to the browser.
```

The API-key SDK intentionally throws in a browser. Use `@authlane/react` with the short-lived URL:

```tsx
import { AuthlaneConnect } from '@authlane/react';

<AuthlaneConnect connectUrl={connectSession.url} />;
```

## Direct provider execution

```typescript
import github from '@authlane/integration-github';

const { data: credential } = await authlane.credentialLeases.create({
  externalUserId: 'user_123',
  serviceId: 'github',
});

if (credential) {
  const result = await github.execute(
    'github_list_repos',
    { limit: 20 },
    credential
  );
}
```

This request goes from your application to GitHub, not through Authlane.

## Hot-read API

- `GET /api/v1/catalog/services`
- `GET /api/v1/users/{externalUserId}/capabilities?format=mcp|openai`
- `GET /api/v1/users/{externalUserId}/connections`
- `GET /api/v1/users/{externalUserId}/tools?format=mcp|openai`
- `POST /api/v1/users/{externalUserId}/connections/{serviceId}/credential-leases`
- `POST /api/v1/connect-sessions`

API key scopes are `catalog:read`, `connections:read`, `credentials:issue`, and `connect-sessions:create`.

Credential lease responses use `Cache-Control: no-store, private`, never expose OAuth refresh or ID tokens, and create an audit record.

## Performance target

The hot capability read is designed for P95 below 100 ms at 500 RPS on 2 vCPU / 1 GB after caches are warm. Run the acceptance benchmark against a configured instance:

```bash
PERF_API_KEY=ak_... PERF_EXTERNAL_USER_ID=user_123 pnpm test:performance
```

## Stack

| Area | Technology |
|---|---|
| Runtime/API | Node.js 22, Hono |
| UI | React, Vite, Tailwind |
| Database | PostgreSQL 16, Drizzle, RLS |
| Cache/queue | Redis 7, BullMQ |
| Monorepo | pnpm 10, Turborepo |
| Tests | Vitest, Playwright |

See [Security](./SECURITY.md), [Security operations](./docs/security/OPERATIONS.md),
[OpenAPI](./apps/docs/api-reference/openapi.yaml), and [AGENTS.md](./AGENTS.md).

## License

Elastic License 2.0 (ELv2).

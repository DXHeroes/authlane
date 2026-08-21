# Authlane

[![CI](https://github.com/DXHeroes/authlane/actions/workflows/ci.yml/badge.svg)](https://github.com/DXHeroes/authlane/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40authlane%2Fsdk?label=%40authlane%2Fsdk)](https://www.npmjs.com/package/@authlane/sdk)
[![PyPI](https://img.shields.io/pypi/v/authlane)](https://pypi.org/project/authlane/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Give every signed-in user tools backed by their own GitHub, Slack, Google, CRM, and productivity
connections—without putting another proxy in the provider request path.

Authlane is an MIT-licensed control plane for SaaS products and AI agents. One Hono application
serves the dashboard, hosted connect UI, OAuth callbacks, documentation, and versioned API. It keeps
tenant policy, encrypted credentials, connection status, and canonical tool definitions. Your
trusted runtime executes tools and calls providers directly.

[Documentation](https://authlane.io/docs) ·
[Quickstart](https://authlane.io/docs/quickstart) ·
[API reference](https://authlane.io/docs/api-reference) ·
[OpenAPI YAML](https://authlane.io/docs/openapi.yaml) ·
[OpenAPI JSON](https://authlane.io/docs/openapi.json) ·
[Agent plugin](./docs/agent-plugins.md) ·
[Security](./SECURITY.md)

[TypeScript SDK](https://authlane.io/docs/sdk/typescript) ·
[Python SDK](https://authlane.io/docs/sdk/python) ·
[Framework adapters](https://authlane.io/docs/sdk/frameworks) ·
[Integration authoring](https://authlane.io/docs/guides/custom-integrations) ·
[AI coding tools](https://authlane.io/docs/ai-tools/marketplace)

## First success in four steps

### 1. Load services on your backend

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

const { data: services, error } = await authlane.services.list();
```

All public SDK calls return `{ data, error }`; expected API failures do not throw.

### 2. Offer services in your product UI

Render the safe catalog using your own components, copy, filtering, and permissions. The tenant API
key stays on the server.

```tsx
<ServicePicker services={services ?? []} onConnect={(serviceId) => connect(serviceId)} />
```

### 3. Connect one external user

```typescript
const { data: session, error: sessionError } = await authlane.connectSessions.create({
  externalUserId: 'user_123',
  allowedServices: [],
  allowedOrigin: 'https://app.example.com',
});

// Return only session.url to the browser.
```

`allowedServices: []` snapshots every service currently enabled for the tenant. Pass explicit IDs
such as `['github', 'slack']` to limit the session. Duplicate IDs are accepted and deduplicated by
the server.

### 4. Give that user's tools to your framework

```typescript
import { vercelAI } from '@authlane/ai/vercel';

const { data: tools, error: toolsError } = await authlane
  .user('user_123')
  .tools.list({ adapter: vercelAI() });

if (toolsError) return Response.json(toolsError, { status: 502 });
return streamText({ model, messages, tools });
```

Adapters are available for Vercel AI SDK, OpenAI Agents, Mastra, and an in-process local MCP
server. Authlane does not expose a hosted MCP server or tool-execution endpoint.

For each enabled service, the tenant chooses `read_only` or `full`. Authlane filters the canonical
tool set before it reaches the SDK and preserves standard MCP annotations. SDK definitions include
`risk: 'read' | 'write' | 'destructive'`, so your product can display, disable, or approve actions
without guessing from tool names. Framework approval is a separate runtime choice:

```typescript
const { data: tools } = await authlane
  .user('user_123')
  .tools.list({ adapter: vercelAI({ approval: 'write-and-destructive' }) });
```

Read-only tenant policy prevents write and destructive tools from being issued at all; approval
controls which issued tools require confirmation immediately before execution.

## Python

```bash
pip install authlane
```

```python
import os

from authlane import Authlane
from authlane.adapters import langchain

with Authlane(
    api_key=os.environ["AUTHLANE_API_KEY"],
) as authlane:
    result = authlane.user("user_123").tools.list(adapter=langchain())

if result.error:
    print(result.error.message)
else:
    tools = result.data
```

Python provides synchronous and asynchronous clients plus generic, Agno, LangChain, and OpenAI
Agents adapters. See the [Python SDK](https://authlane.io/docs/sdk/python) and
[framework adapters](https://authlane.io/docs/sdk/frameworks).

## The boundary

```text
CONNECT / CONTROL PLANE

Your SaaS backend ── scoped API key ──▶ Authlane catalog + connection state
Signed-in browser ── origin-bound session ──▶ Authlane hosted connect + OAuth

EXECUTION / DATA PLANE

Your agent runtime ── local Authlane adapter ──▶ Provider API
                         (GitHub, Slack, Google, CRM, ...)

                         Authlane is not in this path
```

Credential leases contain only access material needed for direct execution. They are audited,
non-cacheable, and never expose OAuth refresh or ID tokens. The adapter requests a lease when a
selected tool runs, then sends tool inputs and receives provider payloads entirely inside your
runtime.

## API and performance

The canonical [OpenAPI 3.1 specification](./apps/docs/api-reference/openapi.yaml) is also published
as deterministic [YAML](https://authlane.io/docs/openapi.yaml) and
[JSON](https://authlane.io/docs/openapi.json). Core hot reads are:

- `GET /api/v1/catalog/services`
- `GET /api/v1/users/{externalUserId}/connections`
- `GET /api/v1/users/{externalUserId}/capabilities?format=mcp|openai`
- `GET /api/v1/users/{externalUserId}/tools?format=mcp|openai`
- `POST /api/v1/users/{externalUserId}/connections/{serviceId}/credential-leases`
- `POST /api/v1/connect-sessions`

API-key scopes are `catalog:read`, `connections:read`, `credentials:issue`, and
`connect-sessions:create`. The warm capability-read target is P95 below 100 ms at 500 RPS on
2 vCPU / 1 GB:

```bash
PERF_API_KEY=ak_... PERF_EXTERNAL_USER_ID=user_123 pnpm test:performance
```

Run the benchmark against a dedicated environment whose server-side rate limit is at least the
profile's total request count (10,000 by default). For the local demo, start Authlane with
`RATE_LIMIT_MAX_REQUESTS=20000 pnpm demo`; production rate limits should remain enabled and sized
for the intended workload.

## Run the secure local demo

Prerequisites: Node.js 22+, pnpm 10, and Docker with Compose.

```bash
pnpm install --frozen-lockfile
pnpm demo
```

Open <http://localhost:5175> for the Example SaaS and <http://localhost:3000> for Authlane. The
demo includes a local OAuth 2.1 provider, PostgreSQL, Redis, Authlane, and an Example SaaS BFF; it
needs no third-party credentials.

```bash
pnpm exec playwright install chromium
pnpm demo:test
pnpm demo:down   # Keep encrypted database and audit history
pnpm demo:reset  # Remove volumes and generated local secrets
```

Fresh credentials are written only to mode-protected files under `.authlane-demo/` and are never
printed. The deterministic acceptance flow proves PKCE/state validation, refresh rotation,
BFF-only provider access, encrypted storage, MFA, audit logging, and API-key revocation.

## Self-host one application

```bash
cp .env.example .env
# Fill every required value; generate independent keys with: openssl rand -hex 32
docker compose up --build
```

Only the Authlane application port is exposed. PostgreSQL and Redis remain on the internal network;
the one-shot migrator uses a separate role. Production configuration requires exact HTTPS origins,
versioned keyrings, and explicit database, Redis, worker, auth, and metrics secrets. Follow the
[self-hosting guide](https://authlane.io/docs/guides/self-hosting) before launch.

Self-hosting defaults to `AUTHLANE_AUTH_MODE=email-password`. For passwordless auth, select
`magic-link`, configure a verified Resend sender at runtime, and set `AUTHLANE_ALLOW_SIGNUP` to your
intended account-creation policy. Production magic-link startup fails closed without complete email
delivery configuration.

Organization owners and admins can validate a dedicated test identity in **Dashboard → Sandbox**.
The direct runner uses the real SDK, credential lease, and provider-local adapter; the optional AI
runner uses Vercel AI SDK with OpenAI, Anthropic, or Google. Configure the matching runtime key and
follow the [Sandbox guide](https://authlane.io/docs/guides/sandbox). Prompts, arguments, and results
remain ephemeral; only execution metadata is retained for audit.

## Develop Authlane

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Useful checks:

```bash
pnpm test
pnpm type-check
pnpm build
pnpm openapi:check
```

The monorepo uses Node.js 22, Hono, React, PostgreSQL 16, Drizzle, Redis, BullMQ, pnpm, Turborepo,
Vitest, and Playwright. See [AGENTS.md](./AGENTS.md) for repository conventions and
[security operations](./docs/security/OPERATIONS.md) for production procedures. Maintainers should
follow the manual OIDC [release guide](./docs/releasing.md); merging code never publishes packages.
New contributors should start with [CONTRIBUTING.md](./CONTRIBUTING.md).
New contributors should start with [CONTRIBUTING.md](./CONTRIBUTING.md).

## AI coding plugin marketplace

Install the shared repository plugin for Claude Code, Codex, or Cursor by following the
[agent plugin guide](./docs/agent-plugins.md). It provides `integrate-authlane` and
`develop-authlane-connection` from one shared source tree. The plugin contains instructions only—no
hosted MCP server, provider access, tenant API key, or external credential.

## License

[MIT](./LICENSE) © 2026 Authlane contributors. You may use, copy, modify, merge, publish, distribute,
sublicense, and sell copies subject to the MIT License terms. Third-party service marks under
`integrations/*/icon.svg` are excluded — see [THIRD_PARTY_NOTICES](./integrations/THIRD_PARTY_NOTICES.md).

# `@authlane/sdk`

Server-side TypeScript client for the Authlane control plane. Authlane stores connection policy,
status, tool definitions, and credentials; your SaaS executes provider requests directly.

## Install

```bash
pnpm add @authlane/sdk
```

## Configure

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});
```

The API-key client is server-only. API and adapter operations use `{ data, error }`; expected
failures do not throw. Invalid constructor configuration still throws.

## Bind an authenticated user

Derive the external user ID from your trusted server session and bind it once:

```typescript
const currentUser = await requireUser(request);
const user = authlane.user(currentUser.id);

const { data: capabilities, error } = await user.capabilities.get({ format: 'mcp' });
const connections = await user.connections.list();
```

The capability read returns effective connection states and tool definitions in one versioned hot
snapshot. Never accept `externalUserId` from model or tool input.

## Build executable AI tools

Install `@authlane/ai` and the optional peer for your framework. For Vercel AI SDK:

```bash
pnpm add @authlane/ai ai zod
```

```typescript
import { vercelAI } from '@authlane/ai/vercel';

const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });
```

`tools` is bound to this external user and belongs only in the trusted SaaS runtime. Do not
serialize it to a browser or cache it across identities. A fresh, audited, access-only credential
lease is created only when a local generated callback executes; the integration consumes it and
calls the provider from your process. Provider traffic never flows through Authlane.

See [`@authlane/ai`](../ai/README.md) for Vercel AI SDK, OpenAI Agents, local MCP, custom integration,
and security examples.

## Hosted connect UI

Create a short-lived session on your backend and return only its URL to the browser:

```typescript
const session = await authlane.connectSessions.create({
  externalUserId: currentUser.id,
  allowedServices: ['github', 'slack'],
  allowedOrigin: 'https://app.example.com',
  expiresInSeconds: 600,
});
```

Use `session.data?.url` as a hosted page or pass it to `@authlane/react`.

Pass `allowedServices: []` to snapshot every service currently enabled globally and for your organization. The session stores concrete IDs, not a wildcard. Services enabled later are not added, while services disabled later are hidden and cannot start a new authorization.

## Definitions without execution callbacks

```typescript
await authlane.services.list();
await user.tools.list({ format: 'openai' });
```

## Required API-key scopes

- `catalog:read`
- `connections:read`
- `credentials:issue`
- `connect-sessions:create`

Grant only the scopes used by each workload. OAuth refresh and ID tokens never leave Authlane.

## License

MIT

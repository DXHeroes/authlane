# TypeScript SDK

Use the server-only TypeScript SDK for catalog, connection, capability, and tool workflows.

The TypeScript SDK exposes control-plane resources and explicit user scopes with non-throwing
results for expected failures.

## Prerequisites

```bash
pnpm add @authlane/sdk
```

Keep the tenant API key in a trusted Node.js server environment.

The client talks to `https://app.authlane.io` unless you say otherwise, so only a self-hosted
deployment needs `baseUrl`.

## Implement the workflow

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function loadUser(userId: string) {
  // One call: connection status and tool definitions for this user.
  return authlane.user(userId).capabilities.get({ format: 'mcp' });
}
```

`user.capabilities.get()` is the hot read: it answers "what can this user do right now" in a single
request. The pieces are also available separately when you need only one of them:

```typescript
export async function loadPieces(userId: string) {
  const user = authlane.user(userId);

  const { data: connections, error: connectionsError } = await user.connections.list();
  if (connectionsError) return { data: null, error: connectionsError };

  const { data: definitions, error: definitionsError } =
    await user.tools.list({ format: 'openai' });
  if (definitionsError) return { data: null, error: definitionsError };

  return { data: { connections, definitions }, error: null };
}
```

Bind the user before choosing an executable adapter; see
[load user-scoped tools](/docs/guides/user-tools).

Custom application adapters can override a built-in handler for the same service while the
capability snapshot remains authoritative:

```typescript
import type { FrameworkAdapterOptions } from '@authlane/ai';
import { vercelAI } from '@authlane/ai/vercel';
import { executeGithubInsideOurBackend } from './github.js';

type IntegrationAdapter = NonNullable<FrameworkAdapterOptions['integrations']>[number];

// Replaces the built-in GitHub handler. The credential still comes from Authlane.
const customGithub: IntegrationAdapter = {
  serviceId: 'github',
  definitions: [],
  execute: executeGithubInsideOurBackend,
};

export async function loadCustomTools(userId: string) {
  const { data: customTools, error: customToolsError } = await authlane
    .user(userId)
    .tools.list({ adapter: vercelAI({ integrations: [customGithub] }) });
  if (customToolsError) return { data: null, error: customToolsError };

  return { data: customTools, error: null };
}
```

Connect sessions, catalog reads, and raw definitions are also typed:

```typescript
export async function loadSetup(userId: string) {
  const { data: session, error: sessionError } = await authlane.connectSessions.create({
    externalUserId: userId,
    allowedServices: [],
    allowedOrigin: 'https://app.example.com',
  });
  if (sessionError) return { data: null, error: sessionError };

  const { data: services, error: servicesError } = await authlane.services.list();
  if (servicesError) return { data: null, error: servicesError };

  return { data: { session, services }, error: null };
}
```

## Expected result

Every public operation resolves to `{ data, error }`. Invalid constructor configuration still
throws because no client can be created.

## Handle errors

Branch on `error.code` and preserve `statusCode`, `hint`, and `docUrl` where useful. See
[errors and rate limits](/docs/api-reference/errors-and-rate-limits).

## Security boundary

Return only `session.url` to a browser. Raw definitions contain no callbacks; executable toolsets,
API keys, and credential leases remain server-only. Provider execution stays in the SaaS runtime.

## Next step

Choose a complete [framework adapter](/docs/sdk/frameworks) flow.

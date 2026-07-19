# TypeScript SDK

Server-side, user-scoped access to Authlane capabilities and local AI tools

## Install and configure

```bash
pnpm add @authlane/sdk
```

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});
```

The client sends the tenant API key as a bearer credential and is server-only. API and adapter
operations return `{ data, error }`; they do not throw for expected failures. Invalid constructor
configuration still throws.

## User-scoped resources

Derive `externalUserId` from your SaaS's authenticated server session once, then bind it:

```typescript
const currentUser = await requireUser(request);
const user = authlane.user(currentUser.id);

const { data: capabilities, error: capabilitiesError } =
  await user.capabilities.get({ format: 'mcp' });
const { data: connections, error: connectionsError } = await user.connections.list();
const { data: definitions, error: definitionsError } =
  await user.tools.list({ format: 'openai' });

const error = capabilitiesError ?? connectionsError ?? definitionsError;
if (error) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.statusCode ?? 400 },
  );
}
```

`user.capabilities.get()` is the hot read for status plus definitions in one versioned snapshot.
The unscoped methods remain available, but `authlane.user(externalUserId)` makes the identity
boundary explicit and avoids repeating an ID on every call.

## Vercel AI SDK

Install the adapter's optional peer explicitly:

```bash
pnpm add @authlane/sdk @authlane/ai ai zod
```

```typescript
import { vercelAI } from '@authlane/ai/vercel';
import { createTextStreamResponse, streamText, toTextStream } from 'ai';

const user = authlane.user(currentUser.id);
const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });

if (error) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.statusCode ?? 400 },
  );
}

const result = streamText({
  model: 'openai/gpt-5-mini',
  messages,
  tools,
});

return createTextStreamResponse({
  stream: toTextStream({ stream: result.stream }),
});
```

## OpenAI Agents SDK

Install the OpenAI Agents optional peer explicitly:

```bash
pnpm add @authlane/sdk @authlane/ai @openai/agents zod
```

```typescript
import { openAIAgents } from '@authlane/ai/openai';
import { Agent, run } from '@openai/agents';

const user = authlane.user(currentUser.id);
const { data: tools, error } = await user.tools.list({ adapter: openAIAgents() });

if (error) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.statusCode ?? 400 },
  );
}

const agent = new Agent({
  name: 'Workspace assistant',
  instructions: 'Use only the connected services needed to answer the request.',
  tools,
});
const result = await run(agent, prompt);

return Response.json({ output: result.finalOutput });
```

## Local MCP server

Install the MCP optional peer explicitly:

```bash
pnpm add @authlane/sdk @authlane/ai @modelcontextprotocol/sdk zod
```

`mcpServer()` creates a low-level MCP `Server`; your application owns and connects its transport:

```typescript
import { mcpServer } from '@authlane/ai/mcp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export async function connectUserMcpServer(
  externalUserId: string,
  transport: Transport,
) {
  const user = authlane.user(externalUserId);
  const { data: server, error } = await user.tools.list({ adapter: mcpServer() });

  if (error) return { data: null, error };
  await server.connect(transport);
  return { data: server, error: null };
}
```

The caller must authenticate the user before calling this function and must close the returned
server and transport together. One server is permanently bound to one `externalUserId`; never
reuse it for another identity, connection, request context, or tenant.

## Custom integration overrides

Pass an application-owned integration adapter to any framework adapter. An explicit custom
adapter takes priority over Authlane's built-in adapter with the same `serviceId`:

```typescript
import type { FrameworkAdapterOptions } from '@authlane/ai';
import { vercelAI } from '@authlane/ai/vercel';

type IntegrationAdapter = NonNullable<FrameworkAdapterOptions['integrations']>[number];

const customGithub: IntegrationAdapter = {
  serviceId: 'github',
  definitions: [],
  async execute(toolName, input, credential) {
    return executeGithubInsideOurBackend(toolName, input, credential);
  },
};

const { data: customTools, error: customToolsError } =
  await authlane.user(currentUser.id).tools.list({
    adapter: vercelAI({ integrations: [customGithub] }),
  });

if (customToolsError) {
  return Response.json(
    { error: { code: customToolsError.code, message: customToolsError.message } },
    { status: customToolsError.statusCode ?? 400 },
  );
}
```

Custom adapters run inside your SaaS trust boundary. They receive ephemeral access-only material
for the current invocation and must not log, persist, cache, or return it.

## Connect sessions and raw definitions

```typescript
const { data: session, error: sessionError } = await authlane.connectSessions.create({
  externalUserId: currentUser.id,
  allowedServices: ['github'],
  allowedOrigin: 'https://app.example.com',
  expiresInSeconds: 600,
});

if (sessionError) {
  return Response.json(
    { error: { code: sessionError.code, message: sessionError.message } },
    { status: sessionError.statusCode ?? 400 },
  );
}

const { data: services, error: servicesError } = await authlane.services.list();
if (servicesError) {
  return Response.json(
    { error: { code: servicesError.code, message: servicesError.message } },
    { status: servicesError.statusCode ?? 400 },
  );
}

const { data: rawDefinitions, error: definitionsError } =
  await authlane.user(currentUser.id).tools.list({ format: 'openai' });
if (definitionsError) {
  return Response.json(
    { error: { code: definitionsError.code, message: definitionsError.message } },
    { status: definitionsError.statusCode ?? 400 },
  );
}
```

Return only `session.url` to the browser. Raw tool definitions contain no execution
callbacks; executable toolsets from an adapter are server-only. Provider requests originate in
your SaaS process and never pass through Authlane.

An empty `allowedServices` array snapshots every service currently enabled globally and for the
organization. Authlane stores the resolved IDs on the session; later additions are not included,
and later-disabled services are hidden and cannot start a new authorization.

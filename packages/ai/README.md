# `@authlane/ai`

Framework adapters that turn one Authlane user's connected-service definitions into locally
executable AI tools. Authlane remains the credential and capability control plane; provider calls
originate in your SaaS process.

## How execution works

1. Authenticate a user in your SaaS backend and derive their `externalUserId` from that trusted
   session.
2. Create `authlane.user(externalUserId)` and list tools with a framework adapter.
3. Pass the returned toolset directly to the framework in the same server request or user-bound
   runtime.
4. When the framework invokes a generated callback, the SDK requests one fresh, audited,
   access-only credential lease and runs the matching integration locally.
5. The integration calls the provider directly. Authlane never receives the provider request or
   response.

The initial tool listing is a control-plane capability read. It does not issue a credential lease.

## Vercel AI SDK

`ai` is an optional peer, so install it explicitly with the SDK and adapter package:

```bash
pnpm add @authlane/sdk @authlane/ai ai zod
```

```typescript
import { vercelAI } from '@authlane/ai/vercel';
import { Authlane } from '@authlane/sdk';
import { createTextStreamResponse, streamText, toTextStream } from 'ai';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});

const currentUser = await requireUser(request);
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

`@openai/agents` is an optional peer, so install it explicitly:

```bash
pnpm add @authlane/sdk @authlane/ai @openai/agents zod
```

```typescript
import { openAIAgents } from '@authlane/ai/openai';
import { Authlane } from '@authlane/sdk';
import { Agent, run } from '@openai/agents';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});
const currentUser = await requireUser(request);
const { data: tools, error } = await authlane
  .user(currentUser.id)
  .tools.list({ adapter: openAIAgents() });

if (error) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.statusCode ?? 400 },
  );
}

const agent = new Agent({
  name: 'Workspace assistant',
  instructions: 'Use connected services only when needed.',
  tools,
});
const result = await run(agent, prompt);

return Response.json({ output: result.finalOutput });
```

## Local MCP with a caller-owned transport

`@modelcontextprotocol/sdk` is an optional peer, so install it explicitly:

```bash
pnpm add @authlane/sdk @authlane/ai @modelcontextprotocol/sdk zod
```

`mcpServer()` builds an MCP `Server`. Authlane does not host it and does not choose the transport;
your application owns the transport and server lifecycle.

```typescript
import { mcpServer } from '@authlane/ai/mcp';
import { Authlane } from '@authlane/sdk';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});

export async function connectUserMcpServer(
  authenticatedExternalUserId: string,
  transport: Transport,
) {
  const result = await authlane
    .user(authenticatedExternalUserId)
    .tools.list({ adapter: mcpServer() });

  if (result.error) return result;
  await result.data.connect(transport);
  return result;
}
```

One returned MCP server is permanently bound to one authenticated external user. Never reuse a
server or its transport for another identity, tenant, browser session, or concurrent shared user
context. Close both when that user-bound lifecycle ends.

## Custom integration override

Every adapter accepts `FrameworkAdapterOptions.integrations`. An explicit custom adapter wins over
the built-in adapter with the same `serviceId`:

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

const { data: tools, error } = await authlane.user(currentUser.id).tools.list({
  adapter: vercelAI({ integrations: [customGithub] }),
});
```

The capability snapshot still decides which tools the user may call. The override changes only the
local handler for that service. Custom handlers execute inside your SaaS trust boundary and must
validate input and constrain outbound requests.

## Errors and security

- Create user scopes only from a server-authenticated tenant user. Never take `externalUserId` from
  a model, tool arguments, URL parameter, or untrusted browser body.
- Keep the tenant Authlane API key server-only.
- Never serialize executable toolsets or MCP servers to a browser, log them, or cache them across
  identities.
- The SDK requests a fresh access-only lease for each allowed invocation. Retain it only within
  that invocation; never log, persist, cache, return, or reuse it.
- OAuth refresh tokens and ID tokens never leave Authlane.
- Adapter and model-facing failures are fixed safe code/message values. Caught provider errors,
  response bodies, credential values, and stack traces are not forwarded.
- Provider traffic goes directly from the SaaS process to the provider. Authlane has no hosted
  tool-execution endpoint, gateway, or MCP server.

All Authlane SDK calls use the non-throwing `{ data, error }` contract for expected API and adapter
failures. Framework or transport lifecycle calls may still throw according to their own public
contracts; handle them at your application's trust boundary.

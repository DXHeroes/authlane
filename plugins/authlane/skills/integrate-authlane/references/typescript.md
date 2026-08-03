# TypeScript integration

## Install and initialize

Install only server packages in the trusted runtime:

```bash
pnpm add @authlane/sdk
pnpm add @authlane/react react react-dom # hosted connect UI in React
pnpm add @authlane/ai                   # generic local tools
pnpm add @authlane/ai ai                # Vercel AI SDK adapter
pnpm add @authlane/ai @openai/agents    # OpenAI Agents adapter
pnpm add @authlane/ai @mastra/core      # Mastra adapter
pnpm add @authlane/ai @modelcontextprotocol/sdk # caller-owned local MCP adapter
```

Install the base SDK, then only the UI/adapter line the application uses. Keep every package above
in the server runtime except the optional `@authlane/react` component.

```ts
import { Authlane } from '@authlane/sdk';

export const catalogAuthlane = new Authlane({
  apiKey: process.env.AUTHLANE_CATALOG_KEY!,
});
export const connectAuthlane = new Authlane({
  apiKey: process.env.AUTHLANE_CONNECT_KEY!,
});
export const toolsAuthlane = new Authlane({
  apiKey: process.env.AUTHLANE_TOOLS_KEY!,
});
```

Handle expected failures through `{ data, error }`; do not rely on exceptions.

## Catalog, status, and connect BFF

```ts
const currentUser = await requireUser(request);
const services = await catalogAuthlane.services.list();
const capabilities = await catalogAuthlane
  .user(currentUser.id)
  .capabilities.get({ format: 'mcp' });

const session = await connectAuthlane.connectSessions.create({
  externalUserId: currentUser.id,
  allowedServices: [],
  allowedOrigin: deploymentOrigins.production,
  expiresInSeconds: 600,
});
```

Return only safe catalog/status fields or `session.data.url`. Render that URL with
`@authlane/react`'s `AuthlaneConnect`, or redirect/open the hosted page. Never instantiate the API
client in React.

## Local AI adapters

Always bind the authenticated server identity immediately before building tools:

```ts
const currentUser = await requireUser(request);
const user = toolsAuthlane.user(currentUser.id);
```

| Runtime | Install/import | Adapter |
| --- | --- | --- |
| Generic/custom | `@authlane/ai` | `createBuiltInAdapter(...)` |
| Vercel AI SDK | `@authlane/ai/vercel` | `vercelAI()` |
| OpenAI Agents | `@authlane/ai/openai` | `openAIAgents()` |
| Mastra | `@authlane/ai/mastra` | `mastraAI()` |
| Caller-owned local MCP | `@authlane/ai/mcp` | `mcpServer()` |

```ts
import { vercelAI } from '@authlane/ai/vercel';

const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });
if (error) return safeSdkError(error);
return streamText({ model, messages: boundedMessages, tools });
```

Create this toolset per authenticated request. Its callbacks acquire fresh leases and call provider
hosts directly. Never cache it or return it to the browser. For local MCP, the application owns the
transport and lifecycle; bind one server permanently to one authenticated user and close it after
the request/session.

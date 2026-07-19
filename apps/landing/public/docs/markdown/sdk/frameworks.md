# Framework adapters

Give one external user’s connected tools to the AI framework running in your SaaS

Framework adapters are explicit output formats, not separate Authlane gateways. Your backend scopes
the request with `externalUserId`; the resulting handlers run beside your agent and call providers
directly.

## TypeScript

```typescript
import { Authlane } from '@authlane/sdk';
import { mastraAI } from '@authlane/ai/mastra';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});

const { data: tools, error } = await authlane
  .user('user_123')
  .tools.list({ adapter: mastraAI() });

if (error) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.statusCode ?? 400 },
  );
}
```

Choose the adapter at the integration boundary:

| Framework | Import | Adapter |
| --- | --- | --- |
| Vercel AI SDK | `@authlane/ai/vercel` | `vercelAI()` |
| OpenAI Agents | `@authlane/ai/openai` | `openAIAgents()` |
| Mastra | `@authlane/ai/mastra` | `mastraAI()` |
| Local MCP server | `@authlane/ai/mcp` | `mcpServer()` |

## Python

```python
import os

from authlane import Authlane
from authlane.adapters import agno, generic, langchain, openai_agents

with Authlane(api_key=os.environ["AUTHLANE_API_KEY"]) as authlane:
    user = authlane.user("user_123")
    agno_tools = user.tools.list(adapter=agno())
    langchain_tools = user.tools.list(adapter=langchain())
    openai_tools = user.tools.list(adapter=openai_agents())
    portable_tools = user.tools.list(adapter=generic())
```

## Identity and execution boundary

The `user_123` value must come from your authenticated SaaS session. Never accept an arbitrary
external user ID from an untrusted client. Authlane returns definitions and scoped local handlers;
it does not receive tool calls and does not expose a hosted MCP server.

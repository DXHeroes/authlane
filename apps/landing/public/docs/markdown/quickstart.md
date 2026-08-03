# Quickstart

Connect a signed-in user and give their connected tools to an AI runtime.

This server-first path lists your tenant catalog, creates an origin-bound connect session, and
loads one authenticated user's executable tools. Provider calls leave from your SaaS runtime;
Authlane remains the control plane.

## 1. Initialize Authlane on your server

```bash
pnpm add @authlane/sdk
```

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});
```

Keep `AUTHLANE_API_KEY` in a trusted server environment. The API-key SDK rejects browser usage.

## 2. List the services your tenant enabled

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function listServices() {
  const { data: services, error } = await authlane.services.list();
  if (error) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode ?? 400 },
    );
  }

  return Response.json({ services });
}
```

An empty array is a valid result: enable a service in the tenant dashboard before offering a
connect action.

## 3. Create a connect session for the signed-in user

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function createConnectSession(currentUser: { id: string }) {
  const { data, error } = await authlane.connectSessions.create({
    externalUserId: currentUser.id,
    allowedServices: [],
    allowedOrigin: 'https://app.example.com',
    expiresInSeconds: 600,
  });

  if (error) return { data: null, error };
  return { data: { connectUrl: data.url }, error: null };
}
```

`allowedServices: []` takes a one-time snapshot of every service currently enabled for this
tenant. Later additions are not included. Return only `data.url` to the browser.

## 4. Render the hosted connect UI

```bash
pnpm add @authlane/react
```

```tsx
import { AuthlaneConnect } from '@authlane/react';

export function Integrations({ connectUrl }: { connectUrl: string }) {
  return <AuthlaneConnect connectUrl={connectUrl} />;
}
```

The short-lived URL already binds the tenant, signed-in external user, service snapshot, exact
parent origin, and expiry. Neither the Authlane API key nor provider credentials enter React.

## 5. Give this user's tools to your AI runtime

Install the packages for the runtime you use:

### Vercel AI

```bash
pnpm add @authlane/sdk @authlane/ai ai zod
```

### OpenAI Agents

```bash
pnpm add @authlane/sdk @authlane/ai @openai/agents zod
```

### Mastra

```bash
pnpm add @authlane/sdk @authlane/ai @mastra/core zod
```

### Agno

```bash
pip install 'authlane[agno]'
```

### LangChain

```bash
pip install 'authlane[langchain]' langchain
```

### Local MCP

```bash
pnpm add @authlane/sdk @authlane/ai @modelcontextprotocol/sdk zod
```


Each panel is a complete server-side flow. Bind the authenticated external user before selecting
the adapter.

### Vercel AI

```typescript
import { vercelAI } from '@authlane/ai/vercel';
import { Authlane } from '@authlane/sdk';
import { createTextStreamResponse, streamText, toTextStream, type ModelMessage } from 'ai';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function answer(currentUser: { id: string }, messages: ModelMessage[]) {
  const user = authlane.user(currentUser.id);
  const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });
  if (error) return Response.json({ error }, { status: error.statusCode ?? 400 });

  const result = streamText({ model: 'openai/gpt-5-mini', messages, tools });
  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
}
```

### OpenAI Agents

```typescript
import { openAIAgents } from '@authlane/ai/openai';
import { Authlane } from '@authlane/sdk';
import { Agent, run } from '@openai/agents';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function answer(currentUser: { id: string }, prompt: string) {
  const user = authlane.user(currentUser.id);
  const { data: tools, error } = await user.tools.list({ adapter: openAIAgents() });
  if (error) return { data: null, error };

  const agent = new Agent({ name: 'Assistant', instructions: 'Use connected tools.', tools });
  const result = await run(agent, prompt);
  return { data: result.finalOutput, error: null };
}
```

### Mastra

```typescript
import { mastraAI } from '@authlane/ai/mastra';
import { Authlane } from '@authlane/sdk';
import { Agent } from '@mastra/core/agent';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function answer(currentUser: { id: string }, prompt: string) {
  const user = authlane.user(currentUser.id);
  const { data: tools, error } = await user.tools.list({ adapter: mastraAI() });
  if (error) return { data: null, error };

  const agent = new Agent({
    id: 'assistant',
    name: 'Assistant',
    instructions: 'Use connected tools.',
    model: 'openai/gpt-5-mini',
    tools,
  });
  return { data: await agent.generate(prompt), error: null };
}
```

### Agno

```python
import os
from dataclasses import dataclass

from agno.agent import Agent
from authlane import Authlane
from authlane.adapters import agno

@dataclass(frozen=True)
class CurrentUser:
    id: str

def answer(current_user: CurrentUser, prompt: str):
    with Authlane(api_key=os.environ["AUTHLANE_API_KEY"]) as authlane:
        user = authlane.user(current_user.id)
        result = user.tools.list(adapter=agno())
        if result.error is not None:
            return result
        assert result.data is not None
        return Agent(tools=result.data).run(prompt)
```

### LangChain

```python
import os
from dataclasses import dataclass

from authlane import Authlane
from authlane.adapters import langchain
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel

@dataclass(frozen=True)
class CurrentUser:
    id: str

def answer(current_user: CurrentUser, prompt: str, model: BaseChatModel):
    with Authlane(api_key=os.environ["AUTHLANE_API_KEY"]) as authlane:
        user = authlane.user(current_user.id)
        result = user.tools.list(adapter=langchain())
        if result.error is not None:
            return result
        assert result.data is not None
        agent = create_agent(model=model, tools=result.data)
        return agent.invoke({"messages": [{"role": "user", "content": prompt}]})
```

### Local MCP

```typescript
import { mcpServer } from '@authlane/ai/mcp';
import { Authlane } from '@authlane/sdk';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

export async function connectMcp(currentUser: { id: string }, transport: Transport) {
  const user = authlane.user(currentUser.id);
  const { data: server, error } = await user.tools.list({ adapter: mcpServer() });
  if (error) return { data: null, error };
  await server.connect(transport);
  return { data: server, error: null };
}
```


Listing tools reads definitions and status; it does not issue credentials. A generated callback
requests one fresh, audited, access-only lease only when invoked, then the local integration calls
the provider directly. Move body limits, route authentication, rate limiting, and redacted logging
into the [production hardening guide](/docs/guides/production-hardening).

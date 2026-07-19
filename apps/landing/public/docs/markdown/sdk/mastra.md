# Mastra

Create a Mastra agent with Authlane tools scoped to the signed-in SaaS user.

Use `mastraAI()` to build Mastra-native tools with canonical JSON Schema validation.

## Prerequisites

```bash
pnpm add @authlane/sdk @authlane/ai @mastra/core zod
```

## Implement the workflow

```typescript
import { mastraAI } from '@authlane/ai/mastra';
import { Authlane } from '@authlane/sdk';
import { Agent } from '@mastra/core/agent';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://app.authlane.io',
});

export async function answer(currentUser: { id: string }, prompt: string) {
  const user = authlane.user(currentUser.id);
  const { data: tools, error } = await user.tools.list({ adapter: mastraAI() });
  if (error) return { data: null, error };

  const agent = new Agent({
    id: 'workspace-assistant',
    name: 'Workspace assistant',
    model: 'openai/gpt-5-mini',
    tools,
  });
  return { data: await agent.generate(prompt), error: null };
}
```

## Expected result

`tools` is a Mastra tool map limited to effective connected capabilities for this user.

## Handle errors

Handle the tuple before `new Agent`. Schema or provider failures become fixed safe tool results;
framework failures remain your runtime's responsibility.

## Security boundary

Do not cache this map across identities. A callback obtains one fresh lease and executes the
provider adapter inside the SaaS process, never through Authlane.

## Next step

Use [connection lifecycle](/docs/guides/connection-lifecycle) to decide when to show reconnect UI.

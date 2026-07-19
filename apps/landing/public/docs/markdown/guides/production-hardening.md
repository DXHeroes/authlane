# Production hardening

Protect authenticated AI routes with bounded input, exact origins, rate limits, and redacted logs.

Harden the server route that scopes a user and gives their tools to an AI runtime.

## Prerequisites

Use a server session authority, a server-only Authlane key, an exact production origin, and a
distributed rate-limit store.

## Implement the workflow

```typescript
import { vercelAI } from '@authlane/ai/vercel';
import { Authlane } from '@authlane/sdk';
import { createTextStreamResponse, streamText, toTextStream } from 'ai';
import { z } from 'zod';
import { requireUser } from './session.js';

const authlane = new Authlane({ apiKey: process.env.AUTHLANE_API_KEY! });
const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().trim().min(1).max(8_000),
  }).strict()).min(1).max(50),
}).strict();

export async function POST(request: Request) {
  const currentUser = await requireUser(request);
  const declaredBytes = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > 65_536) {
    return Response.json({ error: { code: 'INVALID_CHAT_REQUEST' } }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: 'INVALID_CHAT_REQUEST' } }, { status: 400 });
  }

  const user = authlane.user(currentUser.id);
  const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });
  if (error) return Response.json({ error: { code: error.code } }, { status: 502 });
  const result = streamText({ model: 'openai/gpt-5-mini', messages: parsed.data.messages, tools });
  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
}
```

At the ingress, reject chunked or streamed bodies that exceed the same byte limit while reading;
`Content-Length` alone is not a complete limit. Rate-limit by authenticated tenant/user, set
connect-session origins on the server, and use separate least-privilege keys for catalog/status,
connect sessions, and credential issuance.

## Expected result

Invalid or oversized requests stop before capability reads or model calls. Logs contain request IDs,
stable error codes, duration, and route names, but no prompts, tokens, leases, or provider bodies.

## Handle errors

Return stable redacted codes. Honor `Retry-After` for Authlane `429` responses and retry only safe
reads with jittered exponential backoff.

## Security boundary

Never expose tenant keys, executable tools, or credentials to a browser. Use exact HTTPS origins;
plain HTTP is only for explicit localhost development.

## Next step

Apply the [security model](/docs/guides/security) and [errors and rate limits](/docs/api-reference/errors-and-rate-limits).

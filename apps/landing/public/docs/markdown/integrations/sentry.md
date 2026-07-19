# Sentry

Use the local Sentry adapter with Authlane credentials

Install the published adapter in the SaaS or agent runtime that will call Sentry:

```bash
pnpm add @authlane/integration-sentry
```

```typescript
import adapter from @authlane/integration-;

const definitions = adapter.definitions;
const result = await adapter.execute(toolName, input, credential);
```

Issue `credential` from the server-side Authlane credential-leases endpoint and use it immediately. The adapter calls Sentry directly; tool inputs and provider responses do not pass through Authlane.

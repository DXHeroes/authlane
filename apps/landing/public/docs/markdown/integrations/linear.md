# Linear

Use the local Linear adapter with Authlane credentials

Install the published adapter in the SaaS or agent runtime that will call Linear:

```bash
pnpm add @authlane/integration-linear
```

```typescript
import adapter from @authlane/integration-;

const definitions = adapter.definitions;
const result = await adapter.execute(toolName, input, credential);
```

Issue `credential` from the server-side Authlane credential-leases endpoint and use it immediately. The adapter calls Linear directly; tool inputs and provider responses do not pass through Authlane.

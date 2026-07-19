# Airtable

Use the local Airtable adapter with Authlane credentials

Install the published adapter in the SaaS or agent runtime that will call Airtable:

```bash
pnpm add @authlane/integration-airtable
```

```typescript
import adapter from @authlane/integration-;

const definitions = adapter.definitions;
const result = await adapter.execute(toolName, input, credential);
```

Issue `credential` from the server-side Authlane credential-leases endpoint and use it immediately. The adapter calls Airtable directly; tool inputs and provider responses do not pass through Authlane.

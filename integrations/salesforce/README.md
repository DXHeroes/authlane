# @authlane/integration-salesforce

Salesforce tool definitions and a local direct-execution adapter for Authlane.

```bash
pnpm add @authlane/integration-salesforce
```

Use the canonical tools through `@authlane/ai`, or import this package when building a custom local
runtime. Authlane manages connection state and fresh access-only credential leases; provider calls
execute directly from your trusted runtime to the connected Salesforce instance.

[Salesforce connection documentation](https://authlane.io/docs/integrations/salesforce) ·
[MIT License](./LICENSE)

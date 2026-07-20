# @authlane/integration-airtable

Airtable canonical tool definitions and SaaS-runtime execution support for Authlane.

```bash
pnpm add @authlane/integration-airtable
```

Use the canonical tools through `@authlane/ai`, or import this package when building a custom
trusted runtime. Authlane manages connection state and fresh access-only credential leases.
Provider calls run from the SaaS runtime and never pass through the Authlane control plane.

Self-hosted OAuth app creation, redirect URI, Client ID, Client Secret, scopes, execution
policy, and troubleshooting are maintained in the canonical setup guide:
https://authlane.io/docs/integrations/airtable

[MIT License](./LICENSE)

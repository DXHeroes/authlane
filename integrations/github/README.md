# @authlane/integration-github

GitHub tool definitions and a local direct-execution adapter for Authlane.

```bash
pnpm add @authlane/integration-github
```

Use the canonical tools through `@authlane/ai`, or import this package when building a custom local
runtime. Authlane manages connection state and fresh access-only credential leases; provider calls
execute directly from your trusted runtime to GitHub.

[GitHub connection documentation](https://authlane.io/docs/integrations/github) ·
[MIT License](./LICENSE)

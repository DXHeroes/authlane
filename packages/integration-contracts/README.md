# `@authlane/integration-contracts`

Language-neutral, versioned public tool definitions for Authlane's built-in integrations. The JSON
manifests in `manifests/v1` are the canonical source. TypeScript runtimes consume the generated
artifact, and non-TypeScript SDKs can consume `generated/v1/integrations.json` without loading
compiled JavaScript.

## Update a contract

1. Edit the matching `manifests/v1/<service-id>.json` file.
2. Keep the executable handler definition in `integrations/<service-id>/tools.ts` conformant.
3. Run `pnpm contracts:generate` from the repository root.
4. Run `pnpm contracts:check` and the repository tests.

Generation is offline and deterministic. CI fails when the checked-in TypeScript or consolidated
JSON artifact is stale, when a manifest violates the v1 JSON Schema, or when service/tool IDs are
duplicated.

This package contains definitions only. Provider execution stays inside the customer's trusted
runtime; Authlane does not expose a tool-execution API or hosted MCP server.

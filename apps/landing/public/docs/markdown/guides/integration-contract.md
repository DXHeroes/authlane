# Integration contract

Define a canonical service contract and matching direct-execution adapters without gateway behavior.

A shipped connection is one cross-runtime contract, not only a TypeScript handler.

## Prerequisites

Choose a lowercase-hyphenated service ID and verify provider authentication, endpoints, scopes,
refresh behavior, credential placement, and tool requests from official provider documentation.

## Implement the workflow

1. Add the language-neutral tool schema to
   `packages/integration-contracts/manifests/v1/<service-id>.json`.
2. Keep `integrations/<service-id>/config.yaml` aligned with authentication endpoints and minimum
   default scopes.
3. Implement matching TypeScript and Python executors with static provider origins, encoded paths,
   bounded input/output, timeouts, explicit redirect handling, and redacted error mapping.
4. Export the direct adapter and tool definitions, wire the service into catalog/OAuth allowlists
   and both runtime registries, then regenerate contracts.

```bash
pnpm contracts:generate
pnpm contracts:check
```

Canonical definitions contain `name`, `description`, and JSON Schema `inputSchema`. Tool names are
globally unique and service-prefixed. Provider secrets and OAuth scopes live in configuration and
tenant-bound secret records, not tool input.

## Expected result

TypeScript and Python expose the same tools, request semantics, result shape, credential behavior,
and safe error mapping.

## Handle errors

Map provider failures to stable redacted codes. Never forward access tokens, response bodies, or
stack traces to a model.

## Security boundary

The adapter consumes a fresh access-only lease inside the caller's SaaS runtime and calls a fixed
provider origin directly. A provider proxy, Authlane tool-execution endpoint, or hosted Authlane
MCP server is forbidden.

## Next step

Prove the contract with [local integration testing](/docs/guides/integration-testing).

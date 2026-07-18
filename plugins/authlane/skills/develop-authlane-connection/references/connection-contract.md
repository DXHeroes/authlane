# Connection contract

## Decide the product boundary

| Connection type | Public catalog/manifest | TypeScript executor | Python executor | Authlane control plane |
| --- | --- | --- | --- | --- |
| Shipped built-in | Required | Required | Required | Catalog, auth, state, definitions, leases |
| Caller-owned custom | Do not add unless promoted | Application-owned | Application-owned if needed | Existing service lease/definition contract only |

Do not call a local override a shipped service. Promotion to built-in requires the entire vertical
slice below.

## Canonical source and generated artifacts

1. Edit `packages/integration-contracts/manifests/v1/<service-id>.json` against
   `schema/integration-manifest.schema.json`.
2. Define every tool name, description, JSON object input schema, required field, enum, bound, and
   `additionalProperties` policy language-neutrally.
3. Run `pnpm contracts:generate`; commit the deterministic
   `generated/v1/integrations.json` and `src/generated/v1.ts` changes.
4. Run `pnpm contracts:check` and exact inventory/uniqueness tests. Conformance must compare
   executable definitions with the canonical document; iterating only existing manifests cannot
   detect an omitted service.

## Built-in wiring inventory

- `integrations/<service>/`: `package.json`, exports, `index.ts`, `tools.ts`, `config.yaml`, tests,
  README, TypeScript config, and Vitest config.
- `packages/shared/src/supported-services.ts`: `SUPPORTED_SERVICE_IDS` plus exact-inventory test.
- `packages/database/src/seed.ts` and `service-catalog.ts`: production catalog, auth type, provider
  endpoints, global enablement, and exact catalog parity.
- `packages/shared/src/oauth-endpoints.ts`: static authorization/token endpoint SSRF allowlist for
  OAuth services.
- `apps/api/src/lib/integration-registry.ts`: importability/warmup through supported IDs; capability
  and tool reads remain canonical and provider-free.
- `packages/ai/src/integrations.ts`: lazy importer; `packages/ai/package.json`: workspace runtime
  dependency; update `pnpm-lock.yaml`.
- `packages/python/src/authlane/executors.py`: builder/parser and `EXECUTOR_REGISTRY`; generated
  definitions remain exact.
- `apps/docs/integrations/<service>.mdx`, docs navigation, landing integration inventory, and setup
  scopes/auth examples.

Package exports must resolve inside packed artifacts. Add MIT repository/homepage/bugs/files and
public publish metadata consistently with the repository release contract.

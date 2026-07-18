# Connection testing

## RED sequence

Add failing expectations before implementation:

1. Exact supported-service and production-catalog inventory includes the service once.
2. Canonical manifest validates and generated artifacts are stale until regeneration.
3. TypeScript and Python executor registries cover every canonical tool exactly.
4. AI lazy resolver loads the new package and an application package can import public exports.
5. Docs/landing inventory requires the setup page.

Capture the RED output. A manifest-iterating test alone is insufficient because it cannot see an
omitted manifest.

## Cross-runtime conformance matrix

For every tool, derive table cases from the effective TypeScript handler and assert Python matches:

- required/default input, all optionals, each optional, conditionally paired fields;
- schema-valid `false`, `0`, empty string/list/object, and unknown-field behavior;
- exact method, static origin, encoded path, ordered/multi query, custom headers, body;
- mocked provider response, returned result, and stable redacted error;
- OAuth/API-key acceptance or rejection before provider I/O.

Add negative tests for invalid schema, user-controlled host/path traversal, redirect, timeout,
oversized input/response, provider body/credential leakage, and a missing/expired lease. Prove
catalog/status/definitions never acquire credentials or call the provider.

## Repository checks

Run the focused RED/GREEN suites, then at minimum:

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm --filter @authlane/shared test
pnpm --filter @authlane/database test
pnpm --filter @authlane/api test
pnpm --filter @authlane/ai test
pnpm --filter @authlane/integration-<service> test
pnpm build
pnpm type-check
pnpm test:repo
cd packages/python && uv run --frozen --extra all pytest -q
```

Run lint/format, lockfile-frozen install, package dry-run/real-pack import checks, docs/link tests, and
hot-read/control-plane regressions. The final network assertion must show provider tool requests go
from the customer's TS/Python runtime to the provider, never through an Authlane host.

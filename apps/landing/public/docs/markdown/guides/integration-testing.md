# Local integration testing

Verify integration contracts, OAuth boundaries, redaction, tenant isolation, and direct provider execution.

Test a connection as a complete product slice before adding it to the shipped catalog.

## Prerequisites

Complete the [integration contract](/docs/guides/integration-contract) and use local provider HTTP
fakes that assert the exact origin, path, method, headers, body, timeout, and redirect policy.

## Implement the workflow

```bash
pnpm contracts:check
pnpm --filter @authlane/integration-github test
pnpm --filter @authlane/ai test
uv run --project packages/python --frozen pytest
pnpm test
```

Replace the package filter with the connection under development. Cover:

- unit validation and canonical tool names/schemas;
- generated contract parity across TypeScript and Python;
- OAuth state single-use, expiry, PKCE, callback, denied consent, and refresh behavior;
- credential and provider-error redaction;
- organization/external-user isolation and hostile identity input;
- a fresh lease per invocation followed by a direct provider request;
- unavailable tools, provider timeouts, bounded responses, and redirect rejection.

## Expected result

Both runtimes send equivalent provider requests and expose equivalent safe results without routing
provider traffic through Authlane.

## Handle errors

Treat a stale generated contract, runtime-only implementation, missing catalog wire, or secret in
test output as a release blocker.

## Security boundary

Use synthetic credentials in tests and assert they never appear in logs, thrown messages, snapshots,
or model-visible results.

## Next step

Follow the repository's [AI coding marketplace guide](/docs/ai-tools/marketplace) to invoke the
`develop-authlane-connection` skill for future connection work.

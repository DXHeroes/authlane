---
name: develop-authlane-connection
description: Use when adding or changing a built-in or custom Authlane service connection, provider auth flow, canonical tool definition, TypeScript executor, Python executor, or catalog wiring.
---

# Develop an Authlane Connection

## Principle

Treat a shipped built-in as one language-neutral, cross-runtime product slice. A compiling handler
is not a connection. Caller-owned custom adapters may stay local, but must not masquerade as a
shipped catalog service.

## Workflow

1. Classify the request with [connection contract](references/connection-contract.md). For a
   built-in, refuse compile-only, TypeScript-only, or deferred manifest/Python/test completion.
2. Verify authentication, credential placement, authorization/token endpoints, scopes, refresh
   behavior, and tool API calls from official provider documentation. Record sources and retrieval
   date. Follow [provider security](references/provider-security.md); never copy another provider's
   OAuth assumptions.
3. Start RED with exact inventory, canonical-schema, and executable-conformance expectations. Read
   [testing](references/testing.md) before implementation.
4. Add or update `packages/integration-contracts/manifests/v1/<service>.json` first. Regenerate and
   check consolidated JSON and TypeScript artifacts. Keep service IDs lowercase-hyphenated and tool
   names globally unique and service-prefixed.
5. Implement matching TypeScript and Python executors. Use static provider origins, encoded paths
   and query parameters, bounded inputs/responses/timeouts, explicit redirect policy, fresh
   user-scoped access-only credentials, and redacted failures.
6. Wire every built-in through `SUPPORTED_SERVICE_IDS`, production database catalog/seed, OAuth
   endpoint SSRF allowlist when applicable, API registry warmup, TypeScript AI lazy resolver and
   package dependency, Python executor registry, docs/landing inventory, package exports, and
   lockfile.
7. Prove exact definition, request, result, credential, and error parity across both runtimes. Run
   contract, catalog, API, AI, Python, package, docs, and no-gateway regressions before handoff.

## Completion contract

Before handing off, state eight explicit slots: built-in versus custom decision; official provider
auth/API sources and credential choice; failing RED inventory/conformance tests; canonical manifest
and generated artifacts; matching TypeScript and Python executors; every catalog, SSRF allowlist,
AI/Python resolver, package/lockfile, landing, and docs wire; fresh audited user-scoped access-only
lease followed by a direct provider call with no Authlane proxy/hosted execution/MCP; and exact
GREEN parity plus repository commands. If any built-in slot is deferred, report the work as
incomplete even when a package compiles.

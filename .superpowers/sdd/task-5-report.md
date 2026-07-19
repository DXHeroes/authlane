# Task 5 Report: Task-Oriented Documentation Content

## Status

Implemented and verified on `feat/docs-devex` from Task 4 review head `66abb09`.

Commit subject: `docs: publish complete task-oriented guides`

## Implementation

- Reorganized the documentation into the exact eight approved groups: Start here, Build, SDKs and
  frameworks, API reference, Integrations, Extend Authlane, Operate, and AI coding tools.
- Rewrote the Quickstart as five complete outcomes: initialize the server SDK, list tenant-enabled
  services, create the signed-in user's connect session, render the hosted UI, and bind that user's
  tools to an AI runtime.
  - The connect session uses `externalUserId: currentUser.id`, `allowedServices: []`, the exact
    allowed origin, and a 600-second expiry.
  - The final step provides complete install and implementation alternatives for Vercel AI, OpenAI
    Agents, Mastra, Agno, LangChain, and local MCP. Every source initializes Authlane, binds
    `authlane.user(externalUserId)` before selecting its adapter, handles the SDK result, and calls
    the framework directly.
- Added all 22 approved task pages: two concept pages, nine Build/Operate/extension guides, six
  framework pages, one error-and-rate-limit reference, and four AI coding-tool pages.
- Rewrote the existing TypeScript, Python, React, framework, OAuth, webhook, security,
  self-hosting, and custom-integration pages so they link through the task workflows without
  duplicating or contradicting them.
- Kept the product boundary explicit throughout: Authlane is the control plane; provider execution
  remains in the SaaS runtime. Documented `allowedServices: []` as a one-time snapshot of every
  currently enabled tenant service, never as an unrestricted future wildcard.
- Used only commands from the repository-owned plugin manifests and documentation. AI-tool pages
  expose only the two shipped Authlane skills: `integrate-authlane` and
  `develop-authlane-connection`.
- Kept the full OpenAPI reference prominent as the final API-reference destination and removed
  unverified social/community destinations.
- Enabled repository-owned MDX expressions in the landing renderer with
  `blockJS: false`/`blockDangerousJS: true`. This narrowly scoped compatibility fix is required for
  the typed `CodeGroup` array props; its regression test records the trust boundary.
- Regenerated 63 deterministic documentation assets for 59 navigable documents.

## Files

Created:

- 22 approved source pages under `apps/docs/concepts`, `apps/docs/guides`, `apps/docs/sdk`,
  `apps/docs/api-reference`, and `apps/docs/ai-tools`.
- Their generated Markdown counterparts under `apps/landing/public/docs/markdown`.

Modified:

- `apps/docs/mint.json` and 14 existing source pages from the Task 5 brief.
- `apps/docs/api-reference/connections/create-connect-session.mdx` to make the tenant-service
  snapshot semantics unambiguous in the endpoint reference.
- `scripts/docs-quickstart.test.ts` and `apps/landing/app/lib/docs.test.ts` with the new content and
  navigation contracts.
- `apps/landing/app/components/docs-page.tsx` and its regression test for trusted `CodeGroup`
  expression props.
- The generated manifest, search index, public Markdown tree, `llms.txt`, and `llms-full.txt`.

## RED evidence

Required Quickstart contract RED:

```text
$ pnpm vitest run scripts/docs-quickstart.test.ts --environment node
Test Files 1 failed (1)
Tests 1 failed | 5 passed (6)
```

The existing Quickstart still contained the oversized request-validation block and lacked the exact
five-step structure, tenant snapshot, user binding, and complete runtime alternatives.

Required navigation/content RED:

```text
$ pnpm --filter @authlane/landing test -- app/lib/docs.test.ts
Test Files 1 failed | 8 passed (9)
Tests 3 failed | 48 passed (51)
```

The old six-group navigation order did not match the approved eight groups, the framework and
AI-tool pages were absent, and the manifest still contained 37 rather than 59 documents.

Production rendering exposed a separate compatibility RED:

```text
$ pnpm --filter @authlane/landing build
TypeError: Cannot read properties of undefined (reading 'length')
```

The MDX compiler's default JavaScript blocking removed expression-valued `CodeGroup` props. A
focused regression was then added and observed failing before the repository-owned MDX trust
configuration was enabled.

## GREEN evidence

The final verification pipeline was run after the last content and compatibility changes:

```text
$ pnpm docs:generate && \
  pnpm vitest run scripts/docs-quickstart.test.ts --environment node && \
  pnpm --filter @authlane/landing test -- app/lib/docs.test.ts app/docs/docs-contract.test.ts && \
  pnpm docs:check && \
  pnpm --filter @authlane/landing build && \
  pnpm type-check && \
  git diff --check

Generated 63 documentation assets.
Quickstart: 1 test file passed, 6 tests passed.
Landing: 9 test files passed, 59 tests passed.
Documentation assets are current.
Landing compiled and exported 68 static pages, including 59 documentation records and the full
OpenAPI reference.
Type check completed all 50 Turbo tasks plus example and performance checks.
git diff --check exited 0.
```

## API and command verification

- TypeScript initialization, user scoping, resources, tool adapters, and result tuples were checked
  against `packages/sdk/src`, `packages/ai/src`, and their package exports/tests.
- Python `Result` handling and Agno, LangChain, OpenAI Agents, and generic adapter calls were checked
  against `packages/python/authlane`, its extras, tests, and the installed framework signatures.
- React props were checked against `packages/react/src/AuthlaneConnect.tsx`.
- Endpoint fields and response envelopes were checked against
  `apps/docs/api-reference/openapi.yaml` and the shipped SDK types.
- Cache behavior, rate limits, and the P95 hot-read benchmark were checked against the API cache and
  rate-limit implementation plus `scripts/benchmark-hot-read.mjs`.
- Claude, Codex, and Cursor installation/update instructions were copied only from the repository's
  `.claude-plugin`, `.agents/plugins`, plugin metadata, and `docs/agent-plugins.md` surfaces.

## Self-review

- The generated manifest contains 59 documents, each appearing exactly once in the exact eight
  ordered navigation groups.
- Every approved new task page has complete frontmatter, outcome-oriented prose, and the applicable
  prerequisites, implementation, expected-result, error, security-boundary, and next-step sections.
- The Quickstart contains the exact five headings and no `MAX_CHAT_REQUEST_BYTES` production block.
- Both Quickstart `CodeGroup` instances have equal six-item labels, languages, and sources arrays;
  the production HTML renders 12 tabs and preserves all source panels without JavaScript.
- All framework snippets are standalone and keep provider execution outside Authlane.
- No fabricated Authlane GitHub, Discord, Twitter, placeholder, TODO, TBD, or FIXME destination was
  found in the source or regenerated public assets.
- `docs:generate` followed by `docs:check` is stable, and the complete production build and root type
  check pass.
- The final scope contains only Task 5 documentation, content-contract tests, generated outputs,
  the required trusted-MDX compatibility correction, and this report.

## Concerns

No blocking functional concerns. The production build emits Next.js's existing multiple-lockfile
workspace-root warning in this isolated worktree; compilation and all 68 static exports still pass.
The public Markdown generator preserves multiline `CodeGroup` source syntax rather than converting
it into labelled fences; all source panels remain present and searchable, but a later generator
polish can improve their plain-Markdown presentation without changing this task's runtime docs.

## Review fixes

Follow-up commit subject: `fix(docs): harden task-oriented guide rendering`

### Implementation

- Restored the MDX compiler's general JavaScript block with `blockJS: true` while retaining
  `blockDangerousJS: true`.
  - Replaced both expression-prop Quickstart groups with safe `<CodeGroup>` and
    `<CodeGroupItem label="...">` child markup using plain string attributes and ordinary fenced
    code.
  - Added a real compiler entry point used by `DocsMdx` and its renderer tests. The tests render
    child-based groups through the production compiler, prove every fixture label/panel remains in
    the no-JavaScript HTML, and prove arithmetic expressions, imports, exports, dynamic imports,
    and a mocked side effect do not execute.
  - `CodeGroup` now validates that the group is non-empty, every direct child is a
    `CodeGroupItem`, every label is a non-empty string, and every item has a code child. Invalid
    authoring fails with an actionable message.
- Added the required `instructions: 'Use connected tools.'` property to both Mastra `Agent`
  examples and locked it with a type-oriented content contract.
- Wrapped the service-catalog call and both response returns in the complete exported
  `listServices()` server function.
- Added canonical `apps/docs/api-reference.mdx`, placed `api-reference` last in the API reference
  navigation group, and excluded that slug from catch-all static params so the explicit generated
  OpenAPI viewer remains the sole owner of `/docs/api-reference`.
- Extended deterministic Markdown conversion to render each `CodeGroupItem` label as a Markdown
  heading, preserve its fenced code byte-for-byte, and remove all group wrappers and expression-prop
  syntax. `quickstart.md` and `llms-full.txt` now contain two labelled sets of the six runtime
  alternatives with no raw `CodeGroup` markup.
- Regenerated 64 deterministic assets for the expanded 60-page manifest.

### Review RED evidence

Child-based component API before implementation:

```text
$ pnpm --filter @authlane/landing exec vitest run app/components/docs-page.test.tsx
Test Files 1 failed (1)
Tests 3 failed | 10 passed (13)
```

The old array API dereferenced missing `labels`; empty and invalid groups therefore produced a
generic TypeError instead of the required validation errors.

Real safe renderer before registration/compiler hardening:

```text
$ pnpm --filter @authlane/landing exec vitest run app/components/docs-page.test.tsx
Test Files 1 failed (1)
Tests 2 failed | 13 passed (15)
TypeError: renderDocsMdxSource is not a function
```

Content and generated Markdown before the review fixes:

```text
$ pnpm vitest run scripts/docs-quickstart.test.ts scripts/generate-docs.test.ts --environment node
Test Files 2 failed (2)
Tests 4 failed | 15 passed (19)
```

The failures identified the module-scope service returns, expression-prop groups, missing Mastra
instruction, absent Markdown labels, and leaked group syntax.

Navigation and route ownership before the canonical page:

```text
$ pnpm --filter @authlane/landing exec vitest run app/lib/docs.test.ts app/docs/docs-contract.test.ts
Test Files 1 failed | 1 passed (2)
Tests 2 failed | 10 passed (12)

$ pnpm --filter @authlane/landing exec vitest run app/docs/docs-contract.test.ts
Test Files 1 failed (1)
Tests 1 failed | 4 passed (5)
```

The API group ended at `api-reference/introduction`, the source/manifest still had 59 pages, and
catch-all static generation still included every manifest record.

### Review GREEN evidence

Focused content and generator regressions:

```text
$ pnpm vitest run scripts/docs-quickstart.test.ts scripts/generate-docs.test.ts --environment node
Test Files 2 passed (2)
Tests 19 passed (19)
```

Focused renderer, navigation, and publication regressions:

```text
$ pnpm --filter @authlane/landing exec vitest run \
  app/components/docs-page.test.tsx app/lib/docs.test.ts app/docs/docs-contract.test.ts
Test Files 3 passed (3)
Tests 27 passed (27)
```

Full output verification:

```text
$ pnpm docs:generate
Generated 64 documentation assets.

$ pnpm docs:check
Documentation assets are current.

$ pnpm --filter @authlane/landing build
Compiled successfully and generated/exported 68 static pages.

$ pnpm type-check
Tasks: 50 successful, 50 total; example and performance type checks passed.

$ pnpm exec biome check <10 changed implementation/test files>
Checked 10 files. No fixes applied.

$ git diff --check
exit 0
```

### Review self-review

- The Quickstart retains the exact five steps, one-time tenant service snapshot, authenticated user
  scoping before every adapter, explicit result handling, and provider-direct execution boundary.
- No general MDX expression execution is needed by the documentation source; all interactive group
  metadata is represented as static child structure.
- The real compiler regression uses an unresolved import plus expression and dynamic-import payloads;
  rendering succeeds without resolving them, producing `42`, or calling the mocked side effect.
- The generated manifest contains `api-reference` exactly once as the API group's final entry, while
  catch-all static params omit it and the explicit viewer builds successfully.
- The earlier plain-Markdown `CodeGroup` concern is resolved by labelled fenced alternatives in both
  public Markdown and the complete LLM export.

### Review concerns

No remaining functional concerns. The production build continues to emit Next.js's existing
multiple-lockfile workspace-root warning in this isolated worktree; compilation and static export
are unaffected.

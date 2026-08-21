# Contributing to Authlane

Thanks for taking the time to contribute. This guide covers the local setup,
the quality gates every change must pass, and the release process.

## Prerequisites

- Node.js 22+
- pnpm 10 (`corepack enable`)
- Docker with the Compose plugin (PostgreSQL 16 and Redis run in containers)
- Python 3.11+ only if you work on `packages/python`

## Setup

```bash
pnpm install --frozen-lockfile
docker compose -f docker/docker-compose.yml up -d
pnpm dev
```

`pnpm demo` boots the full turnkey stack (API, dashboard, seeded database) if
you want a working product instead of individual dev servers. See
[QUICKSTART.md](./QUICKSTART.md) for environment variables and key rings.

## Quality gates

Run these before opening a pull request — CI runs the same set:

```bash
pnpm lint        # Biome (not ESLint)
pnpm type-check
pnpm test        # unit tests + repository contract suite + doc examples
pnpm docs:check  # generated docs artifacts must match apps/docs sources
pnpm openapi:check
```

## Working on documentation

`apps/docs/*.mdx` is the only hand-edited documentation source. After changing
it, run `pnpm docs:generate` and commit the regenerated artifacts under
`apps/landing/` together with your change. Never edit
`apps/landing/public/docs/**` by hand — `pnpm docs:check` will fail the build.

## Working on integrations

Follow the guide at [Integration authoring](https://authlane.io/docs/guides/custom-integrations)
and the existing pattern in `integrations/`. Validate with `pnpm contracts:check`.

## Conventions

- TypeScript strict mode; SDK methods return `{ data, error }`, they do not throw.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`).
- Code comments in English.
- Repository-wide conventions live in [AGENTS.md](./AGENTS.md).

## Releases

Publishable packages are versioned with changesets: run `pnpm changeset` in
your PR when you touch a published package. Merging never publishes — releases
follow the manual OIDC [release guide](./docs/releasing.md). Package changelogs
live in each package directory (for example `packages/sdk/CHANGELOG.md`).

## Security issues

Never open a public issue for a vulnerability. Follow [SECURITY.md](./SECURITY.md).

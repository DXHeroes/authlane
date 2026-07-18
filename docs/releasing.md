# Releasing Authlane

Authlane releases are operator-controlled. Ordinary pushes, merges, tags, and GitHub releases do
not match either publishing workflow. A validation dispatch with `publish=false` does not publish
anything. Registry access is structurally unreachable until an operator dispatches the same SHA
with `publish=true` and a reviewer approves the protected environment.

This guide describes required external registry and GitHub settings; repository code cannot prove
that those settings are configured.

## Version policy

Public npm packages follow semantic versioning. Add one Changeset for each user-visible change and
select patch, minor, or major for every affected package. `pnpm changeset:version` maps that release
intent to package versions and internal dependency bumps. Private applications are not published.

Keep `packages/python/pyproject.toml` synchronized with the intended Python release. Python and npm
versions may advance independently when only one ecosystem changes, but a cross-runtime API change
must release compatible versions together. Keep the three plugin manifest versions synchronized;
bump them when either shared skill changes. Plugin versions do not automatically follow SDK
versions.

Prepare an npm version PR only after all intended Changesets are present:

```bash
pnpm changeset:status
pnpm changeset:version
pnpm install --lockfile-only
```

Review and commit every version, changelog, internal range, consumed Changeset, and lockfile change
before dispatching a publish workflow. Never run versioning inside the protected publish job.

## Local verification

Start from a clean checkout with Node.js 22+, pnpm 10, Python 3.11+, and uv:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
pnpm build
pnpm changeset:status
pnpm release:pack
pnpm release:python:check
pnpm exec vitest run scripts/plugin-release-contract.test.ts --environment node
```

`release:pack` builds all workspaces, runs `npm pack --dry-run --json` for all 20 public npm
packages, creates real tarballs, installs them in a clean fixture, and imports every public export.
It rejects unexpected source, test, fixture, cache, and secret-like files. The Python check runs
`uv build --clear --no-sources --out-dir packages/python/dist packages/python`, Twine, wheel/sdist
inventory checks, and independent
isolated smoke tests for both artifacts.

Also run the plugin/skill validators in [the agent plugin guide](./agent-plugins.md), workflow YAML
linting, Cursor schema tests, and documentation link checks. Review the complete dry-run and real
pack inventories; generated contracts must be current.

## Required trusted publishers and environments

Create an npm Trusted Publisher for each public `@authlane/*` package with these exact fields:

- provider: GitHub Actions
- organization or user: `dxheroes`
- repository: `authlane`
- workflow filename: `publish-npm.yml`
- environment: `npm-publish`
- repository URL: `https://github.com/dxheroes/authlane`
- Allowed actions: `npm publish`

The 20 configurations cover `@authlane/ai`, `@authlane/integration-contracts`, `@authlane/react`,
`@authlane/sdk`, `@authlane/shared`, and every `@authlane/integration-*` package for Airtable,
Discord, GitHub, Gmail, Google Calendar, Google Drive, HubSpot, Jira, Linear, Notion, Pipedrive,
Salesforce, Sentry, Slack, and Stripe.

Configurations created after 2026-05-20 require an explicit allowed action. Select only
`npm publish` for this Changesets workflow; do not grant `npm stage publish`. With npm 11.15 or
newer, an authorized maintainer can configure each already-created package with this exact shape:

```bash
npm trust github @authlane/PACKAGE \
  --repo dxheroes/authlane \
  --file publish-npm.yml \
  --env npm-publish \
  --allow-publish \
  --yes
```

Replace `@authlane/PACKAGE` with every package listed by `pnpm changeset:status`. `npm trust` is a
registry mutation and its generic `--dry-run` flag is not guaranteed for network trust commands;
review the fields manually and do not run it as a dry run. Task 05 did not execute this command.

Create the PyPI project or pending Trusted Publisher for `authlane` with owner `dxheroes`,
repository `authlane`, workflow `publish-pypi.yml`, and environment `pypi-publish`.

Create protected GitHub environments named `npm-publish` and `pypi-publish`. Require at least one
reviewer, disallow self-approval, and restrict deployment to `main` and approved release tags.
Keep both workflows on GitHub-hosted runners. Validation jobs have only `contents: read`; publish
jobs add job-local `id-token: write` for OIDC. There is no long-lived npm or PyPI token. npm Trusted
Publishing provides public-package provenance; the PyPA action uploads PyPI digital attestations.

## Operator runbook

1. Land version files and changelogs, then record the immutable commit SHA.
2. Dispatch the relevant workflow for that SHA with `publish=false`.
3. Review tests, package inventories, exact versions, provenance prerequisites, and the SHA.
4. Dispatch the same workflow and same SHA with `publish=true`.
5. Approve the protected environment only after its validation job succeeds.
6. Confirm the publish job checked out the expected SHA before registry publication.

After release, install representative npm packages in a new empty project and install the Python
wheel in a new isolated environment. Verify public exports, npm provenance, PyPI attestations,
license metadata, and documentation links. Then prepare the changelog and GitHub release. If shared
skills changed, update all three marketplace/plugin manifest versions together.

## Failure handling

Retry only an identical artifact that is missing from a registry. Never rebuild a supposedly
identical version from a different commit. Use `npm deprecate` instead of unpublishing a bad npm
version, and use PyPI yank instead of deleting or reusing a filename. Publish a new patch for any
immutable correction. If a secret is exposed, stop the run, revoke and rotate it immediately,
remove it from future artifacts, and treat the affected credential as compromised.

## Explicit non-actions

Repository setup does not publish npm or PyPI packages, push a tag, create a GitHub release, submit
the plugin to any external marketplace, import a team marketplace, or install the plugin globally.
Those actions require separate operator authorization.

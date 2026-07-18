# Authlane agent plugin

The repository ships one skills-only plugin for Claude Code, Codex, and Cursor. Installation adds
agent instructions only: no MCP server, no provider access, no configured Authlane tenant API key,
and no external credentials. It does not grant provider access or configure an Authlane deployment.

The two shared skills are:

- `integrate-authlane` — integrate Authlane safely into a TypeScript or Python SaaS or AI runtime.
- `develop-authlane-connection` — build or change a complete cross-runtime Authlane connection.

## Claude Code

Add the public repository marketplace and install the plugin:

```bash
claude plugin marketplace add dxheroes/authlane
claude plugin install authlane@authlane
```

The equivalent interactive commands are:

```text
/plugin marketplace add dxheroes/authlane
/plugin install authlane@authlane
```

To smoke-test a local checkout without installing it globally:

```bash
claude --plugin-dir ./plugins/authlane
```

Update an installed repository marketplace and plugin, then restart Claude Code:

```bash
claude plugin marketplace update authlane
claude plugin update authlane@authlane
```

## Codex

Add the public repository marketplace and plugin:

```bash
codex plugin marketplace add dxheroes/authlane
codex plugin add authlane@authlane
```

Refresh marketplace metadata and start a new thread so skill discovery uses the updated files:

```bash
codex plugin marketplace upgrade authlane
```

If the installed plugin does not refresh, remove and add it again using the current Codex CLI.
For deterministic local development, clone this repository and add its root instead:

```bash
codex plugin marketplace add /absolute/path/to/authlane
codex plugin add authlane@authlane
```

After adding either repository source, the plugin is also available through the Codex plugin
marketplace UI. For a local checkout, run `git pull`, upgrade the marketplace, and reinstall when
needed. `.agents/plugins/marketplace.json` is a repository marketplace manifest; it is not a
personal marketplace or an external marketplace listing.

## Cursor

In a new Agent chat, run:

```text
/add-plugin authlane@https://github.com/dxheroes/authlane
```

For deterministic local development, clone or pull this repository and opt in by symlinking or
copying `plugins/authlane` to `~/.cursor/plugins/local/authlane`. That changes your local Cursor
setup and is not performed by this repository. Inspect, update, or remove the plugin in
Customize → Plugins.

## Invoke a skill

Ask the agent explicitly when you want deterministic routing:

```text
Use $integrate-authlane to add Authlane to this application safely.
Use $develop-authlane-connection to add a complete Trello connection.
```

Repository installs track the checked-out Git revision. Pull changes and reinstall or refresh the
plugin as described above. This repository has not been submitted to an external Claude, Codex, or
Cursor marketplace.

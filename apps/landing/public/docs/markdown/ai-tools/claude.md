# Claude Code plugin

Install, verify, update, and remove the repository-owned Authlane plugin in Claude Code.

Install Authlane from the public repository marketplace and route work to one of its two skills.

## Prerequisites

Use a Claude Code release with plugin marketplace support.

## Implement the workflow

```bash
claude plugin marketplace add dxheroes/authlane
claude plugin install authlane@authlane
```

The equivalent interactive commands are:

```text
/plugin marketplace add dxheroes/authlane
/plugin install authlane@authlane
```

Start a new session and verify discovery by asking for `$integrate-authlane` or
`$develop-authlane-connection`. For a local checkout smoke test, run:

```bash
claude --plugin-dir ./plugins/authlane
```

Update the installed repository marketplace and plugin, then restart Claude Code:

```bash
claude plugin marketplace update authlane
claude plugin update authlane@authlane
```

Use Claude Code's `/plugin` manager to remove the installed `authlane@authlane` plugin and, if no
other plugin uses it, the `authlane` repository marketplace.

## Expected result

Claude exposes only the two repository skills and loads their current checked-in instructions.

## Handle errors

Confirm the marketplace name is `authlane`, restart after updating, and use `--plugin-dir` to
separate repository-content problems from installed-cache problems.

## Security boundary

The plugin contains instructions only. It does not configure Authlane, read provider data, or grant
credentials.

## Next step

Use `$integrate-authlane` for application work or `$develop-authlane-connection` for provider work.

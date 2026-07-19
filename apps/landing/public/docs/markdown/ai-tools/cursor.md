# Cursor plugin

Install, verify, update, and remove the repository-owned Authlane plugin in Cursor.

Install the shared Authlane skills from the repository URL in a new Agent chat.

## Prerequisites

Use a Cursor release with plugin support and inspect the repository before installation.

## Implement the workflow

```text
/add-plugin authlane@https://github.com/dxheroes/authlane
```

Open a new Agent chat and verify both `$integrate-authlane` and
`$develop-authlane-connection` appear. For deterministic local development, clone or pull this
repository, then opt in by copying or symlinking `plugins/authlane` to
`~/.cursor/plugins/local/authlane` yourself.

Use Customize → Plugins to inspect or update the repository-backed plugin. For a local copy, pull
the repository and replace the copied directory, or let the symlink follow the checkout. Remove
Authlane from Customize → Plugins; also remove a local copy or symlink if you created one.

## Expected result

Cursor loads exactly the two repository skills with no MCP server or provider configuration.

## Handle errors

Start a new Agent chat after updating. If discovery remains stale, remove and add the same verified
repository source again.

## Security boundary

Local copy or symlink operations change your personal Cursor setup and are never performed by the
Authlane repository. Installing the plugin grants no external access.

## Next step

Use `$integrate-authlane` for application integration or `$develop-authlane-connection` for a full
cross-runtime provider connection.

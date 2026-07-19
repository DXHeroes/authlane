# GitHub

Connect GitHub and use its tools through the Authlane control plane.

## Prerequisites

Create a GitHub OAuth app and choose an account that can access the repositories your tools will
read or change. Repository and organization policy can still restrict that account after consent.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/github/callback` as the GitHub OAuth callback.
Enable GitHub for the tenant in Authlane, store the client ID and encrypted client secret, and
approve the defaults declared in `integrations/github/config.yaml`.

## Scopes

- `repo` permits repository, issue, pull-request, code, and file operations.
- `user` reads the authorizing user's account context used by repository discovery.

## Available tools

### Discover and read repositories

- `github_list_repos`
- `github_get_file`
- `github_search_code`

### Issues

- `github_list_issues`
- `github_create_issue`

### Pull requests

- `github_list_pull_requests`
- `github_create_pull_request`

### Files

- `github_create_file`

Install `@authlane/integration-github` in the SaaS runtime. Tool callbacks obtain a fresh lease and
the adapter calls GitHub directly; Authlane supplies status and definitions without handling the
provider request or response.

## Connection lifecycle

After GitHub consent, Authlane encrypts the credential and returns `connected`. If GitHub supplies
expiry and refresh material, the background refresh path uses it; otherwise the credential remains
usable until GitHub rejects or revokes it. Reconnect an `expired` or `error` connection. Disconnect
through a fresh hosted session after recent user reauthentication.

## Troubleshooting

- Confirm the exact owner and repository name and that the connected account can see the repo.
- Organization policy or repository permissions can block writes even with the configured `repo`
  scope.
- Updating an existing file with `github_create_file` requires the current file SHA.

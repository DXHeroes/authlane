# Linear

Connect Linear and use its tools through the Authlane control plane.

## Prerequisites

Create a Linear OAuth application and choose a workspace containing the teams, issues, and projects
your SaaS will use. The authorizing user must be allowed to perform the requested changes.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/linear/callback` in the Linear application.
Enable Linear for the tenant in Authlane, store the client ID and encrypted client secret, and
approve the defaults from `integrations/linear/config.yaml`.

## Scopes

- `read` permits issue and project reads.
- `write` permits the exported issue and project mutations.

## Available tools

### Issues

- `linear_list_issues`
- `linear_create_issue`
- `linear_update_issue`

### Projects

- `linear_list_projects`
- `linear_create_project`

Install `@authlane/integration-linear` in the SaaS runtime. Each invocation gets a fresh lease and
the adapter calls Linear directly; Authlane serves connection state and definitions without
proxying tool inputs or results.

## Connection lifecycle

Successful Linear consent stores an encrypted credential and reports `connected`. If Linear
returns an expiring credential and refresh material, Authlane schedules background refresh.
Reconnect after a permanent refresh failure or an `expired` or `error` state. Disconnect through a
fresh hosted session after recent reauthentication.

## Troubleshooting

- Use team, issue, and project IDs returned for the connected workspace.
- A user can read an issue yet lack permission to update it; check workspace permissions and
  `write` consent together.
- Confirm required team and project references exist before creating issues or projects.

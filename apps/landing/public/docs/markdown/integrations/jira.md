# Jira

Connect Jira and use its tools through the Authlane control plane.

## Prerequisites

Create an Atlassian OAuth app and identify the Jira site and projects your users will access. The
connected user must have Jira permission for each requested issue operation.

## Configure authentication

Register `https://<your-authlane-host>/api/v1/oauth/jira/callback` in the Atlassian app. Enable Jira
for the tenant in Authlane, store the client ID and encrypted client secret, and approve the
defaults from `integrations/jira/config.yaml`.

## Scopes

- `read:jira-work` reads issues, comments, and available transitions.
- `write:jira-work` creates, updates, transitions, and comments on issues.

## Available tools

### Read issues and workflow

- `jira_list_issues`
- `jira_get_transitions`

### Create and change issues

- `jira_create_issue`
- `jira_update_issue`
- `jira_transition_issue`
- `jira_add_comment`

Install `@authlane/integration-jira` in the SaaS runtime. Each callback obtains a fresh credential
lease and calls Jira directly; Authlane never proxies JQL, issue data, or Jira responses.

## Connection lifecycle

Atlassian consent creates an encrypted `connected` connection. Authlane refreshes the credential
before expiry only when the provider supplied refresh material. Reconnect after an unrecoverable
refresh or `expired` or `error` state. A destructive hosted disconnect requires a new connect
session with recent reauthentication.

## Troubleshooting

- Confirm the connected user can browse the target project before diagnosing an issue-key error.
- `jira_transition_issue` requires a transition ID currently returned by
  `jira_get_transitions`; status names are not transition IDs.
- Invalid JQL fails in Jira itself; test the same query for the connected site and user.

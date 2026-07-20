# Notion

Connect Notion and use its tools through the Authlane control plane.

## Prerequisites

Create a public Notion integration and make the pages or databases needed by your SaaS available to
that integration. The tools can only see content the connected integration can access. Use the
[API reference](https://developers.notion.com/reference/intro),
[integration setup guide](https://developers.notion.com/docs/create-a-notion-integration), and
[integration console](https://www.notion.so/profile/integrations).

## Self-hosted setup

1. Create a **Public integration** in the Notion integration console.
2. Set its redirect URI to `https://<your-authlane-host>/api/v1/oauth/notion/callback`.
3. Enable the content capabilities required by the tools and submit any distribution information
   required for workspaces outside your own.
4. Copy the OAuth Client ID and Client Secret.

## Configure authentication

Open **Dashboard → Services → Notion → OAuth Configuration**, enter the Client ID and Client Secret,
save, and enable Notion. After consent, the user must explicitly share relevant pages or databases
with the integration.

## Scopes

The repository config declares no default OAuth scopes for Notion. Do not invent a scope list:
content access comes from the pages and databases made available to the connected integration.

## Execution path

Notion has an official MCP server at `https://mcp.notion.com/mcp`; follow the
[official MCP guide](https://developers.notion.com/guides/mcp/get-started-with-mcp). The hosted
server currently requires its own interactive user OAuth and does not accept an Authlane bearer
lease. Authlane therefore uses the direct API adapter for headless execution; treating the hosted
server as a credential-compatible fallback would be incorrect.

## Available tools

### Pages and databases

- `notion_create_page`
- `notion_update_page`
- `notion_get_page`
- `notion_query_database`
- `notion_get_database`
- `notion_list_databases`
- `notion_search`

### Blocks

- `notion_append_block_children`
- `notion_get_block`
- `notion_get_block_children`
- `notion_update_block`
- `notion_delete_block`

### Users

- `notion_get_user`
- `notion_list_users`
- `notion_get_bot_user`

Install `@authlane/integration-notion` in the SaaS runtime. Each tool callback receives a fresh
credential lease and calls Notion directly; page content and provider responses do not pass
through Authlane.

## Connection lifecycle

Successful Notion consent creates an encrypted `connected` credential. Authlane only schedules
refresh when a provider token response contains expiry and refresh material; otherwise provider
revocation or rejection requires reconnect. Disconnect through a new hosted connect session after
recent reauthentication and stop exposing Notion tools for that user.

## Troubleshooting

- A missing page or database usually has not been made available to the connected integration.
- Use page, database, block, and user IDs returned by Notion; copied browser URLs may need their ID
  extracted first.
- Property and block payloads must match the target database schema and Notion object structure.

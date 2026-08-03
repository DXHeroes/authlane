# Your own MCP servers

Offer an MCP server to your users and let each of them authorize it under their own account.

A workspace owner can register an MCP server of their own. Authlane discovers its tool contract and
offers the server to that organization's users exactly like a built-in integration: each user
authorizes it under their own account, and your runtime calls the server directly with a leased
credential. Authlane never relays a tool call.

## Prerequisites

A server reachable over HTTPS from the public internet that speaks MCP and either implements OAuth
2.1 authorization server metadata or accepts a per-user API key.

## Register the server

In the dashboard, open **MCP Servers**, give the server a name, paste its URL and choose how users
authorize it.

Registration runs discovery immediately. The server stays unavailable until a discovery succeeds, so
a URL nobody can reach is never offered to your users. A failure is shown on the card with the
reason; fix the server and press **Rediscover**.

Discovery refuses a URL that resolves to a private address, and every OAuth endpoint has to sit on
the same registrable domain as the URL you registered. The endpoints are stored at discovery and
never re-read when a user connects, so a server cannot present one endpoint while you are looking
and another one afterwards.

## Judge the tools

Discovery records every tool as **write**, whatever the server declares about itself. A third party
labelling a destructive tool read-only would otherwise walk straight through a `read_only`
connection, so what the server claims is shown next to your decision rather than used as it.

Open **Tools** on the server card to lower a tool to `read` once you have checked what it does, raise
it to `destructive`, or switch a tool off entirely. Your judgement survives every later rediscovery.

## Connect a user

Nothing changes in your application code. The server appears in the catalog under its generated id,
which starts with `mcp-`:

```typescript
export async function connectMcpServer(userId: string) {
  // The generated id is shown on the server card in the dashboard.
  return authlane.connectSessions.create({
    externalUserId: userId,
    allowedServices: ['mcp-2f1c4a90-0f1e-4a3b-9d2e-7c5b1a08d4f6'],
    allowedOrigin: 'https://app.example.com',
  });
}
```

For a server that uses per-user API keys, the widget collects the key from the user instead of
redirecting; the key is encrypted at rest like any other credential.

## Expected result

`tools.list` returns the approved tools alongside the built-in ones, and a credential lease carries
access material only — never a refresh or ID token.

## Remove a server

Removing a server deletes every user's connection to it in the same step. There is no undo.

# @authlane/sdk

Server-side TypeScript client for the Authlane control plane. Authlane stores connection policy, status, tool definitions, and credentials; your SaaS executes provider requests directly.

## Install

```bash
pnpm add @authlane/sdk
```

## Configure

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: 'https://authlane.example.com',
});
```

The API key client is server-only. API responses use `{ data, error }`; they do not throw. Invalid constructor configuration still throws.

## Hot capability read

```typescript
const { data, error } = await authlane.capabilities.get({
  externalUserId: 'user_123',
  format: 'mcp',
});
```

This returns effective connection statuses and tool definitions in one cacheable snapshot with a stable version hash.

## Connections and credentials

```typescript
const connections = await authlane.connections.list({
  externalUserId: 'user_123',
});

const credentialLease = await authlane.credentialLeases.create({
  externalUserId: 'user_123',
  serviceId: 'github',
});
```

Credential leases require the `credentials:issue` scope, are audited, and return access-only material from a POST endpoint. OAuth refresh and ID tokens never leave Authlane. Use the lease immediately and never persist it.

## Hosted connect UI

Create a short-lived session on your backend and return only its URL to the browser:

```typescript
const session = await authlane.connectSessions.create({
  externalUserId: 'user_123',
  allowedServices: ['github', 'slack'],
  allowedOrigin: 'https://app.example.com',
  expiresInSeconds: 600,
});
```

Use `session.data?.url` as a hosted page or pass it to `@authlane/react`.

## Catalog and tool definitions

```typescript
await authlane.services.list();
await authlane.tools.list({ externalUserId: 'user_123', format: 'openai' });
```

Authlane returns definitions only. Execute tools in your own runtime with the matching `@authlane/integration-*` adapter and credentials fetched by your backend. Provider traffic never flows through Authlane.

## Required API-key scopes

- `catalog:read`
- `connections:read`
- `credentials:issue`
- `connect-sessions:create`

Grant only the scopes used by each workload.

## License

MIT

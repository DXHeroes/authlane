# SDK Documentation

Official SDKs for integrating Authlane into your applications.

## Available SDKs

### TypeScript SDK

The primary SDK for server-side and Node.js applications.

- [Installation & Setup](./typescript/installation.md)
- [Client Configuration](./typescript/configuration.md)
- [API Reference](./typescript/api-reference.md)
- [Examples](./typescript/examples.md)

### React SDK

React hooks and components for client-side integration.

- [Installation & Setup](./react/installation.md)
- [AuthlaneProvider](./react/provider.md)
- [Hooks Reference](./react/hooks.md)
- [Components](./react/components.md)
- [Examples](./react/examples.md)

### MCP Server

Model Context Protocol server for AI agent integration.

- [Installation & Setup](./mcp-server/installation.md)
- [Claude Desktop Integration](./mcp-server/claude-desktop.md)
- [Configuration](./mcp-server/configuration.md)
- [Available Tools](./mcp-server/tools.md)

## Quick Start

### Server-Side (TypeScript)

```bash
npm install @authlane/sdk
```

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

// List user's connections
const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});

// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'github',
});

// Execute a tool
const { data: result } = await authlane.tools.execute({
  userId: 'user_123',
  tool: 'github_create_issue',
  parameters: {
    owner: 'acme',
    repo: 'my-project',
    title: 'New issue',
  },
});
```

### Client-Side (React)

```bash
npm install @authlane/react
```

```tsx
import { AuthlaneProvider, useConnections, useConnect } from '@authlane/react';

function App() {
  return (
    <AuthlaneProvider
      apiUrl="https://api.authlane.com"
      userId={currentUser.id}
    >
      <ConnectionManager />
    </AuthlaneProvider>
  );
}

function ConnectionManager() {
  const { connections, isLoading } = useConnections();
  const { connect, isConnecting } = useConnect();

  return (
    <div>
      <h2>Connected Services</h2>
      {connections.map(conn => (
        <div key={conn.id}>
          {conn.serviceId} - {conn.status}
        </div>
      ))}

      <button onClick={() => connect('github')}>
        Connect GitHub
      </button>
    </div>
  );
}
```

### AI Agent (MCP Server)

```bash
npm install -g @authlane/mcp-server
```

Configure in Claude Desktop:

```json
{
  "mcpServers": {
    "authlane": {
      "command": "authlane-mcp",
      "env": {
        "AUTHLANE_API_KEY": "ak_...",
        "AUTHLANE_USER_ID": "user_123"
      }
    }
  }
}
```

## SDK Features

| Feature | TypeScript | React | MCP Server |
|---------|------------|-------|------------|
| Connection management | ✓ | ✓ | ✓ |
| Credential retrieval | ✓ | ✗ | ✓ |
| OAuth flow | ✓ | ✓ | ✗ |
| Tool listing | ✓ | ✓ | ✓ |
| Tool execution | ✓ | ✗ | ✓ |
| Real-time updates | ✗ | ✓ | ✗ |
| TypeScript types | ✓ | ✓ | ✓ |

## Error Handling

All SDKs use the same error format:

```typescript
const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});

if (error) {
  // Handle error
  console.error(error.message);
  console.error(error.code);      // e.g., "CONNECTION_NOT_FOUND"
  console.error(error.hint);      // How to fix
  console.error(error.statusCode); // HTTP status
}
```

## TypeScript Support

All SDKs include comprehensive TypeScript definitions:

```typescript
import type {
  Connection,
  Service,
  Tool,
  Credentials,
  ApiError,
} from '@authlane/sdk';

// All responses are typed
const { data } = await authlane.connections.list({ userId: 'user_123' });
// data is typed as { items: Connection[]; pagination: Pagination }
```

## Versioning

SDKs follow semantic versioning:

- **Major**: Breaking changes
- **Minor**: New features (backwards compatible)
- **Patch**: Bug fixes

Compatibility matrix:

| SDK Version | API Version |
|-------------|-------------|
| 1.x | v1 |
| 2.x | v2 (future) |

## Support

- **Documentation**: This guide
- **Issues**: [GitHub Issues](https://github.com/authlane/authlane/issues)
- **Discord**: [Community Discord](https://discord.gg/authlane)
- **Email**: support@authlane.com


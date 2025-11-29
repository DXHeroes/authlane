# @authlane/sdk

TypeScript SDK for [Authlane](https://authlane.com) - OAuth connections for AI agents.

## Installation

```bash
npm install @authlane/sdk
# or
pnpm add @authlane/sdk
# or
yarn add @authlane/sdk
```

## Quick Start

```typescript
import { Authlane } from '@authlane/sdk';

// Initialize the client
const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

// List connections for a user
const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});

if (error) {
  console.error(error.message, error.code);
} else {
  console.log(data);
}
```

## Configuration

```typescript
const authlane = new Authlane({
  apiKey: 'your_api_key',        // Required: Your Authlane API key
  baseUrl: 'https://api.authlane.com',  // Optional: Custom API endpoint
  timeout: 30000,                 // Optional: Request timeout in ms (default: 30000)
});
```

## API Reference

### Connections

Manage end-user connections to third-party services.

#### List Connections

Get all connections for a user.

```typescript
const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});
```

#### Get Connection

Get a specific connection.

```typescript
const { data, error } = await authlane.connections.get({
  userId: 'user_123',
  serviceId: 'github',
});
```

#### Get Credentials

Get decrypted credentials for a connection.

```typescript
const { data, error } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'github',
});

if (data) {
  console.log(data.access_token);
}
```

#### Check Health

Check if a connection is healthy.

```typescript
const { data, error } = await authlane.connections.health({
  userId: 'user_123',
  serviceId: 'github',
});

if (data) {
  console.log(data.status); // 'healthy' or 'unhealthy'
}
```

#### Delete Connection

Disconnect a service.

```typescript
const { data, error } = await authlane.connections.delete({
  userId: 'user_123',
  serviceId: 'github',
});
```

### Services

Manage available services.

#### List Services

Get all available services.

```typescript
const { data, error } = await authlane.services.list();
```

#### Get Service

Get a specific service.

```typescript
const { data, error } = await authlane.services.get('github');
```

### Tools

Get AI agent tools for connected services.

#### List Tools

Get tools in MCP or OpenAI format.

```typescript
// MCP format (default)
const { data, error } = await authlane.tools.list({
  userId: 'user_123',
  format: 'mcp',
});

// OpenAI format
const { data, error } = await authlane.tools.list({
  userId: 'user_123',
  format: 'openai',
});
```

## Error Handling

All SDK methods return a `{ data, error }` tuple (Supabase-style).

```typescript
const { data, error } = await authlane.connections.list({ userId: 'user_123' });

if (error) {
  console.error('Error:', error.message);
  console.error('Code:', error.code);
  console.error('Hint:', error.hint);
  console.error('Docs:', error.docUrl);
} else {
  // Use data safely
  console.log(data);
}
```

### Error Codes

- `MISSING_API_KEY` - API key not provided
- `UNAUTHORIZED` - Invalid API key
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request parameters
- `NETWORK_ERROR` - Network request failed
- `TIMEOUT_ERROR` - Request timeout
- `INTERNAL_ERROR` - Server error

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions.

```typescript
import type {
  Connection,
  Service,
  Credentials,
  ConnectionHealth,
  ToolsResponse,
} from '@authlane/sdk';
```

## Examples

### Check if User Has GitHub Connected

```typescript
const { data: connections } = await authlane.connections.list({
  userId: 'user_123',
});

const hasGitHub = connections?.some((conn) =>
  conn.serviceId === 'github' && conn.status === 'connected'
);
```

### Get GitHub Access Token

```typescript
const { data: credentials, error } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'github',
});

if (!error && credentials && 'access_token' in credentials) {
  // Use the access token with GitHub API
  const octokit = new Octokit({
    auth: credentials.access_token,
  });
}
```

### List All Available Services

```typescript
const { data: services } = await authlane.services.list();

console.log('Available services:');
services?.forEach((service) => {
  console.log(`- ${service.name} (${service.id})`);
});
```

### Get Tools for AI Agent

```typescript
// Get tools in MCP format for Claude
const { data: tools } = await authlane.tools.list({
  userId: 'user_123',
  format: 'mcp',
});

// Get tools in OpenAI format for GPT
const { data: functions } = await authlane.tools.list({
  userId: 'user_123',
  format: 'openai',
});
```

## Development

### Build

```bash
pnpm build
```

### Test

```bash
# Unit tests
pnpm test

# Integration tests (requires running API)
AUTHLANE_API_KEY=your_key pnpm test integration

# Coverage
pnpm test:coverage
```

## License

MIT

## Links

- [Documentation](https://docs.authlane.dev)
- [GitHub](https://github.com/authlane/authlane)
- [NPM](https://www.npmjs.com/package/@authlane/sdk)

# TypeScript SDK API Reference

Complete API reference for the Authlane TypeScript SDK.

## Client

### Constructor

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane(config: AuthlaneConfig);
```

### AuthlaneConfig

```typescript
interface AuthlaneConfig {
  apiKey: string;                          // API key (required)
  baseUrl?: string;                        // API base URL
  timeout?: number;                        // Request timeout (ms)
  retries?: number;                        // Retry attempts
  onError?: (error: ApiError) => void;     // Global error handler
}
```

---

## Services

### authlane.services.list()

List all available services.

```typescript
const { data, error } = await authlane.services.list(options?: {
  enabled?: boolean;
  authType?: 'oauth2' | 'api_key' | 'none';
});
```

**Returns:**
```typescript
{
  data: {
    items: Service[];
    total: number;
  };
  error: ApiError | null;
}
```

### authlane.services.get()

Get a specific service.

```typescript
const { data, error } = await authlane.services.get({
  serviceId: string;
});
```

**Returns:**
```typescript
{
  data: Service;
  error: ApiError | null;
}
```

---

## Connections

### authlane.connections.list()

List connections for a user.

```typescript
const { data, error } = await authlane.connections.list({
  userId: string;
  status?: 'pending' | 'connected' | 'expired' | 'error';
  serviceId?: string;
  limit?: number;
  offset?: number;
});
```

**Returns:**
```typescript
{
  data: {
    items: Connection[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
  error: ApiError | null;
}
```

### authlane.connections.getCredentials()

Get decrypted credentials for a connection.

```typescript
const { data, error } = await authlane.connections.getCredentials({
  userId: string;
  serviceId: string;
});
```

**Returns:**
```typescript
{
  data: {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    scope: string;
    expires_at: string;
  };
  error: ApiError | null;
}
```

### authlane.connections.healthCheck()

Check if a connection is healthy.

```typescript
const { data, error } = await authlane.connections.healthCheck({
  userId: string;
  serviceId: string;
});
```

**Returns:**
```typescript
{
  data: {
    healthy: boolean;
    status: string;
    lastChecked: string;
    responseTime: number | null;
    details: {
      tokenValid: boolean;
      scopesValid: boolean;
      apiReachable: boolean;
      reason?: string;
    };
  };
  error: ApiError | null;
}
```

### authlane.connections.delete()

Delete a connection.

```typescript
const { data, error } = await authlane.connections.delete({
  userId: string;
  serviceId: string;
  revokeToken?: boolean;
});
```

**Returns:**
```typescript
{
  data: {
    deleted: boolean;
    connectionId: string;
    serviceId: string;
    tokenRevoked: boolean;
  };
  error: ApiError | null;
}
```

---

## OAuth

### authlane.oauth.authorize()

Start OAuth flow for a service.

```typescript
const { data, error } = await authlane.oauth.authorize({
  userId: string;
  serviceId: string;
  scope?: 'user' | 'organization';
  redirectUri?: string;
  state?: string;
});
```

**Returns:**
```typescript
{
  data: {
    authorizationUrl: string;
    state: string;
    connectionId: string;
  };
  error: ApiError | null;
}
```

---

## Tools

### authlane.tools.list()

List available tools for a user.

```typescript
const { data, error } = await authlane.tools.list({
  userId: string;
  format?: 'mcp' | 'openai';
  serviceId?: string;
});
```

**Returns (MCP format):**
```typescript
{
  data: {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: JSONSchema;
    }>;
  };
  error: ApiError | null;
}
```

**Returns (OpenAI format):**
```typescript
{
  data: {
    functions: Array<{
      name: string;
      description: string;
      parameters: JSONSchema;
    }>;
  };
  error: ApiError | null;
}
```

### authlane.tools.execute()

Execute a tool.

```typescript
const { data, error } = await authlane.tools.execute({
  userId: string;
  tool: string;
  parameters: Record<string, any>;
});
```

**Returns:**
```typescript
{
  data: {
    result: any;
    executionTime: number;
  };
  error: ApiError | null;
}
```

---

## Types

### Service

```typescript
interface Service {
  id: string;
  name: string;
  authType: 'oauth2' | 'api_key' | 'none';
  enabled: boolean;
  config: {
    authorization_url?: string;
    token_url?: string;
    scopes?: string[];
    base_url?: string;
    documentation_url?: string;
    icon?: string;
    color?: string;
    description?: string;
  };
}
```

### Connection

```typescript
interface Connection {
  id: string;
  scope: 'user' | 'organization';
  userId: string;
  organizationId: string;
  externalUserId: string;
  serviceId: string;
  status: 'pending' | 'connected' | 'expired' | 'error';
  metadata: Record<string, any>;
  connectedAt: string;
  expiresAt: string | null;
  createdAt: string;
}
```

### Tool

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JSONSchema>;
    required?: string[];
  };
}
```

### ApiError

```typescript
interface ApiError {
  message: string;
  code: string;
  hint?: string;
  statusCode: number;
  details?: Record<string, any>;
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid API key |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONNECTION_NOT_FOUND` | Connection doesn't exist |
| `CONNECTION_EXPIRED` | Connection needs refresh |
| `SERVICE_NOT_FOUND` | Invalid service ID |
| `SERVICE_DISABLED` | Service not enabled |
| `TOOL_NOT_FOUND` | Tool doesn't exist |
| `CONNECTION_REQUIRED` | Service not connected |
| `INVALID_PARAMETERS` | Bad parameters |
| `PROVIDER_ERROR` | External API error |
| `RATE_LIMITED` | Too many requests |

---

## Examples

### Full Example

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

async function main() {
  const userId = 'user_123';

  // List connections
  const { data: connections, error: connError } = await authlane.connections.list({
    userId,
    status: 'connected',
  });

  if (connError) {
    console.error('Failed to list connections:', connError.message);
    return;
  }

  console.log('Connected services:', connections.items.map(c => c.serviceId));

  // Check if GitHub is connected
  const hasGithub = connections.items.some(c => c.serviceId === 'github');

  if (!hasGithub) {
    // Start OAuth flow
    const { data: auth } = await authlane.oauth.authorize({
      userId,
      serviceId: 'github',
    });
    console.log('Connect GitHub:', auth.authorizationUrl);
    return;
  }

  // Get credentials
  const { data: creds, error: credError } = await authlane.connections.getCredentials({
    userId,
    serviceId: 'github',
  });

  if (credError) {
    console.error('Failed to get credentials:', credError.message);
    return;
  }

  console.log('GitHub token expires at:', creds.expires_at);

  // Execute a tool
  const { data: result, error: execError } = await authlane.tools.execute({
    userId,
    tool: 'github_list_repos',
    parameters: {
      visibility: 'public',
    },
  });

  if (execError) {
    console.error('Tool execution failed:', execError.message);
    return;
  }

  console.log('Repositories:', result.result);
}

main();
```

